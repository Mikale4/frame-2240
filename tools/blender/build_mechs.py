"""
Babel Sword: Reignition - procedural multipart mech builder.

Run inside Blender (the project drives it through the Blender MCP server):

    exec(open(r"<project>/tools/blender/build_mechs.py").read())
    build_all(r"<project>")

Design notes
------------
* Every mech is built as SEPARATE objects, one per part, exactly as CLAUDE.md
  requires: core, head, left/right arm, main/sub weapon, lower body, backpack,
  left/right thruster.
* Each part's object origin is placed at its *pivot*, so the runtime rig can
  rotate arms/turrets around a sensible point.
* Parts are rendered one at a time with the part's pivot moved to the world
  origin and an orthographic camera aimed at the origin. That guarantees the
  pivot lands exactly at the centre of every exported PNG, so the game can use
  setOrigin(0.5, 0.5) and position sprites purely from the rig offsets.

Scale contract
--------------
PX_PER_BU = 120 render pixels per Blender unit, and the game displays these
sprites at 0.5 scale, so 1 Blender unit == 60 logical game pixels. The rig
offsets in src/data/mechs.ts are authored in those same logical pixels.
"""

import math
import os

import bpy
from mathutils import Vector

# ---------------------------------------------------------------- constants

PX_PER_BU = 120.0
DISPLAY_SCALE = 0.5
LOGICAL_PER_BU = PX_PER_BU * DISPLAY_SCALE  # 60
TILE = 256  # square render target per part
ORTHO_SCALE = TILE / PX_PER_BU  # 2.1333 BU across the frame

# Camera framing: a shallow three-quarter side view, so the near and far arms
# read as distinct volumes while still mirroring cleanly when the mech faces left.
CAM_AZIMUTH = math.radians(16.0)
CAM_ELEVATION = math.radians(7.0)
CAM_DIST = 9.0

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

# Pivots in logical game pixels (x right, y DOWN), matching src/data/mechs.ts,
# plus a depth offset in Blender units (+Y is away from the camera).
PIVOTS_PX = {
    "core": (0, 0, 0.0),
    "head": (3, -23, 0.0),
    "backpack": (-20, -6, 0.06),
    "lowerBody": (0, 22, 0.0),
    "leftArm": (-8, -8, 0.17),
    "subWeapon": (10, -12, 0.17),
    "rightArm": (10, -4, -0.17),
    "mainWeapon": (36, -2, -0.17),
    "leftThruster": (-23, 9, 0.17),
    "rightThruster": (-19, 19, -0.17),
}

PALETTES = {
    "halcyon": {
        "primary": (0.60, 0.74, 0.86),
        "secondary": (0.10, 0.17, 0.26),
        "frame": (0.075, 0.085, 0.105),
        "accent": (1.00, 0.72, 0.26),
        "glow": (0.36, 0.80, 1.00),
    },
    "nocturne": {
        "primary": (0.74, 0.46, 0.58),
        "secondary": (0.17, 0.09, 0.16),
        "frame": (0.085, 0.070, 0.085),
        "accent": (1.00, 0.86, 0.50),
        "glow": (1.00, 0.42, 0.86),
    },
}


# ---------------------------------------------------------------- utilities


def px(x, y, depth=0.0):
    """Logical-pixel pivot -> Blender world vector."""
    return Vector((x / LOGICAL_PER_BU, depth, -y / LOGICAL_PER_BU))


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


def make_material(name, rgb, emission=0.0, roughness=0.42, metallic=0.55):
    mat = bpy.data.materials.get(name)
    if mat is None:
        mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emission > 0.0:
        # Socket names shifted across Blender versions; set whichever exists.
        for key in ("Emission Color", "Emission"):
            if key in bsdf.inputs:
                bsdf.inputs[key].default_value = (*rgb, 1.0)
                break
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = emission
    nt.links.new(bsdf.outputs[0], out.inputs[0])
    return mat


def active():
    """`bpy.context.active_object` is absent right after an empty-file read."""
    obj = getattr(bpy.context, "active_object", None)
    if obj is None:
        obj = bpy.context.view_layer.objects.active
    return obj


def override(active_obj, selected):
    """
    Context override for object operators.

    When this script is driven over the MCP bridge (especially after a file
    open/reset) `bpy.context` has no area/region, and operators such as
    object.join fail their poll. Supplying the objects explicitly makes them
    work regardless of the UI context.
    """
    return bpy.context.temp_override(
        object=active_obj,
        active_object=active_obj,
        selected_objects=list(selected),
        selected_editable_objects=list(selected),
    )


