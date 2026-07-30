"""
Babel Sword: Reignition - procedural multipart mech builder.

Run inside Blender (the project drives it through the Blender MCP server):

    exec(open(r"<project>/tools/blender/build_mechs.py").read())
    build_all(r"<project>")

Design language
---------------
Calibrated against the reference roster art (see docs/REFERENCE_AUDIT.md). These
are NOT upright humanoid mecha. The house style is:

* a hunched, forward-pitched torso with a low, small cockpit pod instead of a head
* reverse-joint ("chicken walker") legs: high hip, knee swept BACK, shin angling
  down-forward onto a wide splayed foot pad
* an oversized rifle held forward in both arms, dominating the silhouette
* a big rounded shoulder pauldron with a disc hub, plus a layered dorsal backpack
* a WIDE horizontal composition, roughly 1.5x wider than tall
* near-monochrome armour (off-white shell, mid-grey far-side limbs, dark joints)
  with one saturated accent used only on small chips
* far-side limbs deliberately darker - that contrast is what sells the depth

The forms stay chunky and faceted on purpose: the reference sprites were clearly
3D renders downsampled to pixel art, so hard planes read better than smooth ones.

Every mech is built as SEPARATE objects, one per part, as CLAUDE.md requires:
core, head, left/right arm, main/sub weapon, lower body, backpack, left/right
thruster. Each part's origin is its pivot.

Scale contract
--------------
PX_PER_BU = 120 render pixels per Blender unit, displayed at 0.5 scale, so
1 Blender unit == 60 logical game pixels. The rig offsets in src/data/mechs.ts
are authored in those same logical pixels.
"""

import math
import os

import bpy
from mathutils import Vector

# ---------------------------------------------------------------- constants

PX_PER_BU = 120.0
DISPLAY_SCALE = 0.5
LOGICAL_PER_BU = PX_PER_BU * DISPLAY_SCALE  # 60
TILE = 320  # square render target per part (fits the long forward-held rifle)
ORTHO_SCALE = TILE / PX_PER_BU  # 2.667 BU across the frame

# Shallow three-quarter side view, matching the reference art's viewing angle.
CAM_AZIMUTH = math.radians(15.0)
CAM_ELEVATION = math.radians(9.0)
CAM_DIST = 9.0

# Dark contour lines. The reference sprites read crisply at ~100px because of
# hard edge contrast; Freestyle reproduces that.
USE_OUTLINES = True
OUTLINE_THICKNESS = 1.7

PART_ORDER = [
    "core",
    "head",
    "backpack",
    "lowerBody",
    "leftArm",
    "subWeapon",
    "rightArm",
    "mainWeapon",
    "leftThruster",
    "rightThruster",
]

"""
Chassis specifications.

Each mech is a genuinely different machine, not a palette swap: hull mass, body
pitch, leg length and thickness, weapon type, booster layout, shoulder pod and
melee hardpoint all vary. `pivots` must be mirrored by that mech's rig in
src/data/mechs.ts (child offsets there are relative to the parent).
"""
CHASSIS = {
    # Light interceptor: slim, strongly pitched, long legs, precision rifle.
    "halcyon": {
        "pitch": 24.0,
        "hull": (0.62, 0.34, 0.30),
        "leg": {"thigh": 0.46, "shin": 0.50, "w": 0.15, "foot": 0.32, "hip": 0.36},
        "weapon": "rifle",
        "booster": "twin",
        "pod": "compact",
        "blade": "beam",
        "pivots": {
            "core": (0, 0, 0.0),
            "head": (21, -7, -0.05),
            "backpack": (-26, -18, 0.05),
            "lowerBody": (-8, 26, 0.0),
            "leftArm": (-2, -2, 0.19),
            "subWeapon": (-5, -25, 0.19),
            "rightArm": (16, 6, -0.19),
            "mainWeapon": (54, 14, -0.19),
            "leftThruster": (-36, 0, 0.17),
            "rightThruster": (-32, 12, -0.17),
        },
    },
    # Heavy assault: broad, squat, short thick legs, rotary cannon, one big burner.
    "nocturne": {
        "pitch": 15.0,
        "hull": (0.76, 0.46, 0.38),
        "leg": {"thigh": 0.36, "shin": 0.38, "w": 0.21, "foot": 0.40, "hip": 0.46},
        "weapon": "gatling",
        "booster": "single",
        "pod": "rack",
        "blade": "claw",
        "pivots": {
            "core": (0, 0, 0.0),
            "head": (23, -2, -0.05),
            "backpack": (-30, -14, 0.05),
            "lowerBody": (-10, 24, 0.0),
            "leftArm": (-4, 0, 0.22),
            "subWeapon": (-10, -26, 0.22),
            "rightArm": (18, 10, -0.22),
            "mainWeapon": (58, 16, -0.22),
            "leftThruster": (-40, 4, 0.14),
            "rightThruster": (-34, 16, -0.14),
        },
    },
}

# The reference roster is near-monochrome: an off-white armour shell, a mid-grey
# for far-side limbs (which is what sells the depth), dark frame joints, and a
# single saturated accent used only on small chips. Faction identity lives in the
# accent, not in the body colour.
PALETTES = {
    "halcyon": {
        "primary": (0.78, 0.80, 0.83),   # off-white armour
        "far": (0.44, 0.47, 0.53),       # far-side limbs, deliberately darker
        "secondary": (0.30, 0.33, 0.39),  # under-armour plating
        "frame": (0.11, 0.12, 0.15),     # joints, pistons, barrel
        "accent": (0.30, 1.00, 0.42),    # small chips only
        "glow": (0.42, 0.86, 1.00),
    },
    # The rival runs a dark gunmetal scheme. The reference kept the whole roster
    # near-monochrome and separated the two fighters with per-player palettes;
    # this does the same job and keeps the two readable apart mid-fight.
    "nocturne": {
        "primary": (0.30, 0.28, 0.33),
        "far": (0.17, 0.16, 0.20),
        "secondary": (0.20, 0.18, 0.23),
        "frame": (0.09, 0.08, 0.10),
        "accent": (1.00, 0.30, 0.48),
        "glow": (1.00, 0.46, 0.84),
    },
}


# ---------------------------------------------------------------- utilities


def px(x, y, depth=0.0):
    """Logical-pixel pivot -> Blender world vector."""
    return Vector((x / LOGICAL_PER_BU, depth, -y / LOGICAL_PER_BU))


def active():
    """`bpy.context.active_object` is absent right after an empty-file read."""
    obj = getattr(bpy.context, "active_object", None)
    if obj is None:
        obj = bpy.context.view_layer.objects.active
    return obj


