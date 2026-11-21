"""
Voxelizes the roster for the voxel renderer.

Reads the eight chassis (and their escorts) straight out of
`assets/blender/mechs.blend` and writes one `assets/voxels/<mech>.json` per
machine. **Nothing is saved back to the .blend** — this is a read-only pass, so
it is safe to run against a working file.

Run headless from the project root:

    "C:/Program Files/Blender Foundation/Blender 5.1/blender.exe" -b \
        assets/blender/mechs.blend --python tools/blender/voxelize_mechs.py -- \
        [--vox 3.0] [--only halcyon,nocturne]

Why voxelize the Blender models instead of authoring voxel mechs by hand
------------------------------------------------------------------------
The machines were already modelled in 3D, out of boxes, wedges and cylinders,
and then flattened into side-view sprites. The 3D detail was always there — the
sprite pass threw it away. Sampling the real geometry keeps every chassis's
established silhouette, proportions and palette, and gives the rig parts true
depth: the near leg is in front of the hull because it *is*, not because a draw
order says so.

How a voxel is decided
----------------------
Each part object is a join of many closed primitives ("shells"). A joined mesh
cannot be inside-tested as one solid — two overlapping boxes make a ray-parity
test call the overlap *outside* — so the mesh is split back into its loose
shells and each is tested on its own:

* a voxel centre is inside a shell when the nearest surface point's face normal
  points away from it (closed, consistently wound primitives make that exact);
* shells thinner than ~1.2 voxels are supersampled, so antennae, fins and trim
  strips survive the grid instead of vanishing between sample points;
* where shells overlap, the **smallest** shell wins the colour — a trim plate
  laid on a hull panel is the paint you see, not the panel under it.

Colours come from each material's *base* colour, traced up the wear-mix chain
(`Base Color` is linked on every detailed material, so its own default value is
meaningless — SESSION_HANDOFF §5). Materials with real emission become glow
voxels, which the game draws unlit.

Coordinate contract (matches src/voxel/VoxelMechData.ts)
-------------------------------------------------------
* One voxel = `vox` logical px (1 Blender unit = 60 logical px).
* Voxel (0, 0, 0) is centred on the part's pivot (its object origin).
* Game axes: +x = Blender +X (the machine's forward when facing right),
  +y = Blender +Z (up), +z = Blender -Y (toward the camera: the near side).
* Each part is sampled in **world orientation** about its own pivot, so the
  object's authored rotation is baked in — exactly what the sprite pass did.

Projected energy (beam blades, NULLTIDE's baton discharge) is not modelled
geometry; `tools/energy_blade.py` and `tools/electric_baton.py` paint it. Those
PNGs are voxelized here as a thin glowing slab, centred on their pivot the same
way the sprite renderer centres them.
"""

import base64
import json
import math
import os
import struct
import sys
import time

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

LOGICAL_PER_BU = 60.0
SPRITE_PX_PER_LOGICAL = 2.0  # sprites render at 120 px/BU, displayed at half

ROSTER = ["halcyon", "nocturne", "vesper", "terramoth", "cirrus", "obelisk", "pyre", "nulltide"]
PARTS = [
    "core", "head", "backpack", "lowerBody", "legNear", "legFar",
    "rightArm", "leftArm", "mainWeapon", "subWeapon", "meleeWeapon",
    "leftThruster", "rightThruster", "drone",
]
ENERGY_PARTS = ["meleeEnergy", "meleeArc"]

# Emission strength at or above which a material is drawn as light.
GLOW_EMISSION = 0.9


def project_root():
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.abspath(os.path.join(here, "..", ".."))


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    vox, only = 3.0, None
    i = 0
    while i < len(argv):
        if argv[i] == "--vox":
            vox = float(argv[i + 1]); i += 2
        elif argv[i] == "--only":
            only = [s.strip() for s in argv[i + 1].split(",") if s.strip()]; i += 2
        else:
            i += 1
    return vox, only


# ------------------------------------------------------------------ colours


def lin_to_srgb(c):
    c = max(0.0, min(1.0, c))
    return 12.92 * c if c <= 0.0031308 else 1.055 * (c ** (1.0 / 2.4)) - 0.055


def to_hex(rgb):
    r, g, b = (int(round(lin_to_srgb(c) * 255)) for c in rgb[:3])
    return (r << 16) | (g << 8) | b


