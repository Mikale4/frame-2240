"""
Pilot portraits for Babel Sword: Reignition.

Eight helmeted busts, one per chassis, rendered in the same style as the mechs
so a portrait and its machine read as the same world.

WHY HELMETS, NOT FACES
----------------------
This pipeline builds everything from boxes, wedges and cylinders. That suits
hard-surface machinery and is actively bad at human faces - a procedural face
made of primitives lands in the uncanny valley and would look worse than no
portrait at all. Mech pilots wear helmets, so the genre hands us an out: visors,
rebreathers, crests and comms fins are hard-surface problems, which is exactly
what the existing tooling is good at.

Each pilot is distinguished by helmet silhouette, visor shape and tint, collar
and faction marking - not by facial features, which are never shown.

Portraits render front-on rather than in the mechs' 3/4 view, because a portrait
that shares the gameplay camera reads as a dropped prop rather than a character.

Outputs
-------
  assets/sprites/pilots/<mech_id>.png       256x256 select-screen portrait
  assets/sprites/pilots/<mech_id>_thumb.png 96x96 in-battle banter thumbnail
"""

import importlib.util
import json
import math
import os
import sys

import bpy
from mathutils import Vector

# ---------------------------------------------------------------- shared tools

_HERE = os.path.dirname(os.path.abspath(__file__))