def override(active_obj, selected):
    """
    Context override for object operators.

    Driven over the MCP bridge `bpy.context` has no area/region and operators
    such as object.join fail their poll. Supplying the objects explicitly makes
    them work regardless of UI context (and in `blender --background`).
    """
    return bpy.context.temp_override(
        object=active_obj,
        active_object=active_obj,
        selected_objects=list(selected),
        selected_editable_objects=list(selected),
    )


def ensure_collection(name):
    coll = bpy.data.collections.get(name)
    if coll is None:
        coll = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(coll)
    return coll


def clear_collection(name):
    coll = bpy.data.collections.get(name)
    if coll is None:
        return
    for obj in list(coll.objects):
        bpy.data.objects.remove(obj, do_unlink=True)


def _scale_rgb(rgb, k, toward=None):
    if toward is None:
        return tuple(min(1.0, max(0.0, c * k)) for c in rgb)
    return tuple(min(1.0, max(0.0, c + (t - c) * k)) for c, t in zip(rgb, toward))


def _mix(nt, fac, a, b):
    """Colour mix node, tolerating the Mix/MixRGB rename across versions."""
    try:
        n = nt.nodes.new("ShaderNodeMix")
        n.data_type = "RGBA"
        n.blend_type = "MIX"
        n.inputs["Factor"].default_value = 0.0
        ia, ib, io = n.inputs[6], n.inputs[7], n.outputs[2]
    except (RuntimeError, KeyError, IndexError):
        n = nt.nodes.new("ShaderNodeMixRGB")
        n.blend_type = "MIX"
        ia, ib, io = n.inputs["Color1"], n.inputs["Color2"], n.outputs["Color"]
    if hasattr(fac, "default_value") or fac is None:
        pass
    if isinstance(a, tuple):
        ia.default_value = (*a, 1.0)
    else:
        nt.links.new(a, ia)
    if isinstance(b, tuple):
        ib.default_value = (*b, 1.0)
    else:
        nt.links.new(b, ib)
    if fac is not None:
        nt.links.new(fac, n.inputs[0])
    return n, io


def make_material(name, rgb, emission=0.0, roughness=0.45, metallic=0.25, detail=True):
    """
    Armour material with procedural surface interest.

    Flat albedo is what makes an untextured model read as "clunky plastic". The
    reference sprites have machined highlights along every edge, panel seams, and
    uneven grime. All three are generated procedurally here so no texture files
    are needed and the result stays original:

      * Pointiness  -> bright worn edges (and slightly glossier there)
      * Wave x2     -> a panel-seam grid in object space
      * Noise x2    -> fine grime plus broad tonal drift
    """
    mat = bpy.data.materials.get(name)
    if mat is None:
        mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    nt.links.new(bsdf.outputs[0], out.inputs[0])

    if emission > 0.0:
        for key in ("Emission Color", "Emission"):
            if key in bsdf.inputs:
                bsdf.inputs[key].default_value = (*rgb, 1.0)
                break
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = emission

    if not detail or emission > 0.0:
        bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
        return mat

    try:
        coord = nt.nodes.new("ShaderNodeTexCoord")

        # --- panel seams: two banded waves crossed into a grid ---------
        # Panels must stay large: a part is only ~35 logical px on screen, so a
        # dense grid turns into halftone mush rather than reading as panelling.
        seams = []
        for axis, scale in (("X", 2.2), ("Z", 1.7)):
            w = nt.nodes.new("ShaderNodeTexWave")
            w.wave_type = "BANDS"
            try:
                w.bands_direction = axis
            except (AttributeError, TypeError):
                pass
            w.inputs["Scale"].default_value = scale
            w.inputs["Distortion"].default_value = 0.0
            nt.links.new(coord.outputs["Object"], w.inputs["Vector"])
            # Black inside the thin band, white elsewhere. With CONSTANT
            # interpolation the stop colour applies from its position upward, so
            # these must be in this order - reversing them yields isolated dots
            # at the band crossings instead of a line grid.
            r = nt.nodes.new("ShaderNodeValToRGB")
            r.color_ramp.interpolation = "CONSTANT"
            r.color_ramp.elements[0].position = 0.0
            r.color_ramp.elements[0].color = (0, 0, 0, 1)
            r.color_ramp.elements[1].position = 0.045  # end of the seam band
            r.color_ramp.elements[1].color = (1, 1, 1, 1)
            nt.links.new(w.outputs["Fac"], r.inputs["Fac"])
            seams.append(r.outputs["Color"])
        seam_mix = nt.nodes.new("ShaderNodeMath")
        seam_mix.operation = "MULTIPLY"
        nt.links.new(seams[0], seam_mix.inputs[0])
        nt.links.new(seams[1], seam_mix.inputs[1])
        # 0 in the seam, 1 elsewhere -> invert into a "seam strength" factor.
        seam_inv = nt.nodes.new("ShaderNodeMath")
        seam_inv.operation = "SUBTRACT"
        seam_inv.inputs[0].default_value = 1.0
        nt.links.new(seam_mix.outputs[0], seam_inv.inputs[1])

        # --- grime + broad tonal drift ----------------------------------
        fine = nt.nodes.new("ShaderNodeTexNoise")
        fine.inputs["Scale"].default_value = 12.0
        fine.inputs["Detail"].default_value = 4.0
        nt.links.new(coord.outputs["Object"], fine.inputs["Vector"])
        fine_r = nt.nodes.new("ShaderNodeValToRGB")
        fine_r.color_ramp.elements[0].position = 0.42
        fine_r.color_ramp.elements[1].position = 0.72
        nt.links.new(fine.outputs["Fac"], fine_r.inputs["Fac"])

        broad = nt.nodes.new("ShaderNodeTexNoise")
        broad.inputs["Scale"].default_value = 3.2
        broad.inputs["Detail"].default_value = 2.0
        nt.links.new(coord.outputs["Object"], broad.inputs["Vector"])

        # --- machined edge wear -----------------------------------------
        geo = nt.nodes.new("ShaderNodeNewGeometry")
        edge_r = nt.nodes.new("ShaderNodeValToRGB")
        edge_r.color_ramp.elements[0].position = 0.50
        edge_r.color_ramp.elements[1].position = 0.60
        nt.links.new(geo.outputs["Pointiness"], edge_r.inputs["Fac"])

        # --- compose -----------------------------------------------------
        grime = _scale_rgb(rgb, 0.70)
        drift = _scale_rgb(rgb, 0.88)
        edge = _scale_rgb(rgb, 0.55, toward=(1.0, 1.0, 1.0))
        seam_col = _scale_rgb(rgb, 0.40)

        n1, c1 = _mix(nt, fine_r.outputs["Color"], rgb, grime)
        n1.inputs[0].default_value = 0.0
        # Damp the grime so it reads as tone, not dirt.
        fine_fac = nt.nodes.new("ShaderNodeMath")
        fine_fac.operation = "MULTIPLY"
        fine_fac.inputs[1].default_value = 0.30
        nt.links.new(fine_r.outputs["Color"], fine_fac.inputs[0])
        nt.links.new(fine_fac.outputs[0], n1.inputs[0])

        broad_fac = nt.nodes.new("ShaderNodeMath")
        broad_fac.operation = "MULTIPLY"
        broad_fac.inputs[1].default_value = 0.35
        nt.links.new(broad.outputs["Fac"], broad_fac.inputs[0])
        _n2, c2 = _mix(nt, broad_fac.outputs[0], c1, drift)

        seam_fac = nt.nodes.new("ShaderNodeMath")
        seam_fac.operation = "MULTIPLY"
        seam_fac.inputs[1].default_value = 0.45
        nt.links.new(seam_inv.outputs[0], seam_fac.inputs[0])
        _n3, c3 = _mix(nt, seam_fac.outputs[0], c2, seam_col)

        _n4, c4 = _mix(nt, edge_r.outputs["Color"], c3, edge)
        nt.links.new(c4, bsdf.inputs["Base Color"])

        # Edges are polished, flats are duller.
        rough_mix = nt.nodes.new("ShaderNodeMapRange")
        rough_mix.inputs["From Min"].default_value = 0.0
        rough_mix.inputs["From Max"].default_value = 1.0
        rough_mix.inputs["To Min"].default_value = roughness
        rough_mix.inputs["To Max"].default_value = max(0.08, roughness * 0.5)
        nt.links.new(edge_r.outputs["Color"], rough_mix.inputs["Value"])
        nt.links.new(rough_mix.outputs["Result"], bsdf.inputs["Roughness"])
    except (AttributeError, KeyError, RuntimeError, IndexError, TypeError):
        # Any node-API drift falls back to a plain shaded material.
        bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)

    return mat


