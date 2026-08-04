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
        "blade": "cleaver",
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
        "blade": "glaive",
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
    """Textures live beside the .blend, in `assets/blender/textures`."""
    if _TEXTURE_DIR_OVERRIDE:
        return _TEXTURE_DIR_OVERRIDE
    if bpy.data.filepath:
        return os.path.join(os.path.dirname(bpy.data.filepath), "textures")
    return None


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
BUMP_STRENGTH = 0.40

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
        rough=0.26, cavity=0.75, seam=0.95, seam_dark=0.14,
    ),
    # Excavation walkers "rated for seam collapse and falling ore", rebuilt for
    # yard defence. The most beaten hardware on the roster: thick scuffed paint,
    # impact scarring, ore dust in every recess.
    "IRONWAKE COLLIERY": dict(
        wear=1.00, broad=0.85, rust=0.72, rust_gate=0.40,
        rough=0.52, cavity=1.00, seam=0.90, seam_dark=0.16,
    ),
    # Concord airframes "rebuilt to Pact standards and returned to service
    # without Concord certification". A machine with a paint history: the
    # heaviest broad tonal drift on the roster, standing in for panels resprayed
    # at different times, over corrosion that was painted rather than cured.
    "EMBERLINE PACT": dict(
        wear=0.80, broad=1.00, rust=0.55, rust_gate=0.52,
        rough=0.44, cavity=0.90, seam=0.95, seam_dark=0.15,
    ),
    # "Assembled from salvage, copied patterns and recovered systems. Individual
    # machines differ substantially." Barely painted at all — CIRRUS is already
    # the one unpainted machine in the palette notes. Bare alloy scuffs bright
    # rather than dark, so wear is high and rust is low: salvage crews run
    # corrosion-resistant recovered stock, they just never finish it.
    "FREE LATITUDE": dict(
        wear=0.95, broad=0.60, rust=0.22, rust_gate=0.66,
        rough=0.58, cavity=0.85, seam=0.80, seam_dark=0.22,
    ),
    # "Built for short engagements and replacement from contract revenue."
    # Cheap thin paint, no refit budget, and — PYRE being the incendiary frame —
    # scorched by its own weapon. Soot rather than rust.
    "ASHFALL IRREGULARS": dict(
        wear=0.88, broad=0.75, rust=0.38, rust_gate=0.58,
        rough=0.46, cavity=0.95, seam=0.85, seam_dark=0.10,
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


def make_material(name, rgb, emission=0.0, roughness=0.45, metallic=0.25, detail=True,
                  surface=None):
    """
    Armour material with procedural surface interest plus photographic wear.

    Flat albedo is what makes an untextured model read as "clunky plastic". The
    reference sprites have machined highlights along every edge, panel seams, and
    uneven grime. The procedural half generates:

      * Pointiness  -> bright worn edges (and slightly glossier there)
      * Wave x2     -> a panel-seam grid in object space
      * Noise x2    -> fine grime plus broad tonal drift

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
    s_seam = sf.get("seam", 0.90)
    s_seam_dark = sf.get("seam_dark", 0.16)
    s_grime = sf.get("grime", RUST_RGB)

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

        # Seams were mixed at 0.45 toward rgb*0.40, which on a part occupying
        # 35-100 px produced a line you had to be told was there. Because each
        # part is rendered *in isolation* — `render_parts` hides every other mesh,
        # so nothing ever shadows anything — panel structure is one of the only
        # sources of depth a sprite has. It is now near-black and near-opaque.
        seam_fac = nt.nodes.new("ShaderNodeMath")
        seam_fac.operation = "MULTIPLY"
        seam_fac.inputs[1].default_value = s_seam
        nt.links.new(seam_inv.outputs[0], seam_fac.inputs[0])
        _n3, c3 = _mix(nt, seam_fac.outputs[0], c2, _scale_rgb(rgb, s_seam_dark))

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
            broad_f = nt.nodes.new("ShaderNodeMath")
            broad_f.operation = "MULTIPLY"
            broad_f.inputs[1].default_value = s_broad
            nt.links.new(broad_tex.outputs["Color"], broad_f.inputs[0])
            _nb, surf = _mix(nt, broad_f.outputs[0], surf, _scale_rgb(rgb, BROAD_DARK))

        wear_tex = _tex(nt, coord, "plate_wear.png", non_color=True)
        if wear_tex is not None:
            wear_fac = nt.nodes.new("ShaderNodeMath")
            wear_fac.operation = "MULTIPLY"
            wear_fac.inputs[1].default_value = s_wear
            nt.links.new(wear_tex.outputs["Color"], wear_fac.inputs[0])
            _nw, surf = _mix(nt, wear_fac.outputs[0], surf, _scale_rgb(rgb, WEAR_DARK))

        rust_tex = _tex(nt, coord, "rust_mask.png", non_color=True)
        if rust_tex is not None:
            # Gated sparse. Full-coverage rust is an abandoned wreck; these are
            # machines somebody maintains and flies.
            rust_ramp = nt.nodes.new("ShaderNodeValToRGB")
            rust_ramp.color_ramp.elements[0].position = s_rust_gate
            rust_ramp.color_ramp.elements[1].position = min(1.0, s_rust_gate + 0.30)
            nt.links.new(rust_tex.outputs["Color"], rust_ramp.inputs["Fac"])
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
            nt.links.new(wear_tex.outputs["Color"], bump.inputs["Height"])
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
    return {
        # Per-faction finish; see FACTION_SURFACE.
        "hull": make_material(f"{mech_id}_hull", pal["primary"], roughness=0.44, surface=_sf),
        "far": make_material(f"{mech_id}_far", pal["far"], roughness=0.5, surface=_sf),
        "sub": make_material(f"{mech_id}_sub", pal["secondary"], roughness=0.5, surface=_sf),
        "trim": make_material(f"{mech_id}_trim", pal["trim"], roughness=0.40, surface=_sf),
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
    M_HULL = make_material(f"{mech_id}_hull", pal["primary"], roughness=0.44, surface=_sf)
    M_FAR = make_material(f"{mech_id}_far", pal["far"], roughness=0.5, surface=_sf)
    M_SUB = make_material(f"{mech_id}_sub", pal["secondary"], roughness=0.5, surface=_sf)
    M_TRIM = make_material(f"{mech_id}_trim", pal["trim"], roughness=0.40, surface=_sf)
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

    # ---- melee weapon: beam saber ------------------------------------------
    # A real model, not a VFX streak: machined hilt, emitter shroud, then the
    # blade built as three concentric layers - a white-hot core, a saturated
    # inner sheath and a soft outer bloom - which is what reads as a beam blade
    # in Gundam-style art rather than a glowing stick.
    piv = px(*P["meleeWeapon"])
    o = []
    M_CORE = make_material(f"{mech_id}_beamcore", (1.0, 1.0, 1.0),
                           emission=3.0, roughness=0.1, metallic=0.0, detail=False)
    M_BEAM = make_material(f"{mech_id}_beam", pal["glow"],
                           emission=2.4, roughness=0.15, metallic=0.0, detail=False)
    blade_len = 1.28
    if spec["blade"] == "claw":
        # A hydraulic breaching claw: three powered tines on a wrist block, with
        # rams behind them. Mechanical throughout - no emissive blade, because
        # the point of this weapon is that it is not energy.
        o.append(add_box("m_wrist", (0.22, 0.16, 0.20), piv, coll=coll, mat=M_FRAME))
        o.append(add_box("m_block", (0.26, 0.20, 0.26), piv + Vector((0.20, 0, 0)),
                         coll=coll, mat=M_HULL))
        for i, dz in enumerate((0.14, 0.0, -0.14)):
            spread = math.radians(-12 + i * 12)
            o.append(add_box(f"m_tine{i}", (0.46, 0.06, 0.08),
                             piv + Vector((0.56, 0, dz)), (0, spread, 0),
                             coll=coll, mat=M_SUB))
            o.append(add_wedge(f"m_point{i}", (0.20, 0.05, 0.07), 1.8,
                               piv + Vector((0.86, 0, dz * 1.25)), (0, spread, 0),
                               coll=coll, mat=M_ACC))
            o.append(add_cyl(f"m_ram{i}", 0.035, 0.24,
                             piv + Vector((0.30, 0.09, dz * 0.8)),
                             (0, math.radians(90), 0), 10, coll=coll, mat=M_TRIM))
        o.append(add_cyl("m_pivotpin", 0.06, 0.30, piv + Vector((0.34, 0, 0)),
                         (math.radians(90), 0, 0), 12, coll=coll, mat=M_ACC))
        parts["meleeWeapon"] = join_as(pn("meleeWeapon"), o, piv, coll)
    elif spec["blade"] == "bayonet":
        # VESPER: a short straight beam spike clamped under the railgun. A
        # thrusting weapon - no cutting edge, no sweep, just a point.
        o.append(add_box("m_clamp", (0.20, 0.12, 0.14), piv, coll=coll, mat=M_FRAME))
        o.append(add_box("m_rail", (0.34, 0.06, 0.06), piv + Vector((0.20, 0, 0.05)),
                         coll=coll, mat=M_SUB))
        o.append(add_wedge("m_emitter", (0.13, 0.11, 0.12), 1.6, piv + Vector((0.24, 0, -0.02)),
                           (0, math.radians(90), 0), coll=coll, mat=M_HULL))
        spike = 0.64
        o.append(add_cyl("m_bloom", 0.042, spike, piv + Vector((0.30 + spike / 2, 0, -0.02)),
                         (0, math.radians(90), 0), 14, coll=coll, cone_r2=0.006, mat=M_BEAM))
        o.append(add_cyl("m_core", 0.015, spike * 0.98,
                         piv + Vector((0.30 + spike / 2, 0, -0.02)),
                         (0, math.radians(90), 0), 12, coll=coll, cone_r2=0.003, mat=M_CORE))
        parts["meleeWeapon"] = join_as(pn("meleeWeapon"), o, piv, coll)
    elif spec["blade"] == "twindagger":
        # CIRRUS: two short blades on a shared mount, which is what an eight-hit
        # alternating flurry actually looks like.
        o.append(add_box("m_mount", (0.16, 0.22, 0.12), piv, coll=coll, mat=M_FRAME))
        for i, dy in enumerate((0.10, -0.10)):
            o.append(add_box(f"m_hilt{i}", (0.14, 0.07, 0.08),
                             piv + Vector((0.10, dy, 0.02)), coll=coll, mat=M_HULL))
            o.append(add_cyl(f"m_lens{i}", 0.036, 0.025, piv + Vector((0.19, dy, 0.02)),
                             (0, math.radians(90), 0), 12, coll=coll, mat=M_CORE))
            dl = 0.56
            o.append(add_cyl(f"m_bloom{i}", 0.045, dl, piv + Vector((0.22 + dl / 2, dy, 0.02)),
                             (0, math.radians(90), 0), 14, coll=coll, cone_r2=0.010, mat=M_BEAM))
            o.append(add_cyl(f"m_core{i}", 0.014, dl * 0.98,
                             piv + Vector((0.22 + dl / 2, dy, 0.02)),
                             (0, math.radians(90), 0), 10, coll=coll, cone_r2=0.003, mat=M_CORE))
        parts["meleeWeapon"] = join_as(pn("meleeWeapon"), o, piv, coll)
    elif spec["blade"] == "cleaver":
        # PYRE: a thick chopping blade heated to glowing, not a plasma edge.
        # Solid metal with a molten cutting edge and heat vents down the spine.
        o.append(add_box("m_grip", (0.20, 0.11, 0.11), piv, coll=coll, mat=M_FRAME))
        o.append(add_box("m_guard", (0.07, 0.20, 0.20), piv + Vector((0.14, 0, 0)),
                         coll=coll, mat=M_HULL))
        o.append(add_box("m_blade", (0.86, 0.07, 0.34), piv + Vector((0.60, 0, 0.02)),
                         coll=coll, mat=M_SUB))
        o.append(add_wedge("m_tip", (0.26, 0.07, 0.34), 1.2, piv + Vector((1.14, 0, 0.02)),
                           (0, math.radians(90), 0), coll=coll, mat=M_SUB))
        # The edge itself is the only emissive part: heat, not energy.
        o.append(add_box("m_edge", (1.06, 0.045, 0.05), piv + Vector((0.66, 0, -0.14)),
                         coll=coll, mat=M_GLOW))
        for i in range(4):
            o.append(add_box(f"m_vent{i}", (0.07, 0.09, 0.07),
                             piv + Vector((0.34 + i * 0.20, 0, 0.17)), coll=coll, mat=M_ACC))
        parts["meleeWeapon"] = join_as(pn("meleeWeapon"), o, piv, coll)
    elif spec["blade"] == "glaive":
        # NULLTIDE: a polearm. Long haft, discharge head at the far end, so its
        # wide sweeps have somewhere to come from.
        o.append(add_box("m_butt", (0.12, 0.09, 0.09), piv + Vector((-0.10, 0, 0)),
                         coll=coll, mat=M_HULL))
        o.append(add_cyl("m_haft", 0.048, 1.02, piv + Vector((0.42, 0, 0)),
                         (0, math.radians(90), 0), 12, coll=coll, mat=M_FRAME))
        for i in range(3):
            o.append(add_cyl(f"m_band{i}", 0.062, 0.045, piv + Vector((0.16 + i * 0.30, 0, 0)),
                             (0, math.radians(90), 0), 12, coll=coll, mat=M_ACC))
        o.append(add_box("m_head", (0.20, 0.10, 0.20), piv + Vector((1.02, 0, 0.02)),
                         coll=coll, mat=M_SUB))
        blade = 0.62
        o.append(add_cyl("m_bloom", 0.052, blade, piv + Vector((1.14 + blade / 2, 0, 0.06)),
                         (0, math.radians(74), 0), 14, coll=coll, cone_r2=0.010, mat=M_BEAM))
        o.append(add_cyl("m_core", 0.016, blade * 0.98,
                         piv + Vector((1.14 + blade / 2, 0, 0.06)),
                         (0, math.radians(74), 0), 10, coll=coll, cone_r2=0.003, mat=M_CORE))
        # Discharge prongs flanking the head.
        for i, dz in enumerate((0.12, -0.12)):
            o.append(add_box(f"m_prong{i}", (0.16, 0.035, 0.035),
                             piv + Vector((1.10, 0, dz)), coll=coll, mat=M_GLOW))
        parts["meleeWeapon"] = join_as(pn("meleeWeapon"), o, piv, coll)
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
        parts["meleeWeapon"] = join_as(pn("meleeWeapon"), o, piv, coll)
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
        parts["meleeWeapon"] = join_as(pn("meleeWeapon"), o, piv, coll)
    else:
        # Hilt: gripped, ribbed, with a pommel.
        o.append(add_box("m_grip", (0.19, 0.10, 0.10), piv, coll=coll, mat=M_FRAME))
        for i in range(3):
            o.append(add_cyl(f"m_rib{i}", 0.056, 0.018, piv + Vector((-0.05 + i * 0.05, 0, 0)),
                             (0, math.radians(90), 0), 10, coll=coll, mat=M_SUB))
        o.append(add_box("m_pommel", (0.06, 0.09, 0.09), piv + Vector((-0.13, 0, 0)),
                         coll=coll, mat=M_HULL))
        # Emitter: a flared shroud the blade springs from.
        o.append(add_wedge("m_emitter", (0.15, 0.14, 0.16), 1.5, piv + Vector((0.15, 0, 0)),
                           (0, math.radians(90), 0), coll=coll, mat=M_HULL))
        o.append(add_cyl("m_lens", 0.052, 0.03, piv + Vector((0.23, 0, 0)),
                         (0, math.radians(90), 0), 14, coll=coll, mat=M_CORE))
        for i, dz in enumerate((0.075, -0.075)):
            o.append(add_box(f"m_prong{i}", (0.10, 0.035, 0.035),
                             piv + Vector((0.26, 0, dz)), coll=coll, mat=M_ACC))
        # Blade: three concentric layers, tapering to a point.
        o.append(add_cyl("m_bloom", 0.062, blade_len, piv + Vector((0.26 + blade_len / 2, 0, 0)),
                         (0, math.radians(90), 0), 16, coll=coll, cone_r2=0.012, mat=M_BEAM))
        o.append(add_cyl("m_sheath", 0.038, blade_len * 0.99,
                         piv + Vector((0.26 + blade_len / 2, 0, 0)),
                         (0, math.radians(90), 0), 16, coll=coll, cone_r2=0.008, mat=M_BEAM))
        o.append(add_cyl("m_core", 0.017, blade_len * 0.985,
                         piv + Vector((0.26 + blade_len / 2, 0, 0)),
                         (0, math.radians(90), 0), 12, coll=coll, cone_r2=0.004, mat=M_CORE))
        parts["meleeWeapon"] = join_as(pn("meleeWeapon"), o, piv, coll)

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
    # Low ambient: the reference art has genuinely dark undersides, and a bright
    # world flattens the forms into soft plastic.
    bg.inputs["Color"].default_value = (0.16, 0.19, 0.26, 1.0)
    bg.inputs["Strength"].default_value = 0.40
    nt.links.new(bg.outputs[0], out.inputs[0])
    scene.world = world

    # `use_gtao` was set here for years and **has done nothing since Blender 4.2**.
    # EEVEE Next removed it along with every `gtao_*` property; the setattr sat
    # inside this try/except and its AttributeError was swallowed in silence. The
    # renders had no ambient occlusion at all, which on geometry this blocky is a
    # real part of why the sprites read as untextured boxes.
    #
    # Both spellings are attempted so the script still works on 3.x/4.0.
    for opt, val in (
        ("taa_render_samples", 64),
        ("use_gtao", True),              # <=4.1 only
        ("gtao_distance", 0.35),         # <=4.1 only
        ("use_raytracing", True),        # 4.2+ EEVEE Next
        ("use_fast_gi", True),
        ("fast_gi_method", "AMBIENT_OCCLUSION"),
        ("fast_gi_distance", 0.5),
        ("fast_gi_ray_count", 4),
        ("fast_gi_step_count", 12),
    ):
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
    lamp("BSR_fill", "AREA", (3.8, -2.6, 0.2), 120.0, (0.58, 0.70, 0.95), size=5.0)
    # The rim does figure-ground separation on its own terms: it lights only the
    # edge facing away from camera, so it lifts the silhouette off a dark
    # backdrop without adding a single lumen to the broad faces that blow out.
    # Cheaper contrast than the key, and warm, to sit with the yard's sodium.
    lamp("BSR_rim", "AREA", (1.0, 3.6, 2.6), 640.0, (1.00, 0.82, 0.66), size=1.8)
    lamp("BSR_bounce", "AREA", (0.0, -1.4, -3.4), 55.0, (0.45, 0.55, 0.85), size=5.0)


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

    # Frame this part on its own, keeping PX_PER_BU fixed.
    tile = required_tile(obj, cam)
    scene.render.resolution_x = tile
    scene.render.resolution_y = tile
    cam.data.ortho_scale = tile / PX_PER_BU

    path = os.path.join(out_dir, f"{mech_id}_{part}.png")
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)

    obj.hide_render = True
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