def _rgba_input(node, name):
    for i in node.inputs:
        if i.name == name and i.type == "RGBA":
            return i
    return None


def trace_base_colour(sock, depth=0):
    """Follows the wear-mix chain back to the colour the panel is painted."""
    if depth > 64:
        return (0.5, 0.5, 0.5)
    if not sock.is_linked:
        return tuple(sock.default_value[:3])
    node = sock.links[0].from_node
    kind = node.bl_idname
    if kind == "ShaderNodeMix":
        a = _rgba_input(node, "A")
        if a is not None:
            return trace_base_colour(a, depth + 1)
    if kind == "ShaderNodeMixRGB":
        return trace_base_colour(node.inputs["Color1"], depth + 1)
    if kind == "ShaderNodeRGB":
        return tuple(node.outputs[0].default_value[:3])
    for i in node.inputs:
        if i.type == "RGBA" and not i.is_linked:
            return tuple(i.default_value[:3])
    return (0.5, 0.5, 0.5)


_MAT_CACHE = {}


def material_info(mat):
    """(srgb hex, glow) for a material."""
    if mat is None:
        return (0x808080, False)
    if mat.name in _MAT_CACHE:
        return _MAT_CACHE[mat.name]
    rgb, glow = (0.5, 0.5, 0.5), False
    if mat.use_nodes and mat.node_tree:
        bsdf = next((n for n in mat.node_tree.nodes if n.bl_idname == "ShaderNodeBsdfPrincipled"), None)
        if bsdf is not None:
            rgb = trace_base_colour(bsdf.inputs["Base Color"])
            es = bsdf.inputs.get("Emission Strength")
            ec = bsdf.inputs.get("Emission Color")
            if es is not None and not es.is_linked and es.default_value >= GLOW_EMISSION:
                if ec is not None and max(ec.default_value[:3]) > 0.05:
                    glow = True
                    rgb = tuple(ec.default_value[:3])
        else:
            emit = next((n for n in mat.node_tree.nodes if n.bl_idname == "ShaderNodeEmission"), None)
            if emit is not None:
                rgb = tuple(emit.inputs["Color"].default_value[:3])
                glow = True
    else:
        rgb = tuple(mat.diffuse_color[:3])
    out = (to_hex(rgb), glow)
    _MAT_CACHE[mat.name] = out
    return out


# ------------------------------------------------------------------- shells


class Shell:
    __slots__ = ("bvh", "lo", "hi", "volume", "sign", "mat", "closed")


def split_shells(obj):
    """Splits a part object into its loose primitives, in pivot-relative world orientation."""
    deps = bpy.context.evaluated_depsgraph_get()
    eo = obj.evaluated_get(deps)
    me = eo.to_mesh()
    bm = bmesh.new()
    bm.from_mesh(me)
    eo.to_mesh_clear()

    rot = obj.matrix_world.to_3x3()
    for v in bm.verts:
        v.co = rot @ v.co
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.verts.ensure_lookup_table()
    bm.faces.ensure_lookup_table()

    # Union-find over vertices shared by faces.
    parent = list(range(len(bm.verts)))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    for f in bm.faces:
        idx = [v.index for v in f.verts]
        r0 = find(idx[0])
        for k in idx[1:]:
            rk = find(k)
            if rk != r0:
                parent[rk] = r0

    groups = {}
    for f in bm.faces:
        groups.setdefault(find(f.verts[0].index), []).append(f)

    mats = list(obj.data.materials)
    shells = []
    for faces in groups.values():
        vmap, verts, polys = {}, [], []
        vol6 = 0.0
        mcount = {}
        for f in faces:
            tri = []
            for v in f.verts:
                if v.index not in vmap:
                    vmap[v.index] = len(verts)
                    verts.append(v.co.copy())
                tri.append(vmap[v.index])
            polys.append(tri)
            a, b, c = (verts[t] for t in tri)
            vol6 += a.dot(b.cross(c))
            mcount[f.material_index] = mcount.get(f.material_index, 0) + f.calc_area()
        if len(verts) < 3:
            continue
        s = Shell()
        s.bvh = BVHTree.FromPolygons(verts, polys)
        s.lo = Vector((min(v.x for v in verts), min(v.y for v in verts), min(v.z for v in verts)))
        s.hi = Vector((max(v.x for v in verts), max(v.y for v in verts), max(v.z for v in verts)))
        s.volume = abs(vol6) / 6.0
        s.sign = 1.0 if vol6 >= 0 else -1.0
        dims = s.hi - s.lo
        box = max(1e-9, dims.x * dims.y * dims.z)
        # An open surface (a decal card, a fin plane) has ~no enclosed volume.
        s.closed = s.volume > box * 0.02
        mi = max(mcount, key=mcount.get) if mcount else 0
        s.mat = mats[mi] if 0 <= mi < len(mats) else None
        shells.append(s)
    bm.free()
    return shells