def _relink(obj, coll):
    if coll is None:
        return
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    coll.objects.link(obj)


def add_box(name, size, loc, rot=(0, 0, 0), bevel=0.010, coll=None, mat=None, bevel_seg=2):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc, rotation=rot)
    obj = active()
    obj.name = name
    obj.scale = Vector(size)
    with override(obj, [obj]):
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        mod = obj.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = bevel_seg
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(40)
    _relink(obj, coll)
    if mat is not None:
        obj.data.materials.append(mat)
    return obj


def along(base, angle, dist):
    """Point `dist` down a limb whose axis is rotated `angle` about Y."""
    return base + Vector((-dist * math.sin(angle), 0, -dist * math.cos(angle)))


def bolt_row(prefix, count, start, step, radius, coll, mat, axis="Y"):
    """A row of rivet heads. Cheap detail that reads well at sprite scale."""
    rot = (math.radians(90), 0, 0) if axis == "Y" else (0, math.radians(90), 0)
    out = []
    for i in range(count):
        out.append(
            add_cyl(f"{prefix}{i}", radius, radius * 1.1,
                    start + step * i, rot, 8, coll=coll, mat=mat)
        )
    return out


def segmented_limb(prefix, hip, angle, length, width, depth, coll, shell, frame,
                   segments=3, taper=0.94):
    """
    A limb built from stacked armour bands separated by recessed dark gaps.

    The reference limbs are visibly segmented rather than smooth tubes, and that
    banding is most of what makes them read as machinery at small size.

    The gap is a *narrower* box, not a cylinder: a side-facing disc reads as a
    hole punched through the limb and turns the leg into a string of beads.
    """
    out = []
    seg_len = length / segments
    for i in range(segments):
        d = seg_len * (i + 0.5)
        w = width * (taper ** i)
        out.append(
            add_box(f"{prefix}_seg{i}", (w + 0.02, depth * (taper ** i), seg_len * 0.80),
                    along(hip, angle, d), (0, angle, 0), coll=coll, mat=shell)
        )
        if i < segments - 1:
            gw = w * 0.86
            out.append(
                add_box(f"{prefix}_gap{i}", (gw, depth * (taper ** i) * 0.86, seg_len * 0.22),
                        along(hip, angle, seg_len * (i + 1)), (0, angle, 0),
                        bevel=0.006, coll=coll, mat=frame)
            )
    return out


def add_cyl(name, radius, depth, loc, rot=(0, 0, 0), verts=16, coll=None,
            cone_r2=None, mat=None):
    if cone_r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(
            radius=radius, depth=depth, location=loc, rotation=rot, vertices=verts
        )
    else:
        bpy.ops.mesh.primitive_cone_add(
            radius1=radius, radius2=cone_r2, depth=depth,
            location=loc, rotation=rot, vertices=verts,
        )
    obj = active()
    obj.name = name
    _relink(obj, coll)
    if mat is not None:
        obj.data.materials.append(mat)
    return obj


def apply_modifiers(obj):
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    for mod in list(obj.modifiers):
        try:
            with override(obj, [obj]):
                bpy.ops.object.modifier_apply(modifier=mod.name)
        except RuntimeError:
            obj.modifiers.remove(mod)


def join_as(name, objs, pivot, coll):
    """Joins `objs` into one part object whose origin sits at `pivot`."""
    for o in objs:
        apply_modifiers(o)
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        with override(objs[0], objs):
            bpy.ops.object.join()
    obj = objs[0]
    obj.name = name

    prev = tuple(bpy.context.scene.cursor.location)
    bpy.context.scene.cursor.location = pivot
    with override(obj, [obj]):
        bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    bpy.context.scene.cursor.location = prev

    _relink(obj, coll)
    return obj


# ---------------------------------------------------------------- mech build


