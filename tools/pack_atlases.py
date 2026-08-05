"""
Packs the per-part mech sprites into one texture atlas per chassis.

WHY
---
The loader made 112 separate requests for mech art, one per part. That is slow
to boot and, more importantly, means Phaser binds up to 112 different textures
while drawing a match, which defeats its sprite batching. One atlas per mech
takes it to 8 requests and 8 binds.

NO TRIMMING
-----------
Every part PNG is square with its pivot at the exact centre, and the whole rig
is positioned by drawing each part with origin 0.5,0.5 at its rig offset (see
`manifest.json` and `MechRenderer`). Trimming transparent margins would shrink
frames and break that invariant unless every consumer honoured the trim offsets.
The atlas therefore stores full, untrimmed frames: it buys fewer requests and
fewer texture binds, not a smaller download, and it cannot silently misplace a
limb.

Output, per mech:
  assets/sprites/mechs/<mech>.atlas.png
  assets/sprites/mechs/<mech>.atlas.json   (Phaser JSON Hash)
"""

import json
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPRITES = os.path.join(ROOT, "assets", "sprites", "mechs")
# Wide enough to fit three 320px parts per shelf without wasting a whole column.
#
# **Widened from 1024 when the blades went to eight churn frames.** At 1024 a
# 576px energy frame owns a whole shelf — two will not fit side by side — so
# PYRE's eight frames alone were 4608px of height and the atlas reached 6400.
# 4096 is a common `MAX_TEXTURE_SIZE` floor and PYRE had been sitting exactly on
# it, so that was over the edge on any such GPU. At 2048 three 576s share a
# shelf and the tallest atlas comes back under 3000. Total pixels barely move;
# what changes is that the height is no longer the binding constraint.
ATLAS_W = 2048

PARTS = [
    "core", "head", "backpack", "lowerBody", "legFar", "legNear",
    "leftArm", "subWeapon", "rightArm", "mainWeapon", "meleeWeapon",
    "leftThruster", "rightThruster", "drone",
]

# Parts only some chassis carry. A missing one is not an error.
#
# `meleeEnergy` is the projected blade, split out of `meleeWeapon` so it can skip
# the Freestyle contour and be animated on its own. NOCTURNE's claw, TERRAMOTH's
# pile driver and OBELISK's shield project nothing and have none.
# Frames 1..N of an animated part. Frame 0 keeps the bare name so the rig can
# reference it without knowing the part is animated at all.
OPTIONAL_PARTS = ["meleeEnergy"] + [f"meleeEnergy_{i}" for i in range(1, 12)]


def pack_mech(mech_id):
    """Shelf-packs one mech's parts. Returns (frames, width, height) or None."""
    images = {}
    for part in PARTS:
        path = os.path.join(SPRITES, f"{mech_id}_{part}.png")
        if not os.path.exists(path):
            return None
        images[part] = Image.open(path).convert("RGBA")
    for part in OPTIONAL_PARTS:
        path = os.path.join(SPRITES, f"{mech_id}_{part}.png")
        if os.path.exists(path):
            images[part] = Image.open(path).convert("RGBA")

    # Tallest first, so shelves pack densely instead of leaving ragged gaps.
    order = sorted(images.items(), key=lambda kv: -kv[1].size[1])

    frames = {}
    x = y = shelf_h = 0
    for part, im in order:
        w, h = im.size
        if x + w > ATLAS_W:
            x = 0
            y += shelf_h
            shelf_h = 0
        frames[part] = {"x": x, "y": y, "w": w, "h": h}
        x += w
        shelf_h = max(shelf_h, h)
    height = y + shelf_h

    atlas = Image.new("RGBA", (ATLAS_W, height), (0, 0, 0, 0))
    for part, box in frames.items():
        atlas.paste(images[part], (box["x"], box["y"]))

    atlas.save(os.path.join(SPRITES, f"{mech_id}.atlas.png"))

    meta = {
        "frames": {
            part: {
                "frame": box,
                "rotated": False,
                # Untrimmed by design; see the module docstring.
                "trimmed": False,
                "spriteSourceSize": {"x": 0, "y": 0, "w": box["w"], "h": box["h"]},
                "sourceSize": {"w": box["w"], "h": box["h"]},
            }
            for part, box in frames.items()
        },
        "meta": {
            "app": "tools/pack_atlases.py",
            "image": f"{mech_id}.atlas.png",
            "format": "RGBA8888",
            "size": {"w": ATLAS_W, "h": height},
            "scale": "1",
            "note": "Untrimmed: each frame is square with its pivot at the centre.",
        },
    }
    with open(os.path.join(SPRITES, f"{mech_id}.atlas.json"), "w", encoding="utf-8") as fh:
        json.dump(meta, fh, indent=1)
    return frames, ATLAS_W, height


def main():
    manifest_path = os.path.join(SPRITES, "manifest.json")
    with open(manifest_path, encoding="utf-8") as fh:
        manifest = json.load(fh)
    ids = sorted(manifest.get("pivots_px", {}).keys())

    total_before = 0
    total_after = 0
    for mech_id in ids:
        for part in PARTS + OPTIONAL_PARTS:
            p = os.path.join(SPRITES, f"{mech_id}_{part}.png")
            if os.path.exists(p):
                total_before += os.path.getsize(p)
        result = pack_mech(mech_id)
        if result is None:
            print(f"{mech_id}: SKIPPED (missing parts)")
            continue
        frames, w, h = result
        size = os.path.getsize(os.path.join(SPRITES, f"{mech_id}.atlas.png"))
        total_after += size
        print(f"{mech_id}: {len(frames)} frames -> {w}x{h}, {size // 1024} KB")

    # Counted rather than multiplied: optional parts mean chassis no longer all
    # carry the same number of files.
    n_files = sum(
        1
        for mid in ids
        for part in PARTS + OPTIONAL_PARTS
        if os.path.exists(os.path.join(SPRITES, f"{mid}_{part}.png"))
    )
    print(f"\n{n_files} files ({total_before // 1024} KB) "
          f"-> {len(ids)} atlases ({total_after // 1024} KB)")


if __name__ == "__main__":
    sys.exit(main())
