"""
Babel Sword: Reignition - arena backdrop builder.

Renders the original arena "CATHEDRAL YARD" (an abandoned orbital drydock) as
wide parallax strips with transparent backgrounds:

    arena_far.png    1536 x 512  distant hull plating and towers
    arena_mid.png    1536 x 512  gantry trusses and dock cradles
    arena_near.png   1536 x 256  foreground girder rail with hazard stripes

The sky gradient itself is drawn procedurally in-engine, so these layers only
carry structure and can tile horizontally.

Run inside Blender:
    exec(open(r"<project>/tools/blender/build_arena.py").read())
    build_arena(r"<project>")
"""

import math
import os

import bpy
from mathutils import Vector

LAYER_SPECS = {
    # name: (res_x, res_y, ortho_width_bu, exposure_ev)
    # Distant layers are baked darker so the parallax reads as depth; the game
    # tints them further at runtime.
    "far": (1536, 512, 48.0, -1.3),
    "mid": (1536, 512, 32.0, -0.35),
    "near": (1536, 256, 24.0, 0.0),
}


def _clear(name):
    coll = bpy.data.collections.get(name)
    if coll is None:
        return
    for obj in list(coll.objects):
        bpy.data.objects.remove(obj, do_unlink=True)


def _coll(name):
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(c)
    return c


def _mat(name, rgb, emission=0.0, roughness=0.7, metallic=0.4):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    b.inputs["Base Color"].default_value = (*rgb, 1.0)
    b.inputs["Roughness"].default_value = roughness
    b.inputs["Metallic"].default_value = metallic
    if emission > 0:
        for k in ("Emission Color", "Emission"):
            if k in b.inputs:
                b.inputs[k].default_value = (*rgb, 1.0)
                break
        if "Emission Strength" in b.inputs:
            b.inputs["Emission Strength"].default_value = emission
    nt.links.new(b.outputs[0], out.inputs[0])
    return mat


def _active():
    """`bpy.context.active_object` is absent right after an empty-file read."""
    o = getattr(bpy.context, "active_object", None)
    if o is None:
        o = bpy.context.view_layer.objects.active
    return o


def _box(name, size, loc, rot=(0, 0, 0), coll=None, mat=None):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc, rotation=rot)
    o = _active()
    o.name = name
    o.scale = Vector(size)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if coll is not None:
        for c in list(o.users_collection):
            c.objects.unlink(o)
        coll.objects.link(o)
    if mat is not None:
        o.data.materials.append(mat)
    return o


def _cyl(name, r, d, loc, rot=(0, 0, 0), coll=None, mat=None, verts=12):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=d, location=loc,
                                        rotation=rot, vertices=verts)
    o = _active()
    o.name = name
    if coll is not None:
        for c in list(o.users_collection):
            c.objects.unlink(o)
        coll.objects.link(o)
    if mat is not None:
        o.data.materials.append(mat)
    return o