def add_box(name, size, loc, rot=(0, 0, 0), bevel=0.012, coll=None):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc, rotation=rot)
    obj = active()
    obj.name = name
    obj.scale = Vector(size)
    with override(obj, [obj]):
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        mod = obj.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(40)
    _relink(obj, coll)
    return obj


def add_cyl(name, radius, depth, loc, rot=(0, 0, 0), verts=16, coll=None, cone_r2=None):
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
    return obj


def _relink(obj, coll):
    if coll is None:
        return
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    coll.objects.link(obj)


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

    # Origin -> pivot, via the 3D cursor.
    prev = tuple(bpy.context.scene.cursor.location)
    bpy.context.scene.cursor.location = pivot
    with override(obj, [obj]):
        bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    bpy.context.scene.cursor.location = prev

    _relink(obj, coll)
    return obj


def assign(obj, mat, face_filter=None):
    """Assigns `mat` as slot 0, or to selected faces when a filter is given."""
    if mat.name not in [m.name for m in obj.data.materials if m]:
        obj.data.materials.append(mat)
    idx = [m.name for m in obj.data.materials].index(mat.name)
    for poly in obj.data.polygons:
        if face_filter is None or face_filter(poly, obj):
            poly.material_index = idx


# ---------------------------------------------------------------- mech build