def inside(shell, p, half):
    hit = shell.bvh.find_nearest(p)
    if hit[0] is None:
        return False
    loc, normal, _i, dist = hit
    if not shell.closed:
        return dist <= half
    return (loc - p).dot(normal) * shell.sign > 0.0


SUB = [(-0.3, -0.3, -0.3), (0.3, -0.3, -0.3), (-0.3, 0.3, -0.3), (0.3, 0.3, -0.3),
       (-0.3, -0.3, 0.3), (0.3, -0.3, 0.3), (-0.3, 0.3, 0.3), (0.3, 0.3, 0.3)]


def voxelize_object(obj, vs, palette):
    """Returns {(i, j, k): palette index} in Blender axes (i: X, j: Y, k: Z)."""
    shells = split_shells(obj)
    shells.sort(key=lambda s: -s.volume)  # largest first; smaller shells overwrite
    cells = {}
    half = vs * 0.5
    for s in shells:
        dims = s.hi - s.lo
        thin = min(dims.x, dims.y, dims.z) < vs * 1.2 or not s.closed
        i0, i1 = math.floor(s.lo.x / vs - 0.5), math.ceil(s.hi.x / vs + 0.5)
        j0, j1 = math.floor(s.lo.y / vs - 0.5), math.ceil(s.hi.y / vs + 0.5)
        k0, k1 = math.floor(s.lo.z / vs - 0.5), math.ceil(s.hi.z / vs + 0.5)
        colour = material_info(s.mat)
        if colour not in palette:
            palette[colour] = len(palette)
        ci = palette[colour]
        for i in range(i0, i1 + 1):
            x = i * vs
            if x < s.lo.x - half or x > s.hi.x + half:
                continue
            for j in range(j0, j1 + 1):
                y = j * vs
                if y < s.lo.y - half or y > s.hi.y + half:
                    continue
                for k in range(k0, k1 + 1):
                    z = k * vs
                    if z < s.lo.z - half or z > s.hi.z + half:
                        continue
                    p = Vector((x, y, z))
                    hit = inside(s, p, half)
                    if not hit and thin:
                        for (a, b, c) in SUB:
                            if inside(s, Vector((x + a * vs, y + b * vs, z + c * vs)), half * 0.6):
                                hit = True
                                break
                    if hit:
                        cells[(i, j, k)] = ci
    return cells


# ------------------------------------------------------------------ energy


def voxelize_sprite(path, vox, palette, alpha_cut=0.32):
    """A painted energy part as a thin glowing slab, centred on its pivot."""
    img = bpy.data.images.load(path, check_existing=False)
    w, h = img.size
    px = list(img.pixels)  # RGBA floats, bottom row first
    bpy.data.images.remove(img)
    step = vox * SPRITE_PX_PER_LOGICAL  # sprite pixels per voxel (vox is logical px)
    cells = {}
    cx, cy = w / 2.0, h / 2.0
    imin = math.floor(-cx / step) - 1
    imax = math.ceil(cx / step) + 1
    kmin = math.floor(-cy / step) - 1
    kmax = math.ceil(cy / step) + 1
    for i in range(imin, imax + 1):
        for k in range(kmin, kmax + 1):
            # Voxel centre in sprite pixels. Sprite rows run top-down in logical
            # space but bottom-up in `pixels`; k is up.
            u0 = cx + (i - 0.5) * step
            v0 = cy + (k - 0.5) * step  # bottom-up row coordinate
            sa = sr = sg = sb = 0.0
            n = 0
            for uu in range(int(u0), int(u0 + step) + 1):
                if uu < 0 or uu >= w:
                    continue
                for vv in range(int(v0), int(v0 + step) + 1):
                    if vv < 0 or vv >= h:
                        continue
                    o = (vv * w + uu) * 4
                    a = px[o + 3]
                    sa += a
                    sr += px[o] * a
                    sg += px[o + 1] * a
                    sb += px[o + 2] * a
                    n += 1
            if n == 0:
                continue
            avg = sa / n
            if avg < alpha_cut:
                continue
            r, g, b = sr / sa, sg / sa, sb / sa
            # Sprite pixels are already display-referred; quantise so a blade
            # does not spray the palette with a hundred near-identical tones.
            q = lambda c: round(max(0.0, min(1.0, c)) * 12) / 12
            hexc = (int(q(r) * 255) << 16) | (int(q(g) * 255) << 8) | int(q(b) * 255)
            colour = (hexc, True)
            if colour not in palette:
                palette[colour] = len(palette)
            ci = palette[colour]
            cells[(i, 0, k)] = ci
            if avg > 0.82:
                cells[(i, 1, k)] = ci
                cells[(i, -1, k)] = ci
    return cells


