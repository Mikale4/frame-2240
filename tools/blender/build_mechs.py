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
TILE = 320  # default square render target per part
ORTHO_SCALE = TILE / PX_PER_BU  # 2.667 BU across the frame

# A part is framed on its own pivot, so the tile only reaches TILE/2 px in each
# direction. Long parts held away from their pivot overrun that: the beam saber
# is 1.7 BU of blade growing forward from a pivot at the emitter, which the
# 320px tile cut off flat mid-blade. Tiles are therefore sized per part from the
# real bounding box. PX_PER_BU is held constant (ortho_scale tracks the tile), so
# a bigger tile only adds transparent margin — the pivot stays at the centre and
# the game still draws every part at origin 0.5,0.5 and PART_SCALE.
TILE_STEP = 64  # round tile sizes up to this, to keep texture dimensions tidy
TILE_MARGIN_PX = 14  # room for the Freestyle contour and any glow bleed
TILE_MAX = 1024  # a part needing more than this is a modelling mistake

# Shallow three-quarter side view, matching the reference art's viewing angle.
CAM_AZIMUTH = math.radians(15.0)
CAM_ELEVATION = math.radians(9.0)
CAM_DIST = 9.0

# Dark contour lines. The reference sprites read crisply at ~100px because of
# hard edge contrast; Freestyle reproduces that.
USE_OUTLINES = True
# The reference sprites are hard-edged pixel art with a crisp dark contour on
# every part. Thin, near-black, and applied to creases as well as silhouettes.
OUTLINE_THICKNESS = 2.1

PART_ORDER = [
    "core",
    "head",
    "backpack",
    "lowerBody",
    # Legs are separate parts so each can swing about its hip for a walk cycle.
    "legNear",
    "legFar",
    "leftArm",
    "subWeapon",
    "rightArm",
    "mainWeapon",
    "leftThruster",
    "rightThruster",
    # Shown only during a melee sequence, in place of the stowed rifle.
    "meleeWeapon",
]

# Parts that only some chassis carry, so a missing one is not a build error.
#
# `meleeEnergy` is the projected blade, split out of `meleeWeapon` so it can be
# excluded from the Freestyle contour and flickered on its own. CLAW and
# RAMSHIELD project nothing and therefore have none.
OPTIONAL_PARTS = ["meleeEnergy"]

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
            # Hip line, 1.2 logical px below the lowerBody pivot (hip z = -0.02 BU).
            "legNear": (-8, 27, -0.08),
            "legFar": (-8, 27, 0.08),
            "leftArm": (-2, -2, 0.19),
            "subWeapon": (-5, -25, 0.19),
            "rightArm": (16, 6, -0.19),
            "mainWeapon": (54, 14, -0.19),
            "meleeWeapon": (44, 12, -0.21),
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
            "legNear": (-10, 25, -0.10),
            "legFar": (-10, 25, 0.10),
            "leftArm": (-4, 0, 0.22),
            "subWeapon": (-10, -26, 0.22),
            "rightArm": (18, 10, -0.22),
            "mainWeapon": (58, 16, -0.22),
            "meleeWeapon": (48, 14, -0.24),
            "leftThruster": (-40, 4, 0.14),
            "rightThruster": (-34, 16, -0.14),
        },
    },
    # --- roster expansion -------------------------------------------------
    # Pivots below are WORLD logical pixels; src/data/rosterExtra.ts stores the
    # same points as offsets relative to each part's parent. So e.g. VESPER's
    # mainWeapon world (61,13) = rightArm (15,5) + child (46,8). Change one and
    # the other must follow, or the sprite and the hitbox disagree.

    # Marksman: slimmest hull, longest legs, hardest pitch, oversized railgun.
    "vesper": {
        "pitch": 26.0,
        "hull": (0.58, 0.32, 0.28),
        "leg": {"thigh": 0.50, "shin": 0.54, "w": 0.14, "foot": 0.30, "hip": 0.34},
        "weapon": "railgun",
        "booster": "twin",
        "pod": "compact",
        "blade": "bayonet",
        "pivots": {
            "core": (0, 0, 0.0),
            "head": (23, -9, -0.05),
            "backpack": (-28, -20, 0.05),
            "lowerBody": (-8, 28, 0.0),
            "legNear": (-8, 29, -0.08),
            "legFar": (-8, 29, 0.08),
            "leftArm": (-2, -3, 0.19),
            "subWeapon": (-5, -27, 0.19),
            "rightArm": (15, 5, -0.19),
            "mainWeapon": (61, 13, -0.19),
            "meleeWeapon": (41, 11, -0.21),
            "leftThruster": (-38, 0, 0.17),
            "rightThruster": (-34, 12, -0.17),
        },
    },
    # Siege walker: widest and heaviest, stubby legs, near-level stance, mortar.
    "terramoth": {
        "pitch": 10.0,
        "hull": (0.88, 0.54, 0.44),
        "leg": {"thigh": 0.30, "shin": 0.32, "w": 0.26, "foot": 0.46, "hip": 0.52},
        "weapon": "mortar",
        "booster": "quad",
        "pod": "rack",
        "blade": "pile",
        "pivots": {
            "core": (0, 0, 0.0),
            "head": (20, 2, -0.05),
            "backpack": (-34, -10, 0.05),
            "lowerBody": (-12, 22, 0.0),
            "legNear": (-12, 23, -0.11),
            "legFar": (-12, 23, 0.11),
            "leftArm": (-6, 2, 0.24),
            "subWeapon": (-14, -26, 0.24),
            "rightArm": (20, 12, -0.24),
            "mainWeapon": (62, 16, -0.24),
            "meleeWeapon": (52, 14, -0.26),
            "leftThruster": (-44, 6, 0.15),
            "rightThruster": (-38, 18, -0.15),
        },
    },
    # Skirmisher: thinnest frame, steepest pitch, wing boosters, twin SMGs.
    "cirrus": {
        "pitch": 30.0,
        "hull": (0.50, 0.28, 0.24),
        "leg": {"thigh": 0.44, "shin": 0.48, "w": 0.12, "foot": 0.26, "hip": 0.30},
        "weapon": "smg",
        "booster": "wing",
        "pod": "compact",
        "blade": "twindagger",
        "pivots": {
            "core": (0, 0, 0.0),
            "head": (19, -8, -0.045),
            "backpack": (-22, -16, 0.045),
            "lowerBody": (-6, 22, 0.0),
            "legNear": (-6, 23, -0.07),
            "legFar": (-6, 23, 0.07),
            "leftArm": (-1, -3, 0.17),
            "subWeapon": (-3, -23, 0.17),
            "rightArm": (14, 4, -0.17),
            "mainWeapon": (46, 11, -0.17),
            "meleeWeapon": (38, 9, -0.19),
            "leftThruster": (-32, -2, 0.15),
            "rightThruster": (-28, 9, -0.15),
        },
    },
    # Bulwark: broad shielded frame, single heavy burner, short-range breach gun.
    "obelisk": {
        "pitch": 12.0,
        "hull": (0.80, 0.50, 0.40),
        "leg": {"thigh": 0.34, "shin": 0.36, "w": 0.23, "foot": 0.42, "hip": 0.48},
        "weapon": "breachgun",
        "booster": "single",
        "pod": "rack",
        "blade": "ramshield",
        "pivots": {
            "core": (0, 0, 0.0),
            "head": (21, -1, -0.05),
            "backpack": (-30, -12, 0.05),
            "lowerBody": (-10, 24, 0.0),
            "legNear": (-10, 25, -0.10),
            "legFar": (-10, 25, 0.10),
            "leftArm": (-5, 1, 0.22),
            "subWeapon": (-12, -24, 0.22),
            "rightArm": (18, 9, -0.22),
            "mainWeapon": (54, 15, -0.22),
            "meleeWeapon": (46, 13, -0.24),
            "leftThruster": (-40, 4, 0.14),
            "rightThruster": (-34, 15, -0.14),
        },
    },
    # Incendiary brawler: mid-weight, twin burners, wide-mouthed flame projector.
    "pyre": {
        "pitch": 18.0,
        "hull": (0.70, 0.42, 0.34),
        "leg": {"thigh": 0.40, "shin": 0.44, "w": 0.18, "foot": 0.36, "hip": 0.40},
        "weapon": "flamer",
        "booster": "twin",
        "pod": "rack",
        "blade": "scythe",
        "pivots": {
            "core": (0, 0, 0.0),
            "head": (22, -5, -0.05),
            "backpack": (-27, -17, 0.05),
            "lowerBody": (-9, 25, 0.0),
            "legNear": (-9, 26, -0.09),
            "legFar": (-9, 26, 0.09),
            "leftArm": (-3, -1, 0.20),
            "subWeapon": (-8, -25, 0.20),
            "rightArm": (17, 7, -0.20),
            "mainWeapon": (51, 15, -0.20),
            "meleeWeapon": (44, 12, -0.22),
            "leftThruster": (-37, 2, 0.16),
            "rightThruster": (-33, 13, -0.16),
        },
    },
    # Disruptor: lean EW frame, wing boosters, antenna mast, arc emitter.
    "nulltide": {
        "pitch": 28.0,
        "hull": (0.54, 0.30, 0.26),
        "leg": {"thigh": 0.46, "shin": 0.50, "w": 0.13, "foot": 0.28, "hip": 0.32},
        "weapon": "arc",
        "booster": "wing",
        "pod": "compact",
        "blade": "baton",
        "pivots": {
            "core": (0, 0, 0.0),
            "head": (20, -10, -0.045),
            "backpack": (-25, -19, 0.045),
            "lowerBody": (-7, 23, 0.0),
            "legNear": (-7, 24, -0.075),
            "legFar": (-7, 24, 0.075),
            "leftArm": (-2, -4, 0.18),
            "subWeapon": (-6, -26, 0.18),
            "rightArm": (15, 3, -0.18),
            "mainWeapon": (50, 12, -0.18),
            "meleeWeapon": (40, 9, -0.20),
            "leftThruster": (-34, -1, 0.15),
            "rightThruster": (-30, 11, -0.15),
        },
    },
}