def _load_builder():
    """Reuses the mech builder's primitives, materials and lighting rig."""
    mod = sys.modules.get("bsr_build_mechs")
    if mod is not None:
        return mod
    path = os.path.join(_HERE, "build_mechs.py")
    spec = importlib.util.spec_from_file_location("bsr_build_mechs", path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules["bsr_build_mechs"] = mod
    spec.loader.exec_module(mod)
    return mod


BM = _load_builder()

PORTRAIT_PX = 256
THUMB_PX = 96
# Tight enough to fill the frame with helmet and shoulders.
PORTRAIT_ORTHO = 1.35


"""
Pilot roster.

`helmet` selects the silhouette; every pilot has a different one, because the
silhouette is what makes a 96px thumbnail identifiable during a fight. `visor`
picks the eye treatment. Faction drives the collar marking.
"""
PILOTS = {
    "halcyon": {
        "name": "NAIA VESK",
        "faction": "CONCORD SKYWARD",
        "helmet": "ace",        # sleek flight helmet, swept crest
        "visor": "wrap",        # full wraparound band
        "collar": "flightsuit",
    },
    "nocturne": {
        "name": "HALDEN ROOK",
        "faction": "EMBERLINE PACT",
        "helmet": "crested",    # heavy centre crest, brutal
        "visor": "slit",
        "collar": "armoured",
    },
    "vesper": {
        "name": "KESTREL DOYNE",
        "faction": "CONCORD SKYWARD",
        "helmet": "scoped",     # offset monocular sight over one eye
        "visor": "mono",
        "collar": "flightsuit",
    },
    "terramoth": {
        "name": "BRUNN OKONKWO",
        "faction": "IRONWAKE COLLIERY",
        "helmet": "rebreather",  # industrial hard hat and breathing gear
        "visor": "goggles",
        "collar": "armoured",
    },
    "cirrus": {
        "name": "MIRA HOLLOWAY",
        "faction": "FREE LATITUDE",
        "helmet": "finned",     # twin comms fins, light and fast
        "visor": "wrap",
        "collar": "flightsuit",
    },
    "obelisk": {
        "name": "SAAR TENGKU",
        "faction": "IRONWAKE COLLIERY",
        "helmet": "hooded",     # armoured hood over a recessed face
        "visor": "slit",
        "collar": "armoured",
    },
    "pyre": {
        "name": "RASA VOLKOV",
        "faction": "ASHFALL IRREGULARS",
        "helmet": "scavenger",  # patched hood, asymmetric, irregular
        "visor": "goggles",
        "collar": "scarf",
    },
    "nulltide": {
        "name": "IO SENNA",
        "faction": "FREE LATITUDE",
        "helmet": "antenna",    # EW headset, sensor spines
        "visor": "mono",
        "collar": "flightsuit",
    },
}


def _mats(mech_id):
    """Portrait materials, drawn from the mech's own palette."""
    pal = BM.PALETTES[mech_id]
    return {
        "shell": BM.make_material(f"p_{mech_id}_shell", pal["primary"], roughness=0.42, metallic=0.30),
        "dark": BM.make_material(f"p_{mech_id}_dark", pal["far"], roughness=0.5, metallic=0.25),
        "trim": BM.make_material(f"p_{mech_id}_trim", pal["trim"], roughness=0.38, metallic=0.20),
        "frame": BM.make_material(f"p_{mech_id}_frame", pal["frame"], roughness=0.6, metallic=0.35),
        "accent": BM.make_material(f"p_{mech_id}_accent", pal["accent"], roughness=0.35, metallic=0.15),
        "visor": BM.make_material(f"p_{mech_id}_visor", pal["glow"], emission=1.9, roughness=0.12,
                                  metallic=0.0, detail=False),
        "suit": BM.make_material(f"p_{mech_id}_suit", pal["secondary"], roughness=0.65, metallic=0.05),
    }


def build_portrait(mech_id):
    """Builds one pilot bust and returns its collection."""
    spec = PILOTS[mech_id]
    name = f"PILOT_{mech_id.upper()}"
    BM.clear_collection(name)
    coll = BM.get_or_make_collection(name) if hasattr(BM, "get_or_make_collection") else _collection(name)
    M = _mats(mech_id)
    o = []
    O = Vector((0.0, 0.0, 0.0))

    # ---- shoulders and neck ---------------------------------------------
    if spec["collar"] == "armoured":
        o.append(BM.add_box("b_shoulder", (0.92, 0.46, 0.26), O + Vector((0, 0, -0.62)),
                            coll=coll, mat=M["shell"]))
        for i, dx in enumerate((0.40, -0.40)):
            o.append(BM.add_wedge(f"b_pauldron{i}", (0.30, 0.34, 0.22), 0.55,
                                  O + Vector((dx, -0.02, -0.50)), (0, 0, 0),
                                  coll=coll, mat=M["dark"]))
    elif spec["collar"] == "scarf":
        o.append(BM.add_box("b_shoulder", (0.86, 0.42, 0.22), O + Vector((0, 0, -0.62)),
                            coll=coll, mat=M["suit"]))
        # Wrapped scarf: offset layers so it reads as cloth, not plate.
        for i in range(3):
            o.append(BM.add_box(f"b_scarf{i}", (0.62 - i * 0.07, 0.30, 0.10),
                                O + Vector((0.03 * (1 if i % 2 else -1), -0.06, -0.40 + i * 0.09)),
                                (0, 0, math.radians(-6 + i * 5)), coll=coll, mat=M["accent"]))
    else:
        o.append(BM.add_box("b_shoulder", (0.84, 0.42, 0.22), O + Vector((0, 0, -0.62)),
                            coll=coll, mat=M["suit"]))
        o.append(BM.add_box("b_yoke", (0.54, 0.34, 0.10), O + Vector((0, -0.04, -0.48)),
                            coll=coll, mat=M["shell"]))

    o.append(BM.add_cyl("b_neck", 0.16, 0.24, O + Vector((0, 0, -0.40)),
                        (math.radians(90), 0, 0), 14, coll=coll, mat=M["frame"]))
    o.append(BM.add_cyl("b_seal", 0.19, 0.07, O + Vector((0, 0, -0.30)),
                        (math.radians(90), 0, 0), 16, coll=coll, mat=M["dark"]))

    # ---- skull ------------------------------------------------------------
    o.append(BM.add_box("h_skull", (0.46, 0.48, 0.42), O + Vector((0, 0, -0.02)),
                        coll=coll, mat=M["shell"], bevel=0.03, bevel_seg=3))
    o.append(BM.add_wedge("h_jaw", (0.38, 0.40, 0.18), 0.72,
                          O + Vector((0, 0.02, -0.22)), (math.radians(90), 0, 0),
                          coll=coll, mat=M["dark"]))
    o.append(BM.add_box("h_crown", (0.42, 0.42, 0.10), O + Vector((0, 0, 0.20)),
                        coll=coll, mat=M["trim"], bevel=0.02))

    # ---- visor ------------------------------------------------------------
    v = spec["visor"]
    if v == "wrap":
        o.append(BM.add_box("v_band", (0.44, 0.10, 0.13), O + Vector((0, -0.21, 0.02)),
                            coll=coll, mat=M["visor"]))
        o.append(BM.add_box("v_brow", (0.47, 0.10, 0.05), O + Vector((0, -0.22, 0.11)),
                            coll=coll, mat=M["frame"]))
    elif v == "slit":
        o.append(BM.add_box("v_slit", (0.34, 0.09, 0.06), O + Vector((0, -0.22, 0.02)),
                            coll=coll, mat=M["visor"]))
        o.append(BM.add_wedge("v_hood", (0.46, 0.16, 0.16), 0.6,
                              O + Vector((0, -0.16, 0.14)), (math.radians(90), 0, 0),
                              coll=coll, mat=M["dark"]))
    elif v == "mono":
        # Single optic, deliberately off-centre: asymmetry reads at thumbnail size.
        o.append(BM.add_box("v_plate", (0.40, 0.08, 0.14), O + Vector((0, -0.21, 0.02)),
                            coll=coll, mat=M["frame"]))
        o.append(BM.add_cyl("v_optic", 0.075, 0.10, O + Vector((0.11, -0.26, 0.03)),
                            (math.radians(90), 0, 0), 16, coll=coll, mat=M["visor"]))
        o.append(BM.add_cyl("v_ring", 0.095, 0.05, O + Vector((0.11, -0.23, 0.03)),
                            (math.radians(90), 0, 0), 16, coll=coll, mat=M["accent"]))
    else:  # goggles
        for i, dx in enumerate((0.12, -0.12)):
            o.append(BM.add_cyl(f"v_lens{i}", 0.088, 0.09, O + Vector((dx, -0.24, 0.02)),
                                (math.radians(90), 0, 0), 16, coll=coll, mat=M["visor"]))
            o.append(BM.add_cyl(f"v_rim{i}", 0.105, 0.05, O + Vector((dx, -0.21, 0.02)),
                                (math.radians(90), 0, 0), 16, coll=coll, mat=M["frame"]))
        o.append(BM.add_box("v_strap", (0.50, 0.06, 0.07), O + Vector((0, -0.14, 0.02)),
                            coll=coll, mat=M["dark"]))

    # ---- helmet silhouette -------------------------------------------------
    h = spec["helmet"]
    if h == "ace":
        o.append(BM.add_wedge("k_crest", (0.09, 0.42, 0.16), 0.35,
                              O + Vector((0, 0.02, 0.26)), (0, 0, 0), coll=coll, mat=M["accent"]))
        o.append(BM.add_box("k_fin", (0.05, 0.20, 0.10), O + Vector((0, 0.22, 0.20)),
                            (math.radians(-18), 0, 0), coll=coll, mat=M["trim"]))
    elif h == "crested":
        o.append(BM.add_wedge("k_crest", (0.13, 0.46, 0.26), 0.25,
                              O + Vector((0, 0.0, 0.30)), (0, 0, 0), coll=coll, mat=M["accent"]))
        for i, dx in enumerate((0.24, -0.24)):
            o.append(BM.add_box(f"k_horn{i}", (0.07, 0.10, 0.22),
                                O + Vector((dx, 0.10, 0.22)), (0, math.radians(14 - i * 28), 0),
                                coll=coll, mat=M["frame"]))
    elif h == "scoped":
        o.append(BM.add_box("k_rail", (0.30, 0.26, 0.06), O + Vector((0.02, 0.0, 0.26)),
                            coll=coll, mat=M["frame"]))
        o.append(BM.add_cyl("k_scope", 0.055, 0.40, O + Vector((0.13, -0.12, 0.24)),
                            (math.radians(90), 0, 0), 14, coll=coll, mat=M["dark"]))
        o.append(BM.add_cyl("k_lens", 0.045, 0.04, O + Vector((0.13, -0.32, 0.24)),
                            (math.radians(90), 0, 0), 14, coll=coll, mat=M["accent"]))
    elif h == "rebreather":
        o.append(BM.add_box("k_brim", (0.60, 0.34, 0.06), O + Vector((0, -0.06, 0.24)),
                            coll=coll, mat=M["accent"]))
        o.append(BM.add_cyl("k_mask", 0.15, 0.14, O + Vector((0, -0.26, -0.14)),
                            (math.radians(90), 0, 0), 16, coll=coll, mat=M["frame"]))
        for i, dx in enumerate((0.20, -0.20)):
            o.append(BM.add_cyl(f"k_filter{i}", 0.075, 0.10, O + Vector((dx, -0.22, -0.16)),
                                (math.radians(90), 0, 0), 14, coll=coll, mat=M["dark"]))
            o.append(BM.add_box(f"k_hose{i}", (0.06, 0.16, 0.06),
                                O + Vector((dx, -0.10, -0.26)), coll=coll, mat=M["suit"]))
    elif h == "finned":
        for i, dx in enumerate((0.26, -0.26)):
            o.append(BM.add_wedge(f"k_fin{i}", (0.05, 0.16, 0.34), 0.3,
                                  O + Vector((dx, 0.06, 0.24)), (0, math.radians(12 - i * 24), 0),
                                  coll=coll, mat=M["accent"]))
        o.append(BM.add_box("k_spine", (0.07, 0.36, 0.07), O + Vector((0, 0.04, 0.24)),
                            coll=coll, mat=M["trim"]))
    elif h == "hooded":
        o.append(BM.add_wedge("k_hood", (0.60, 0.56, 0.34), 0.55,
                              O + Vector((0, 0.04, 0.14)), (0, 0, 0), coll=coll, mat=M["dark"]))
        o.append(BM.add_box("k_ridge", (0.10, 0.50, 0.10), O + Vector((0, 0.02, 0.30)),
                            coll=coll, mat=M["accent"]))
        for i, dx in enumerate((0.30, -0.30)):
            o.append(BM.add_box(f"k_cheek{i}", (0.07, 0.22, 0.26),
                                O + Vector((dx, -0.10, -0.06)), coll=coll, mat=M["shell"]))
    elif h == "scavenger":
        # Asymmetric on purpose: irregulars do not have matching kit.
        o.append(BM.add_wedge("k_hood", (0.56, 0.50, 0.26), 0.6,
                              O + Vector((-0.03, 0.04, 0.18)), (0, math.radians(6), 0),
                              coll=coll, mat=M["suit"]))
        o.append(BM.add_box("k_patch", (0.18, 0.20, 0.14), O + Vector((0.22, -0.06, 0.10)),
                            (0, math.radians(-12), 0), coll=coll, mat=M["accent"]))
        o.append(BM.add_box("k_rivet", (0.05, 0.05, 0.20), O + Vector((-0.24, -0.10, 0.06)),
                            coll=coll, mat=M["frame"]))
    else:  # antenna
        for i, (dx, tilt) in enumerate(((0.22, 16), (-0.22, -16), (0.0, 0))):
            ln = 0.42 if i == 2 else 0.32
            o.append(BM.add_cyl(f"k_ant{i}", 0.022, ln,
                                O + Vector((dx, 0.06, 0.30 + (0.06 if i == 2 else 0))),
                                (0, math.radians(tilt), 0), 8, coll=coll, mat=M["frame"]))
            o.append(BM.add_cyl(f"k_tip{i}", 0.034, 0.05,
                                O + Vector((dx * 1.18, 0.06, 0.50 + (0.08 if i == 2 else 0))),
                                (0, math.radians(tilt), 0), 10, coll=coll, mat=M["visor"]))
        o.append(BM.add_box("k_pack", (0.34, 0.16, 0.10), O + Vector((0, 0.20, 0.10)),
                            coll=coll, mat=M["dark"]))

    # ---- faction flash on the collar --------------------------------------
    o.append(BM.add_box("b_flash", (0.10, 0.06, 0.10), O + Vector((0.28, -0.20, -0.52)),
                        coll=coll, mat=M["accent"]))

    return BM.join_as(f"{mech_id}_portrait", o, O, coll)


def _collection(name):
    coll = bpy.data.collections.get(name)
    if coll is None:
        coll = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(coll)
    return coll


def _portrait_camera():
    """A dedicated front-on orthographic camera, distinct from the mech rig."""
    cam = bpy.data.objects.get("BSR_PortraitCam")
    if cam is None:
        data = bpy.data.cameras.new("BSR_PortraitCam")
        cam = bpy.data.objects.new("BSR_PortraitCam", data)
        bpy.context.scene.collection.objects.link(cam)
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = PORTRAIT_ORTHO
    # Slightly off dead-centre so the helmet has some form rather than reading flat.
    cam.location = Vector((0.55, -4.0, 0.30))
    cam.rotation_euler = (math.radians(86), 0.0, math.radians(8))
    return cam


def render_portraits(project_root, only=None):
    """Builds and renders every pilot portrait plus its banter thumbnail."""
    BM.setup_world_and_lights()
    BM.setup_outlines()
    cam = _portrait_camera()

    scene = bpy.context.scene
    scene.camera = cam
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"

    out = os.path.join(project_root, "assets", "sprites", "pilots")
    os.makedirs(out, exist_ok=True)

    ids = [m for m in PILOTS if only is None or m in only]
    made = {}
    # Hide the mechs so they cannot wander into a portrait frame.
    hidden = []
    for c in bpy.data.collections:
        if c.name.startswith("MECH_") and not c.hide_render:
            c.hide_render = True
            hidden.append(c)
    try:
        for mech_id in ids:
            obj = build_portrait(mech_id)
            for other in ids:
                o2 = bpy.data.objects.get(f"{other}_portrait")
                if o2 is not None:
                    o2.hide_render = other != mech_id
            for px, suffix in ((PORTRAIT_PX, ""), (THUMB_PX, "_thumb")):
                scene.render.resolution_x = px
                scene.render.resolution_y = px
                scene.render.resolution_percentage = 100
                scene.render.filepath = os.path.join(out, f"{mech_id}{suffix}.png")
                bpy.ops.render.render(write_still=True)
            made[mech_id] = PILOTS[mech_id]["name"]
            obj.hide_render = False
    finally:
        for c in hidden:
            c.hide_render = False

    with open(os.path.join(out, "pilots.json"), "w", encoding="utf-8") as fh:
        json.dump(
            {
                "note": "Helmeted busts; faces are never shown. See build_portraits.py.",
                "portrait_px": PORTRAIT_PX,
                "thumb_px": THUMB_PX,
                "pilots": {k: PILOTS[k] for k in ids},
            },
            fh,
            indent=2,
        )
    return made