# ------------------------------------------------------------------- export


def encode(cells):
    """Game axes, packed as int8 quads (x, y, z, colour) in base64."""
    buf = bytearray()
    for (i, j, k), c in sorted(cells.items()):
        x, y, z = i, k, -j
        if max(abs(x), abs(y), abs(z)) > 127 or c > 255:
            raise ValueError(f"voxel out of int8 range: {(x, y, z, c)}")
        buf += struct.pack("bbbB", x, y, z, c)
    return base64.b64encode(bytes(buf)).decode("ascii")


def bounds(cells):
    if not cells:
        return None
    xs = [i for (i, _j, _k) in cells]
    ys = [k for (_i, _j, k) in cells]
    zs = [-j for (_i, j, _k) in cells]
    return [min(xs), min(ys), min(zs), max(xs), max(ys), max(zs)]


def run():
    vox, only = parse_args()
    root = project_root()
    out_dir = os.path.join(root, "assets", "voxels")
    sprite_dir = os.path.join(root, "assets", "sprites", "mechs")
    os.makedirs(out_dir, exist_ok=True)
    vs = vox / LOGICAL_PER_BU
    report = {}
    for mech in ROSTER:
        if only and mech not in only:
            continue
        t0 = time.time()
        palette = {}
        parts = {}
        core = bpy.data.objects.get(f"{mech}_core")
        if core is None:
            print(f"VOXELIZE {mech}: no core object, skipped")
            continue
        for part in PARTS:
            obj = bpy.data.objects.get(f"{mech}_{part}")
            if obj is None or obj.type != "MESH":
                continue
            cells = voxelize_object(obj, vs, palette)
            rel = obj.matrix_world.translation - core.matrix_world.translation
            parts[part] = {
                "n": len(cells),
                "bounds": bounds(cells),
                # Pivot relative to the core, in logical px: x forward, y down
                # (the rig's own convention, checked against MechDef.rig by
                # src/tests/voxel.test.ts), z toward the camera. The rig carries
                # no depth, so z is the only record of where a part sits front
                # to back — the near arm ahead of the hull, the far one behind.
                "origin": [
                    round(rel.x * LOGICAL_PER_BU, 2),
                    round(-rel.z * LOGICAL_PER_BU, 2),
                    round(-rel.y * LOGICAL_PER_BU, 2),
                ],
                "v": encode(cells),
            }
        for part in ENERGY_PARTS:
            path = os.path.join(sprite_dir, f"{mech}_{part}.png")
            if not os.path.exists(path):
                continue
            cells = voxelize_sprite(path, vox, palette)
            parts[part] = {"n": len(cells), "bounds": bounds(cells), "v": encode(cells)}

        pal = [None] * len(palette)
        for (hexc, glow), idx in palette.items():
            pal[idx] = [hexc, 1 if glow else 0]
        data = {
            "id": mech,
            "voxelPx": vox,
            "source": "assets/blender/mechs.blend via tools/blender/voxelize_mechs.py",
            "palette": pal,
            "parts": parts,
        }
        with open(os.path.join(out_dir, f"{mech}.json"), "w", encoding="utf-8") as fh:
            json.dump(data, fh, separators=(",", ":"))
        report[mech] = {p: parts[p]["n"] for p in parts}
        print(f"VOXELIZE {mech}: {sum(report[mech].values())} voxels, {len(pal)} colours, {time.time() - t0:.1f}s")
    print("VOXELIZE_DONE " + json.dumps(report))


run()