def build_mech(mech_id, palette_key=None):
    """Builds one mech's ten parts into a collection named after `mech_id`."""
    pal = PALETTES[palette_key or mech_id]
    spec = CHASSIS[mech_id]
    P = spec["pivots"]
    PITCH = math.radians(spec["pitch"])
    LEG = spec["leg"]
    HULL = spec["hull"]
    coll_name = f"MECH_{mech_id.upper()}"
    clear_collection(coll_name)
    coll = ensure_collection(coll_name)

    M_HULL = make_material(f"{mech_id}_hull", pal["primary"], roughness=0.44)
    M_FAR = make_material(f"{mech_id}_far", pal["far"], roughness=0.5)
    M_SUB = make_material(f"{mech_id}_sub", pal["secondary"], roughness=0.5)
    M_FRAME = make_material(f"{mech_id}_frame", pal["frame"], roughness=0.62, metallic=0.7)
    M_ACC = make_material(f"{mech_id}_accent", pal["accent"], emission=1.1, roughness=0.35)
    M_GLOW = make_material(f"{mech_id}_glow", pal["glow"], emission=2.1, roughness=0.2, metallic=0.0)

    parts = {}

    def pn(name):
        return f"{mech_id}_{name}"

    # ---- core: hunched, forward-pitched hull ---------------------------
    piv = px(*P["core"])
    R = (0, PITCH, 0)
    hx, hy, hz = HULL
    o = []
    o.append(add_box("c_hull", (hx, hy, hz), piv + Vector((0.02, 0, 0)), R, coll=coll, mat=M_HULL))
    o.append(add_box("c_deck", (hx * 0.74, hy * 0.9, 0.10), piv + Vector((-0.03, 0, hz * 0.60)), R,
                     coll=coll, mat=M_HULL))
    o.append(add_box("c_nose", (0.24, hy * 0.82, 0.24), piv + Vector((hx * 0.50, 0, -0.10)), R,
                     coll=coll, mat=M_SUB))
    o.append(add_box("c_belly", (hx * 0.62, hy * 0.88, 0.12), piv + Vector((0.04, 0, -hz * 0.60)), R,
                     coll=coll, mat=M_SUB))
    o.append(add_box("c_collar", (0.18, hy + 0.02, hz * 0.94), piv + Vector((-hx * 0.48, 0, 0.06)),
                     coll=coll, mat=M_FRAME))
    o.append(add_box("c_vent0", (0.18, 0.05, 0.05), piv + Vector((0.14, -hy * 0.55, 0.06)), R,
                     coll=coll, mat=M_ACC))
    o.append(add_box("c_vent1", (0.10, 0.05, 0.04), piv + Vector((-0.10, -hy * 0.55, -0.08)), R,
                     coll=coll, mat=M_ACC))
    for i, (gx, gz) in enumerate(((0.16, 0.16), (-0.06, 0.17), (-0.20, 0.13))):
        o.append(add_box(f"c_pan{i}", (0.10, hy * 0.6, 0.035),
                         piv + Vector((gx, 0, gz + 0.03)), R, coll=coll, mat=M_FRAME))
    # Overlapping side plates with a visible step - the dominant reference motif.
    for i, (px_, pz, pw) in enumerate(((0.20, 0.02, 0.20), (-0.02, -0.02, 0.24), (-0.22, 0.00, 0.18))):
        o.append(add_box(f"c_plate{i}", (pw, 0.06, hz * 0.62),
                         piv + Vector((px_, -hy * 0.52, pz)), R,
                         bevel=0.018, bevel_seg=3, coll=coll, mat=M_SUB))
    o += bolt_row("c_bolt", 4, piv + Vector((-0.22, -hy * 0.57, hz * 0.30)),
                  Vector((0.14, 0, -0.03)), 0.014, coll, M_FRAME)
    # Hydraulic actuator across the waist joint.
    o.append(add_cyl("c_ram", 0.026, 0.26, piv + Vector((-0.16, -hy * 0.40, -hz * 0.42)),
                     (0, math.radians(64), 0), 8, coll=coll, mat=M_FRAME))
    if spec["weapon"] == "gatling":
        # The heavy frame carries an ammo hopper feeding the rotary cannon.
        o.append(add_box("c_hopper", (0.26, hy * 0.5, 0.20), piv + Vector((0.10, -hy * 0.42, -0.22)),
                         R, coll=coll, mat=M_FRAME))
    parts["core"] = join_as(pn("core"), o, piv, coll)

    # ---- head: small forward cockpit pod --------------------------------
    piv = px(*P["head"])
    o = []
    o.append(add_box("h_pod", (0.22, 0.20, 0.17), piv, R, coll=coll, mat=M_HULL))
    o.append(add_box("h_visor", (0.15, 0.055, 0.06), piv + Vector((0.09, -0.10, -0.01)), R, coll=coll, mat=M_GLOW))
    o.append(add_box("h_brow", (0.12, 0.22, 0.05), piv + Vector((0.03, 0, 0.10)), R, coll=coll, mat=M_ACC))
    o.append(add_box("h_jaw", (0.12, 0.16, 0.06), piv + Vector((0.06, 0, -0.10)), R, coll=coll, mat=M_FRAME))
    o.append(add_cyl("h_ant", 0.008, 0.22, piv + Vector((-0.08, 0.04, 0.19)),
                     (math.radians(14), 0, 0), 8, coll=coll, mat=M_FRAME))
    # Sensor cluster: a small dish plus twin scopes beside the main optic.
    o.append(add_cyl("h_dish", 0.045, 0.03, piv + Vector((0.02, -0.11, 0.09)),
                     (0, math.radians(90), 0), 12, coll=coll, cone_r2=0.028, mat=M_FRAME))
    for i, dz in enumerate((0.035, -0.035)):
        o.append(add_cyl(f"h_scope{i}", 0.016, 0.07, piv + Vector((0.11, 0.08, dz)),
                         (0, math.radians(90), 0), 8, coll=coll, mat=M_ACC))
    parts["head"] = join_as(pn("head"), o, piv, coll)

    # ---- backpack: layered dorsal block ----------------------------------
    piv = px(*P["backpack"])
    o = []
    if spec["booster"] == "twin":
        # Interceptor: tall, finned, antenna-topped.
        o.append(add_box("b_main", (0.30, 0.34, 0.36), piv, R, coll=coll, mat=M_SUB))
        o.append(add_box("b_lid", (0.26, 0.30, 0.08), piv + Vector((0.0, 0, 0.22)), R, coll=coll, mat=M_HULL))
        o.append(add_box("b_spine", (0.10, 0.20, 0.38), piv + Vector((-0.17, 0, -0.02)), coll=coll, mat=M_FRAME))
        for i, z in enumerate((0.12, 0.0, -0.12)):
            o.append(add_box(f"b_fin{i}", (0.18, 0.05, 0.035),
                             piv + Vector((-0.21, 0, z)), (0, math.radians(18), 0), coll=coll, mat=M_ACC))
        for i, dy in enumerate((-0.13, 0.13)):
            o.append(add_cyl(f"b_spike{i}", 0.012, 0.32, piv + Vector((-0.10, dy, 0.34)),
                             (math.radians(10), math.radians(-16), 0), 8, coll=coll, mat=M_FRAME))
    else:
        # Assault: a wide radiator block with stacked exhaust chimneys.
        o.append(add_box("b_main", (0.40, 0.46, 0.30), piv, R, coll=coll, mat=M_SUB))
        o.append(add_box("b_armor", (0.34, 0.50, 0.10), piv + Vector((0.0, 0, 0.19)), R, coll=coll, mat=M_HULL))
        for i, dy in enumerate((-0.16, 0.16)):
            o.append(add_cyl(f"b_stack{i}", 0.055, 0.30, piv + Vector((-0.14, dy, 0.24)),
                             (0, math.radians(-12), 0), 12, coll=coll, mat=M_FRAME))
            o.append(add_cyl(f"b_stackc{i}", 0.045, 0.05, piv + Vector((-0.17, dy, 0.39)),
                             (0, math.radians(-12), 0), 12, coll=coll, mat=M_ACC))
        for i, z in enumerate((0.06, -0.08)):
            o.append(add_box(f"b_grill{i}", (0.06, 0.40, 0.05),
                             piv + Vector((-0.22, 0, z)), coll=coll, mat=M_FRAME))
    parts["backpack"] = join_as(pn("backpack"), o, piv, coll)

    # ---- lower body: hips + two reverse-joint legs ------------------------
    piv = px(*P["lowerBody"])
    o = []
    lw = LEG["w"]
    o.append(add_box("l_hips", (LEG["hip"], LEG["hip"] + 0.02, 0.24), piv + Vector((0, 0, 0.06)),
                     coll=coll, mat=M_HULL))
    o.append(add_box("l_skirt", (0.26, LEG["hip"] * 0.9, 0.12), piv + Vector((0.12, 0, -0.08)),
                     (0, math.radians(14), 0), coll=coll, mat=M_SUB))
    o.append(add_box("l_tail", (0.16, 0.24, 0.14), piv + Vector((-0.22, 0, 0.02)), coll=coll, mat=M_FRAME))

    THIGH_A = math.radians(32)   # top forward, bottom swept back
    SHIN_A = math.radians(-36)   # knee back, foot forward
    spread = LEG["hip"] * 0.46
    for side, (dy, mat_leg) in enumerate(((-spread, M_HULL), (spread, M_FAR))):
        hip = Vector((0.0, dy, -0.02))
        o.append(add_cyl(f"l_hub{side}", lw * 0.66, 0.10, piv + hip,
                         (math.radians(90), 0, 0), 14, coll=coll, mat=M_FRAME))
        tl = LEG["thigh"]
        o += segmented_limb(f"l_thigh{side}", piv + hip, THIGH_A, tl, lw, lw + 0.01,
                            coll, mat_leg, M_FRAME, segments=3)
        knee = hip + Vector((-tl * math.sin(THIGH_A), 0, -tl * math.cos(THIGH_A)))
        o.append(add_cyl(f"l_knee{side}", lw * 0.6, lw + 0.03, piv + knee,
                         (math.radians(90), 0, 0), 14, coll=coll, mat=M_FRAME))
        o.append(add_box(f"l_kneecap{side}", (lw * 0.7, lw * 0.5, lw * 0.7),
                         piv + along(knee, THIGH_A, -0.02) + Vector((lw * 0.42, 0, 0)),
                         (0, THIGH_A, 0), coll=coll, mat=M_SUB))
        sl = LEG["shin"]
        sc = knee + Vector((-(sl / 2) * math.sin(SHIN_A), 0, -(sl / 2) * math.cos(SHIN_A)))
        o += segmented_limb(f"l_shin{side}", piv + knee, SHIN_A, sl, lw - 0.01, lw - 0.01,
                            coll, mat_leg, M_FRAME, segments=3)
        o.append(add_cyl(f"l_pist{side}", 0.028, sl * 0.62,
                         piv + sc + Vector((-lw * 0.72, 0, 0.02)), (0, SHIN_A, 0), 8,
                         coll=coll, mat=M_FRAME))
        # The heavy frame wears an extra shin plate.
        if spec["weapon"] == "gatling":
            o.append(add_box(f"l_plate{side}", (lw * 0.7, lw + 0.05, sl * 0.6),
                             piv + sc + Vector((lw * 0.5, 0, 0.02)), (0, SHIN_A, 0),
                             coll=coll, mat=M_SUB))
        ankle = knee + Vector((-sl * math.sin(SHIN_A), 0, -sl * math.cos(SHIN_A)))
        o.append(add_cyl(f"l_ank{side}", lw * 0.48, lw - 0.02, piv + ankle,
                         (math.radians(90), 0, 0), 12, coll=coll, mat=M_FRAME))
        fw = LEG["foot"]
        o.append(add_box(f"l_foot{side}", (fw, lw + 0.03, 0.08),
                         piv + ankle + Vector((fw * 0.2, 0, -0.07)), coll=coll, mat=mat_leg))
        for t in range(3):
            o.append(add_box(f"l_toe{side}_{t}", (fw * 0.26, 0.045, 0.05),
                             piv + ankle + Vector((fw * 0.58, -0.055 + t * 0.055, -0.09)),
                             coll=coll, mat=M_FRAME))
        o.append(add_box(f"l_heel{side}", (0.10, lw - 0.01, 0.05),
                         piv + ankle + Vector((-fw * 0.34, 0, -0.07)), coll=coll, mat=M_ACC))
    parts["lowerBody"] = join_as(pn("lowerBody"), o, piv, coll)

    # ---- arms: big pauldron + disc hub + forward grip ---------------------
    for key, near in (("rightArm", True), ("leftArm", False)):
        piv = px(*P[key])
        shell = M_HULL if near else M_FAR
        sgn = -1 if near else 1
        o = []
        # Rounded pauldron: a heavy bevel reads as the curved shoulder shield the
        # reference frames all carry, rather than a flat slab.
        o.append(add_box(f"a_pauld_{key}", (0.28, 0.24, 0.34),
                         piv + Vector((-0.02, 0, 0.09)), (0, math.radians(10), 0),
                         bevel=0.062, bevel_seg=4, coll=coll, mat=shell))
        # Overlapping outer plate with a visible step, the reference's signature.
        o.append(add_box(f"a_plate_{key}", (0.22, 0.09, 0.28),
                         piv + Vector((0.01, sgn * 0.14, 0.10)), (0, math.radians(10), 0),
                         bevel=0.03, bevel_seg=3, coll=coll, mat=M_SUB))
        o.append(add_box(f"a_lip_{key}", (0.30, 0.10, 0.10),
                         piv + Vector((-0.01, sgn * 0.10, 0.24)), (0, math.radians(10), 0),
                         coll=coll, mat=M_SUB))
        o += bolt_row(f"a_bolt_{key}", 3,
                      piv + Vector((-0.09, sgn * 0.155, 0.20)), Vector((0.09, 0, -0.02)),
                      0.016, coll, M_FRAME)
        # Disc hub: the roundel that appears on nearly every reference shoulder.
        o.append(add_cyl(f"a_hub_{key}", 0.105, 0.07, piv + Vector((-0.01, sgn * 0.13, 0.09)),
                         (math.radians(90), 0, 0), 18, coll=coll, mat=M_FRAME))
        o.append(add_cyl(f"a_hubc_{key}", 0.045, 0.09, piv + Vector((-0.01, sgn * 0.15, 0.09)),
                         (math.radians(90), 0, 0), 12, coll=coll, mat=M_ACC))
        o.append(add_cyl(f"a_upper_{key}", 0.062, 0.24, piv + Vector((0.10, 0, -0.10)),
                         (0, math.radians(-38), 0), 12, coll=coll, mat=M_FRAME))
        # Forearm reaches forward far enough to visibly meet the rifle receiver.
        o.append(add_box(f"a_fore_{key}", (0.32, 0.14, 0.14), piv + Vector((0.30, 0, -0.18)),
                         (0, math.radians(-26), 0), coll=coll, mat=shell))
        o.append(add_box(f"a_grip_{key}", (0.11, 0.11, 0.13), piv + Vector((0.47, 0, -0.26)),
                         coll=coll, mat=M_FRAME))
        # Melee hardpoint, visible on the far arm: a folded beam edge on the
        # interceptor, a hydraulic breaching claw on the assault frame.
        if not near:
            if spec["blade"] == "beam":
                o.append(add_box(f"a_emitter_{key}", (0.16, 0.07, 0.09),
                                 piv + Vector((0.12, 0.11, -0.06)), coll=coll, mat=M_FRAME))
                o.append(add_box(f"a_edge_{key}", (0.42, 0.025, 0.05),
                                 piv + Vector((0.34, 0.11, -0.02)), (0, math.radians(-14), 0),
                                 coll=coll, mat=M_GLOW))
            else:
                o.append(add_box(f"a_claw_{key}", (0.20, 0.12, 0.16),
                                 piv + Vector((0.20, 0.11, -0.02)), coll=coll, mat=M_FRAME))
                for c in range(3):
                    o.append(add_box(f"a_tine_{key}{c}", (0.20, 0.035, 0.045),
                                     piv + Vector((0.40, 0.11, 0.05 - c * 0.06)),
                                     (0, math.radians(-8 + c * 8), 0), coll=coll, mat=M_ACC))
        parts[key] = join_as(pn(key), o, piv, coll)

    # ---- main weapon: oversized forward rifle -----------------------------
    piv = px(*P["mainWeapon"])
    o = []
    if spec["weapon"] == "rifle":
        # Long-barrel precision rifle: slim, scoped, drum-fed.
        o.append(add_box("w_recv", (0.36, 0.17, 0.24), piv, coll=coll, mat=M_SUB))
        o.append(add_box("w_shroud", (0.40, 0.15, 0.16), piv + Vector((0.34, 0, 0.02)), coll=coll, mat=M_HULL))
        o.append(add_cyl("w_barrel", 0.045, 0.78, piv + Vector((0.56, 0, 0.02)),
                         (0, math.radians(90), 0), 14, coll=coll, mat=M_FRAME))
        o.append(add_cyl("w_brake", 0.075, 0.12, piv + Vector((0.94, 0, 0.02)),
                         (0, math.radians(90), 0), 14, coll=coll, cone_r2=0.05, mat=M_FRAME))
        o.append(add_cyl("w_muzzle", 0.05, 0.05, piv + Vector((1.00, 0, 0.02)),
                         (0, math.radians(90), 0), 14, coll=coll, mat=M_GLOW))
        o.append(add_cyl("w_drum", 0.135, 0.13, piv + Vector((0.02, 0, -0.17)),
                         (math.radians(90), 0, 0), 18, coll=coll, mat=M_SUB))
        o.append(add_cyl("w_drumc", 0.05, 0.15, piv + Vector((0.02, 0, -0.17)),
                         (math.radians(90), 0, 0), 12, coll=coll, mat=M_ACC))
        o.append(add_box("w_scope", (0.18, 0.07, 0.06), piv + Vector((0.10, 0, 0.17)), coll=coll, mat=M_FRAME))
        o.append(add_box("w_stock", (0.22, 0.13, 0.16), piv + Vector((-0.26, 0, -0.02)), coll=coll, mat=M_HULL))
        for i in range(3):
            o.append(add_box(f"w_rib{i}", (0.03, 0.16, 0.13),
                             piv + Vector((0.22 + i * 0.11, 0, 0.02)), coll=coll, mat=M_FRAME))
    else:
        # Rotary cannon: fat housing, six-barrel cluster, belt feed, big brake.
        o.append(add_box("w_body", (0.44, 0.26, 0.32), piv, coll=coll, mat=M_SUB))
        o.append(add_box("w_armor", (0.30, 0.30, 0.20), piv + Vector((0.06, 0, 0.14)), coll=coll, mat=M_HULL))
        o.append(add_cyl("w_hub", 0.145, 0.44, piv + Vector((0.44, 0, 0.0)),
                         (0, math.radians(90), 0), 18, coll=coll, mat=M_FRAME))
        for i in range(6):
            a = (i / 6.0) * math.tau
            oy = math.cos(a) * 0.095
            oz = math.sin(a) * 0.095
            o.append(add_cyl(f"w_bar{i}", 0.032, 0.62, piv + Vector((0.60, oy, oz)),
                             (0, math.radians(90), 0), 10, coll=coll, mat=M_FRAME))
        o.append(add_cyl("w_brake", 0.17, 0.16, piv + Vector((0.94, 0, 0.0)),
                         (0, math.radians(90), 0), 20, coll=coll, cone_r2=0.13, mat=M_SUB))
        o.append(add_cyl("w_muzzle", 0.11, 0.05, piv + Vector((1.01, 0, 0.0)),
                         (0, math.radians(90), 0), 20, coll=coll, mat=M_GLOW))
        # Ammo belt running back toward the hull hopper.
        for i in range(5):
            o.append(add_box(f"w_belt{i}", (0.07, 0.10, 0.07),
                             piv + Vector((-0.26 - i * 0.09, -0.10, -0.14 - i * 0.03)),
                             coll=coll, mat=M_ACC))
        o.append(add_box("w_handle", (0.14, 0.10, 0.14), piv + Vector((-0.16, 0, -0.22)),
                         coll=coll, mat=M_FRAME))
    parts["mainWeapon"] = join_as(pn("mainWeapon"), o, piv, coll)

    # ---- sub weapon: shoulder missile pod --------------------------------
    piv = px(*P["subWeapon"])
    o = []
    if spec["pod"] == "compact":
        # Interceptor: a slim angled 6-tube pod.
        o.append(add_box("s_pod", (0.34, 0.26, 0.24), piv, (0, math.radians(-8), 0), coll=coll, mat=M_FAR))
        o.append(add_box("s_lid", (0.30, 0.22, 0.06), piv + Vector((0, 0, 0.14)), (0, math.radians(-8), 0),
                         coll=coll, mat=M_SUB))
        o.append(add_box("s_cap", (0.05, 0.24, 0.22), piv + Vector((0.18, 0, 0.02)), coll=coll, mat=M_FRAME))
        for i in range(6):
            oz = 0.06 - (i % 3) * 0.07
            oy = -0.06 + (i // 3) * 0.12
            o.append(add_cyl(f"s_tube{i}", 0.032, 0.06, piv + Vector((0.20, oy, oz)),
                             (0, math.radians(90), 0), 10, coll=coll, mat=M_GLOW))
        o.append(add_box("s_brace", (0.10, 0.08, 0.16), piv + Vector((-0.18, 0, -0.10)),
                         coll=coll, mat=M_FRAME))
    else:
        # Assault: a boxy 12-cell missile rack with a hinged blast lid.
        o.append(add_box("s_rack", (0.46, 0.34, 0.30), piv, (0, math.radians(-14), 0),
                         coll=coll, mat=M_FAR))
        o.append(add_box("s_lid", (0.46, 0.36, 0.06), piv + Vector((0.02, 0, 0.20)),
                         (0, math.radians(-26), 0), coll=coll, mat=M_SUB))
        o.append(add_box("s_cap", (0.05, 0.32, 0.28), piv + Vector((0.24, 0, 0.02)),
                         coll=coll, mat=M_FRAME))
        for i in range(12):
            oz = 0.09 - (i % 4) * 0.06
            oy = -0.09 + (i // 4) * 0.09
            o.append(add_cyl(f"s_tube{i}", 0.026, 0.05, piv + Vector((0.26, oy, oz)),
                             (0, math.radians(90), 0), 8, coll=coll, mat=M_GLOW))
        o.append(add_box("s_brace", (0.14, 0.12, 0.22), piv + Vector((-0.24, 0, -0.10)),
                         coll=coll, mat=M_FRAME))
        o.append(add_box("s_strut", (0.10, 0.08, 0.26), piv + Vector((-0.16, 0, -0.22)),
                         (0, math.radians(18), 0), coll=coll, mat=M_ACC))
    parts["subWeapon"] = join_as(pn("subWeapon"), o, piv, coll)

    # ---- thrusters: rear-facing bells -------------------------------------
    twin = spec["booster"] == "twin"
    for key, near in (("leftThruster", False), ("rightThruster", True)):
        piv = px(*P[key])
        shell = M_HULL if near else M_FAR
        o = []
        if twin:
            # Interceptor: a pair of slim high-velocity bells.
            o.append(add_box(f"t_house_{key}", (0.26, 0.22, 0.28), piv, coll=coll, mat=shell))
            o.append(add_box(f"t_cowl_{key}", (0.10, 0.24, 0.30), piv + Vector((0.10, 0, 0.02)),
                             coll=coll, mat=M_SUB))
            o.append(add_cyl(f"t_bell_{key}", 0.135, 0.28, piv + Vector((-0.24, 0, -0.01)),
                             (0, math.radians(90), 0), 18, coll=coll, cone_r2=0.085, mat=M_FRAME))
            o.append(add_cyl(f"t_inner_{key}", 0.10, 0.05, piv + Vector((-0.38, 0, -0.01)),
                             (0, math.radians(90), 0), 18, coll=coll, mat=M_GLOW))
            for i, dz in enumerate((0.13, -0.13)):
                o.append(add_box(f"t_vane_{key}{i}", (0.14, 0.05, 0.05),
                                 piv + Vector((-0.16, 0, dz)), coll=coll, mat=M_ACC))
        else:
            # Assault: one wide caged burner with a heat shroud and struts.
            o.append(add_box(f"t_house_{key}", (0.32, 0.30, 0.34), piv, coll=coll, mat=shell))
            o.append(add_box(f"t_shroud_{key}", (0.16, 0.36, 0.40), piv + Vector((-0.10, 0, 0.0)),
                             coll=coll, mat=M_SUB))
            o.append(add_cyl(f"t_bell_{key}", 0.185, 0.34, piv + Vector((-0.28, 0, -0.01)),
                             (0, math.radians(90), 0), 20, coll=coll, cone_r2=0.115, mat=M_FRAME))
            o.append(add_cyl(f"t_inner_{key}", 0.135, 0.05, piv + Vector((-0.45, 0, -0.01)),
                             (0, math.radians(90), 0), 20, coll=coll, mat=M_GLOW))
            for i in range(4):
                a = (i / 4.0) * math.tau + 0.4
                o.append(add_box(f"t_cage_{key}{i}", (0.30, 0.035, 0.035),
                                 piv + Vector((-0.30, math.cos(a) * 0.19, math.sin(a) * 0.19)),
                                 coll=coll, mat=M_FRAME))
            o.append(add_box(f"t_tab_{key}", (0.10, 0.34, 0.06), piv + Vector((0.06, 0, 0.19)),
                             coll=coll, mat=M_ACC))
        parts[key] = join_as(pn(key), o, piv, coll)

    return coll, parts


# ---------------------------------------------------------------- scene setup


def setup_outlines():
    """Dark Freestyle contours so silhouettes read at game scale."""
    scene = bpy.context.scene
    if not USE_OUTLINES:
        scene.render.use_freestyle = False
        return False
    try:
        scene.render.use_freestyle = True
        vl = bpy.context.view_layer
        vl.use_freestyle = True
        fs = vl.freestyle_settings
        for ls in list(fs.linesets):
            fs.linesets.remove(ls)
        lineset = fs.linesets.new("contours")
        lineset.select_silhouette = True
        lineset.select_border = True
        lineset.select_crease = True
        lineset.select_edge_mark = False
        style = lineset.linestyle
        style.color = (0.035, 0.040, 0.055)
        style.thickness = OUTLINE_THICKNESS
        style.alpha = 1.0
        return True
    except (AttributeError, TypeError, RuntimeError):
        scene.render.use_freestyle = False
        return False


def setup_world_and_lights():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.film_transparent = True
    scene.render.resolution_x = TILE
    scene.render.resolution_y = TILE
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"

    # Game sprites want literal colours, not a filmic/AgX grade.
    try:
        scene.view_settings.view_transform = "Standard"
        scene.view_settings.look = "None"
        scene.view_settings.exposure = 0.0
    except (AttributeError, TypeError):
        pass

    world = bpy.data.worlds.get("BSR_World") or bpy.data.worlds.new("BSR_World")
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Color"].default_value = (0.20, 0.23, 0.30, 1.0)
    bg.inputs["Strength"].default_value = 0.75
    nt.links.new(bg.outputs[0], out.inputs[0])
    scene.world = world

    for opt, val in (("taa_render_samples", 64), ("use_gtao", True)):
        try:
            setattr(scene.eevee, opt, val)
        except (AttributeError, TypeError):
            pass

    lights = ensure_collection("BSR_LIGHTS")
    clear_collection("BSR_LIGHTS")

    def lamp(name, kind, loc, energy, color, size=3.0):
        data = bpy.data.lights.new(name, kind)
        data.energy = energy
        data.color = color
        if kind == "AREA":
            data.size = size
        obj = bpy.data.objects.new(name, data)
        obj.location = loc
        lights.objects.link(obj)
        d = Vector((0, 0, 0)) - Vector(loc)
        obj.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        return obj

    # Strong top-left key with a tight fill: the reference art has a clear
    # light-from-above-left read with dark undersides.
    lamp("BSR_key", "AREA", (-3.0, -3.2, 4.2), 1100.0, (1.0, 0.98, 0.94), size=3.4)
    lamp("BSR_fill", "AREA", (3.8, -2.6, 0.2), 190.0, (0.66, 0.76, 0.95), size=5.0)
    lamp("BSR_rim", "AREA", (1.2, 3.8, 2.4), 380.0, (1.00, 0.80, 0.62), size=3.0)
    lamp("BSR_bounce", "AREA", (0.0, -1.6, -3.4), 90.0, (0.50, 0.60, 0.85), size=5.0)


def setup_camera():
    cam = bpy.data.objects.get("BSR_Cam")
    if cam is None:
        data = bpy.data.cameras.new("BSR_Cam")
        cam = bpy.data.objects.new("BSR_Cam", data)
        bpy.context.scene.collection.objects.link(cam)
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = ORTHO_SCALE
    cam.data.clip_start = 0.1
    cam.data.clip_end = 100.0

    az, el = CAM_AZIMUTH, CAM_ELEVATION
    cam.location = (
        CAM_DIST * math.sin(az) * math.cos(el),
        -CAM_DIST * math.cos(az) * math.cos(el),
        CAM_DIST * math.sin(el),
    )
    d = Vector((0, 0, 0)) - Vector(cam.location)
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = cam
    return cam


# ---------------------------------------------------------------- rendering


def render_parts(coll, out_dir, mech_id, manifest):
    """Renders each part centred on its own pivot to <out_dir>/<mech>_<part>.png."""
    os.makedirs(out_dir, exist_ok=True)
    scene = bpy.context.scene
    scene.render.resolution_x = TILE
    scene.render.resolution_y = TILE

    mech_objs = {o.name: o for o in coll.objects if o.type == "MESH"}
    missing = [n for n in PART_ORDER if f"{mech_id}_{n}" not in mech_objs]
    if missing:
        raise RuntimeError(
            f"{mech_id}: missing part objects {missing}. "
            f"Collection holds {sorted(mech_objs)}"
        )

    all_meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    saved_hide = {o.name: o.hide_render for o in all_meshes}
    for o in all_meshes:
        o.hide_render = True

    try:
        for name in PART_ORDER:
            obj = mech_objs[f"{mech_id}_{name}"]
            saved_loc = tuple(obj.location)
            obj.location = (0.0, 0.0, 0.0)
            obj.hide_render = False

            path = os.path.join(out_dir, f"{mech_id}_{name}.png")
            scene.render.filepath = path
            bpy.ops.render.render(write_still=True)

            obj.hide_render = True
            obj.location = saved_loc

            dims = tuple(round(v, 4) for v in obj.dimensions)
            manifest.setdefault(mech_id, {})[name] = {
                "file": os.path.basename(path),
                "dims_bu": dims,
                "dims_logical_px": tuple(round(v * LOGICAL_PER_BU, 1) for v in dims),
            }
    finally:
        for o in all_meshes:
            o.hide_render = saved_hide.get(o.name, False)


def render_assembled(coll, out_path, ortho=4.0):
    """A single framed render of the whole mech, for docs/preview."""
    scene = bpy.context.scene
    cam = bpy.context.scene.camera
    prev_scale = cam.data.ortho_scale
    prev_x, prev_y = scene.render.resolution_x, scene.render.resolution_y

    all_meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    members = set(o.name for o in coll.objects)
    saved = {o.name: o.hide_render for o in all_meshes}
    for o in all_meshes:
        o.hide_render = o.name not in members

    cam.data.ortho_scale = ortho
    scene.render.resolution_x = 640
    scene.render.resolution_y = 640
    scene.render.filepath = out_path
    try:
        bpy.ops.render.render(write_still=True)
    finally:
        cam.data.ortho_scale = prev_scale
        scene.render.resolution_x, scene.render.resolution_y = prev_x, prev_y
        for o in all_meshes:
            o.hide_render = saved.get(o.name, False)


# ---------------------------------------------------------------- entry point


def build_all(project_root):
    """Builds both mechs, renders parts + previews, saves the .blend."""
    import json

    cube = bpy.data.objects.get("Cube")
    if cube is not None and not bpy.data.filepath:
        bpy.data.objects.remove(cube, do_unlink=True)
    for name in ("Light", "Camera"):
        obj = bpy.data.objects.get(name)
        if obj is not None and not bpy.data.filepath:
            bpy.data.objects.remove(obj, do_unlink=True)

    setup_world_and_lights()
    outlines = setup_outlines()
    setup_camera()

    sprites = os.path.join(project_root, "assets", "sprites", "mechs")
    debug = os.path.join(project_root, "renders", "debug")
    blend_dir = os.path.join(project_root, "assets", "blender")
    for d in (sprites, debug, blend_dir):
        os.makedirs(d, exist_ok=True)

    manifest = {}
    built = {}
    for mech_id in ("halcyon", "nocturne"):
        coll, _parts = build_mech(mech_id)
        built[mech_id] = coll
        render_parts(coll, sprites, mech_id, manifest)
        render_assembled(coll, os.path.join(debug, f"{mech_id}_assembled.png"))

    for obj in built["nocturne"].objects:
        obj.location.x += 4.0

    meta = {
        "px_per_bu": PX_PER_BU,
        "display_scale": DISPLAY_SCALE,
        "logical_per_bu": LOGICAL_PER_BU,
        "tile": TILE,
        "ortho_scale": ORTHO_SCALE,
        "outlines": outlines,
        "camera": {
            "azimuth_deg": math.degrees(CAM_AZIMUTH),
            "elevation_deg": math.degrees(CAM_ELEVATION),
        },
        "note": "Every PNG is TILE x TILE with the part pivot at the exact centre; "
                "draw with origin 0.5,0.5 at the rig offset.",
        # World-space pivots in logical pixels. src/data/mechs.ts must mirror
        # these (child offsets there are relative to the parent).
        "pivots_px": {
            mid: {k: (v[0], v[1]) for k, v in CHASSIS[mid]["pivots"].items()}
            for mid in CHASSIS
        },
        "chassis": {
            mid: {k: CHASSIS[mid][k] for k in ("pitch", "weapon", "booster", "pod", "blade")}
            for mid in CHASSIS
        },
        "parts": manifest,
    }
    with open(os.path.join(sprites, "manifest.json"), "w", encoding="utf-8") as fh:
        json.dump(meta, fh, indent=2)

    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(blend_dir, "mechs.blend"))
    return meta