def build_far(coll):
    hull = _mat("ar_hull", (0.115, 0.135, 0.190), roughness=0.85, metallic=0.2)
    hull2 = _mat("ar_hull2", (0.085, 0.100, 0.150), roughness=0.85, metallic=0.2)
    lamp = _mat("ar_lamp", (0.55, 0.78, 1.00), emission=1.9, metallic=0.0)
    warm = _mat("ar_warm", (1.00, 0.62, 0.30), emission=1.6, metallic=0.0)

    # A long back wall of hull plating.
    _box("f_wall", (52.0, 1.0, 15.0), (0, 6.0, 0.0), coll=coll, mat=hull2)

    # Towers of varying height, with window lights.
    xs = [-22.5, -17.0, -11.5, -5.5, 0.5, 6.0, 11.5, 17.5, 22.0]
    hs = [9.0, 12.5, 7.5, 14.0, 8.5, 11.0, 13.5, 8.0, 10.5]
    for i, (x, h) in enumerate(zip(xs, hs)):
        _box(f"f_tower{i}", (3.4, 2.2, h), (x, 4.2, -7.5 + h / 2), coll=coll,
             mat=hull if i % 2 else hull2)
        for j in range(int(h // 1.6)):
            if (i + j) % 3 == 0:
                continue
            _box(f"f_win{i}_{j}", (2.2, 0.2, 0.28),
                 (x + (0.3 if j % 2 else -0.3), 3.05, -6.6 + j * 1.6),
                 coll=coll, mat=lamp if (i + j) % 4 else warm)

    # Two distant gantry arms sweeping across the sky.
    _box("f_arm0", (30.0, 1.2, 0.7), (-6.0, 5.0, 5.6), rot=(0, math.radians(4), 0),
         coll=coll, mat=hull)
    _box("f_arm1", (22.0, 1.0, 0.55), (9.0, 5.4, 2.4), rot=(0, math.radians(-3), 0),
         coll=coll, mat=hull2)


def build_mid(coll):
    steel = _mat("ar_steel", (0.20, 0.225, 0.275), roughness=0.6, metallic=0.7)
    steel2 = _mat("ar_steel2", (0.145, 0.165, 0.205), roughness=0.65, metallic=0.7)
    accent = _mat("ar_accent", (1.00, 0.70, 0.22), emission=1.4, metallic=0.0)
    cyan = _mat("ar_cyan", (0.40, 0.85, 1.00), emission=1.7, metallic=0.0)

    # Repeating dock cradles: vertical pylons braced with diagonal trusses.
    for i, x in enumerate(range(-14, 16, 6)):
        xf = float(x)
        _box(f"m_pylon{i}", (1.5, 1.6, 17.0), (xf, 2.0, 0.0), coll=coll,
             mat=steel if i % 2 else steel2)
        _box(f"m_cap{i}", (2.6, 2.0, 0.8), (xf, 2.0, 8.0), coll=coll, mat=steel2)
        _box(f"m_base{i}", (3.0, 2.2, 1.0), (xf, 2.0, -8.0), coll=coll, mat=steel2)
        for k, z in enumerate((-5.0, -1.0, 3.0, 6.5)):
            _box(f"m_brace{i}_{k}", (6.2, 0.7, 0.4), (xf + 3.0, 2.2, z),
                 rot=(0, math.radians(26 if k % 2 else -26), 0), coll=coll, mat=steel2)
        _box(f"m_strip{i}", (0.5, 0.3, 12.0), (xf - 0.9, 1.15, 0.0), coll=coll, mat=accent)
        _cyl(f"m_light{i}", 0.34, 0.5, (xf, 1.0, 8.6), rot=(math.radians(90), 0, 0),
             coll=coll, mat=cyan)

    # Horizontal catwalks tying the pylons together.
    for k, z in enumerate((-6.5, 0.5, 7.2)):
        _box(f"m_walk{k}", (34.0, 1.4, 0.5), (0.0, 2.4, z), coll=coll, mat=steel)
        for j in range(18):
            _box(f"m_rail{k}_{j}", (0.16, 0.16, 0.9), (-16.0 + j * 1.9, 2.0, z + 0.7),
                 coll=coll, mat=steel2)


def build_near(coll):
    dark = _mat("ar_fg", (0.055, 0.065, 0.085), roughness=0.9, metallic=0.3)
    hazard = _mat("ar_hazard", (1.00, 0.74, 0.16), emission=0.9, metallic=0.0)
    red = _mat("ar_red", (0.90, 0.22, 0.26), emission=0.9, metallic=0.0)

    # A heavy foreground girder with a hazard-striped lip.
    _box("n_beam", (30.0, 2.0, 2.0), (0.0, 0.0, -1.2), coll=coll, mat=dark)
    _box("n_lip", (30.0, 2.2, 0.42), (0.0, 0.0, 0.05), coll=coll, mat=dark)
    for j in range(40):
        x = -14.6 + j * 0.75
        _box(f"n_stripe{j}", (0.34, 0.2, 0.34), (x, -1.16, 0.05),
             rot=(0, math.radians(34), 0), coll=coll,
             mat=hazard if j % 2 == 0 else red)
    # Bolted plates and standoffs for silhouette interest.
    for j in range(11):
        x = -13.5 + j * 2.7
        _box(f"n_plate{j}", (1.5, 0.4, 1.1), (x, -1.05, -1.5), coll=coll, mat=dark)
        _cyl(f"n_bolt{j}", 0.16, 0.3, (x, -1.35, -1.5), rot=(math.radians(90), 0, 0),
             coll=coll, mat=hazard)


def _setup_lights():
    lights = _coll("ARENA_LIGHTS")
    _clear("ARENA_LIGHTS")

    def lamp(name, loc, energy, color, size):
        d = bpy.data.lights.new(name, "AREA")
        d.energy = energy
        d.color = color
        d.size = size
        o = bpy.data.objects.new(name, d)
        o.location = loc
        lights.objects.link(o)
        v = Vector((0, 0, 0)) - Vector(loc)
        o.rotation_euler = v.to_track_quat("-Z", "Y").to_euler()

    # Area-light power falls off with distance squared; these sit ~30 units out,
    # so they need far less energy than the close-up mech rig.
    lamp("AR_key", (-14.0, -22.0, 16.0), 9000.0, (0.86, 0.92, 1.00), 30.0)
    lamp("AR_fill", (16.0, -18.0, -6.0), 2600.0, (0.50, 0.62, 1.00), 34.0)
    lamp("AR_rim", (6.0, 16.0, 12.0), 4200.0, (1.00, 0.66, 0.40), 24.0)


def _camera(width_bu, res_x, res_y, exposure=0.0):
    cam = bpy.data.objects.get("ARENA_Cam")
    if cam is None:
        cam = bpy.data.objects.new("ARENA_Cam", bpy.data.cameras.new("ARENA_Cam"))
        bpy.context.scene.collection.objects.link(cam)
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = width_bu
    cam.data.clip_start = 0.1
    cam.data.clip_end = 400.0
    # Dead-on elevation so the strips tile horizontally without perspective drift.
    cam.location = (0.0, -60.0, 0.0)
    cam.rotation_euler = (math.radians(90.0), 0.0, 0.0)
    bpy.context.scene.camera = cam
    scene = bpy.context.scene
    scene.render.resolution_x = res_x
    scene.render.resolution_y = res_y
    try:
        scene.view_settings.exposure = exposure
    except (AttributeError, TypeError):
        pass
    return cam


def build_arena(project_root, fresh=True):
    # Start from an empty file so arena.blend does not carry the mech scene.
    # mechs.blend is saved separately by build_mechs.py.
    if fresh:
        bpy.ops.wm.read_homefile(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    try:
        scene.view_settings.view_transform = "Standard"
        scene.view_settings.look = "None"
    except (AttributeError, TypeError):
        pass
    for opt, val in (("taa_render_samples", 48), ("use_gtao", True)):
        try:
            setattr(scene.eevee, opt, val)
        except (AttributeError, TypeError):
            pass

    world = bpy.data.worlds.get("ARENA_World") or bpy.data.worlds.new("ARENA_World")
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Color"].default_value = (0.10, 0.13, 0.20, 1.0)
    bg.inputs["Strength"].default_value = 0.40
    nt.links.new(bg.outputs[0], out.inputs[0])
    scene.world = world

    _setup_lights()

    out_dir = os.path.join(project_root, "assets", "arenas")
    debug_dir = os.path.join(project_root, "renders", "debug")
    os.makedirs(out_dir, exist_ok=True)
    os.makedirs(debug_dir, exist_ok=True)

    builders = {"far": build_far, "mid": build_mid, "near": build_near}
    written = []

    # Build every layer first, then render one at a time.
    colls = {}
    for name, fn in builders.items():
        cname = f"ARENA_{name.upper()}"
        _clear(cname)
        c = _coll(cname)
        fn(c)
        colls[name] = c

    all_meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    for name, c in colls.items():
        res_x, res_y, width, ev = LAYER_SPECS[name]
        _camera(width, res_x, res_y, ev)
        members = set(o.name for o in c.objects)
        for o in all_meshes:
            o.hide_render = o.name not in members
        path = os.path.join(out_dir, f"arena_{name}.png")
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        written.append(path)

    for o in all_meshes:
        o.hide_render = False

    blend_dir = os.path.join(project_root, "assets", "blender")
    os.makedirs(blend_dir, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(blend_dir, "arena.blend"))
    return written