def build_mech(mech_id, palette_key=None):
    """Builds one mech's ten parts into a collection named after `mech_id`."""
    pal = PALETTES[palette_key or mech_id]
    coll_name = f"MECH_{mech_id.upper()}"
    clear_collection(coll_name)
    coll = ensure_collection(coll_name)

    m_primary = make_material(f"{mech_id}_primary", pal["primary"], roughness=0.38)
    m_second = make_material(f"{mech_id}_secondary", pal["secondary"], roughness=0.5)
    m_frame = make_material(f"{mech_id}_frame", pal["frame"], roughness=0.62, metallic=0.75)
    # Emission is kept low: with a Standard view transform anything much above
    # ~2.5 clips to white and the part loses its colour identity.
    m_accent = make_material(f"{mech_id}_accent", pal["accent"], emission=1.5, roughness=0.3)
    m_glow = make_material(f"{mech_id}_glow", pal["glow"], emission=2.3, roughness=0.2, metallic=0.0)

    P = PIVOTS_PX
    parts = {}

    # Part objects must be namespaced per mech. Without this the second mech's
    # "core" collides with the first one's and Blender silently renames it to
    # "core.001", which then never matches during rendering.
    def pn(name):
        return f"{mech_id}_{name}"

    # ---- core / torso -------------------------------------------------
    piv = px(*P["core"])
    chest = add_box("c_chest", (0.36, 0.30, 0.42), piv + Vector((0, 0, 0.02)), coll=coll)
    assign(chest, m_primary)
    plate = add_box("c_plate", (0.26, 0.10, 0.30), piv + Vector((0.06, -0.19, 0.03)),
                    rot=(0, math.radians(-6), 0), coll=coll)
    assign(plate, m_second)
    collar = add_box("c_collar", (0.30, 0.24, 0.09), piv + Vector((0, 0, 0.235)), coll=coll)
    assign(collar, m_frame)
    vent = add_box("c_vent", (0.17, 0.05, 0.05), piv + Vector((0.05, -0.22, 0.14)), coll=coll)
    assign(vent, m_accent)
    waist = add_box("c_waist", (0.24, 0.22, 0.10), piv + Vector((0, 0, -0.20)), coll=coll)
    assign(waist, m_frame)
    parts["core"] = join_as(pn("core"), [chest, plate, collar, vent, waist], piv, coll)

    # ---- head ---------------------------------------------------------
    piv = px(*P["head"])
    skull = add_box("h_skull", (0.17, 0.16, 0.15), piv, coll=coll)
    assign(skull, m_primary)
    # A short neck plug so the head reads as attached to the collar below it.
    neck = add_cyl("h_neck", 0.052, 0.10, piv + Vector((-0.01, 0, -0.10)), verts=12, coll=coll)
    assign(neck, m_frame)
    visor = add_box("h_visor", (0.14, 0.055, 0.05), piv + Vector((0.03, -0.10, 0.012)), coll=coll)
    assign(visor, m_glow)
    crest = add_box("h_crest", (0.05, 0.13, 0.055), piv + Vector((-0.02, 0, 0.09)), coll=coll)
    assign(crest, m_accent)
    ant = add_cyl("h_ant", 0.008, 0.18, piv + Vector((-0.06, 0.02, 0.16)),
                  rot=(math.radians(12), 0, 0), verts=8, coll=coll)
    assign(ant, m_frame)
    parts["head"] = join_as(pn("head"), [skull, neck, visor, crest, ant], piv, coll)

    # ---- backpack -----------------------------------------------------
    piv = px(*P["backpack"])
    pack = add_box("b_pack", (0.22, 0.26, 0.40), piv, coll=coll)
    assign(pack, m_second)
    ridge = add_box("b_ridge", (0.08, 0.20, 0.44), piv + Vector((-0.10, 0, 0.02)), coll=coll)
    assign(ridge, m_frame)
    for i, z in enumerate((0.13, -0.02, -0.17)):
        fin = add_box(f"b_fin{i}", (0.13, 0.05, 0.035), piv + Vector((-0.16, 0, z)),
                      rot=(0, math.radians(14), 0), coll=coll)
        assign(fin, m_accent)
        parts.setdefault("_bfins", []).append(fin)
    fins = parts.pop("_bfins")
    parts["backpack"] = join_as(pn("backpack"), [pack, ridge, *fins], piv, coll)

    # ---- lower body ---------------------------------------------------
    piv = px(*P["lowerBody"])
    hips = add_box("l_hips", (0.34, 0.28, 0.17), piv, coll=coll)
    assign(hips, m_primary)
    skirt_l = add_box("l_skirt_l", (0.13, 0.09, 0.19), piv + Vector((-0.16, -0.13, -0.06)),
                      rot=(0, math.radians(10), 0), coll=coll)
    assign(skirt_l, m_second)
    skirt_r = add_box("l_skirt_r", (0.13, 0.09, 0.19), piv + Vector((0.17, -0.13, -0.06)),
                      rot=(0, math.radians(-10), 0), coll=coll)
    assign(skirt_r, m_second)
    legs = []
    for i, (dx, dy, tilt) in enumerate(((-0.10, 0.13, 7), (0.09, -0.13, -5))):
        thigh = add_box(f"l_thigh{i}", (0.13, 0.14, 0.26), piv + Vector((dx, dy, -0.22)),
                        rot=(0, math.radians(tilt), 0), coll=coll)
        assign(thigh, m_primary if i == 1 else m_second)
        shin = add_box(f"l_shin{i}", (0.11, 0.12, 0.24), piv + Vector((dx * 1.5, dy, -0.46)),
                       rot=(0, math.radians(tilt * -1.6), 0), coll=coll)
        assign(shin, m_frame)
        foot = add_box(f"l_foot{i}", (0.15, 0.13, 0.08), piv + Vector((dx * 1.9, dy, -0.60)),
                       coll=coll)
        assign(foot, m_frame)
        heel = add_box(f"l_heel{i}", (0.05, 0.10, 0.035), piv + Vector((dx * 1.9 - 0.08, dy, -0.62)),
                       coll=coll)
        assign(heel, m_accent)
        legs += [thigh, shin, foot, heel]
    parts["lowerBody"] = join_as(pn("lowerBody"), [hips, skirt_l, skirt_r, *legs], piv, coll)

    # ---- arms ---------------------------------------------------------
    for side, key in ((1, "rightArm"), (-1, "leftArm")):
        piv = px(*P[key])
        near = side > 0
        pauldron = add_box(f"a_pauld_{key}", (0.19, 0.21, 0.20), piv + Vector((0.01, 0, 0.05)),
                           coll=coll)
        assign(pauldron, m_primary if near else m_second)
        stripe = add_box(f"a_stripe_{key}", (0.055, 0.16, 0.035),
                         piv + Vector((0.055, -0.115 if near else 0.115, 0.11)), coll=coll)
        assign(stripe, m_accent)
        upper = add_cyl(f"a_upper_{key}", 0.055, 0.20, piv + Vector((0.08, 0, -0.09)),
                        rot=(0, math.radians(-16), 0), verts=12, coll=coll)
        assign(upper, m_frame)
        fore = add_box(f"a_fore_{key}", (0.17, 0.11, 0.11), piv + Vector((0.20, 0, -0.15)),
                       rot=(0, math.radians(-24), 0), coll=coll)
        assign(fore, m_primary if near else m_second)
        parts[key] = join_as(pn(key), [pauldron, stripe, upper, fore], piv, coll)

    # ---- main weapon (rifle) ------------------------------------------
    piv = px(*P["mainWeapon"])
    recv = add_box("w_recv", (0.20, 0.11, 0.13), piv, coll=coll)
    assign(recv, m_frame)
    barrel = add_cyl("w_barrel", 0.036, 0.46, piv + Vector((0.30, 0, 0.01)),
                     rot=(0, math.radians(90), 0), verts=14, coll=coll)
    assign(barrel, m_second)
    shroud = add_box("w_shroud", (0.20, 0.09, 0.10), piv + Vector((0.20, 0, 0.015)), coll=coll)
    assign(shroud, m_primary)
    muzzle = add_cyl("w_muzzle", 0.05, 0.07, piv + Vector((0.545, 0, 0.01)),
                     rot=(0, math.radians(90), 0), verts=14, coll=coll, cone_r2=0.032)
    assign(muzzle, m_glow)
    mag = add_box("w_mag", (0.08, 0.07, 0.16), piv + Vector((0.02, 0, -0.14)), coll=coll)
    assign(mag, m_second)
    sight = add_box("w_sight", (0.10, 0.04, 0.035), piv + Vector((0.10, 0, 0.09)), coll=coll)
    assign(sight, m_accent)
    parts["mainWeapon"] = join_as(
        pn("mainWeapon"), [recv, barrel, shroud, muzzle, mag, sight], piv, coll
    )

    # ---- sub weapon (missile pod) --------------------------------------
    piv = px(*P["subWeapon"])
    pod = add_box("s_pod", (0.20, 0.17, 0.22), piv, coll=coll)
    assign(pod, m_second)
    cap = add_box("s_cap", (0.045, 0.16, 0.21), piv + Vector((0.11, 0, 0.005)), coll=coll)
    assign(cap, m_frame)
    tubes = []
    for i in range(4):
        ox = 0.135
        oz = 0.06 - (i % 2) * 0.12
        oy = -0.045 + (i // 2) * 0.09
        t = add_cyl(f"s_tube{i}", 0.031, 0.05, piv + Vector((ox, oy, oz)),
                    rot=(0, math.radians(90), 0), verts=10, coll=coll)
        assign(t, m_glow)
        tubes.append(t)
    brace = add_box("s_brace", (0.07, 0.06, 0.09), piv + Vector((-0.12, 0, 0)), coll=coll)
    assign(brace, m_frame)
    parts["subWeapon"] = join_as(pn("subWeapon"), [pod, cap, *tubes, brace], piv, coll)

    # ---- thrusters -----------------------------------------------------
    # Main lift thrusters, slung off the lower back where the plume reads clearly
    # behind the chassis rather than being hidden by the legs.
    for key, tilt in (("leftThruster", 16), ("rightThruster", 10)):
        piv = px(*P[key])
        housing = add_box(f"t_house_{key}", (0.20, 0.18, 0.28), piv, coll=coll)
        assign(housing, m_second)
        collar_t = add_box(f"t_collar_{key}", (0.22, 0.20, 0.06), piv + Vector((0, 0, 0.15)),
                           coll=coll)
        assign(collar_t, m_frame)
        bell = add_cyl(f"t_bell_{key}", 0.115, 0.24, piv + Vector((-0.03, 0, -0.25)),
                       rot=(math.radians(tilt), 0, 0), verts=18, coll=coll, cone_r2=0.072)
        assign(bell, m_frame)
        inner = add_cyl(f"t_inner_{key}", 0.084, 0.045, piv + Vector((-0.035, 0, -0.375)),
                        rot=(math.radians(tilt), 0, 0), verts=18, coll=coll)
        assign(inner, m_glow)
        vane = add_box(f"t_vane_{key}", (0.06, 0.14, 0.13), piv + Vector((0.12, 0, 0.02)),
                       coll=coll)
        assign(vane, m_accent)
        parts[key] = join_as(pn(key), [housing, collar_t, bell, inner, vane], piv, coll)

    return coll, parts


# ---------------------------------------------------------------- scene setup


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

    # Game sprites want literal colours, not a filmic/AgX grade — otherwise the
    # palette desaturates and every emissive detail clips to white.
    try:
        scene.view_settings.view_transform = "Standard"
        scene.view_settings.look = "None"
    except (AttributeError, TypeError):
        pass

    # Soft, neutral world so unlit sides never go pure black.
    world = bpy.data.worlds.get("BSR_World") or bpy.data.worlds.new("BSR_World")
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Color"].default_value = (0.16, 0.19, 0.26, 1.0)
    bg.inputs["Strength"].default_value = 0.85
    nt.links.new(bg.outputs[0], out.inputs[0])
    scene.world = world

    for opt, val in (("taa_render_samples", 64), ("use_gtao", True)):
        try:
            setattr(scene.eevee, opt, val)
        except (AttributeError, TypeError):
            pass

    lights = ensure_collection("BSR_LIGHTS")
    clear_collection("BSR_LIGHTS")

    def lamp(name, kind, loc, energy, color, size=3.0, angle=None):
        data = bpy.data.lights.new(name, kind)
        data.energy = energy
        data.color = color
        if kind == "AREA":
            data.size = size
        if kind == "SUN" and angle is not None:
            data.angle = angle
        obj = bpy.data.objects.new(name, data)
        obj.location = loc
        lights.objects.link(obj)
        # Aim at the origin.
        d = Vector((0, 0, 0)) - Vector(loc)
        obj.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        return obj

    # Key from camera-left-above, cool fill from the far side, warm rim behind.
    lamp("BSR_key", "AREA", (-3.2, -3.4, 3.6), 900.0, (1.0, 0.96, 0.90), size=4.0)
    lamp("BSR_fill", "AREA", (3.6, -2.2, 0.6), 260.0, (0.62, 0.76, 1.00), size=5.0)
    lamp("BSR_rim", "AREA", (1.4, 3.6, 2.2), 420.0, (1.00, 0.72, 0.52), size=3.0)
    lamp("BSR_under", "AREA", (0.0, -1.2, -3.2), 120.0, (0.45, 0.62, 0.95), size=5.0)


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

    mech_objs = {o.name: o for o in coll.objects if o.type == "MESH"}
    # Hide everything renderable, then reveal one part at a time.
    all_meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    saved_hide = {o.name: o.hide_render for o in all_meshes}
    for o in all_meshes:
        o.hide_render = True

    missing = [n for n in PART_ORDER if f"{mech_id}_{n}" not in mech_objs]
    if missing:
        raise RuntimeError(
            f"{mech_id}: missing part objects {missing}. "
            f"Collection holds {sorted(mech_objs)}"
        )

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


def render_assembled(coll, out_path, ortho=3.4):
    """A single framed render of the whole mech, for docs/preview."""
    scene = bpy.context.scene
    cam = bpy.context.scene.camera
    prev_scale = cam.data.ortho_scale
    prev_x, prev_y = scene.render.resolution_x, scene.render.resolution_y

    all_meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    saved = {o.name: o.hide_render for o in all_meshes}
    for o in all_meshes:
        o.hide_render = o not in list(coll.objects)

    cam.data.ortho_scale = ortho
    scene.render.resolution_x = 512
    scene.render.resolution_y = 512
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

    # Drop the factory startup cube if it is still sitting in an unsaved file.
    cube = bpy.data.objects.get("Cube")
    if cube is not None and not bpy.data.filepath:
        bpy.data.objects.remove(cube, do_unlink=True)
    for name in ("Light", "Camera"):
        obj = bpy.data.objects.get(name)
        if obj is not None and not bpy.data.filepath:
            bpy.data.objects.remove(obj, do_unlink=True)

    setup_world_and_lights()
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

    # Keep the two mechs apart in the viewport so the .blend stays readable.
    for obj in built["nocturne"].objects:
        obj.location.x += 3.0

    meta = {
        "px_per_bu": PX_PER_BU,
        "display_scale": DISPLAY_SCALE,
        "logical_per_bu": LOGICAL_PER_BU,
        "tile": TILE,
        "ortho_scale": ORTHO_SCALE,
        "camera": {
            "azimuth_deg": math.degrees(CAM_AZIMUTH),
            "elevation_deg": math.degrees(CAM_ELEVATION),
        },
        "note": "Every PNG is TILE x TILE with the part pivot at the exact centre; "
                "draw with origin 0.5,0.5 at the rig offset.",
        "parts": manifest,
    }
    with open(os.path.join(sprites, "manifest.json"), "w", encoding="utf-8") as fh:
        json.dump(meta, fh, indent=2)

    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(blend_dir, "mechs.blend"))
    return meta