"""
Palettes.

Calibrated from the 2005 build's own .act palette files (chars/rs/pal/*.act,
768-byte RGB tables) and from in-game screenshots — NOT from the roster portrait
GIFs, which are rendered in a neutral placeholder palette and led an earlier pass
badly astray. The real machines are vividly coloured: sampling 00-1.act yields
#0090FF / #00DCFF with #FF5500, 01-1.act gives orange over teal, 20-1.act a green
and teal ramp. (#FF00FF is MUGEN's transparency key, not a body colour.)

Each mech therefore gets a bold identity hue, a darker far-side variant of that
same hue for depth, near-white highlight plating, dark joints, and a contrasting
accent. Values are linear-ish sRGB fed straight to Base Color.
"""
PALETTES = {
    # Azure interceptor with hot orange trim.
    # `secondary` is a DARKER shade of the identity hue, not white: the identity
    # colour has to dominate the surface area or the mech reads as a white robot
    # with coloured bits. `trim` is the near-white, used only on small pieces.
    "halcyon": {
        "primary": (0.10, 0.44, 0.86),
        "far": (0.05, 0.20, 0.44),
        "secondary": (0.06, 0.26, 0.56),
        "trim": (0.84, 0.89, 0.94),
        "frame": (0.10, 0.12, 0.17),
        "accent": (1.00, 0.36, 0.06),
        "glow": (0.20, 0.90, 1.00),
    },
    # Crimson assault frame with cyan trim - maximum separation from HALCYON.
    "nocturne": {
        "primary": (0.82, 0.16, 0.10),
        "far": (0.38, 0.07, 0.05),
        "secondary": (0.52, 0.09, 0.06),
        "trim": (0.88, 0.84, 0.80),
        "frame": (0.12, 0.09, 0.09),
        "accent": (0.10, 0.92, 0.86),
        "glow": (1.00, 0.78, 0.18),
    },
    # --- roster expansion -------------------------------------------------
    # Eight machines have to be told apart instantly at gameplay scale, so the
    # identity hues are spread around the wheel and no two sit adjacent:
    # azure, crimson, teal, ochre, silver, violet, orange, slate.
    # These mirror `tint` in src/data/rosterExtra.ts.

    # Teal marksman, sulphur-yellow optics.
    "vesper": {
        "primary": (0.18, 0.66, 0.63),
        "far": (0.05, 0.22, 0.21),
        "secondary": (0.08, 0.33, 0.35),
        "trim": (0.84, 0.90, 0.90),
        "frame": (0.09, 0.13, 0.14),
        "accent": (0.95, 0.88, 0.30),
        "glow": (0.50, 0.96, 0.90),
    },
    # Ochre siege walker, hazard-amber lamps: industrial plant, not a fighter.
    "terramoth": {
        "primary": (0.60, 0.42, 0.18),
        "far": (0.24, 0.16, 0.07),
        "secondary": (0.31, 0.20, 0.09),
        "trim": (0.88, 0.85, 0.78),
        "frame": (0.14, 0.11, 0.08),
        "accent": (1.00, 0.76, 0.30),
        "glow": (1.00, 0.76, 0.30),
    },
    # Bare silver skirmisher - the one unpainted machine, cyan running lights.
    "cirrus": {
        "primary": (0.85, 0.87, 0.91),
        "far": (0.40, 0.43, 0.48),
        "secondary": (0.49, 0.53, 0.60),
        "trim": (0.96, 0.98, 1.00),
        "frame": (0.13, 0.15, 0.18),
        "accent": (0.29, 0.84, 1.00),
        "glow": (0.74, 0.94, 1.00),
    },
    # Violet bulwark with a pale shield glow.
    "obelisk": {
        "primary": (0.43, 0.37, 0.66),
        "far": (0.17, 0.14, 0.30),
        "secondary": (0.20, 0.17, 0.36),
        "trim": (0.86, 0.84, 0.92),
        "frame": (0.11, 0.10, 0.16),
        "accent": (0.78, 0.71, 1.00),
        "glow": (0.66, 0.55, 1.00),
    },
    # Furnace orange - deliberately clear of NOCTURNE's deep crimson.
    "pyre": {
        "primary": (0.91, 0.46, 0.11),
        "far": (0.36, 0.15, 0.03),
        "secondary": (0.48, 0.21, 0.04),
        "trim": (0.92, 0.87, 0.80),
        "frame": (0.15, 0.10, 0.07),
        "accent": (1.00, 0.88, 0.40),
        "glow": (1.00, 0.76, 0.28),
    },
    # Near-black slate with electric cyan: the EW frame reads as unlit hardware.
    "nulltide": {
        "primary": (0.14, 0.23, 0.29),
        "far": (0.05, 0.09, 0.12),
        "secondary": (0.07, 0.11, 0.15),
        "trim": (0.80, 0.86, 0.90),
        "frame": (0.08, 0.10, 0.12),
        "accent": (0.54, 1.00, 0.88),
        "glow": (0.36, 0.88, 1.00),
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


# ------------------------------------------------------- surface textures
#
# CC0 maps from Poly Haven, processed to 512px greyscale. See
# `assets/blender/textures/README.md` for provenance, the exact source URLs and
# the 16-bit conversion trap.
#
# They drive **masks, roughness and bump — never albedo colour**. The palette
# rule below requires the identity hue to dominate the surface so eight machines
# stay tellable apart at gameplay scale, and photographic albedo would pull every
# one of them toward the same brown-grey.

_TEXTURE_DIR_OVERRIDE = None
_IMG_CACHE = {}


def _texture_dir():
    """Textures live beside the .blend, in `assets/blender/textures`.

    **Do not rely on `bpy.data.filepath` alone.** A headless build started as
    `blender --background --factory-startup --python run_build.py` has no open
    file, so that path is empty for the entire run - `build_all` only saves the
    .blend at the very end. Every `_load_image` then returned None, every
    material took the procedural-only fallback, and a full eight-mech rebuild
    produced 112 sprites with **no wear, rust or roughness maps at all**. It
    raised no error, because the fallback is deliberate; the only symptom was
    the machines coming out ~18 levels brighter and cleaner.

    So fall back to this file's own location, which is a fixed distance from the
    textures: `tools/blender/build_mechs.py` -> `assets/blender/textures`.
    """
    if _TEXTURE_DIR_OVERRIDE:
        return _TEXTURE_DIR_OVERRIDE
    if bpy.data.filepath:
        d = os.path.join(os.path.dirname(bpy.data.filepath), "textures")
        if os.path.isdir(d):
            return d
    here = os.path.dirname(os.path.abspath(__file__))
    root = os.path.dirname(os.path.dirname(here))          # tools/blender -> project
    d = os.path.join(root, "assets", "blender", "textures")
    return d if os.path.isdir(d) else None


def _load_image(filename, non_color=False):
    """Loads a texture once and reuses it. None if it is missing.

    Missing textures are not an error: every material falls back to the
    procedural-only path, so the build still produces sprites on a checkout that
    has not fetched them.
    """
    if filename in _IMG_CACHE:
        return _IMG_CACHE[filename]
    d = _texture_dir()
    path = os.path.join(d, filename) if d else None
    img = None
    if path and os.path.exists(path):
        try:
            img = bpy.data.images.get(filename) or bpy.data.images.load(path)
            if non_color:
                img.colorspace_settings.name = "Non-Color"
        except (RuntimeError, OSError):
            img = None
    _IMG_CACHE[filename] = img
    return img


# Repeats per Blender unit.
#
# Swept at 2.2 / 4.0 / 6.5 / 10.0 and it measured **flat** - hull SD 36.10,
# 36.03, 36.02, 36.03 - because at any of these the texture modulates by at most
# ~25 of 255 while the 3D form's own shading spans far more. The scale is
# therefore *not* the sensitive dial it was assumed to be; the strengths below
# are. 4.0 is kept because it puts 1.5-2.5 repeats across a typical 0.4 BU part,
# which is coarse enough to survive to the 35-100 logical px a part occupies.
TEX_SCALE = 4.0
# A second, much coarser sampling of the same maps. One scale alone gives a
# single grain; a coarse layer under a fine one is what makes a surface look
# *aged* rather than *speckled*, and it is the layer that survives to sprite size.
TEX_SCALE_BROAD = 0.9
# How far the scuff mask pulls the surface toward its worn tone.
#
# These were 0.34/0.30/0.28 on the first pass and the result was, correctly,
# called invisible. A part face is large and flat and takes one lighting value,
# so *all* the tonal variation within a panel has to come from here. Timid
# values produce a 25-of-255 modulation that vanishes against the form's own
# shading. They are deliberately aggressive now.
WEAR_STRENGTH = 1.0
WEAR_DARK = 0.34
BROAD_STRENGTH = 0.70
BROAD_DARK = 0.55
# Oxide. `RUST_GATE` is the mask threshold - raising it makes rust rarer, which
# is the difference between "weathered machine" and "abandoned wreck".
RUST_STRENGTH = 0.62
RUST_GATE = 0.46
# How much the roughness map varies the base roughness. This is what breaks up
# the smooth specular sweep that made the sprites read as moulded plastic.
ROUGH_TEX_STRENGTH = 0.45
# Crevice darkening. Pointiness above 0.5 is convex (an edge), below is concave
# (a corner, a panel gap, the seam where two boxes meet). The material brightened
# convex edges from the start and did nothing with concave ones, so every inside
# corner stayed as bright as the middle of a face — which is a large part of why
# the chassis read as untextured boxes. This is the single biggest contributor to
# perceived depth on geometry this blocky.
CAVITY_STRENGTH = 0.85
CAVITY_DARK = 0.30
# Surface relief, driven from the wear map's luminance. A normal map is not
# usable here: the meshes carry no UVs, so there is no tangent basis for a
# NormalMap node to work in. Bump needs none.
#
# **Measured, and it is a dead lever.** Swept 0.0 / 0.4 / 1.0 / 2.0 / 3.5 against
# a flat-map baseline: the texture's contribution at on-screen size went 5.00 /
# 5.05 / 5.08 / 5.22 / 5.58. An 8.75x lever bought 12 %, and bump-off versus the
# shipped value differ by 1 %. The rig is four soft area lights (sizes 1.4-5.0)
# on large flat faces, and soft light barely responds to a perturbed normal.
# Left at 0.4 because it costs nothing; do not reach for it expecting anything.
BUMP_STRENGTH = 0.40

# How far each mask's contrast is expanded about its own mean before use.
#
# **This is the lever bump is not.** The maps ship at SD 42.6 (wear) and 47.9
# (grime), and at that contrast the whole texture stack moved a rendered part by
# a mean of 5.0/255 at the size it is actually displayed - present, and
# invisible. Swept 1.0 / 1.6 / 2.5 / 4.0 on an isolated part, rendered the way
# `render_part` renders it:
#
#     gain   map SD   mean|d| vs flat   body pixels changed >8 levels
#     1.0      42.6              5.05                            18.5 %
#     1.6      62.3              7.27                            34.6 %
#     2.5      79.4              9.26                            46.6 %
#     4.0      95.2             11.10                            55.6 %
#
# Near-linear in map SD, and confirmed on CIRRUS (silver) as well as TERRAMOTH
# (ochre), so it is not a property of one palette. 4.0 chosen by the owner off
# the rendered sweep.
#
# **It is applied in the shader, not baked into the PNGs.** The sources stay
# pristine and regenerable, and the value stays a dial. The cost is that at 4.0
# the shipped maps clip - they already span 0-255, so expanding about the mean
# crushes the tails. Purpose-authored maps at this SD would not; see
# `docs/PROMPT_MECH_TEXTURES.md`.
TEX_CONTRAST = 4.0

# Each mask's mean, needed to expand contrast about it rather than about mid-grey
# (which would shift the average and change how much wear the surface carries).
# Measured values; see `assets/blender/textures/README.md`.
TEX_MEAN = {
    "plate_wear.png": 88.0 / 255.0,
    "rust_mask.png": 106.2 / 255.0,
}

# A thin clear coat over the armour. Painted steel has one and bare Principled
# diffuse does not, which is a real part of the "untextured Blender model" read:
# without it the only highlight is the broad diffuse roll-off. Worth a modest
# 1.17 mean|d| on its own - small next to the contrast, but it is the difference
# between paint and plaster, and it costs one node.
# Not applied to emissive or detail-free materials.
COAT_WEIGHT = 0.25
COAT_ROUGHNESS = 0.16

# ---------------------------------------------------------------- cel shading
#
# The reference shades **hard**: roughly four flat value steps per form, with no
# soft gradient anywhere, and a black line between every adjacent component. A
# continuous EEVEE gradient is the single strongest "this came out of Blender"
# signal, and no amount of albedo texture hides it — see
# `docs/REFERENCE_ART_STUDY.md` §3.
#
# Implemented by taking the diffuse lighting result through `Shader to RGB`
# (EEVEE-only, verified present in 5.1), quantising it with a CONSTANT-
# interpolation ramp, and multiplying the textured albedo by the result. The
# albedo keeps all of its detail; only the *lighting* is stepped, which is what
# cel shading actually means.
#
# **Off, by direction.** Built, rendered, and rejected: it produces exactly the
# flat poster look the 2005 reference has, and the target for this project is
# semi-realistic machines that belong in the same world as CATHEDRAL YARD's
# painted art — real material response, weathered painted steel, believable
# light — while still separating from the background as foreground subjects.
# Kept intact rather than deleted because it is a working toon path and the
# decision is an art call, not a technical one.
CEL_SHADE = False
CEL_STEPS = 4
# Darkest band. The reference's shadow side stays clearly readable rather than
# going black - separation there is done by the line work, not by crushing.
CEL_SHADOW = 0.46
# Where the lit/shadow terminator falls. Below 0.5 puts more of each form in
# light, which is what keeps the machines bright against a busy background.
CEL_BIAS = 0.42
# The oxide tone, sampled from rust_coarse_01 rather than invented: hue 23.8deg,
# against the deck's sodium practicals at 30.3deg. Same warm family, so the
# corrosion reads as native to CATHEDRAL YARD.
RUST_RGB = (0.30, 0.15, 0.07)


# ------------------------------------------------- per-faction surface finish
#
# **Five powers, five ways of building and maintaining a machine.** Taken from
# `src/data/archive.ts` ("THE FIVE POWERS") rather than invented, because the
# Archive already says how each of them treats hardware, and a roster where every
# chassis carries the same grime is a roster that wastes its own fiction.
#
# Each entry scales the shared wear stack. Values are multipliers/overrides on
# the module defaults below; anything omitted falls back to them.
FACTIONS = {
    "halcyon": "CONCORD SKYWARD",
    "vesper": "CONCORD SKYWARD",
    "nocturne": "EMBERLINE PACT",
    "terramoth": "IRONWAKE COLLIERY",
    "obelisk": "IRONWAKE COLLIERY",
    "cirrus": "FREE LATITUDE",
    "nulltide": "FREE LATITUDE",
    "pyre": "ASHFALL IRREGULARS",
}

FACTION_SURFACE = {
    # "Reliability the first requirement." Published doctrine, central
    # certification, extended trials. These are maintained to a standard: even
    # factory paint, crisp panel work, very little corrosion.
    "CONCORD SKYWARD": dict(
        wear=0.42, broad=0.40, rust=0.10, rust_gate=0.80,
        rough=0.26, cavity=0.75,
    ),
    # Excavation walkers "rated for seam collapse and falling ore", rebuilt for
    # yard defence. The most beaten hardware on the roster: thick scuffed paint,
    # impact scarring, ore dust in every recess.
    "IRONWAKE COLLIERY": dict(
        wear=1.00, broad=0.85, rust=0.72, rust_gate=0.40,
        rough=0.52, cavity=1.00,
    ),
    # Concord airframes "rebuilt to Pact standards and returned to service
    # without Concord certification". A machine with a paint history: the
    # heaviest broad tonal drift on the roster, standing in for panels resprayed
    # at different times, over corrosion that was painted rather than cured.
    "EMBERLINE PACT": dict(
        wear=0.80, broad=1.00, rust=0.55, rust_gate=0.52,
        rough=0.44, cavity=0.90,
    ),
    # "Assembled from salvage, copied patterns and recovered systems. Individual
    # machines differ substantially." Barely painted at all — CIRRUS is already
    # the one unpainted machine in the palette notes. Bare alloy scuffs bright
    # rather than dark, so wear is high and rust is low: salvage crews run
    # corrosion-resistant recovered stock, they just never finish it.
    "FREE LATITUDE": dict(
        wear=0.95, broad=0.60, rust=0.22, rust_gate=0.66,
        rough=0.58, cavity=0.85,
    ),
    # "Built for short engagements and replacement from contract revenue."
    # Cheap thin paint, no refit budget, and — PYRE being the incendiary frame —
    # scorched by its own weapon. Soot rather than rust.
    "ASHFALL IRREGULARS": dict(
        wear=0.88, broad=0.75, rust=0.38, rust_gate=0.58,
        rough=0.46, cavity=0.95,
    ),
}

# The oxide tone per faction. Ironwake corrodes; Ashfall soots; Free Latitude
# shows bare metal where paint has gone rather than rust.
FACTION_GRIME_RGB = {
    "CONCORD SKYWARD": (0.26, 0.22, 0.18),
    "IRONWAKE COLLIERY": (0.32, 0.15, 0.06),
    "EMBERLINE PACT": (0.30, 0.15, 0.07),
    "FREE LATITUDE": (0.34, 0.34, 0.33),
    "ASHFALL IRREGULARS": (0.13, 0.11, 0.10),
}


# Machines whose identity colour IS the neutral, and which therefore keep the
# classic mapping. Inverting these does not make them read as designed — it
# destroys the thing that identifies them.
#
# **NULLTIDE.** Its identity is near-black slate `#243B4A` and its `trim` is
# near-white `#CCDBE6`, so the inversion turned the darkest machine on the
# roster into a pale one: 25.1 % light became 44.3 %. It and CIRRUS are the
# closest silhouette pair in the game and they are separated by *value*, not by
# outline — that gap collapsed from 25 points to 9. Its own design sheet says
# "this is the DARKEST machine on the roster, use the light armour sparingly",
# and `assets/blender/concepts/NOTES.md` says do not lighten it.
PALETTE_INVERT_EXEMPT = {"nulltide"}


def palette_roles(pal, mech_id=None):
    """Which palette entry each armour material actually paints.

    **Inverted at the owner's direction after the design commission.** The old
    rule lived beside `PALETTES` — "the identity colour has to dominate the
    surface area or the mech reads as a white robot with coloured bits" — and
    measuring the 2005 reference says it is backwards. A reference sprite is
    roughly a third light neutral, a third saturated colour and a sixth
    near-black. Ours were **13.9 % light against 58.7 % chromatic**, which is
    most of why they read as monochrome toys rather than machines. A reference
    *is* a white robot with coloured bits; so is a Gundam. They stay tellable
    apart by silhouette, accent and markings, not by flooding the body.

    The swap happens here rather than at the 68 `mat=` call sites: `hull` (26
    placements) and `sub` (42) both carried the identity hue against `trim`'s
    14. Making hull the light armour and sub the identity colour gives 40 light
    against 42 coloured, which is the reference's balance.

    **`PALETTES` itself is untouched** — those values are canon and all eight
    design sheets in `assets/blender/concepts/` quote them.

    **Both material factories must call this.** `_drone_materials` builds
    materials with the *same names* as the chassis (`{mech_id}_hull` and
    friends, deliberately, so they are shared), and `build_all` runs
    `build_drone` *before* `render_parts`. `make_material` fetches by name and
    rebuilds in place, so a second factory using different colours silently
    wins and the sprites render with them. That is exactly what happened on the
    first attempt at this change: the edit was correct, the build was clean, and
    the render was byte-identical because the drone pass overwrote it.
    """
    if mech_id in PALETTE_INVERT_EXEMPT:
        return {
            "armour": pal["primary"],
            "panel": pal["secondary"],
            "hilite": pal["trim"],
            "armour_far": pal["far"],
        }
    return {
        "armour": pal["trim"],                 # light neutral now carries the mass
        "panel": pal["primary"],               # the identity hue, as deliberate panels
        "hilite": _scale_rgb(pal["trim"], 0.45, toward=(1.0, 1.0, 1.0)),
        # The far side must be a darker version of *what the part actually is*.
        # Far-side parts are light armour now, so `pal["far"]` — a dark shade of
        # the identity hue — would paint a light limb navy. Derive from armour.
        "armour_far": _scale_rgb(pal["trim"], 0.52),
    }


def faction_surface(mech_id):
    """Surface finish for a chassis, or None to use the module defaults."""
    fac = FACTIONS.get(mech_id)
    if fac is None:
        return None
    s = dict(FACTION_SURFACE[fac])
    s["grime"] = FACTION_GRIME_RGB[fac]
    return s


def _tex(nt, coord, filename, scale=None, non_color=False):
    """An image texture in object space, box-projected. Returns None if absent.

    Box projection because the meshes have **no UV maps** - every procedural
    node in this file drives off object coordinates for the same reason. Box
    projection needs no unwrap and gives all six faces sane, seam-free coverage.
    """
    img = _load_image(filename, non_color=non_color)
    if img is None:
        return None
    mapping = nt.nodes.new("ShaderNodeMapping")
    s = TEX_SCALE if scale is None else scale
    mapping.inputs["Scale"].default_value = (s, s, s)
    nt.links.new(coord.outputs["Object"], mapping.inputs["Vector"])
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.projection = "BOX"
    tex.projection_blend = 0.35
    tex.extension = "REPEAT"
    nt.links.new(mapping.outputs["Vector"], tex.inputs["Vector"])
    return tex


def _signal(nt, tex, filename, contrast=None):
    """The output socket to read a mask from, with its contrast expanded.

    Expands about the map's *own* mean so the average amount of wear on the
    surface is unchanged and only its spread grows - expanding about mid-grey
    would quietly darken or lighten every machine as a side effect.

    Returns the raw Color socket when there is nothing to do, so a caller can
    use this unconditionally.
    """
    c = TEX_CONTRAST if contrast is None else contrast
    mean = TEX_MEAN.get(filename)
    if tex is None:
        return None
    if mean is None or c is None or abs(c - 1.0) < 1e-6:
        return tex.outputs["Color"]
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.label = "BSR_CONTRAST"
    mr.clamp = True
    # out = (v - from_min) / (from_max - from_min), chosen so slope == c and
    # the mean maps to itself.
    fmin = mean * (1.0 - 1.0 / c)
    mr.inputs["From Min"].default_value = fmin
    mr.inputs["From Max"].default_value = fmin + 1.0 / c
    mr.inputs["To Min"].default_value = 0.0
    mr.inputs["To Max"].default_value = 1.0
    nt.links.new(tex.outputs["Color"], mr.inputs["Value"])
    return mr.outputs["Result"]


def make_material(name, rgb, emission=0.0, roughness=0.45, metallic=0.25, detail=True,
                  surface=None):
    """
    Armour material with procedural surface interest plus photographic wear.

    Flat albedo is what makes an untextured model read as "clunky plastic". The
    reference sprites have machined highlights along every edge, panel seams, and
    uneven grime. The procedural half generates:

      * Pointiness  -> bright worn edges, and dark crevices
      * Noise x2    -> fine grime plus broad tonal drift

    Panel lines are **not** generated here. A procedural grid in object space
    tiles identically across every part regardless of its shape; Freestyle's
    crease pass draws the real ones, from the geometry.

    That got the shape right and the *surface* wrong: measured against the stage,
    the sprites sat at luminance 133-188 with a 95th percentile of **255** —
    blowing out to pure white — where CATHEDRAL YARD's steel runs 44 and tops out
    at 104. Smooth gradients climbing to white is exactly the plastic read. The
    texture half fixes that:

      * plate_wear   -> scuffs, abrasion and vertical panel seams
      * rust_mask    -> sparse oxide, tinted to the deck's own warm family
      * plate_rough  -> roughness break-up, which kills the specular sweep
      * bump         -> a whisper of relief, from the wear map's luminance

    Missing texture files degrade to the procedural-only result rather than
    failing the build.
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

    # Painted steel carries a thin clear coat; bare Principled diffuse does not,
    # and its absence is part of why the armour reads as unpainted plaster.
    # Guarded because `Coat Weight` is 4.x naming and this script still runs on
    # older Blender.
    for key, val in (("Coat Weight", COAT_WEIGHT), ("Coat Roughness", COAT_ROUGHNESS)):
        if key in bsdf.inputs:
            bsdf.inputs[key].default_value = val

    # Per-faction finish, falling back to the module defaults for anything the
    # faction does not override (and for the drone/effect materials, which pass
    # no surface at all).
    sf = surface or {}
    s_wear = sf.get("wear", WEAR_STRENGTH)
    s_broad = sf.get("broad", BROAD_STRENGTH)
    s_rust = sf.get("rust", RUST_STRENGTH)
    s_rust_gate = sf.get("rust_gate", RUST_GATE)
    s_rough = sf.get("rough", ROUGH_TEX_STRENGTH)
    s_cavity = sf.get("cavity", CAVITY_STRENGTH)
    s_grime = sf.get("grime", RUST_RGB)

    try:
        coord = nt.nodes.new("ShaderNodeTexCoord")

        # **No procedural panel grid.** Two crossed wave bands in *object space*
        # at fixed scales tile the same lines across every part of every mech
        # regardless of its shape, so it reads as graph paper laid over the
        # model rather than as panelling — and it fights the real panel lines,
        # which Freestyle already draws from the geometry's own creases.
        # Removed at the user's direction; the crease pass is the panel liner.

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

        c3 = c2

        # --- photographic wear ------------------------------------------
        # Sits between the panelling and the edge highlight deliberately: edge
        # wear must stay last so machined edges read *on top of* the grime and
        # the silhouette keeps the crisp contour Freestyle draws around it.
        surf = c3

        # Coarse layer first: big soft blotches of tonal drift across a whole
        # panel, at roughly one repeat per part. This is the layer that reads at
        # sprite size — fine grain averages away, a gradient across a face does
        # not.
        broad_tex = _tex(nt, coord, "rust_mask.png", scale=TEX_SCALE_BROAD, non_color=True)
        if broad_tex is not None:
            broad_sig = _signal(nt, broad_tex, "rust_mask.png")
            broad_f = nt.nodes.new("ShaderNodeMath")
            broad_f.operation = "MULTIPLY"
            broad_f.inputs[1].default_value = s_broad
            nt.links.new(broad_sig, broad_f.inputs[0])
            _nb, surf = _mix(nt, broad_f.outputs[0], surf, _scale_rgb(rgb, BROAD_DARK))

        wear_tex = _tex(nt, coord, "plate_wear.png", non_color=True)
        wear_sig = _signal(nt, wear_tex, "plate_wear.png")
        if wear_tex is not None:
            wear_fac = nt.nodes.new("ShaderNodeMath")
            wear_fac.operation = "MULTIPLY"
            wear_fac.inputs[1].default_value = s_wear
            nt.links.new(wear_sig, wear_fac.inputs[0])
            _nw, surf = _mix(nt, wear_fac.outputs[0], surf, _scale_rgb(rgb, WEAR_DARK))

        rust_tex = _tex(nt, coord, "rust_mask.png", non_color=True)
        if rust_tex is not None:
            # Gated sparse. Full-coverage rust is an abandoned wreck; these are
            # machines somebody maintains and flies.
            rust_ramp = nt.nodes.new("ShaderNodeValToRGB")
            rust_ramp.color_ramp.elements[0].position = s_rust_gate
            rust_ramp.color_ramp.elements[1].position = min(1.0, s_rust_gate + 0.30)
            nt.links.new(_signal(nt, rust_tex, "rust_mask.png"), rust_ramp.inputs["Fac"])
            rust_fac = nt.nodes.new("ShaderNodeMath")
            rust_fac.operation = "MULTIPLY"
            rust_fac.inputs[1].default_value = s_rust
            nt.links.new(rust_ramp.outputs["Color"], rust_fac.inputs[0])
            _nr, surf = _mix(nt, rust_fac.outputs[0], surf, s_grime)

        # --- crevice darkening -------------------------------------------
        # Pointiness > 0.5 is convex, < 0.5 is concave. The material has always
        # brightened convex edges and done nothing with concave ones, so every
        # inside corner and panel gap sat at the same value as the middle of a
        # face. On geometry this blocky that is most of the "untextured box"
        # read, and no amount of albedo texture substitutes for it.
        cav_r = nt.nodes.new("ShaderNodeValToRGB")
        cav_r.color_ramp.elements[0].position = 0.34
        cav_r.color_ramp.elements[0].color = (1, 1, 1, 1)   # deep concave: full
        cav_r.color_ramp.elements[1].position = 0.50
        cav_r.color_ramp.elements[1].color = (0, 0, 0, 1)   # flat: none
        nt.links.new(geo.outputs["Pointiness"], cav_r.inputs["Fac"])
        cav_f = nt.nodes.new("ShaderNodeMath")
        cav_f.operation = "MULTIPLY"
        cav_f.inputs[1].default_value = s_cavity
        nt.links.new(cav_r.outputs["Color"], cav_f.inputs[0])
        _nc, surf = _mix(nt, cav_f.outputs[0], surf, _scale_rgb(rgb, CAVITY_DARK))

        # Edge highlight stays last so machined edges read on top of everything.
        _n4, c4 = _mix(nt, edge_r.outputs["Color"], surf, edge)
        nt.links.new(c4, bsdf.inputs["Base Color"])

        # Edges are polished, flats are duller.
        rough_mix = nt.nodes.new("ShaderNodeMapRange")
        rough_mix.inputs["From Min"].default_value = 0.0
        rough_mix.inputs["From Max"].default_value = 1.0
        rough_mix.inputs["To Min"].default_value = roughness
        rough_mix.inputs["To Max"].default_value = max(0.08, roughness * 0.5)
        nt.links.new(edge_r.outputs["Color"], rough_mix.inputs["Value"])

        # The measured roughness map, added as a signed offset around whatever
        # the edge term produced. This is the node that matters most for the
        # plastic read: a constant roughness gives one smooth specular sweep
        # climbing to pure white, and breaking it up is what caps the highlight.
        rough_tex = _tex(nt, coord, "plate_rough.png", non_color=True)
        if rough_tex is not None:
            r_range = nt.nodes.new("ShaderNodeMapRange")
            r_range.inputs["From Min"].default_value = 0.0
            r_range.inputs["From Max"].default_value = 1.0
            r_range.inputs["To Min"].default_value = -s_rough
            r_range.inputs["To Max"].default_value = s_rough
            nt.links.new(rough_tex.outputs["Color"], r_range.inputs["Value"])
            r_add = nt.nodes.new("ShaderNodeMath")
            r_add.operation = "ADD"
            r_add.use_clamp = True
            nt.links.new(rough_mix.outputs["Result"], r_add.inputs[0])
            nt.links.new(r_range.outputs["Result"], r_add.inputs[1])
            nt.links.new(r_add.outputs[0], bsdf.inputs["Roughness"])
        else:
            nt.links.new(rough_mix.outputs["Result"], bsdf.inputs["Roughness"])

        # Relief from the wear map's luminance. Bump rather than NormalMap: the
        # meshes carry no UVs, so there is no tangent basis a normal map could
        # be interpreted in, and box-projected tangents are undefined.
        if wear_tex is not None:
            bump = nt.nodes.new("ShaderNodeBump")
            bump.inputs["Strength"].default_value = BUMP_STRENGTH
            nt.links.new(wear_sig, bump.inputs["Height"])
            nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

        # --- quantise the lighting into flat bands --------------------------
        if CEL_SHADE:
            # A white diffuse lobe, sampled through Shader to RGB, is the scene's
            # lighting with the albedo divided out. Quantising *that* and then
            # multiplying the albedo back in keeps every bit of texture detail
            # while making the light itself step.
            lit = nt.nodes.new("ShaderNodeBsdfDiffuse")
            lit.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)
            if wear_tex is not None:
                nt.links.new(bump.outputs["Normal"], lit.inputs["Normal"])
            s2rgb = nt.nodes.new("ShaderNodeShaderToRGB")
            nt.links.new(lit.outputs[0], s2rgb.inputs[0])

            steps = nt.nodes.new("ShaderNodeValToRGB")
            cr = steps.color_ramp
            cr.interpolation = "CONSTANT"
            # CONSTANT holds each stop's colour from its position upward, so the
            # stops must ascend and the first must sit at 0.
            while len(cr.elements) > 1:
                cr.elements.remove(cr.elements[-1])
            cr.elements[0].position = 0.0
            v0 = CEL_SHADOW
            cr.elements[0].color = (v0, v0, v0, 1.0)
            for k in range(1, CEL_STEPS):
                # Bands are spread across the terminator rather than 0..1, so the
                # steps land where the light actually falls off.
                pos = CEL_BIAS * k / (CEL_STEPS - 1) + 0.02
                v = v0 + (1.0 - v0) * (k / (CEL_STEPS - 1))
                e = cr.elements.new(min(0.99, pos))
                e.color = (v, v, v, 1.0)
            nt.links.new(s2rgb.outputs["Color"], steps.inputs["Fac"])

            shaded = nt.nodes.new("ShaderNodeMixRGB")
            shaded.blend_type = "MULTIPLY"
            shaded.inputs[0].default_value = 1.0
            nt.links.new(c4, shaded.inputs[1])
            nt.links.new(steps.outputs["Color"], shaded.inputs[2])

            emit = nt.nodes.new("ShaderNodeEmission")
            emit.inputs["Strength"].default_value = 1.0
            nt.links.new(shaded.outputs[0], emit.inputs["Color"])
            # Replace the Principled path entirely. Freestyle is a geometric
            # post-process and is unaffected by this.
            nt.links.new(emit.outputs[0], out.inputs[0])
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


# ------------------------------------------------------------------ decals
#
# Markings — serials, unit numbers, stencilled warnings, hazard chevrons,
# insignia. `docs/PROMPT_MECH_DESIGN.md` commissioned eight design sheets whose
# markings are a large part of why the machines read as manufactured objects,
# and none of them could be applied before this.
#
# **They cannot be painted on the armour.** The meshes carry no UV maps, which
# is why every material here is box-projected in object space; box projection
# has no idea where "the left shoulder" is and would repeat a serial on all six
# faces. So a marking is a **separate quad** floating a hair above the surface.
# A primitive plane arrives with its own UV map, so the image lands correctly
# and nothing needs unwrapping.
#
# Three consequences the rest of the pipeline has to respect:
#
# 1. **Decals are not joined into their part.** They stay separate objects
#    *parented* to it, so they follow it when `render_one_part` moves it to the
#    origin, and so they keep a collection identity (see 2).
# 2. **Freestyle must not outline them.** A quad lying on a surface has border
#    edges, and the outline pass would ring every marking in black. Decals are
#    therefore linked into `BSR_NOLINE`, the collection the lineset already
#    excludes for projected energy. A lineset can only name one collection, so
#    reusing it is not a convenience — it is the only option. (Face marks are
#    not available either: `MeshPolygon.use_freestyle_mark` does not exist in
#    5.1, and `setup_outlines` records that the line pass ignored them anyway.)
# 3. **`render_one_part` must unhide the part's decal children**, or the
#    markings render on nothing.

DECAL_COLL = "BSR_DECALS"
# How far a decal floats above the surface it sits on, in Blender units. Large
# enough to beat z-fighting at this scale, small enough to be invisible at the
# 35-100 px a part occupies.
DECAL_LIFT = 0.004
_DECAL_CACHE = {}


def _decal_dir():
    """Decals live beside the .blend, in `assets/blender/decals`.

    Same `__file__` fallback as `_texture_dir` and for the same reason: a
    headless build has no `bpy.data.filepath` until it saves at the very end.
    """
    if bpy.data.filepath:
        d = os.path.join(os.path.dirname(bpy.data.filepath), "decals")
        if os.path.isdir(d):
            return d
    here = os.path.dirname(os.path.abspath(__file__))
    d = os.path.join(os.path.dirname(os.path.dirname(here)), "assets", "blender", "decals")
    return d if os.path.isdir(d) else None


def _decal_image(name):
    """Loads `<name>.png` from the decal directory, with its alpha intact."""
    if name in _DECAL_CACHE:
        return _DECAL_CACHE[name]
    d = _decal_dir()
    path = os.path.join(d, name + ".png") if d else None
    img = None
    if path and os.path.exists(path):
        try:
            img = bpy.data.images.get(name + ".png") or bpy.data.images.load(path)
        except (RuntimeError, OSError):
            img = None
    _DECAL_CACHE[name] = img
    return img


def _decal_material(name, image, rgb, roughness=0.5):
    """Flat tinted colour, with the image's alpha cutting the quad to shape."""
    key = f"decal_{name}_{int(rgb[0]*255):02x}{int(rgb[1]*255):02x}{int(rgb[2]*255):02x}"
    mat = bpy.data.materials.get(key)
    if mat is not None:
        return mat
    mat = bpy.data.materials.new(key)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = 0.0
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = image
    tex.extension = "CLIP"          # never tile a marking
    tex.interpolation = "Cubic"
    nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
    nt.links.new(bsdf.outputs[0], out.inputs[0])
    # EEVEE Next: `blend_method` is legacy, `surface_render_method` is the live
    # control and BLENDED is what gives smooth alpha rather than a dither.
    for attr, val in (("surface_render_method", "BLENDED"), ("blend_method", "BLEND")):
        try:
            setattr(mat, attr, val)
        except (AttributeError, TypeError):
            pass
    mat.use_backface_culling = True
    try:
        mat.use_transparent_shadow = True
    except AttributeError:
        pass
    return mat


def add_decal(name, image_name, parent, loc, rot=(0, 0, 0), width=0.2, height=None,
              rgb=(0.05, 0.05, 0.06), roughness=0.5):
    """One marking quad, parented to `parent` and excluded from the outline pass.

    `loc`/`rot` are in the parent's local space. `width` is in Blender units and
    the height follows the image's aspect unless given. Returns None when the
    decal image is missing, so a checkout without them still builds.
    """
    img = _decal_image(image_name)
    if img is None:
        return None
    coll = ensure_collection(DECAL_COLL)
    w, h = img.size
    if height is None:
        height = width * (h / float(w)) if w else width

    bpy.ops.mesh.primitive_plane_add(size=1.0, location=(0, 0, 0))
    obj = active()
    obj.name = f"{name}_decal"
    obj.scale = (width, height, 1.0)
    with override(obj, [obj]):
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    # A plane is born in XY facing +Z; the caller's rotation aims it at the
    # surface, and DECAL_LIFT pushes it off along its own normal afterwards.
    #
    # `loc` is parent-local, which is the only frame a caller can reason about —
    # a part's origin is its rig pivot. Parenting happens after positioning and
    # preserves the world transform, so the world position has to be resolved
    # through the parent here rather than assigned directly.
    obj.rotation_euler = rot
    obj.location = (parent.matrix_world @ Vector(loc)) if parent is not None else Vector(loc)
    _relink(obj, coll)
    # Also into BSR_NOLINE, which is the collection the outline pass excludes.
    noline = ensure_collection(NOLINE_COLLECTION)
    if obj.name not in noline.objects:
        noline.objects.link(obj)
    obj.data.materials.append(_decal_material(name, img, rgb, roughness))
    bpy.context.view_layer.update()
    obj.location = obj.location + (obj.matrix_world.to_3x3() @ Vector((0, 0, DECAL_LIFT)))
    if parent is not None:
        obj.parent = parent
        obj.matrix_parent_inverse = parent.matrix_world.inverted()
    return obj


def add_box(name, size, loc, rot=(0, 0, 0), bevel=0.005, coll=None, mat=None, bevel_seg=1):
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


def add_wedge(name, size, taper, loc, rot=(0, 0, 0), coll=None, mat=None,
              bevel=0.005, spin=0.0):
    """
    A four-sided frustum: a tapered slab, wide at the base and narrower at the top.

    This is the workhorse shape of the reference art. Building armour from
    uniformly scaled cubes is what makes a mech read as blocky no matter how many
    pieces you add; the reference's plates flare and narrow, so every silhouette
    edge is a diagonal rather than a right angle.

    `size` is (width, depth, height) at the BASE, `taper` the top/base ratio
    (0.5 = strong wedge, 1.0 = a plain box). `spin` rotates about the part's own
    axis before scaling, for plates that sit at an angle.
    """
    bpy.ops.mesh.primitive_cone_add(
        vertices=4, radius1=1.0, radius2=max(0.001, taper), depth=1.0,
        location=loc, rotation=rot,
    )
    obj = active()
    obj.name = name
    # vertices=4 puts corners on the axes; rotate 45deg so the FACES are axis
    # aligned, then scale to the requested footprint.
    import mathutils
    obj.data.transform(mathutils.Matrix.Rotation(math.radians(45.0) + spin, 4, "Z"))
    # A unit square inscribed in radius 1 has half-diagonal 1, so side = sqrt(2).
    k = 1.0 / math.sqrt(2.0)
    obj.scale = Vector((size[0] * k, size[1] * k, size[2]))
    with override(obj, [obj]):
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        mod = obj.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 1
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(40)
    _relink(obj, coll)
    if mat is not None:
        obj.data.materials.append(mat)
    return obj


def scatter_greebles(prefix, centre, extent, count, coll, mats, seed=0, scale=1.0):
    """
    Sprinkles small mechanical detail across a form.

    The reference sprites are dense - each machine carries dozens of small vents,
    blocks, pipes and caps. Formula-placed detail is not the same as hand-authored
    detail, but raising the part count meaningfully narrows the gap in how
    "designed" a surface reads at sprite scale.

    Deterministic: driven by an integer hash of `seed`, so rebuilds are identical.
    """
    out = []
    s = (seed * 1664525 + 1013904223) & 0xFFFFFFFF

    def rnd():
        nonlocal s
        s = (s * 1664525 + 1013904223) & 0xFFFFFFFF
        return ((s >> 8) & 0xFFFF) / 65535.0

    for i in range(count):
        ox = (rnd() - 0.5) * extent[0]
        oy = (rnd() - 0.5) * extent[1]
        oz = (rnd() - 0.5) * extent[2]
        loc = centre + Vector((ox, oy, oz))
        mat = mats[int(rnd() * len(mats)) % len(mats)]
        kind = rnd()
        yaw = (rnd() - 0.5) * 0.9
        if kind < 0.45:
            w = (0.020 + rnd() * 0.045) * scale
            out.append(add_box(f"{prefix}_g{i}", (w * 2.4, w, w * 1.5), loc,
                               (0, yaw, 0), bevel=0.003, coll=coll, mat=mat))
        elif kind < 0.75:
            r = (0.012 + rnd() * 0.020) * scale
            out.append(add_cyl(f"{prefix}_g{i}", r, r * (1.6 + rnd() * 2.2), loc,
                               (math.radians(90), 0, yaw), 8, coll=coll, mat=mat))
        else:
            w = (0.014 + rnd() * 0.026) * scale
            out.append(add_wedge(f"{prefix}_g{i}", (w * 3.0, w, w * 2.0), 0.45, loc,
                                 (0, math.radians(90) + yaw, 0), coll=coll, mat=mat))
    return out


def add_slab(name, size, loc, rot=(0, 0, 0), coll=None, mat=None):
    """A thin armour shell laid over a base form. Kept crisp (tiny bevel)."""
    return add_box(name, size, loc, rot, bevel=0.004, coll=coll, mat=mat)


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
        # Each band is itself a slight wedge, and the whole limb narrows toward
        # the joint, so the leg silhouette is a series of diagonals.
        out.append(
            add_wedge(f"{prefix}_seg{i}", (w + 0.03, depth * (taper ** i) + 0.01, seg_len * 0.80),
                      0.60, along(hip, angle, d), (0, angle, 0), coll=coll, mat=shell)
        )
        # Thin outer armour shell over the outboard face.
        out.append(
            add_slab(f"{prefix}_shell{i}", (w * 0.52, depth * 0.30, seg_len * 0.62),
                     along(hip, angle, d) + Vector((w * 0.44, 0, 0)), (0, angle, 0),
                     coll=coll, mat=frame if i % 2 else shell)
        )
        if i < segments - 1:
            gw = w * 0.84
            out.append(
                add_box(f"{prefix}_gap{i}", (gw, depth * (taper ** i) * 0.84, seg_len * 0.20),
                        along(hip, angle, seg_len * (i + 1)), (0, angle, 0),
                        bevel=0.004, coll=coll, mat=frame)
            )
    return out


def add_swept_blade(name, stations, thickness, coll=None, mat=None):
    """
    A curved, tapering blade built as **one mesh**.

    `stations` is a list of `(x_inner, z_inner, x_outer, z_outer)` in object
    space, walked from root to tip; the blade is the ruled surface between the
    inner and outer edges, given `thickness` in Y.

    **This exists because chorded boxes cannot make a curved blade here.** A run
    of overlapping cubes stair-steps along the silhouette, and — far worse —
    Freestyle draws a contour around *every one of them*, so a 22-segment
    crescent renders as a heap of outlined shingles rather than a blade. A single
    mesh has a single outline, which is the whole point of the crease pass.
    """
    t = thickness * 0.5
    verts, faces = [], []
    for (xi, zi, xo, zo) in stations:
        base = len(verts)
        verts.extend([
            (xi, -t, zi), (xo, -t, zo),   # front inner, front outer
            (xi, t, zi), (xo, t, zo),     # back inner, back outer
        ])
        del base
    n = len(stations)
    for i in range(n - 1):
        a, b = i * 4, (i + 1) * 4
        faces.append((a + 0, a + 1, b + 1, b + 0))   # front
        faces.append((a + 2, b + 2, b + 3, a + 3))   # back
        faces.append((a + 1, a + 3, b + 3, b + 1))   # outer wall
        faces.append((a + 0, b + 0, b + 2, a + 2))   # inner wall
    # Cap the root so the blade is closed where it meets the emitter.
    faces.append((0, 2, 3, 1))
    me = bpy.data.meshes.new(name + "_mesh")
    me.from_pydata(verts, [], faces)
    me.validate()
    me.update()

    # **Freestyle face marks, so the line pass skips this.** Energy in the
    # reference carries no black contour at all — the hardware is outlined and
    # the blade is not, and outlining a projected blade is what makes it read as
    # a painted metal object. Marks moved to a generic boolean attribute in
    # Blender 4; `setup_outlines` excludes anything marked.
    try:
        attr = me.attributes.get(".freestyle_face") or \
               me.attributes.new(".freestyle_face", 'BOOLEAN', 'FACE')
        for d in attr.data:
            d.value = True
    except (AttributeError, RuntimeError, TypeError):
        pass

    obj = bpy.data.objects.new(name, me)
    (coll or bpy.context.scene.collection).objects.link(obj)
    if mat is not None:
        obj.data.materials.append(mat)
    # Smooth shading across the sweep so the curve does not facet under light.
    for p in obj.data.polygons:
        p.use_smooth = True
    return obj


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


# Objects linked here are excluded from the Freestyle line pass. See D131.
NOLINE_COLLECTION = "BSR_NOLINE"


def _is_energy_material(mat):
    """True for projected-energy surfaces — the blade itself, not its fittings.

    `M_GLOW` and `M_ACC` are deliberately *not* energy: they are indicator lamps,
    heat vents and running lights bolted to the physical weapon. They should keep
    their contour and should not flicker with the blade.
    """
    if mat is None:
        return False
    n = mat.name
    return n.endswith("_beam") or n.endswith("_beamcore") or "_scythe_" in n


def split_melee(parts, objs, pivot, coll, pn):
    """
    Splits accumulated melee geometry into hardware and **projected energy**.

    Two reasons the blade cannot stay joined to its haft:

    1. **Freestyle cannot be filtered inside one mesh.** Face marks survive the
       join but are ignored by the line pass — measured at 28.4 % dark pixels
       marked versus 2.4 % with Freestyle off, i.e. no effect whatsoever. A
       separate object *can* be excluded, by collection.
    2. **Flicker needs its own sprite.** Energy in the reference pulses like
       flame; the metal haft does not. One sprite cannot do both.

    Writes `parts['meleeWeapon']` always, and `parts['meleeEnergy']` only when
    the weapon actually projects a blade — CLAW and RAMSHIELD do not.

    **No weapon currently builds energy geometry**, so in practice this only ever
    writes the hardware row: `tools/energy_blade.py` draws all five projected
    blades and owns their PNG, canvas size and manifest row outright. The split
    is kept rather than deleted because it is the contract that makes that
    possible — if energy is ever modelled again it must come out as its own
    object for both reasons above, and this is where that happens.
    """
    energy, hardware = [], []
    for x in objs:
        mats = list(x.data.materials) if getattr(x, "type", None) == "MESH" else []
        target = energy if (mats and _is_energy_material(mats[0])) else hardware
        target.append(x)

    parts["meleeWeapon"] = join_as(pn("meleeWeapon"), hardware, pivot, coll)
    if not energy:
        return
    e = join_as(pn("meleeEnergy"), energy, pivot, coll)
    parts["meleeEnergy"] = e
    noline = ensure_collection(NOLINE_COLLECTION)
    if e.name not in noline.objects:
        noline.objects.link(e)


# --------------------------------------------------------------- drone build


# The supporter is small — it must still read at roughly 40 logical px — so each
# one is built as ONE joined object rather than a rig. A four-part rig on a 40px
# sprite buys nothing: the whole drone turns to face its target, so rotating a
# single sprite gives the same result as animating a hierarchy.
#
# Every drone is modelled nose-along +X, matching the parts convention, with the
# pivot at the hull centre so the game can rotate it about its own middle. +Y is
# the lateral/depth axis (the camera sits at an azimuth, so a pair mirrored in Y
# reads as spread on screen) and +Z is up.
#
# The eight designs are deliberately different *silhouettes*, not one hull in
# eight palettes — that was the previous state and it made the roster's escorts
# indistinguishable in a fight. Each drone's outline says something about the
# machine it serves and about the passive it carries:
#
#   ARBITER   swept interceptor dart      the neutral baseline
#   WARDEN    armoured brick, twin guns   heavy frame's escort
#   SIGHTLINE a rifle with an engine      longest barrel, biggest optics
#   BULWARK   a shield on thrusters       widest, front-heavy, plated
#   WISP      an open hoop and a node     smallest, skeletal, barely there
#   AEGIS     an upright monolith slab    vertical rather than horizontal
#   EMBER     tanks, vents and nozzles    hunched and exhaust-heavy
#   STATIC    a lattice antenna mast      asymmetric, almost unarmed
DRONE_LENGTH_BU = 0.72  # ~43 logical px nose to tail, for the baseline drone


def _drone_materials(mech_id, pal):
    """The seven materials every drone shares. Named per mech so they are reused.

    An escort is built and maintained by the same yard as its parent chassis, so
    it takes the same faction finish. The material names are shared with the
    chassis, which means this must agree with `build_mech` or whichever runs
    second silently rebuilds the other's nodes.
    """
    _sf = faction_surface(mech_id)
    _roles = palette_roles(pal, mech_id)
    return {
        # Per-faction finish; see FACTION_SURFACE.
        # Same role mapping as the chassis - see `palette_roles`. These
        # materials share the chassis's names *by design*, and `build_drone`
        # runs before `render_parts`, so any divergence here repaints the whole
        # machine moments before it is rendered.
        "hull": make_material(f"{mech_id}_hull", _roles["armour"], roughness=0.44, surface=_sf),
        "far": make_material(f"{mech_id}_far", _roles["armour_far"], roughness=0.5, surface=_sf),
        "sub": make_material(f"{mech_id}_sub", _roles["panel"], roughness=0.5, surface=_sf),
        "trim": make_material(f"{mech_id}_trim", _roles["hilite"], roughness=0.40, surface=_sf),
        "frame": make_material(f"{mech_id}_frame", pal["frame"], roughness=0.62, metallic=0.7, surface=_sf),
        "acc": make_material(f"{mech_id}_accent", pal["accent"], emission=1.1, roughness=0.35),
        "glow": make_material(f"{mech_id}_glow", pal["glow"], emission=2.1, roughness=0.2, metallic=0.0),
    }


def _drone_arbiter(coll, M):
    """
    ARBITER — HALCYON's escort. A swept interceptor dart.

    The baseline against which the other seven read as unusual: back-heavy engine
    block, hard-tapered forward hull, chisel prow, swept vanes and a slung cannon.
    """
    L = 0.72
    o = []

    # Engine block: the heavy mass, at the tail. Massing the drone back-heavy
    # stops it reading as a paper dart — the silhouette steps down from a deep
    # tail to a thin nose.
    o.append(add_wedge("d_block", (0.30, 0.24, 0.26), 0.66,
                       Vector((-L * 0.30, 0, 0.005)),
                       (0, math.radians(90), 0), coll=coll, mat=M["hull"]))
    o.append(add_box("d_blockcap", (0.055, 0.21, 0.235),
                     Vector((-L * 0.44, 0, 0.005)), coll=coll, mat=M["frame"]))

    # Forward hull, tapering hard from the block to the nose.
    o.append(add_wedge("d_hull", (0.235, 0.185, L * 0.52), 0.26,
                       Vector((L * 0.06, 0, 0.0)),
                       (0, math.radians(90), 0), coll=coll, mat=M["hull"]))
    o.append(add_wedge("d_prow", (0.10, 0.10, L * 0.22), 0.14,
                       Vector((L * 0.42, 0, -0.028)),
                       (0, math.radians(76), 0), coll=coll, mat=M["sub"]))

    # Layered plates: a visible step along the spine and flank. A narrow
    # near-white lip only — the identity colour has to hold the surface area.
    o.append(add_wedge("d_spine", (0.15, 0.075, 0.030), 0.48,
                       Vector((-L * 0.16, 0, 0.128)), coll=coll, mat=M["trim"]))
    o.append(add_wedge("d_shoulder", (0.24, 0.20, 0.05), 0.62,
                       Vector((-L * 0.10, 0, 0.095)), coll=coll, mat=M["sub"]))
    o.append(add_box("d_belly", (L * 0.46, 0.15, 0.045),
                     Vector((-L * 0.05, 0, -0.098)), coll=coll, mat=M["far"]))
    o.append(add_wedge("d_keel", (0.22, 0.16, 0.07), 0.55,
                       Vector((-L * 0.24, 0, -0.075)), coll=coll, mat=M["far"]))

    # Sensor housing: a raised, angled cowl with a glowing slit.
    o.append(add_wedge("d_cowl", (0.13, 0.13, 0.075), 0.42,
                       Vector((L * 0.20, 0, 0.075)),
                       (0, math.radians(70), 0), coll=coll, mat=M["sub"]))
    o.append(add_box("d_eye", (0.055, 0.075, 0.022),
                     Vector((L * 0.255, 0, 0.070)), (0, math.radians(-16), 0),
                     coll=coll, mat=M["glow"]))

    # Swept vanes: they must break the hull silhouette to read.
    for i, sy in enumerate((-1, 1)):
        o.append(add_wedge(f"d_vane{i}", (0.30, 0.030, 0.26), 0.14,
                           Vector((-L * 0.30, sy * 0.115, 0.075)),
                           (math.radians(sy * 34), 0, math.radians(-sy * 20)),
                           coll=coll, mat=M["hull"]))
        o.append(add_box(f"d_vanetip{i}", (0.04, 0.026, 0.045),
                         Vector((-L * 0.42, sy * 0.165, 0.155)),
                         (math.radians(sy * 34), 0, 0), coll=coll, mat=M["acc"]))
        o.append(add_wedge(f"d_fin{i}", (0.15, 0.026, 0.13), 0.20,
                           Vector((L * 0.10, sy * 0.085, -0.055)),
                           (math.radians(sy * 62), 0, math.radians(-sy * 12)),
                           coll=coll, mat=M["sub"]))

    # Cannon, slung under the nose, thick enough to read at 50px.
    o.append(add_box("d_breech", (0.115, 0.10, 0.09),
                     Vector((L * 0.10, 0, -0.075)), coll=coll, mat=M["frame"]))
    o.append(add_cyl("d_barrel", 0.040, L * 0.40, Vector((L * 0.30, 0, -0.075)),
                     (0, math.radians(90), 0), verts=10, coll=coll, mat=M["frame"]))
    o.append(add_wedge("d_muzzle", (0.095, 0.095, 0.085), 0.55,
                       Vector((L * 0.50, 0, -0.075)),
                       (0, math.radians(90), 0), coll=coll, mat=M["trim"]))
    o.append(add_box("d_feed", (0.075, 0.13, 0.055),
                     Vector((L * 0.02, 0, -0.070)), coll=coll, mat=M["sub"]))

    # Thruster.
    o.append(add_cyl("d_bell", 0.085, 0.11, Vector((-L * 0.52, 0, 0.005)),
                     (0, math.radians(90), 0), verts=12, coll=coll, mat=M["frame"]))
    o.append(add_cyl("d_flame", 0.058, 0.030, Vector((-L * 0.585, 0, 0.005)),
                     (0, math.radians(90), 0), verts=12, coll=coll, mat=M["glow"]))
    for i, sy in enumerate((-1, 1)):
        o.append(add_box(f"d_vent{i}", (0.075, 0.030, 0.030),
                         Vector((-L * 0.20, sy * 0.10, 0.045)), coll=coll, mat=M["acc"]))

    o.extend(scatter_greebles("d_g", Vector((-L * 0.10, 0, 0)),
                              Vector((L * 0.30, 0.085, 0.085)), 9, coll,
                              [M["frame"], M["sub"], M["acc"]], seed=77, scale=0.45))
    return o


def _drone_warden(coll, M):
    """
    WARDEN — NOCTURNE's escort. An armoured brick with twin stub cannons.

    Almost no taper anywhere: a deep rectangular hull with bolted armour bands, a
    blunt sloped face instead of a prow, stubby clipped wings and two side-by-side
    barrels. It should look like it was built to be shot at, because it can be.
    """
    L = 0.78
    o = []

    # Deep slab hull. Two stacked boxes with a recessed dark band between them —
    # the step is what stops a brick reading as one undetailed lump.
    o.append(add_box("d_hullup", (L * 0.80, 0.30, 0.15),
                     Vector((-L * 0.04, 0, 0.075)), coll=coll, mat=M["hull"]))
    o.append(add_box("d_hullband", (L * 0.82, 0.26, 0.035),
                     Vector((-L * 0.04, 0, -0.008)), coll=coll, mat=M["frame"]))
    o.append(add_box("d_hulllow", (L * 0.74, 0.28, 0.12),
                     Vector((-L * 0.06, 0, -0.085)), coll=coll, mat=M["far"]))

    # Blunt sloped face rather than a point.
    o.append(add_wedge("d_face", (0.28, 0.26, 0.16), 0.72,
                       Vector((L * 0.40, 0, 0.02)),
                       (0, math.radians(72), 0), coll=coll, mat=M["sub"]))
    o.append(add_box("d_visor", (0.030, 0.20, 0.045),
                     Vector((L * 0.475, 0, 0.045)), (0, math.radians(-14), 0),
                     coll=coll, mat=M["glow"]))

    # Bolted armour bands across the back, and a raised dorsal spine.
    o.append(add_box("d_dorsal", (L * 0.34, 0.12, 0.055),
                     Vector((-L * 0.14, 0, 0.175)), coll=coll, mat=M["trim"]))
    for i, sx in enumerate((-0.30, -0.06, 0.18)):
        o.append(add_box(f"d_rib{i}", (0.035, 0.325, 0.185),
                         Vector((L * sx, 0, 0.055)), coll=coll, mat=M["frame"]))

    # Clipped stub wings: short, thick, squared off, and canted enough to break
    # the rectangle. Without the cant the whole drone read as a shipping crate.
    for i, sy in enumerate((-1, 1)):
        o.append(add_wedge(f"d_stub{i}", (0.22, 0.155, 0.075), 0.55,
                           Vector((-L * 0.14, sy * 0.215, 0.03)),
                           (math.radians(sy * 26), 0, math.radians(-sy * 10)),
                           coll=coll, mat=M["hull"]))
        o.append(add_box(f"d_stubtip{i}", (0.07, 0.05, 0.085),
                         Vector((-L * 0.24, sy * 0.275, 0.06)),
                         (math.radians(sy * 26), 0, 0), coll=coll, mat=M["acc"]))
        # Twin cannons, side by side. Carried high on the shoulder line and run
        # well past the nose, so the guns are the first thing read rather than
        # something tucked under the hull where the silhouette hides them.
        o.append(add_box(f"d_breech{i}", (0.155, 0.095, 0.10),
                         Vector((L * 0.16, sy * 0.105, 0.055)),
                         coll=coll, mat=M["frame"]))
        o.append(add_cyl(f"d_barrel{i}", 0.036, L * 0.46,
                         Vector((L * 0.44, sy * 0.105, 0.055)),
                         (0, math.radians(90), 0), verts=10, coll=coll, mat=M["frame"]))
        o.append(add_cyl(f"d_brake{i}", 0.058, 0.065,
                         Vector((L * 0.65, sy * 0.105, 0.055)),
                         (0, math.radians(90), 0), verts=10, coll=coll, mat=M["trim"]))
        o.append(add_cyl(f"d_flash{i}", 0.030, 0.026,
                         Vector((L * 0.695, sy * 0.105, 0.055)),
                         (0, math.radians(90), 0), verts=10, coll=coll, mat=M["glow"]))
        # Squared thrusters, one per side.
        o.append(add_box(f"d_bell{i}", (0.09, 0.115, 0.115),
                         Vector((-L * 0.48, sy * 0.095, 0.03)), coll=coll, mat=M["frame"]))
        o.append(add_box(f"d_flame{i}", (0.025, 0.08, 0.08),
                         Vector((-L * 0.535, sy * 0.095, 0.03)), coll=coll, mat=M["glow"]))

    o.extend(scatter_greebles("d_g", Vector((-L * 0.08, 0, 0.02)),
                              Vector((L * 0.5, 0.24, 0.14)), 11, coll,
                              [M["frame"], M["sub"], M["acc"]], seed=131, scale=0.5))
    return o


def _drone_sightline(coll, M):
    """
    SIGHTLINE — VESPER's escort. A rifle that grew an engine.

    The longest and thinnest drone: the barrel is over half the total length, the
    body is a narrow spine, and the largest single feature is the optics block. It
    reads as an instrument rather than a fighter, which is the point.
    """
    L = 0.90
    o = []

    # Narrow spine, almost no depth.
    o.append(add_wedge("d_spine", (0.115, 0.115, L * 0.62), 0.42,
                       Vector((-L * 0.06, 0, 0.0)),
                       (0, math.radians(90), 0), coll=coll, mat=M["hull"]))
    o.append(add_box("d_spinecap", (0.045, 0.10, 0.10),
                     Vector((-L * 0.40, 0, 0.0)), coll=coll, mat=M["frame"]))

    # Optics: the dominant mass, sat high and forward on a short pylon.
    o.append(add_box("d_pylon", (0.055, 0.07, 0.075),
                     Vector((L * 0.03, 0, 0.085)), coll=coll, mat=M["frame"]))
    # (height, width, length-along-the-nose) — see the note on BULWARK's shield.
    o.append(add_wedge("d_scope", (0.125, 0.145, 0.28), 0.72,
                       Vector((L * 0.02, 0, 0.165)),
                       (0, math.radians(90), 0), coll=coll, mat=M["sub"]))
    o.append(add_cyl("d_lens", 0.052, 0.028, Vector((L * 0.19, 0, 0.165)),
                     (0, math.radians(90), 0), verts=14, coll=coll, mat=M["glow"]))
    o.append(add_cyl("d_hood", 0.062, 0.045, Vector((L * 0.155, 0, 0.165)),
                     (0, math.radians(90), 0), verts=14, coll=coll, mat=M["trim"]))
    # Rangefinder bar across the optics — the reference loves an asymmetric aerial.
    o.append(add_box("d_finder", (0.020, 0.30, 0.020),
                     Vector((L * 0.00, 0, 0.225)), coll=coll, mat=M["acc"]))

    # The barrel: long, thin, with a mid brace and a slotted muzzle.
    o.append(add_box("d_receiver", (0.20, 0.10, 0.095),
                     Vector((L * 0.12, 0, -0.045)), coll=coll, mat=M["frame"]))
    o.append(add_cyl("d_barrel", 0.030, L * 0.56, Vector((L * 0.40, 0, -0.045)),
                     (0, math.radians(90), 0), verts=12, coll=coll, mat=M["frame"]))
    o.append(add_cyl("d_brace", 0.048, 0.04, Vector((L * 0.30, 0, -0.045)),
                     (0, math.radians(90), 0), verts=12, coll=coll, mat=M["sub"]))
    o.append(add_cyl("d_muzzle", 0.050, 0.075, Vector((L * 0.645, 0, -0.045)),
                     (0, math.radians(90), 0), verts=12, coll=coll, mat=M["trim"]))
    o.append(add_cyl("d_flash", 0.034, 0.03, Vector((L * 0.685, 0, -0.045)),
                     (0, math.radians(90), 0), verts=12, coll=coll, mat=M["glow"]))

    # Long tail fins, swept back hard — stabilisers, not wings.
    for i, sy in enumerate((-1, 1)):
        o.append(add_wedge(f"d_fin{i}", (0.30, 0.020, 0.155), 0.10,
                           Vector((-L * 0.30, sy * 0.055, 0.06)),
                           (math.radians(sy * 24), 0, math.radians(-sy * 26)),
                           coll=coll, mat=M["hull"]))
        o.append(add_box(f"d_fintip{i}", (0.035, 0.018, 0.030),
                         Vector((-L * 0.42, sy * 0.105, 0.135)),
                         coll=coll, mat=M["acc"]))

    # A single slim thruster in line with the spine.
    o.append(add_cyl("d_bell", 0.062, 0.10, Vector((-L * 0.44, 0, 0.0)),
                     (0, math.radians(90), 0), verts=12, coll=coll, mat=M["frame"]))
    o.append(add_cyl("d_flame", 0.042, 0.028, Vector((-L * 0.50, 0, 0.0)),
                     (0, math.radians(90), 0), verts=12, coll=coll, mat=M["glow"]))

    o.extend(scatter_greebles("d_g", Vector((-L * 0.05, 0, 0.0)),
                              Vector((L * 0.40, 0.06, 0.09)), 7, coll,
                              [M["frame"], M["sub"], M["acc"]], seed=211, scale=0.36))
    return o


def _drone_bulwark(coll, M):
    """
    BULWARK — TERRAMOTH's escort. A shield bolted to four thrusters.

    Front-heavy and by far the widest: a convex layered shield plate fills the
    nose, the body hides behind it, and the weapon is a short mortar poking over
    the top. The toughest drone should look like the toughest drone.
    """
    L = 0.80
    o = []

    # The shield: three stacked plates, each smaller and further forward, so the
    # face reads as convex rather than as one flat slab.
    #
    # NOTE the argument order. `add_wedge` takes (x, y, taper-axis) in LOCAL
    # space, and a 90deg Y rotation maps local Z onto world X — so with that
    # rotation the tuple reads (height, width, thickness-along-the-nose), not
    # (thickness, width, height). Getting this backwards is what turned the first
    # version of this shield into a horizontal pancake 7px tall.
    o.append(add_wedge("d_shield0", (0.44, 0.46, 0.075), 0.86,
                       Vector((L * 0.34, 0, 0.0)),
                       (0, math.radians(90), 0), coll=coll, mat=M["hull"]))
    o.append(add_wedge("d_shield1", (0.34, 0.36, 0.050), 0.82,
                       Vector((L * 0.40, 0, 0.005)),
                       (0, math.radians(90), 0), coll=coll, mat=M["sub"]))
    o.append(add_wedge("d_shield2", (0.20, 0.22, 0.045), 0.72,
                       Vector((L * 0.44, 0, 0.010)),
                       (0, math.radians(90), 0), coll=coll, mat=M["trim"]))
    # Hazard chevron and a slit for the sensor to see through.
    o.append(add_box("d_chev", (0.020, 0.30, 0.035),
                     Vector((L * 0.475, 0, -0.10)), coll=coll, mat=M["acc"]))
    o.append(add_box("d_slit", (0.020, 0.13, 0.030),
                     Vector((L * 0.475, 0, 0.10)), coll=coll, mat=M["glow"]))
    # Rivet rows down the shield edges.
    for i, sy in enumerate((-1, 1)):
        o.extend(bolt_row(f"d_bolt{i}_", 4,
                          Vector((L * 0.375, sy * 0.205, -0.135)),
                          Vector((0, 0, 0.09)), 0.020, coll, M["frame"], axis="X"))

    # Squat body behind the shield.
    o.append(add_box("d_body", (L * 0.42, 0.30, 0.22),
                     Vector((-L * 0.10, 0, 0.0)), coll=coll, mat=M["far"]))
    o.append(add_wedge("d_backplate", (0.10, 0.26, 0.19), 0.72,
                       Vector((-L * 0.34, 0, 0.0)),
                       (0, math.radians(-90), 0), coll=coll, mat=M["sub"]))

    # Short mortar over the top, not a rifle: siege ordnance.
    o.append(add_box("d_mount", (0.12, 0.13, 0.075),
                     Vector((-L * 0.02, 0, 0.145)), coll=coll, mat=M["frame"]))
    o.append(add_cyl("d_tube", 0.058, L * 0.30, Vector((L * 0.16, 0, 0.165)),
                     (0, math.radians(78), 0), verts=12, coll=coll, mat=M["frame"]))
    o.append(add_cyl("d_mouth", 0.072, 0.045, Vector((L * 0.30, 0, 0.195)),
                     (0, math.radians(78), 0), verts=12, coll=coll, mat=M["trim"]))

    # Four short thrusters at the corners, splayed outward.
    for i, (sy, sz) in enumerate(((-1, 1), (1, 1), (-1, -1), (1, -1))):
        o.append(add_box(f"d_pod{i}", (0.13, 0.085, 0.085),
                         Vector((-L * 0.40, sy * 0.145, sz * 0.115)),
                         (math.radians(sy * 10), 0, 0), coll=coll, mat=M["frame"]))
        o.append(add_box(f"d_flame{i}", (0.030, 0.055, 0.055),
                         Vector((-L * 0.475, sy * 0.145, sz * 0.115)),
                         coll=coll, mat=M["glow"]))

    o.extend(scatter_greebles("d_g", Vector((-L * 0.10, 0, 0.0)),
                              Vector((L * 0.34, 0.26, 0.17)), 10, coll,
                              [M["frame"], M["sub"], M["acc"]], seed=307, scale=0.5))
    return o


def _drone_wisp(coll, M):
    """
    WISP — CIRRUS's escort. An open hoop with a node in the middle.

    The smallest and least solid thing in the roster: most of its silhouette is a
    hole. Built from a ring of eight short segments with a floating core, so it
    reads as barely-there hardware rather than as a small aircraft.
    """
    L = 0.58
    o = []

    # The hoop: eight segments around the YZ plane, so the ring faces the camera.
    # The radial thickness has to stay above ~3 logical px or the ring vanishes at
    # gameplay scale and the drone reads as a scrap of debris.
    R = 0.225
    for i in range(8):
        a = math.radians(22.5 + i * 45)
        cy, cz = math.cos(a) * R, math.sin(a) * R
        o.append(add_box(f"d_ring{i}", (0.075, 0.155, 0.060),
                         Vector((-L * 0.06, cy, cz)),
                         (a + math.radians(90), 0, 0),
                         bevel=0.004, coll=coll, mat=M["hull"] if i % 2 else M["sub"]))
    # Four node blocks at the compass points, one lit.
    for i, a in enumerate((0, 90, 180, 270)):
        r = math.radians(a)
        o.append(add_box(f"d_node{i}", (0.085, 0.080, 0.080),
                         Vector((-L * 0.06, math.cos(r) * R, math.sin(r) * R)),
                         coll=coll, mat=M["acc"] if i == 0 else M["frame"]))

    # Core, floating inside the hoop on two thin spars.
    o.append(add_wedge("d_core", (0.145, 0.135, L * 0.50), 0.34,
                       Vector((L * 0.06, 0, 0.0)),
                       (0, math.radians(90), 0), coll=coll, mat=M["hull"]))
    o.append(add_cyl("d_eye", 0.055, 0.032, Vector((L * 0.30, 0, 0.0)),
                     (0, math.radians(90), 0), verts=14, coll=coll, mat=M["glow"]))
    for i, sy in enumerate((-1, 1)):
        o.append(add_box(f"d_spar{i}", (0.036, 0.20, 0.026),
                         Vector((-L * 0.06, sy * 0.105, 0.0)), coll=coll, mat=M["frame"]))

    # A single small emitter under the core rather than a cannon.
    o.append(add_cyl("d_emit", 0.026, L * 0.26, Vector((L * 0.22, 0, -0.065)),
                     (0, math.radians(90), 0), verts=10, coll=coll, mat=M["frame"]))
    o.append(add_cyl("d_tip", 0.036, 0.030, Vector((L * 0.34, 0, -0.065)),
                     (0, math.radians(90), 0), verts=10, coll=coll, mat=M["trim"]))

    # Two outrigger thrusters on stalks, canted out.
    for i, sy in enumerate((-1, 1)):
        o.append(add_cyl(f"d_stalk{i}", 0.016, 0.11,
                         Vector((-L * 0.22, sy * 0.13, 0.055)),
                         (math.radians(90), 0, math.radians(-sy * 30)),
                         verts=8, coll=coll, mat=M["frame"]))
        o.append(add_cyl(f"d_bell{i}", 0.048, 0.075,
                         Vector((-L * 0.30, sy * 0.185, 0.085)),
                         (0, math.radians(90), 0), verts=12, coll=coll, mat=M["sub"]))
        o.append(add_cyl(f"d_flame{i}", 0.032, 0.024,
                         Vector((-L * 0.35, sy * 0.185, 0.085)),
                         (0, math.radians(90), 0), verts=12, coll=coll, mat=M["glow"]))

    o.extend(scatter_greebles("d_g", Vector((L * 0.02, 0, 0.0)),
                              Vector((L * 0.24, 0.05, 0.05)), 5, coll,
                              [M["frame"], M["acc"]], seed=419, scale=0.3))
    return o


def _drone_aegis(coll, M):
    """
    AEGIS — OBELISK's escort. An upright monolith.

    The only drone taller than it is long. A standing slab with buttressed
    shoulders, a single vertical eye slot and a projector at its base; the ring of
    emitters around the top is the guard relay it lends its pilot. Rotating it to
    aim tips the whole tower, which reads as deliberate rather than as a glitch
    because nothing else about it is aerodynamic.
    """
    L = 0.72
    o = []

    # The slab: tall, narrow, slightly tapered toward the top.
    o.append(add_wedge("d_slab", (0.235, 0.24, 0.62), 0.74,
                       Vector((0, 0, 0.02)), coll=coll, mat=M["hull"]))
    o.append(add_wedge("d_cap", (0.20, 0.20, 0.075), 0.55,
                       Vector((0, 0, 0.355)), coll=coll, mat=M["trim"]))
    o.append(add_box("d_base", (0.26, 0.26, 0.055),
                     Vector((0, 0, -0.30)), coll=coll, mat=M["frame"]))

    # Vertical eye slot down the face, and a dark inset behind it.
    o.append(add_box("d_inset", (0.030, 0.13, 0.44),
                     Vector((L * 0.155, 0, 0.03)), coll=coll, mat=M["far"]))
    o.append(add_box("d_eye", (0.022, 0.055, 0.34),
                     Vector((L * 0.175, 0, 0.03)), coll=coll, mat=M["glow"]))

    # Buttressed shoulders: angled plates that widen the base of the tower.
    for i, sy in enumerate((-1, 1)):
        o.append(add_wedge(f"d_butt{i}", (0.10, 0.075, 0.34), 0.30,
                           Vector((-L * 0.02, sy * 0.155, -0.06)),
                           (math.radians(sy * 16), 0, 0), coll=coll, mat=M["sub"]))
        o.append(add_box(f"d_shoulder{i}", (0.16, 0.055, 0.075),
                         Vector((0, sy * 0.175, 0.19)), coll=coll, mat=M["hull"]))
        # Relay emitters ringing the crown.
        o.append(add_cyl(f"d_emit{i}", 0.028, 0.075,
                         Vector((-L * 0.05, sy * 0.10, 0.40)),
                         (0, 0, 0), verts=10, coll=coll, mat=M["acc"]))
        o.append(add_cyl(f"d_emitf{i}", 0.030, 0.02,
                         Vector((L * 0.10, sy * 0.10, 0.40)),
                         (0, 0, 0), verts=10, coll=coll, mat=M["glow"]))
        # Recessed bands down the flanks.
        for j, sz in enumerate((0.16, 0.0, -0.16)):
            o.append(add_box(f"d_band{i}{j}", (0.185, 0.030, 0.028),
                             Vector((0, sy * 0.125, sz)), coll=coll, mat=M["frame"]))

    # Projector at the foot, aimed forward — its whole weapon.
    o.append(add_box("d_proj", (0.145, 0.115, 0.10),
                     Vector((L * 0.11, 0, -0.245)), coll=coll, mat=M["frame"]))
    o.append(add_cyl("d_lens", 0.052, 0.045, Vector((L * 0.235, 0, -0.245)),
                     (0, math.radians(90), 0), verts=12, coll=coll, mat=M["glow"]))

    # Thrusters underneath, since there is no tail to put them on.
    for i, sy in enumerate((-1, 1)):
        o.append(add_cyl(f"d_bell{i}", 0.055, 0.09,
                         Vector((-L * 0.14, sy * 0.115, -0.35)),
                         (0, 0, 0), verts=12, coll=coll, mat=M["frame"]))
        o.append(add_cyl(f"d_flame{i}", 0.038, 0.026,
                         Vector((-L * 0.14, sy * 0.115, -0.405)),
                         (0, 0, 0), verts=12, coll=coll, mat=M["glow"]))

    o.extend(scatter_greebles("d_g", Vector((-L * 0.08, 0, 0.0)),
                              Vector((0.14, 0.18, 0.44)), 9, coll,
                              [M["frame"], M["sub"], M["acc"]], seed=523, scale=0.4))
    return o


def _drone_ember(coll, M):
    """
    EMBER — PYRE's escort. A hunched machine strapped with fuel.

    Two large canisters ride the flanks, the exhaust nozzles are oversized and
    flared, and the muzzle is a wide-mouthed projector rather than a barrel. It
    should look like it is running too hot, which is what its passive does.
    """
    L = 0.74
    o = []

    # Hunched hull: high at the shoulders, dropping toward the nose.
    o.append(add_wedge("d_hull", (0.24, 0.22, L * 0.44), 0.44,
                       Vector((-L * 0.02, 0, 0.02)),
                       (0, math.radians(84), 0), coll=coll, mat=M["hull"]))
    o.append(add_wedge("d_hump", (0.26, 0.20, 0.13), 0.52,
                       Vector((-L * 0.16, 0, 0.135)), coll=coll, mat=M["sub"]))
    o.append(add_box("d_belly", (L * 0.40, 0.17, 0.055),
                     Vector((-L * 0.02, 0, -0.10)), coll=coll, mat=M["far"]))

    # Blunt cowled nose with a lit intake.
    o.append(add_wedge("d_cowl", (0.175, 0.165, 0.155), 0.62,
                       Vector((L * 0.28, 0, -0.02)),
                       (0, math.radians(84), 0), coll=coll, mat=M["sub"]))
    o.append(add_cyl("d_intake", 0.055, 0.035, Vector((L * 0.375, 0, -0.02)),
                     (0, math.radians(90), 0), verts=12, coll=coll, mat=M["glow"]))

    # Fuel canisters on the flanks, banded and capped.
    for i, sy in enumerate((-1, 1)):
        o.append(add_cyl(f"d_tank{i}", 0.075, L * 0.44,
                         Vector((-L * 0.08, sy * 0.185, 0.02)),
                         (0, math.radians(90), 0), verts=12, coll=coll, mat=M["hull"]))
        o.append(add_cyl(f"d_tankcap{i}", 0.082, 0.035,
                         Vector((L * 0.09, sy * 0.185, 0.02)),
                         (0, math.radians(90), 0), verts=12, coll=coll, mat=M["trim"]))
        o.append(add_cyl(f"d_tankband{i}", 0.080, 0.028,
                         Vector((-L * 0.20, sy * 0.185, 0.02)),
                         (0, math.radians(90), 0), verts=12, coll=coll, mat=M["acc"]))
        # Feed pipe from tank to projector.
        o.append(add_cyl(f"d_pipe{i}", 0.020, L * 0.30,
                         Vector((L * 0.16, sy * 0.135, -0.055)),
                         (0, math.radians(80), 0), verts=8, coll=coll, mat=M["frame"]))
        # Flared exhaust: an oversized cone, deliberately out of proportion.
        o.append(add_cyl(f"d_bell{i}", 0.062, 0.16,
                         Vector((-L * 0.42, sy * 0.135, 0.02)),
                         (0, math.radians(90), 0), verts=12,
                         cone_r2=0.115, coll=coll, mat=M["frame"]))
        o.append(add_cyl(f"d_flame{i}", 0.088, 0.035,
                         Vector((-L * 0.50, sy * 0.135, 0.02)),
                         (0, math.radians(90), 0), verts=12, coll=coll, mat=M["glow"]))
        # Heat vents along the hump.
        for j, sx in enumerate((-0.26, -0.14, -0.02)):
            o.append(add_box(f"d_vent{i}{j}", (0.030, 0.030, 0.075),
                             Vector((L * sx, sy * 0.085, 0.145)),
                             coll=coll, mat=M["acc"]))

    # Wide-mouthed projector under the nose.
    o.append(add_box("d_breech", (0.135, 0.11, 0.095),
                     Vector((L * 0.10, 0, -0.10)), coll=coll, mat=M["frame"]))
    o.append(add_cyl("d_throat", 0.042, L * 0.26, Vector((L * 0.28, 0, -0.10)),
                     (0, math.radians(90), 0), verts=10, coll=coll, mat=M["frame"]))
    o.append(add_cyl("d_mouth", 0.048, 0.085, Vector((L * 0.44, 0, -0.10)),
                     (0, math.radians(90), 0), verts=12,
                     cone_r2=0.090, coll=coll, mat=M["trim"]))

    o.extend(scatter_greebles("d_g", Vector((-L * 0.08, 0, 0.02)),
                              Vector((L * 0.36, 0.12, 0.14)), 10, coll,
                              [M["frame"], M["sub"], M["acc"]], seed=641, scale=0.42))
    return o


def _drone_static(coll, M):
    """
    STATIC — NULLTIDE's escort. An antenna mast that happens to fly.

    Deliberately barely armed: a lattice mast carrying a dish and a spray of
    aerials, on a thin fuselage, with one small emitter. The asymmetry — dish on
    one side only — is the fastest way to tell it apart at gameplay scale.
    """
    L = 0.68
    o = []

    # Thin fuselage.
    o.append(add_wedge("d_body", (0.145, 0.135, L * 0.56), 0.40,
                       Vector((-L * 0.04, 0, -0.02)),
                       (0, math.radians(90), 0), coll=coll, mat=M["hull"]))
    o.append(add_box("d_keel", (L * 0.34, 0.11, 0.045),
                     Vector((-L * 0.10, 0, -0.10)), coll=coll, mat=M["far"]))
    o.append(add_wedge("d_nose", (0.085, 0.085, 0.145), 0.24,
                       Vector((L * 0.36, 0, -0.03)),
                       (0, math.radians(78), 0), coll=coll, mat=M["sub"]))

    # Lattice mast: four uprights and two cross-braces, up off the spine.
    for i, (sy, sx) in enumerate(((-1, -0.16), (1, -0.16), (-1, 0.06), (1, 0.06))):
        o.append(add_cyl(f"d_strut{i}", 0.016, 0.30,
                         Vector((L * sx, sy * 0.075, 0.135)),
                         (math.radians(sy * 8), 0, 0), verts=8, coll=coll, mat=M["frame"]))
    for i, sz in enumerate((0.06, 0.24)):
        o.append(add_box(f"d_brace{i}", (0.20, 0.175, 0.018),
                         Vector((-L * 0.05, 0, sz)), coll=coll, mat=M["frame"]))

    # Dish, cocked to one side. The single most identifying feature.
    o.append(add_cyl("d_dishback", 0.105, 0.030,
                     Vector((-L * 0.04, 0.175, 0.29)),
                     (math.radians(70), 0, math.radians(-18)), verts=16,
                     coll=coll, mat=M["sub"]))
    o.append(add_cyl("d_dish", 0.125, 0.035,
                     Vector((-L * 0.04, 0.195, 0.30)),
                     (math.radians(70), 0, math.radians(-18)), verts=16,
                     cone_r2=0.055, coll=coll, mat=M["trim"]))
    o.append(add_cyl("d_feedhorn", 0.024, 0.085,
                     Vector((-L * 0.02, 0.255, 0.325)),
                     (math.radians(70), 0, math.radians(-18)), verts=8,
                     coll=coll, mat=M["acc"]))

    # Aerials: thin whips at several angles, plus a lit emitter node on the mast.
    for i, (ang, ln) in enumerate(((18, 0.30), (-26, 0.24), (52, 0.20))):
        o.append(add_cyl(f"d_whip{i}", 0.009, ln,
                         Vector((-L * 0.16, -0.10 - i * 0.02, 0.34 + i * 0.02)),
                         (math.radians(ang), 0, math.radians(12 * i)), verts=6,
                         coll=coll, mat=M["frame"]))
    o.append(add_box("d_emitnode", (0.075, 0.075, 0.055),
                     Vector((L * 0.06, 0, 0.275)), coll=coll, mat=M["glow"]))

    # Sensor eye and the one small weapon.
    o.append(add_box("d_eye", (0.045, 0.065, 0.022),
                     Vector((L * 0.30, 0, 0.045)), (0, math.radians(-18), 0),
                     coll=coll, mat=M["glow"]))
    o.append(add_cyl("d_emit", 0.028, L * 0.28, Vector((L * 0.26, 0, -0.115)),
                     (0, math.radians(90), 0), verts=10, coll=coll, mat=M["frame"]))
    o.append(add_cyl("d_tip", 0.038, 0.032, Vector((L * 0.40, 0, -0.115)),
                     (0, math.radians(90), 0), verts=10, coll=coll, mat=M["acc"]))

    # Canted tail vanes and a single thruster.
    for i, sy in enumerate((-1, 1)):
        o.append(add_wedge(f"d_vane{i}", (0.185, 0.018, 0.145), 0.18,
                           Vector((-L * 0.34, sy * 0.075, 0.02)),
                           (math.radians(sy * 42), 0, math.radians(-sy * 18)),
                           coll=coll, mat=M["hull"]))
    o.append(add_cyl("d_bell", 0.068, 0.10, Vector((-L * 0.42, 0, -0.02)),
                     (0, math.radians(90), 0), verts=12, coll=coll, mat=M["frame"]))
    o.append(add_cyl("d_flame", 0.046, 0.028, Vector((-L * 0.485, 0, -0.02)),
                     (0, math.radians(90), 0), verts=12, coll=coll, mat=M["glow"]))

    o.extend(scatter_greebles("d_g", Vector((-L * 0.06, 0, -0.02)),
                              Vector((L * 0.32, 0.10, 0.09)), 8, coll,
                              [M["frame"], M["sub"], M["acc"]], seed=733, scale=0.34))
    return o


# One builder per mech. A missing entry falls back to ARBITER's dart, so adding a
# ninth chassis produces a working drone before its own design exists.
DRONE_BUILDERS = {
    "halcyon": _drone_arbiter,
    "nocturne": _drone_warden,
    "vesper": _drone_sightline,
    "terramoth": _drone_bulwark,
    "cirrus": _drone_wisp,
    "obelisk": _drone_aegis,
    "pyre": _drone_ember,
    "nulltide": _drone_static,
}


def build_drone(mech_id, palette_key=None):
    """
    Builds one supporter drone into MECH_<ID>, named `<mech_id>_drone`.

    The design language follows the chassis throughout: tapered wedges rather than
    plain boxes, overlapping plates with a visible step, dark recessed bands, and
    exactly one emissive feature that reads as an eye. What differs per drone is
    the silhouette, because that is the only thing legible at 40 logical pixels
    in the middle of a firefight.
    """
    pal = PALETTES[palette_key or mech_id]
    coll = ensure_collection(f"MECH_{mech_id.upper()}")
    M = _drone_materials(mech_id, pal)
    build = DRONE_BUILDERS.get(mech_id, _drone_arbiter)
    return join_as(f"{mech_id}_drone", build(coll, M), Vector((0, 0, 0)), coll)


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

    _sf = faction_surface(mech_id)
    roles = palette_roles(pal, mech_id)
    M_HULL = make_material(f"{mech_id}_hull", roles["armour"], roughness=0.44, surface=_sf)
    M_FAR = make_material(f"{mech_id}_far", roles["armour_far"], roughness=0.5, surface=_sf)
    M_SUB = make_material(f"{mech_id}_sub", roles["panel"], roughness=0.5, surface=_sf)
    M_TRIM = make_material(f"{mech_id}_trim", roles["hilite"], roughness=0.40, surface=_sf)
    M_FRAME = make_material(f"{mech_id}_frame", pal["frame"], roughness=0.62, metallic=0.7, surface=_sf)
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
    # Hull as a wedge lying on its side: broad at the back, tapering to the nose.
    o.append(add_wedge("c_hull", (hz, hy, hx), 0.62, piv + Vector((0.02, 0, 0)),
                       (0, math.radians(90) + PITCH, 0), coll=coll, mat=M_HULL))
    o.append(add_slab("c_deck", (hx * 0.70, hy * 0.86, 0.055),
                      piv + Vector((-0.03, 0, hz * 0.56)), R, coll=coll, mat=M_TRIM))
    # Chisel nose, angled down.
    o.append(add_wedge("c_nose", (0.26, hy * 0.80, 0.30), 0.34,
                       piv + Vector((hx * 0.50, 0, -0.08)),
                       (0, math.radians(74), 0), coll=coll, mat=M_SUB))
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
    o += scatter_greebles("c_gr", piv + Vector((0.0, -hy * 0.50, 0.0)),
                          (hx * 0.86, 0.06, hz * 0.86), 14, coll,
                          [M_FRAME, M_SUB, M_ACC], seed=11)
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
        o.append(add_box("b_lid", (0.26, 0.30, 0.08), piv + Vector((0.0, 0, 0.22)), R, coll=coll, mat=M_TRIM))
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
        o.append(add_box("b_armor", (0.34, 0.50, 0.10), piv + Vector((0.0, 0, 0.19)), R, coll=coll, mat=M_TRIM))
        for i, dy in enumerate((-0.16, 0.16)):
            o.append(add_cyl(f"b_stack{i}", 0.055, 0.30, piv + Vector((-0.14, dy, 0.24)),
                             (0, math.radians(-12), 0), 12, coll=coll, mat=M_FRAME))
            o.append(add_cyl(f"b_stackc{i}", 0.045, 0.05, piv + Vector((-0.17, dy, 0.39)),
                             (0, math.radians(-12), 0), 12, coll=coll, mat=M_ACC))
        for i, z in enumerate((0.06, -0.08)):
            o.append(add_box(f"b_grill{i}", (0.06, 0.40, 0.05),
                             piv + Vector((-0.22, 0, z)), coll=coll, mat=M_FRAME))
    o += scatter_greebles("b_gr", piv + Vector((-0.06, -0.16, 0.02)), (0.30, 0.06, 0.34),
                          10, coll, [M_FRAME, M_SUB, M_ACC], seed=23)
    parts["backpack"] = join_as(pn("backpack"), o, piv, coll)

    # ---- lower body: hips + two reverse-joint legs ------------------------
    piv = px(*P["lowerBody"])
    pelvis = []
    lw = LEG["w"]
    pelvis.append(add_box("l_hips", (LEG["hip"], LEG["hip"] + 0.02, 0.24), piv + Vector((0, 0, 0.06)),
                          coll=coll, mat=M_HULL))
    pelvis.append(add_box("l_skirt", (0.26, LEG["hip"] * 0.9, 0.12), piv + Vector((0.12, 0, -0.08)),
                          (0, math.radians(14), 0), coll=coll, mat=M_SUB))
    pelvis.append(add_box("l_tail", (0.16, 0.24, 0.14), piv + Vector((-0.22, 0, 0.02)),
                          coll=coll, mat=M_FRAME))

    THIGH_A = math.radians(32)   # top forward, bottom swept back
    SHIN_A = math.radians(-36)   # knee back, foot forward
    spread = LEG["hip"] * 0.46
    # Each leg is collected separately so it can be exported as its own part and
    # swung about its hip for a walk cycle. `o` keeps only the pelvis.
    legs = {0: [], 1: []}
    hip_local = Vector((0.0, 0.0, -0.02))
    for side, (dy, mat_leg) in enumerate(((-spread, M_HULL), (spread, M_FAR))):
        o = legs[side]
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

    # Pelvis and legs ship as three parts so the game can swing each leg about
    # its own hip. A single lowerBody sprite cannot walk.
    parts["lowerBody"] = join_as(pn("lowerBody"), pelvis, piv, coll)
    hip_piv = piv + hip_local
    parts["legNear"] = join_as(pn("legNear"), legs[0], hip_piv, coll)
    parts["legFar"] = join_as(pn("legFar"), legs[1], hip_piv, coll)

    # ---- arms: big pauldron + disc hub + forward grip ---------------------
    for key, near in (("rightArm", True), ("leftArm", False)):
        piv = px(*P[key])
        shell = M_HULL if near else M_FAR
        sgn = -1 if near else 1
        o = []
        # Pauldron as a tapered scoop: wide at the shoulder, narrowing outward,
        # tilted off-axis. This is the reference's signature shoulder, and it is
        # what a plain box cannot express.
        # A long sweeping scoop, roughly twice as long as it is wide and strongly
        # tapered, angled back over the shoulder. Proportion carries as much of
        # the reference read as the taper does.
        o.append(add_wedge(f"a_pauld_{key}", (0.30, 0.28, 0.62), 0.30,
                           piv + Vector((-0.09, 0, 0.18)),
                           (math.radians(sgn * -8), math.radians(-32), 0),
                           coll=coll, mat=shell))
        # Thin outer shell laid over it, edge visible along the sweep.
        o.append(add_wedge(f"a_shell_{key}", (0.20, 0.07, 0.54), 0.34,
                           piv + Vector((-0.08, sgn * 0.155, 0.19)),
                           (math.radians(sgn * -8), math.radians(-32), 0),
                           coll=coll, mat=M_SUB))
        # Sharp fin sweeping back off the shoulder.
        o.append(add_wedge(f"a_fin_{key}", (0.10, 0.05, 0.26), 0.18,
                           piv + Vector((-0.16, sgn * 0.08, 0.22)),
                           (0, math.radians(-38), 0), coll=coll, mat=M_ACC))
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
        # ---- the hand ------------------------------------------------------
        # There was a 0.11 BU block here called `a_grip` and nothing else, so
        # every machine on the roster held its rifle and its blade with a stump.
        #
        # **A mitt, not five fingers.** The hand is ~8 logical px on a 104 px
        # chassis; a finger would be under two, which is below what the sprite
        # can resolve and would come out as noise. So: a collar, a palm, one
        # curled finger *mass* crossing the haft with two grooves for knuckles,
        # and a thumb — separated, on the near side, because the thumb is the
        # single element that says "gripping" rather than "ending".
        #
        # **In shell, not frame.** The first pass built it all in the dark frame
        # material, sitting against a dark forearm and holding a dark weapon, and
        # it read as a bracket rather than a hand. The palm and fingers carry the
        # machine's own hull colour so the shape separates from both.
        HAND = piv + Vector((0.47, 0, -0.26))
        AXF = (0, math.radians(-26), 0)          # along the forearm
        o.append(add_cyl(f"a_wristcol_{key}", 0.075, 0.10,
                         HAND + Vector((-0.075, 0, 0.035)),
                         (0, math.radians(64), 0), 12, coll=coll, mat=M_FRAME))
        o.append(add_box(f"a_palm_{key}", (0.155, 0.13, 0.165), HAND,
                         AXF, coll=coll, mat=shell))
        # Finger mass, curled across the haft rather than along it.
        o.append(add_box(f"a_fings_{key}", (0.095, 0.125, 0.175),
                         HAND + Vector((0.095, 0, -0.005)),
                         (0, math.radians(-70), 0), coll=coll, mat=shell))
        for k in range(2):
            o.append(add_box(f"a_knuck_{key}{k}", (0.10, 0.135, 0.017),
                             HAND + Vector((0.095, 0, 0.035 - k * 0.055)),
                             (0, math.radians(-70), 0), coll=coll, mat=M_FRAME))
        # Thumb, on the near side, closing the other way.
        o.append(add_box(f"a_thumb_{key}", (0.10, 0.045, 0.055),
                         HAND + Vector((0.055, sgn * -0.075, 0.055)),
                         (0, math.radians(-16), math.radians(sgn * 16)),
                         coll=coll, mat=M_SUB))
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
        o += scatter_greebles(f"a_gr_{key}", piv + Vector((0.02, sgn * 0.15, 0.10)),
                              (0.26, 0.05, 0.36), 8, coll,
                              [M_FRAME, M_SUB, M_ACC], seed=31 + (0 if near else 7))
        parts[key] = join_as(pn(key), o, piv, coll)

    # ---- main weapon: oversized forward rifle -----------------------------
    piv = px(*P["mainWeapon"])
    o = []
    if spec["weapon"] == "rifle":
        # Long-barrel precision rifle: slim, scoped, drum-fed.
        o.append(add_box("w_recv", (0.36, 0.17, 0.24), piv, coll=coll, mat=M_SUB))
        o.append(add_wedge("w_shroud", (0.18, 0.16, 0.46), 0.62,
                           piv + Vector((0.34, 0, 0.02)), (0, math.radians(90), 0),
                           coll=coll, mat=M_TRIM))
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
    elif spec["weapon"] == "railgun":
        # VESPER: twin accelerator rails over a capacitor block. The silhouette
        # is almost all barrel - it should read as "outranges you" from across
        # the arena.
        o.append(add_box("w_cap", (0.42, 0.22, 0.30), piv + Vector((-0.06, 0, -0.02)),
                         coll=coll, mat=M_SUB))
        o.append(add_box("w_capfin", (0.30, 0.26, 0.06), piv + Vector((-0.06, 0, 0.16)),
                         coll=coll, mat=M_ACC))
        for i, dz in enumerate((0.075, -0.075)):
            o.append(add_box(f"w_rail{i}", (1.24, 0.05, 0.05),
                             piv + Vector((0.76, 0, dz)), coll=coll, mat=M_FRAME))
        # Accelerator coils stepping down the rails.
        for i in range(5):
            o.append(add_cyl(f"w_coil{i}", 0.105 - i * 0.008, 0.07,
                             piv + Vector((0.30 + i * 0.24, 0, 0)),
                             (0, math.radians(90), 0), 14, coll=coll,
                             mat=M_GLOW if i % 2 else M_TRIM))
        o.append(add_box("w_spine", (1.10, 0.09, 0.09), piv + Vector((0.72, 0, 0)),
                         coll=coll, mat=M_HULL))
        o.append(add_cyl("w_muzzle", 0.07, 0.06, piv + Vector((1.40, 0, 0)),
                         (0, math.radians(90), 0), 16, coll=coll, mat=M_GLOW))
        o.append(add_box("w_scope", (0.30, 0.06, 0.07), piv + Vector((0.16, 0, 0.20)),
                         coll=coll, mat=M_FRAME))
        o.append(add_cyl("w_lens", 0.035, 0.03, piv + Vector((0.32, 0, 0.20)),
                         (0, math.radians(90), 0), 12, coll=coll, mat=M_ACC))
        o.append(add_box("w_brace", (0.16, 0.12, 0.20), piv + Vector((-0.24, 0, -0.06)),
                         coll=coll, mat=M_HULL))
    elif spec["weapon"] == "mortar":
        # TERRAMOTH: a short, enormous-bore tube canted upward on recoil rams.
        # Nothing about it says "aimed" - it says "dropped on you".
        o.append(add_box("w_breech", (0.46, 0.36, 0.40), piv, coll=coll, mat=M_SUB))
        o.append(add_box("w_plate", (0.10, 0.40, 0.44), piv + Vector((-0.24, 0, 0)),
                         coll=coll, mat=M_HULL))
        o.append(add_cyl("w_tube", 0.20, 0.74, piv + Vector((0.48, 0, 0.10)),
                         (0, math.radians(76), 0), 20, coll=coll, mat=M_FRAME))
        o.append(add_cyl("w_mouth", 0.235, 0.10, piv + Vector((0.66, 0, 0.44)),
                         (0, math.radians(76), 0), 20, coll=coll, cone_r2=0.20, mat=M_HULL))
        o.append(add_cyl("w_bore", 0.16, 0.04, piv + Vector((0.68, 0, 0.47)),
                         (0, math.radians(76), 0), 20, coll=coll, mat=M_GLOW))
        # Recoil rams either side of the tube.
        for i, dy in enumerate((0.20, -0.20)):
            o.append(add_cyl(f"w_ram{i}", 0.045, 0.52, piv + Vector((0.34, dy, -0.02)),
                             (0, math.radians(76), 0), 10, coll=coll, mat=M_TRIM))
        for i in range(3):
            o.append(add_box(f"w_shell{i}", (0.12, 0.12, 0.12),
                             piv + Vector((-0.18, -0.16, -0.20 + i * 0.14)),
                             coll=coll, mat=M_ACC))
    elif spec["weapon"] == "smg":
        # CIRRUS: a matched pair of stubby machine pistols, not one big gun.
        for i, dy in enumerate((0.11, -0.11)):
            o.append(add_box(f"w_body{i}", (0.30, 0.09, 0.20),
                             piv + Vector((0.02, dy, 0.02)), coll=coll, mat=M_SUB))
            o.append(add_cyl(f"w_bar{i}", 0.036, 0.40, piv + Vector((0.36, dy, 0.04)),
                             (0, math.radians(90), 0), 10, coll=coll, mat=M_FRAME))
            o.append(add_cyl(f"w_muz{i}", 0.045, 0.04, piv + Vector((0.58, dy, 0.04)),
                             (0, math.radians(90), 0), 10, coll=coll, mat=M_GLOW))
            o.append(add_box(f"w_mag{i}", (0.09, 0.07, 0.22),
                             piv + Vector((-0.02, dy, -0.16)), (0, math.radians(-10), 0),
                             coll=coll, mat=M_ACC))
            o.append(add_box(f"w_vent{i}", (0.16, 0.10, 0.04),
                             piv + Vector((0.20, dy, 0.14)), coll=coll, mat=M_TRIM))
        o.append(add_box("w_yoke", (0.16, 0.30, 0.10), piv + Vector((-0.10, 0, 0.02)),
                         coll=coll, mat=M_HULL))
    elif spec["weapon"] == "breachgun":
        # OBELISK: wide-bore siege shotgun behind a slab of shield plate. The
        # plate is the point - this chassis advances behind its own gun.
        o.append(add_box("w_body", (0.40, 0.24, 0.30), piv, coll=coll, mat=M_SUB))
        o.append(add_box("w_shield", (0.12, 0.46, 0.56), piv + Vector((0.18, 0, 0.04)),
                         (0, math.radians(-6), 0), coll=coll, mat=M_HULL))
        o.append(add_box("w_boss", (0.08, 0.18, 0.22), piv + Vector((0.26, 0, 0.04)),
                         coll=coll, mat=M_ACC))
        o.append(add_cyl("w_bore", 0.155, 0.46, piv + Vector((0.50, 0, -0.06)),
                         (0, math.radians(90), 0), 18, coll=coll, mat=M_FRAME))
        o.append(add_cyl("w_choke", 0.185, 0.10, piv + Vector((0.76, 0, -0.06)),
                         (0, math.radians(90), 0), 18, coll=coll, cone_r2=0.165, mat=M_TRIM))
        o.append(add_cyl("w_muzzle", 0.13, 0.04, piv + Vector((0.83, 0, -0.06)),
                         (0, math.radians(90), 0), 18, coll=coll, mat=M_GLOW))
        o.append(add_box("w_pump", (0.24, 0.10, 0.09), piv + Vector((0.44, 0, -0.22)),
                         coll=coll, mat=M_FRAME))
    elif spec["weapon"] == "flamer":
        # PYRE: fuel bottles feeding a flared projector with a lit pilot flame.
        o.append(add_box("w_body", (0.34, 0.20, 0.24), piv, coll=coll, mat=M_SUB))
        for i, dy in enumerate((0.14, -0.14)):
            o.append(add_cyl(f"w_tank{i}", 0.095, 0.42, piv + Vector((-0.20, dy, -0.04)),
                             (0, math.radians(90), 0), 14, coll=coll, mat=M_ACC))
            o.append(add_cyl(f"w_cap{i}", 0.06, 0.05, piv + Vector((-0.42, dy, -0.04)),
                             (0, math.radians(90), 0), 10, coll=coll, mat=M_FRAME))
        o.append(add_cyl("w_neck", 0.075, 0.44, piv + Vector((0.38, 0, 0.02)),
                         (0, math.radians(90), 0), 14, coll=coll, mat=M_FRAME))
        o.append(add_cyl("w_bell", 0.075, 0.24, piv + Vector((0.70, 0, 0.02)),
                         (0, math.radians(90), 0), 18, coll=coll, cone_r2=0.20, mat=M_HULL))
        o.append(add_cyl("w_pilot", 0.055, 0.05, piv + Vector((0.84, 0, 0.02)),
                         (0, math.radians(90), 0), 16, coll=coll, mat=M_GLOW))
        # Fuel line looping from the bottles to the neck.
        for i in range(4):
            o.append(add_box(f"w_line{i}", (0.09, 0.05, 0.05),
                             piv + Vector((-0.04 + i * 0.11, 0.12, 0.14)),
                             coll=coll, mat=M_TRIM))
    elif spec["weapon"] == "arc":
        # NULLTIDE: an emitter, not a gun - stacked tesla rings between two
        # prongs, with no barrel at all.
        o.append(add_box("w_body", (0.32, 0.18, 0.26), piv, coll=coll, mat=M_SUB))
        o.append(add_box("w_stack", (0.30, 0.14, 0.16), piv + Vector((0.28, 0, 0.02)),
                         coll=coll, mat=M_FRAME))
        for i in range(4):
            o.append(add_cyl(f"w_ring{i}", 0.115 - i * 0.012, 0.035,
                             piv + Vector((0.20 + i * 0.15, 0, 0.02)),
                             (0, math.radians(90), 0), 16, coll=coll,
                             mat=M_GLOW if i % 2 == 0 else M_ACC))
        for i, dz in enumerate((0.13, -0.13)):
            o.append(add_box(f"w_prong{i}", (0.44, 0.04, 0.04),
                             piv + Vector((0.74, 0, dz * 0.75)),
                             (0, math.radians(-6 + i * 12), 0), coll=coll, mat=M_TRIM))
            o.append(add_cyl(f"w_tip{i}", 0.035, 0.05,
                             piv + Vector((0.96, 0, dz * 0.62)),
                             (0, math.radians(90), 0), 10, coll=coll, mat=M_GLOW))
        # The arc gap itself: the brightest thing on the machine.
        o.append(add_cyl("w_gap", 0.045, 0.04, piv + Vector((0.92, 0, 0.02)),
                         (0, math.radians(90), 0), 14, coll=coll, mat=M_GLOW))
        o.append(add_box("w_coilbox", (0.16, 0.13, 0.14), piv + Vector((-0.20, 0, -0.08)),
                         coll=coll, mat=M_HULL))
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

    # ---- melee weapon: hardware only ---------------------------------------
    # **No projected energy is modelled here any more.** Every blade the five
    # energy weapons throw is drawn by `tools/energy_blade.py`; what Blender
    # builds is the machine that throws it — grip, conduit, emitter, mouth.
    #
    # The modelled blades were three concentric emissive layers, and at emission
    # 2.4/3.0 spread over any real width that clips all three channels: HALCYON's
    # azure, VESPER's aqua, CIRRUS's ice and NULLTIDE's cyan every one rendered
    # as the same flat white cone. The scythe hit this first (D132) and the
    # diagnosis there — a mesh has a silhouette, projected energy does not — is
    # equally true of the other four.
    #
    # `M_GLOW` and `M_ACC` are deliberately still used below. They are lamps and
    # vents bolted to the weapon, they keep their Freestyle contour, and they are
    # what gives the drawn blade somewhere to have come from.
    piv = px(*P["meleeWeapon"])
    o = []
    if spec["blade"] == "claw":
        # NOCTURNE: a forearm gauntlet throwing three long blades, built to the
        # supplied concept sheet. Mechanical throughout — no emissive blade,
        # because the point of this weapon is that it is *not* energy. What glows
        # is plumbing between the blade roots, not the blades.
        #
        # The reference's read comes from three things, in order of how much each
        # carries: blades far longer and finer than the housing that throws them;
        # a housing built as *stacked plates* rather than one block; and a banded
        # cuff at the wrist that makes the whole thing look socketed onto an arm.
        AX = (0, math.radians(90), 0)

        # ---- cuff: stacked rings at the back, where it meets the forearm ----
        for i in range(3):
            o.append(add_cyl(f"m_cuff{i}", 0.145 - i * 0.008, 0.055,
                             piv + Vector((-0.14 + i * 0.065, 0, 0)),
                             AX, 12, coll=coll, mat=M_FRAME))
        o.append(add_cyl("m_cuffband", 0.152, 0.022, piv + Vector((-0.10, 0, 0)),
                         AX, 12, coll=coll, mat=M_SUB))

        # ---- housing: layered plates, not one block -------------------------
        o.append(add_box("m_core", (0.34, 0.19, 0.24), piv + Vector((0.14, 0, 0)),
                         coll=coll, mat=M_FRAME))
        # Upper and lower armour plates, each a little shorter than the last, so
        # the silhouette steps down toward the blades instead of ending square.
        for i, (dx, dz, ln) in enumerate(((0.10, 0.135, 0.30), (0.16, -0.125, 0.26))):
            o.append(add_box(f"m_plate{i}", (ln, 0.165, 0.055),
                             piv + Vector((dx, 0, dz)),
                             (0, math.radians(-3 + i * 6), 0), coll=coll, mat=M_HULL))
        o.append(add_box("m_plateside", (0.28, 0.045, 0.19),
                         piv + Vector((0.13, 0.105, 0.01)), coll=coll, mat=M_SUB))
        o.append(add_box("m_shoulderplate", (0.16, 0.055, 0.21),
                         piv + Vector((-0.02, -0.10, 0.02)),
                         (0, math.radians(6), 0), coll=coll, mat=M_HULL))
        # The side disc the sheet puts on every view.
        o.append(add_cyl("m_disc", 0.072, 0.05, piv + Vector((0.20, 0.115, -0.03)),
                         (math.radians(90), 0, 0), 16, coll=coll, mat=M_SUB))
        o.append(add_cyl("m_discpin", 0.028, 0.07, piv + Vector((0.20, 0.13, -0.03)),
                         (math.radians(90), 0, 0), 10, coll=coll, mat=M_ACC))
        o += bolt_row("m_gbolt", 3, piv + Vector((0.02, 0.11, 0.10)),
                      Vector((0.08, 0, 0)), 0.014, coll, M_FRAME)

        # ---- knuckle block the blades are socketed into ---------------------
        o.append(add_box("m_knuckle", (0.14, 0.20, 0.26), piv + Vector((0.36, 0, -0.01)),
                         coll=coll, mat=M_HULL))

        # ---- three blades ---------------------------------------------------
        # Long, slim and finely tapered: on the sheet they run about as long as
        # the housing again, which is what makes the weapon read as claws rather
        # than as a spiked fist.
        for i, dz in enumerate((0.115, 0.0, -0.115)):
            spread = math.radians(-9 + i * 9)
            # Root shroud, the short bright collar each blade emerges from.
            o.append(add_box(f"m_root{i}", (0.13, 0.05, 0.075),
                             piv + Vector((0.44, 0, dz)), (0, spread, 0),
                             coll=coll, mat=M_SUB))
            # **The conduit.** Glow belongs between the blades, not on them.
            o.append(add_box(f"m_vein{i}", (0.10, 0.028, 0.026),
                             piv + Vector((0.44, 0, dz + 0.052)), (0, spread, 0),
                             coll=coll, mat=M_GLOW))
            o.append(add_box(f"m_blade{i}", (0.62, 0.032, 0.062),
                             piv + Vector((0.82, 0, dz * 1.18)), (0, spread, 0),
                             coll=coll, mat=M_TRIM))
            o.append(add_wedge(f"m_point{i}", (0.30, 0.026, 0.055), 2.4,
                               piv + Vector((1.28, 0, dz * 1.34)), (0, spread, 0),
                               coll=coll, mat=M_TRIM))
        # Outboard fins, shorter and swept, flanking the three.
        for i, dz in enumerate((0.20, -0.20)):
            o.append(add_wedge(f"m_fin{i}", (0.38, 0.022, 0.07), 2.0,
                               piv + Vector((0.68, 0.03, dz)),
                               (0, math.radians(-14 + i * 28), 0),
                               coll=coll, mat=M_SUB))
        split_melee(parts, o, piv, coll, pn)
    elif spec["blade"] == "bayonet":
        # VESPER: a spike emitter clamped under the railgun. A thrusting weapon -
        # no cutting edge, no sweep, just a point. The hardware is subordinate to
        # the gun and should look bolted on rather than designed in.
        AX = (0, math.radians(90), 0)
        o.append(add_box("m_clamp", (0.20, 0.12, 0.14), piv, coll=coll, mat=M_FRAME))
        o.append(add_box("m_rail", (0.34, 0.06, 0.06), piv + Vector((0.20, 0, 0.05)),
                         coll=coll, mat=M_SUB))
        # Conduit tapped off the rail: this weapon runs on the railgun's supply.
        o.append(add_box("m_conduit", (0.14, 0.040, 0.024),
                         piv + Vector((0.18, 0, 0.086)), coll=coll, mat=M_GLOW))
        o.append(add_cyl("m_collar", 0.058, 0.045, piv + Vector((0.14, 0, -0.02)),
                         AX, 6, coll=coll, mat=M_SUB))
        o.append(add_wedge("m_emitter", (0.13, 0.11, 0.12), 1.6, piv + Vector((0.24, 0, -0.02)),
                           AX, coll=coll, mat=M_HULL))
        # Mouth under the drawn spike's root at x=0.29.
        o.append(add_box("m_mouth", (0.035, 0.050, 0.050), piv + Vector((0.285, 0, -0.02)),
                         coll=coll, mat=M_GLOW))
        for i, dy in enumerate((0.052, -0.052)):
            o.append(add_box(f"m_prong{i}", (0.10, 0.022, 0.028),
                             piv + Vector((0.33, dy, -0.02)), coll=coll, mat=M_ACC))
        o.append(add_cyl("m_vent", 0.034, 0.070, piv + Vector((0.22, 0, -0.10)),
                         (math.radians(90), 0, 0), 10, coll=coll, mat=M_ACC))
        split_melee(parts, o, piv, coll, pn)
    elif spec["blade"] == "twindagger":
        # CIRRUS: two emitters on a shared mount, which is what an eight-hit
        # alternating flurry actually looks like.
        #
        # **The pair sits at +/-0.15, widened from +/-0.10.** The two blades are
        # separated on screen by nothing but this offset, and the camera's 15 deg
        # azimuth turns 0.10 of Y into 6 px of screen — at gameplay scale the two
        # merged into one fuzzy shard and the weapon stopped reading as twin.
        # `energy_blade.py`'s `strands` must carry the same number.
        AX = (0, math.radians(90), 0)
        SEP = 0.15
        o.append(add_box("m_mount", (0.16, 0.30, 0.12), piv, coll=coll, mat=M_FRAME))
        # Spine across the mount, tying the two emitters into one weapon.
        o.append(add_box("m_spine", (0.07, 0.34, 0.05), piv + Vector((0.07, 0, 0.045)),
                         coll=coll, mat=M_SUB))
        o.append(add_box("m_feed", (0.05, 0.26, 0.022), piv + Vector((0.07, 0, 0.078)),
                         coll=coll, mat=M_GLOW))
        for i, dy in enumerate((SEP, -SEP)):
            o.append(add_box(f"m_hilt{i}", (0.14, 0.07, 0.08),
                             piv + Vector((0.10, dy, 0.02)), coll=coll, mat=M_HULL))
            o.append(add_cyl(f"m_collar{i}", 0.048, 0.030, piv + Vector((0.15, dy, 0.02)),
                             AX, 6, coll=coll, mat=M_SUB))
            # Mouth under the drawn shard's root at x=0.21.
            o.append(add_cyl(f"m_mouth{i}", 0.034, 0.030, piv + Vector((0.205, dy, 0.02)),
                             AX, 12, coll=coll, mat=M_GLOW))
            for j, dz in enumerate((0.048, -0.048)):
                o.append(add_box(f"m_prong{i}{j}", (0.08, 0.020, 0.022),
                                 piv + Vector((0.24, dy, 0.02 + dz)), coll=coll, mat=M_ACC))
        split_melee(parts, o, piv, coll, pn)
    elif spec["blade"] == "scythe":
        # PYRE: a reaping scythe, replacing the cleaver it carried until D130.
        #
        # **The silhouette has to state the motion.** `reap` is the one strike on
        # the roster that ends *nearer* the wielder than it began — the blade is
        # thrown out wide and drawn back through the target — and a straight
        # chopping blade cannot express that. A hooked blade set across the end
        # of a haft can: the shape is the pull.
        # Per the supplied reference the blade is **projected energy**, not forged
        # steel: a long solid snath carrying an emitter head, and a glowing
        # crescent thrown from it — wide at the root, tapering to a fine point.
        # PYRE's glow is amber (1.00, 0.76, 0.30), so the crescent reads as flame,
        # which is the right element for the incendiary frame.
        # ---- the snath ---------------------------------------------------
        # Built to the supplied reference, which is a *machine*: alternating
        # knurled grip runs and hex collars, glowing conduit slots along its
        # length, a layered emitter head, and a finned counterweight. The plain
        # rod it replaced was most of why the blade looked pasted on — energy
        # with no visible plumbing has nowhere to have come from.
        AX = (0, math.radians(90), 0)

        # Finned counterweight at the butt.
        o.append(add_cyl("m_spike", 0.052, 0.20, piv + Vector((-0.30, 0, 0)),
                         AX, 8, coll=coll, cone_r2=0.004, mat=M_FRAME))
        for i in range(3):
            ang = math.radians(90 + i * 120)
            o.append(add_box(f"m_fin{i}", (0.13, 0.018, 0.09),
                             piv + Vector((-0.20, 0.05 * math.cos(ang), 0.05 * math.sin(ang))),
                             (ang, 0, 0), coll=coll, mat=M_FRAME))

        # Shaft: knurled runs between hex collars.
        RUNS = ((-0.10, 0.34), (0.40, 0.74), (0.80, 1.14), (1.20, 1.46))
        for i, (a, b) in enumerate(RUNS):
            mid, ln = (a + b) * 0.5, (b - a)
            o.append(add_cyl(f"m_run{i}", 0.044, ln, piv + Vector((mid, 0, 0)),
                             AX, 12, coll=coll, mat=M_FRAME))
            # Knurling: shallow rings, close enough to read as texture at scale.
            k = max(2, int(ln / 0.055))
            for j in range(k):
                o.append(add_cyl(f"m_knurl{i}_{j}", 0.050, 0.014,
                                 piv + Vector((a + 0.03 + j * (ln - 0.06) / max(1, k - 1), 0, 0)),
                                 AX, 10, coll=coll, mat=M_FRAME))
        for i, x in enumerate((0.37, 0.77, 1.17)):
            o.append(add_cyl(f"m_collar{i}", 0.072, 0.075, piv + Vector((x, 0, 0)),
                             AX, 6, coll=coll, mat=M_SUB))
            # **The conduit slot.** This is where the plasma is running from.
            o.append(add_box(f"m_conduit{i}", (0.030, 0.062, 0.030),
                             piv + Vector((x, 0, 0.052)), coll=coll, mat=M_GLOW))

        # ---- emitter head -------------------------------------------------
        # Layered angular plates rather than one block, with a gold wedge under
        # the mouth and twin prongs reaching past it. The blade roots at x=1.58,
        # so the mouth has to sit just behind that.
        o.append(add_box("m_neck", (0.14, 0.10, 0.12), piv + Vector((1.44, 0, 0.01)),
                         coll=coll, mat=M_SUB))
        o.append(add_box("m_headA", (0.26, 0.13, 0.20), piv + Vector((1.58, 0, 0.03)),
                         (0, math.radians(-6), 0), coll=coll, mat=M_HULL))
        o.append(add_box("m_headB", (0.20, 0.15, 0.11), piv + Vector((1.60, 0, -0.09)),
                         (0, math.radians(4), 0), coll=coll, mat=M_FRAME))
        # Gold wedge, the one warm note on the hardware.
        o.append(add_wedge("m_wedge", (0.15, 0.11, 0.13), 1.7,
                           piv + Vector((1.50, 0, -0.13)), (0, math.radians(96), 0),
                           coll=coll, mat=M_ACC))
        # Prongs reaching past the mouth, which the blade springs between.
        for i, dy in enumerate((0.058, -0.058)):
            o.append(add_box(f"m_prong{i}", (0.30, 0.028, 0.045),
                             piv + Vector((1.78, dy, 0.05)),
                             (0, math.radians(-7), 0), coll=coll, mat=M_FRAME))
        # The mouth itself: the brightest fitting on the weapon.
        o.append(add_box("m_mouth", (0.05, 0.075, 0.075), piv + Vector((1.60, 0, 0.02)),
                         coll=coll, mat=M_GLOW))
        o.append(add_cyl("m_vent", 0.048, 0.10, piv + Vector((1.52, 0, -0.16)),
                         (math.radians(90), 0, 0), 10, coll=coll, mat=M_ACC))
        # **The crescent itself is drawn, not modelled** — see the note at the top
        # of this section and `tools/energy_blade.py`. What used to live here was
        # three concentric swept bands on dedicated low-emission materials, tuned
        # down and down to stop the amber clipping to white, which is the shape of
        # a losing argument: a mesh has a silhouette and projected energy does not.
        #
        # The one number the two sides still have to agree on is where the blade
        # roots. **The mouth is at x=1.58 and the generator's arc starts there.**
        # An arc's tangent is perpendicular to its radius, so putting the centre
        # directly *behind* the emitter on the haft axis (cx = 1.58 - r) makes the
        # blade leave the head at ninety degrees and hook back toward the wielder.
        # That one placement is the whole difference between a scythe and a spear,
        # and it is now stated in `BLADES["pyre"]["arc"]`.
        split_melee(parts, o, piv, coll, pn)
    elif spec["blade"] == "baton":
        # NULLTIDE: an extended shock baton. **All hardware — this weapon
        # projects nothing**, which is why `nulltide` is not in
        # `tools/energy_blade.py`'s BLADES and its rig entry carries no `energy`.
        # The electricity is a separate drawn layer that crawls *along* the rod
        # rather than a blade springing from a mouth, and it is generated by
        # `tools/electric_baton.py`.
        #
        # Built as a telescoping baton at full extension: four concentric runs of
        # falling radius, each ending in a collar where the next one leaves. That
        # reads as *extended* rather than as a plain rod — the joints are the
        # whole tell, and they double as the emitters the arcs strike between.
        #
        # It runs to x=1.72 because the drawn cleaver it replaces reached 1.75,
        # and the sweep is authored against that length. A baton stopping at the
        # old haft's 1.15 would have quietly shortened the weapon by a third.
        AX = (0, math.radians(90), 0)
        # **Sized for gameplay scale, not for the render.** The first cut used
        # the glaive's own 0.048 haft radius throughout and read as an antenna:
        # the polearm had carried its mass in the discharge head, and a baton has
        # no head to carry it. Everything below is roughly 1.45x that, which is
        # what it takes for the rod to still be a *rod* at NULLTIDE's 0.89 rig
        # scale rather than a line.
        o.append(add_box("m_butt", (0.15, 0.13, 0.13), piv + Vector((-0.11, 0, 0)),
                         coll=coll, mat=M_HULL))
        # Grip: the only knurled run. A baton is held at one end, unlike the
        # polearm this replaces, which was gripped in two places.
        o.append(add_cyl("m_grip", 0.082, 0.40, piv + Vector((0.14, 0, 0)),
                         AX, 12, coll=coll, mat=M_FRAME))
        k = 7
        for j in range(k):
            o.append(add_cyl(f"m_knurl{j}", 0.092, 0.016,
                             piv + Vector((-0.02 + j * 0.048, 0, 0)),
                             AX, 10, coll=coll, mat=M_FRAME))
        # Arc core: the housing the whole weapon is powered from, sitting right
        # above the hand where a reference baton puts it. A block with a lit
        # window rather than a plain collar — it is the visual promise that the
        # rod is energised, made on the hardware before any arc is drawn.
        o.append(add_cyl("m_guard", 0.112, 0.058, piv + Vector((0.36, 0, 0)),
                         AX, 12, coll=coll, mat=M_ACC))
        o.append(add_box("m_core", (0.20, 0.15, 0.17), piv + Vector((0.47, 0, 0.01)),
                         coll=coll, mat=M_HULL))
        o.append(add_box("m_coreWin", (0.13, 0.062, 0.062),
                         piv + Vector((0.47, 0, 0.10)), coll=coll, mat=M_GLOW))
        o.append(add_box("m_coreTab", (0.07, 0.11, 0.09), piv + Vector((0.53, 0, -0.09)),
                         coll=coll, mat=M_ACC))
        # The telescoping runs. `(centre, half-length, radius)` — each starts
        # where the last ended, so the collars sit on the joins.
        SEGS = ((0.60, 0.20, 0.072), (0.98, 0.18, 0.060), (1.33, 0.17, 0.049))
        for i, (cx, half, r) in enumerate(SEGS):
            o.append(add_cyl(f"m_seg{i}", r, half * 2.0, piv + Vector((cx, 0, 0)),
                             AX, 12, coll=coll, mat=M_FRAME if i == 0 else M_SUB))
            # Collar at the shoulder of each run, with a live stud on top of it:
            # these are the points the arcs are drawn between.
            o.append(add_cyl(f"m_collar{i}", r + 0.028, 0.046,
                             piv + Vector((cx - half, 0, 0)), AX, 10, coll=coll, mat=M_ACC))
            o.append(add_box(f"m_stud{i}", (0.034, 0.052, 0.034),
                             piv + Vector((cx - half, 0, r + 0.026)), coll=coll, mat=M_GLOW))
        # Power conduits running the full live length, core housing to head, so
        # the arcs have a visible source on the hardware itself. Two channels
        # rather than one: at the 15°/9° camera a single top-facing strip is
        # foreshortened almost to nothing, and the side channel is what actually
        # carries the line down the rod on screen. Sunk against the segments —
        # at 0.030 clear the first one read as a separate wire floating alongside.
        for i, (dy, dz) in enumerate(((0.0, 0.062), (0.058, 0.030))):
            o.append(add_box(f"m_conduit{i}", (0.90, 0.026, 0.022),
                             piv + Vector((0.98, dy, dz)), coll=coll, mat=M_GLOW))
        # **The electrified strike end, and it is where the weapon's mass lives.**
        #
        # The first pass finished the rod with a small cap and the whole thing
        # read as an antenna. The reference is unambiguous about why: a baton
        # carries a *head* — a caged assembly roughly three times the shaft
        # radius holding lit rods, about a sixth of the total length. That is the
        # silhouette that says "weapon" at 0.89 rig scale, and nothing further
        # down the shaft can supply it.
        o.append(add_cyl("m_tipcol", 0.078, 0.062, piv + Vector((1.44, 0, 0)),
                         AX, 12, coll=coll, mat=M_ACC))
        # Lit core rods, visible *through* the cage.
        for i, dz in enumerate((0.045, -0.045)):
            o.append(add_cyl(f"m_corerod{i}", 0.030, 0.30,
                             piv + Vector((1.62, 0, dz)), AX, 8, coll=coll, mat=M_GLOW))
        o.append(add_cyl("m_headcore", 0.052, 0.32, piv + Vector((1.62, 0, 0)),
                         AX, 10, coll=coll, mat=M_GLOW))
        # The cage: staggered armour staves around the core, so the head reads as
        # a lantern of segments rather than one solid block.
        for i in range(6):
            a = i * math.tau / 6.0
            dy, dz = math.cos(a) * 0.088, math.sin(a) * 0.088
            long_stave = (i % 2) == 0
            o.append(add_box(f"m_stave{i}",
                             (0.30 if long_stave else 0.22, 0.048, 0.048),
                             piv + Vector((1.60 if long_stave else 1.66, dy, dz)),
                             coll=coll, mat=M_HULL if long_stave else M_SUB))
        # Bands closing the cage at both ends.
        for i, x in enumerate((1.48, 1.78)):
            o.append(add_cyl(f"m_headband{i}", 0.112, 0.048, piv + Vector((x, 0, 0)),
                             AX, 12, coll=coll, mat=M_ACC))
        # Blunt striking cap: this is a concussion weapon, so it ends flat.
        o.append(add_cyl("m_cap", 0.086, 0.070, piv + Vector((1.83, 0, 0)),
                         AX, 12, coll=coll, cone_r2=0.070, mat=M_FRAME))
        o.append(add_box("m_capWin", (0.030, 0.055, 0.055),
                         piv + Vector((1.86, 0, 0)), coll=coll, mat=M_GLOW))
        split_melee(parts, o, piv, coll, pn)
    elif spec["blade"] == "ramshield":
        # OBELISK: a powered tower shield with a central ram boss. It bashes; the
        # face is the weapon, so the silhouette is a slab, not an edge.
        o.append(add_box("m_arm", (0.22, 0.16, 0.18), piv, coll=coll, mat=M_FRAME))
        o.append(add_box("m_face", (0.16, 0.54, 0.86), piv + Vector((0.26, 0, 0.02)),
                         (0, math.radians(-4), 0), coll=coll, mat=M_HULL))
        o.append(add_box("m_rim", (0.06, 0.60, 0.92), piv + Vector((0.20, 0, 0.02)),
                         (0, math.radians(-4), 0), coll=coll, mat=M_SUB))
        # Ram boss: the part that actually connects.
        o.append(add_cyl("m_boss", 0.15, 0.20, piv + Vector((0.40, 0, 0.02)),
                         (0, math.radians(90), 0), 16, coll=coll, cone_r2=0.11, mat=M_ACC))
        o.append(add_cyl("m_spike", 0.06, 0.16, piv + Vector((0.52, 0, 0.02)),
                         (0, math.radians(90), 0), 12, coll=coll, cone_r2=0.02, mat=M_FRAME))
        # Impact buffers along the leading face.
        for i, dz in enumerate((0.30, 0.0, -0.30)):
            o.append(add_box(f"m_buf{i}", (0.05, 0.44, 0.08),
                             piv + Vector((0.35, 0, dz)), coll=coll, mat=M_GLOW))
        o.append(add_box("m_strut", (0.24, 0.08, 0.10), piv + Vector((0.12, 0, -0.20)),
                         coll=coll, mat=M_TRIM))
        split_melee(parts, o, piv, coll, pn)
    elif spec["blade"] == "pile":
        # A pile driver: a blunt ram in a guide cage. Siege equipment, not a
        # sword - it hits once, enormously.
        o.append(add_box("m_mount", (0.26, 0.22, 0.26), piv, coll=coll, mat=M_FRAME))
        o.append(add_box("m_cage", (0.72, 0.26, 0.30), piv + Vector((0.46, 0, 0)),
                         coll=coll, mat=M_HULL))
        for i, dz in enumerate((0.17, -0.17)):
            o.append(add_box(f"m_rail{i}", (0.80, 0.05, 0.05),
                             piv + Vector((0.48, 0, dz)), coll=coll, mat=M_TRIM))
        o.append(add_cyl("m_ram", 0.11, 0.86, piv + Vector((0.62, 0, 0)),
                         (0, math.radians(90), 0), 16, coll=coll, mat=M_SUB))
        o.append(add_cyl("m_head", 0.16, 0.18, piv + Vector((1.10, 0, 0)),
                         (0, math.radians(90), 0), 18, coll=coll, mat=M_ACC))
        o.append(add_cyl("m_face", 0.13, 0.04, piv + Vector((1.20, 0, 0)),
                         (0, math.radians(90), 0), 18, coll=coll, mat=M_FRAME))
        # Hydraulic accumulator behind the ram.
        o.append(add_cyl("m_accum", 0.09, 0.28, piv + Vector((-0.08, 0, 0.10)),
                         (0, math.radians(90), 0), 12, coll=coll, mat=M_GLOW))
        split_melee(parts, o, piv, coll, pn)
    else:
        # HALCYON: a Concord beam saber. The most *machined* weapon on the
        # roster — this is issued equipment from the faction that builds to a
        # standard, so it reads as turned and collared rather than forged.
        AX = (0, math.radians(90), 0)
        # Hilt: knurled grip run between a pommel and a hex collar.
        o.append(add_box("m_grip", (0.19, 0.10, 0.10), piv, coll=coll, mat=M_FRAME))
        for i in range(5):
            o.append(add_cyl(f"m_knurl{i}", 0.058, 0.014,
                             piv + Vector((-0.07 + i * 0.035, 0, 0)),
                             AX, 10, coll=coll, mat=M_FRAME))
        o.append(add_box("m_pommel", (0.06, 0.09, 0.09), piv + Vector((-0.13, 0, 0)),
                         coll=coll, mat=M_HULL))
        o.append(add_cyl("m_collar", 0.070, 0.055, piv + Vector((0.09, 0, 0)),
                         AX, 6, coll=coll, mat=M_SUB))
        # **The conduit.** A run of plasma visibly entering the emitter, so the
        # blade has plumbing behind it rather than starting at a bare lens.
        o.append(add_box("m_conduit", (0.10, 0.052, 0.026),
                         piv + Vector((0.09, 0, 0.050)), coll=coll, mat=M_GLOW))
        # Emitter: two offset plates and a shroud, not one block.
        o.append(add_wedge("m_emitter", (0.13, 0.13, 0.15), 1.5, piv + Vector((0.15, 0, 0)),
                           AX, coll=coll, mat=M_HULL))
        o.append(add_box("m_headA", (0.09, 0.11, 0.13), piv + Vector((0.20, 0, 0.01)),
                         (0, math.radians(-5), 0), coll=coll, mat=M_SUB))
        # The mouth: brightest fitting on the weapon, sitting under the drawn
        # blade's root at x=0.25.
        o.append(add_box("m_mouth", (0.04, 0.062, 0.062), piv + Vector((0.245, 0, 0)),
                         coll=coll, mat=M_GLOW))
        o.append(add_cyl("m_vent", 0.040, 0.085, piv + Vector((0.14, 0, -0.11)),
                         (math.radians(90), 0, 0), 10, coll=coll, mat=M_ACC))
        for i, dz in enumerate((0.078, -0.078)):
            o.append(add_box(f"m_prong{i}", (0.13, 0.032, 0.034),
                             piv + Vector((0.28, 0, dz)),
                             (0, math.radians(-4 + i * 8), 0), coll=coll, mat=M_ACC))
        split_melee(parts, o, piv, coll, pn)

    # ---- thrusters: rear-facing bells -------------------------------------
    boost = spec["booster"]
    for key, near in (("leftThruster", False), ("rightThruster", True)):
        piv = px(*P[key])
        shell = M_HULL if near else M_FAR
        o = []
        if boost == "quad":
            # Siege walker: a stacked block of four small burners rather than one
            # big one - lifting mass, not chasing anybody.
            o.append(add_box(f"t_house_{key}", (0.34, 0.34, 0.44), piv, coll=coll, mat=shell))
            o.append(add_box(f"t_plate_{key}", (0.10, 0.38, 0.48), piv + Vector((0.12, 0, 0)),
                             coll=coll, mat=M_SUB))
            for i, (dy, dz) in enumerate(((0.11, 0.13), (-0.11, 0.13), (0.11, -0.13), (-0.11, -0.13))):
                o.append(add_cyl(f"t_bell_{key}{i}", 0.088, 0.22,
                                 piv + Vector((-0.24, dy, dz)),
                                 (0, math.radians(90), 0), 14, coll=coll,
                                 cone_r2=0.058, mat=M_FRAME))
                o.append(add_cyl(f"t_in_{key}{i}", 0.062, 0.04,
                                 piv + Vector((-0.35, dy, dz)),
                                 (0, math.radians(90), 0), 14, coll=coll, mat=M_GLOW))
            o.append(add_box(f"t_brace_{key}", (0.24, 0.06, 0.42), piv + Vector((-0.16, 0, 0)),
                             coll=coll, mat=M_ACC))
        elif boost == "wing":
            # Skirmisher / EW frame: a swept vectoring vane with the nozzle set
            # into its trailing edge. Reads as an aircraft, not a rocket.
            o.append(add_wedge(f"t_root_{key}", (0.24, 0.20, 0.34), 0.5, piv,
                               (0, math.radians(-90), 0), coll=coll, mat=shell))
            o.append(add_box(f"t_wing_{key}", (0.54, 0.06, 0.30),
                             piv + Vector((-0.20, 0, 0.10)), (0, math.radians(14), 0),
                             coll=coll, mat=M_SUB))
            o.append(add_wedge(f"t_tip_{key}", (0.20, 0.05, 0.16), 1.6,
                               piv + Vector((-0.50, 0, 0.18)), (0, math.radians(14), 0),
                               coll=coll, mat=M_TRIM))
            o.append(add_cyl(f"t_bell_{key}", 0.105, 0.24, piv + Vector((-0.26, 0, -0.06)),
                             (0, math.radians(90), 0), 16, coll=coll, cone_r2=0.07, mat=M_FRAME))
            o.append(add_cyl(f"t_inner_{key}", 0.078, 0.045, piv + Vector((-0.38, 0, -0.06)),
                             (0, math.radians(90), 0), 16, coll=coll, mat=M_GLOW))
            # Leading-edge strip: the running light that makes it read at speed.
            o.append(add_box(f"t_edge_{key}", (0.50, 0.035, 0.035),
                             piv + Vector((-0.20, 0, 0.24)), (0, math.radians(14), 0),
                             coll=coll, mat=M_ACC))
        elif boost == "twin":
            # Interceptor: a pair of slim high-velocity bells.
            o.append(add_wedge(f"t_house_{key}", (0.30, 0.24, 0.52), 0.40, piv,
                               (0, math.radians(-90), 0), coll=coll, mat=shell))
            o.append(add_wedge(f"t_cowl_{key}", (0.30, 0.26, 0.14), 0.46,
                               piv + Vector((0.10, 0, 0.03)),
                               (0, math.radians(-90), 0), coll=coll, mat=M_SUB))
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
        # **Exclude projected energy from the line pass.** In the reference the
        # hardware carries a black contour and the energy carries none; a blade
        # with a contour reads as a painted metal object rather than as light.
        #
        # By *collection*, not by face mark. Face marks were tried first and do
        # nothing: `.freestyle_face` survives the join — 303 of 439 faces marked
        # — and the line pass ignores it, at both `ONE` and `BOTH`, measured to
        # the pixel. Collection membership is honoured, which is why
        # `split_melee` keeps the blade as its own object.
        try:
            noline = ensure_collection(NOLINE_COLLECTION)
            lineset.select_by_collection = True
            lineset.collection = noline
            lineset.collection_negation = "EXCLUSIVE"
        except (AttributeError, TypeError):
            pass
        style = lineset.linestyle
        # **This is a LINEAR value and it was never black.** (0.035, 0.040,
        # 0.055) through the Standard view transform lands at display luminance
        # ~56 - and because the line work is the darkest thing on a mech, that
        # single number was the floor of every sprite in the game. Measured:
        # min 54, p05 56, and **0.0 %** of any mech below luminance 30, against
        # 16.2 % in the 2005 reference. The machines had no blacks at all, which
        # is most of the "untextured Blender model" read - every greeble, bolt
        # row and overlapping plate was rendering into the same mid band with
        # nothing to separate it.
        #
        # Retuned to land on the reference's actual floor of 14, not on pure
        # black, and keeping the original blue-black tint ratio. With this plus
        # the lighting below, HALCYON measures p25 55 / median 124 / 13.1 %
        # under 30, against the reference's 59 / 126 / 16.2 %.
        style.color = (0.0045, 0.0051, 0.0070)
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
    # Low ambient: the reference art has genuinely dark undersides, and a bright
    # world flattens the forms into soft plastic.
    bg.inputs["Color"].default_value = (0.16, 0.19, 0.26, 1.0)
    # 0.40 -> 0.25. Ambient turned out to be a weak lever on the dark end - swept
    # 0.40/0.20/0.10/0.04 and the floor moved only 54 -> 44 - so this is a small
    # trim, not the fix. The fill light below is what was lifting the shadows.
    bg.inputs["Strength"].default_value = 0.25
    nt.links.new(bg.outputs[0], out.inputs[0])
    scene.world = world

    # `use_gtao` was set here for years and **has done nothing since Blender 4.2**.
    # EEVEE Next removed it along with every `gtao_*` property; the setattr sat
    # inside this try/except and its AttributeError was swallowed in silence. The
    # renders had no ambient occlusion at all, which on geometry this blocky is a
    # real part of why the sprites read as untextured boxes.
    #
    # Both spellings are attempted so the script still works on 3.x/4.0.
    #
    # **The same silent failure happened twice more in this very list.**
    # `fast_gi_method` was `"AMBIENT_OCCLUSION"`, which is not a valid
    # identifier - Blender 5.1 spells it `AMBIENT_OCCLUSION_ONLY` - so the
    # assignment raised, was swallowed here, and fast GI has been running in
    # GLOBAL_ILLUMINATION mode (bouncing light, i.e. *lifting* the crevices this
    # was meant to darken) for its entire existence. Verified against
    # `scene.eevee.bl_rna.properties['fast_gi_method'].enum_items`.
    #
    # **Check the value stuck.** A try/except around a setattr will hide a typo
    # in an enum forever, and this list has now done exactly that twice.
    for opt, val in (
        ("taa_render_samples", 128),     # 64 -> 128: cleaner AA at sprite size
        ("use_gtao", True),              # <=4.1 only
        ("gtao_distance", 0.35),         # <=4.1 only
        ("use_raytracing", True),        # 4.2+ EEVEE Next
        ("use_fast_gi", True),
        ("fast_gi_method", "AMBIENT_OCCLUSION_ONLY"),
        # 0.5 BU was shorter than the parts themselves (0.5-1.5 BU), so the
        # occlusion had nothing to reach across.
        ("fast_gi_distance", 1.6),
        ("fast_gi_quality", 0.5),
        ("fast_gi_resolution", "1"),
        ("fast_gi_ray_count", 6),
        ("fast_gi_step_count", 16),
        # Both were at the floor. Parts are rendered one at a time, so this only
        # buys self-shadowing - but measured 3.84 mean|d| on an isolated part.
        ("shadow_ray_count", 4),
        ("shadow_step_count", 16),
    ):
        try:
            setattr(scene.eevee, opt, val)
        except (AttributeError, TypeError):
            continue
        got = getattr(scene.eevee, opt, None)
        if isinstance(val, str) and got != val:
            print(f"  ! eevee.{opt} = {val!r} did not stick (is {got!r})")

    rt = getattr(scene.eevee, "ray_tracing_options", None)
    if rt is not None:
        for opt, val in (("resolution_scale", "1"), ("screen_trace_quality", 0.75)):
            try:
                setattr(rt, opt, val)
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

    # Hard, small key for crisp terminators; minimal fill so shadowed planes stay
    # genuinely dark; a tight rim to separate the silhouette from the arena.
    #
    # **The key was 1500 and that is what made the sprites read as plastic** — not
    # the flat albedo it was blamed on. Sitting above at z=4.0 it drove every
    # upward-facing panel to pure white: measured against CATHEDRAL YARD, the
    # mechs ran a 95th percentile of 238 with 4.3 % of the armour at >=250, while
    # nothing in the entire stage exceeds ~208 (its sodium practicals) and the
    # deck's steel sits at 44.
    #
    # Swept against the real backdrop:
    #
    #   energy   mean   p95    >=250
    #   1500    120.9  238.3   4.26 %
    #   1100    111.5  231.4   3.79 %
    #    800    102.4  212.2   2.08 %
    #
    # 800 puts the 95th percentile at 212, i.e. level with the brightest thing in
    # the arena, and leaves the armour still 2.3x the deck's value so a machine
    # reads clearly against it. The residual >=250 is the emissive accent and
    # glow cores, which are *supposed* to be white.
    # **1150, not 800.** D128 dropped this to 800 to pull the machines down to
    # the deck's luminance, on the theory that matching the stage's value register
    # was what "belonging" meant. That was wrong in both directions: the reference
    # keeps its machines *brighter* than their background, and a mech that shares
    # the deck's value stops reading as the foreground subject. 1150 keeps the
    # blowout fix — the defect was armour at pure white, not armour being bright —
    # while restoring the separation.
    lamp("BSR_key", "AREA", (-2.6, -3.0, 4.0), 1150.0, (1.0, 0.97, 0.92), size=1.4)
    # **120 -> 60. The fill was what kept the shadow side off the floor.**
    # Swept 120/60/25/0 against a black line: the darkest pixel went 49/34/16/11
    # and p25 went 74/68/66/66. 0 is too far - the shadow side loses its form -
    # and 25 overshot the reference (p25 48 against its 59). 60 lands p25 at 55
    # and the median at 124, which is the reference's 59 and 126.
    lamp("BSR_fill", "AREA", (3.8, -2.6, 0.2), 60.0, (0.58, 0.70, 0.95), size=5.0)
    # The rim does figure-ground separation on its own terms: it lights only the
    # edge facing away from camera, so it lifts the silhouette off a dark
    # backdrop without adding a single lumen to the broad faces that blow out.
    # Cheaper contrast than the key, and warm, to sit with the yard's sodium.
    lamp("BSR_rim", "AREA", (1.0, 3.6, 2.6), 640.0, (1.00, 0.82, 0.66), size=1.8)
    # 55 -> 25, same reason as the fill: it lit the undersides back up.
    lamp("BSR_bounce", "AREA", (0.0, -1.4, -3.4), 25.0, (0.45, 0.55, 0.85), size=5.0)


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


def required_tile(obj, cam):
    """
    Smallest tile (px, multiple of TILE_STEP) that fully contains `obj` when it
    is rendered centred on its own pivot.

    The part's bounding-box corners are projected onto the camera's screen axes
    and measured from the pivot, so the result covers the actual silhouette
    rather than an axis-aligned guess.
    """
    basis = cam.matrix_world.to_3x3()
    right = (basis @ Vector((1.0, 0.0, 0.0))).normalized()
    up = (basis @ Vector((0.0, 1.0, 0.0))).normalized()

    # bound_box is in local space; apply rotation/scale but not the location, as
    # the part is moved to the origin for its render.
    rot_scale = obj.matrix_world.to_3x3()
    half_bu = 0.0
    for corner in obj.bound_box:
        v = rot_scale @ Vector(corner)
        half_bu = max(half_bu, abs(v.dot(right)), abs(v.dot(up)))

    need_px = 2.0 * half_bu * PX_PER_BU + 2.0 * TILE_MARGIN_PX
    steps = math.ceil(need_px / TILE_STEP)
    return max(TILE, min(TILE_MAX, steps * TILE_STEP))


def render_one_part(obj, out_dir, mech_id, part, manifest):
    """
    Renders a single part, centred on its own pivot, and records its manifest row.

    Split out of `render_parts` so one part can be re-rendered on its own — a full
    eight-mech pass is ~112 renders, and redoing all of them to change one drone
    is both slow and an invitation to disturb art that was already correct. The
    caller is responsible for hiding everything else and restoring render state.
    """
    scene = bpy.context.scene
    cam = scene.camera

    saved_loc = tuple(obj.location)
    obj.location = (0.0, 0.0, 0.0)
    obj.hide_render = False
    # Decals are separate objects parented to the part, so the caller's
    # hide-everything-else pass hides them too and the markings would render on
    # nothing. They follow the move to the origin for free, being children.
    decals = [c for c in obj.children if c.name.endswith("_decal")]
    for dcl in decals:
        dcl.hide_render = False

    # Frame this part on its own, keeping PX_PER_BU fixed.
    tile = required_tile(obj, cam)
    scene.render.resolution_x = tile
    scene.render.resolution_y = tile
    cam.data.ortho_scale = tile / PX_PER_BU

    path = os.path.join(out_dir, f"{mech_id}_{part}.png")
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)

    obj.hide_render = True
    for dcl in decals:
        dcl.hide_render = True
    obj.location = saved_loc

    dims = tuple(round(v, 4) for v in obj.dimensions)
    manifest.setdefault(mech_id, {})[part] = {
        "file": os.path.basename(path),
        "tile": tile,
        "dims_bu": dims,
        "dims_logical_px": tuple(round(v * LOGICAL_PER_BU, 1) for v in dims),
    }
    return tile


def render_parts(coll, out_dir, mech_id, manifest):
    """Renders each part centred on its own pivot to <out_dir>/<mech>_<part>.png."""
    os.makedirs(out_dir, exist_ok=True)
    scene = bpy.context.scene
    cam = scene.camera

    mech_objs = {o.name: o for o in coll.objects if o.type == "MESH"}
    # The drone lives in the same collection but is not part of the rig; it is
    # rendered alongside so it shares the camera, lighting and outline settings.
    wanted = list(PART_ORDER) + ["drone"]
    # Optional parts render when the chassis has them and are skipped silently
    # when it does not — a weapon with no energy blade is not a build fault.
    wanted += [n for n in OPTIONAL_PARTS if f"{mech_id}_{n}" in mech_objs]
    missing = [n for n in wanted if f"{mech_id}_{n}" not in mech_objs]
    if missing:
        raise RuntimeError(
            f"{mech_id}: missing part objects {missing}. "
            f"Collection holds {sorted(mech_objs)}"
        )

    all_meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    saved_hide = {o.name: o.hide_render for o in all_meshes}
    for o in all_meshes:
        o.hide_render = True

    saved_ortho = cam.data.ortho_scale
    try:
        for name in wanted:
            render_one_part(mech_objs[f"{mech_id}_{name}"], out_dir, mech_id, name, manifest)
    finally:
        cam.data.ortho_scale = saved_ortho
        scene.render.resolution_x = TILE
        scene.render.resolution_y = TILE
        for o in all_meshes:
            o.hide_render = saved_hide.get(o.name, False)


def render_assembled(coll, out_path, ortho=4.0):
    """A single framed render of the whole mech, for docs/preview."""
    scene = bpy.context.scene
    cam = bpy.context.scene.camera
    prev_scale = cam.data.ortho_scale
    prev_x, prev_y = scene.render.resolution_x, scene.render.resolution_y

    all_meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    # The drone shares the collection but sits at the origin, which would drop it
    # through the middle of the assembled chassis. It gets its own preview.
    members = set(o.name for o in coll.objects if not o.name.endswith("_drone"))
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


def build_all(project_root, only=None):
    """Builds the roster, renders parts + previews, saves the .blend.

    `only` is an optional iterable of mech ids, for iterating on a single
    chassis without paying for a full eight-mech render.
    """
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

    # Say so, loudly, before spending twelve minutes rendering. The surface maps
    # are an optional dependency by design, and that silence once shipped a
    # complete roster with no weathering on it.
    _missing = [f for f in ("plate_wear.png", "rust_mask.png", "plate_rough.png")
                if _load_image(f, non_color=True) is None]
    if _missing:
        print("=" * 70)
        print(f"  WARNING: surface textures NOT found: {', '.join(_missing)}")
        print(f"  looked in: {_texture_dir()!r}")
        print("  The build will run, but every mech will be procedural-only.")
        print("=" * 70)
    else:
        print(f"  surface textures OK, from {_texture_dir()!r}")

    sprites = os.path.join(project_root, "assets", "sprites", "mechs")
    debug = os.path.join(project_root, "renders", "debug")
    blend_dir = os.path.join(project_root, "assets", "blender")
    for d in (sprites, debug, blend_dir):
        os.makedirs(d, exist_ok=True)

    manifest = {}
    built = {}
    # Every chassis in CHASSIS, so adding a mech is a data edit rather than a
    # code edit. `only` builds a subset while iterating on one machine's
    # geometry — a full eight-mech run renders ~112 part sprites.
    order = [m for m in CHASSIS if only is None or m in only]
    for mech_id in order:
        coll, _parts = build_mech(mech_id)
        build_drone(mech_id)
        built[mech_id] = coll
        render_parts(coll, sprites, mech_id, manifest)
        render_assembled(coll, os.path.join(debug, f"{mech_id}_assembled.png"))

    # Spread them along +X so the saved .blend shows the roster side by side
    # instead of eight machines occupying the same space. Rendering is already
    # done by this point, so the offset cannot affect any sprite.
    for i, mech_id in enumerate(order):
        if i == 0:
            continue
        for obj in built[mech_id].objects:
            obj.location.x += 4.0 * i

    meta = {
        "px_per_bu": PX_PER_BU,
        "display_scale": DISPLAY_SCALE,
        "logical_per_bu": LOGICAL_PER_BU,
        "tile": TILE,
        "tile_note": "Default tile. Parts that overrun it are rendered larger; "
                     "see parts.<mech>.<part>.tile. px_per_bu is identical for "
                     "every tile size, so only the transparent margin changes.",
        "ortho_scale": ORTHO_SCALE,
        "outlines": outlines,
        "camera": {
            "azimuth_deg": math.degrees(CAM_AZIMUTH),
            "elevation_deg": math.degrees(CAM_ELEVATION),
        },
        "note": "Every PNG is square with the part pivot at the exact centre; "
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
