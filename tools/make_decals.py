"""
Generates the marking decals the mechs wear — serials, unit numbers, stencilled
warnings, hazard chevrons and faction insignia.

WHY THESE ARE NOT TEXTURES ON THE MECH
--------------------------------------
The chassis meshes carry **no UV maps**. Every material in `build_mechs.py` is
box-projected in object space, which is fine for tiling wear but cannot place a
serial number at a chosen spot on a chosen panel — box projection has no idea
where "the left shoulder" is, and it would repeat the mark on all six faces.

So a marking is not painted on the armour. It is a **separate quad** floating a
hair above the surface, carrying one of these images with an alpha channel. A
primitive plane arrives from Blender with its own UV map, so the image lands on
it correctly with no unwrapping anywhere.

`docs/PROMPT_MECH_DESIGN.md` commissioned eight design sheets whose markings are
a large part of why the machines read as manufactured objects rather than
coloured shapes. This is what makes those markings buildable.

Output: assets/blender/decals/<name>.png, RGBA, white-on-transparent.

The images are **white**. `add_decal()` in `build_mechs.py` tints them per use,
so one `stencil_07.png` serves any machine that needs a 07 in any colour.

Run:  python tools/make_decals.py
"""

import math
import os
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "blender", "decals")

# Condensed bold reads as stencilling and stays legible when the decal is only a
# few pixels tall on screen. Arial Narrow Bold is on every Windows box; the
# fallbacks cover the rest.
FONT_CANDIDATES = [
    "C:/Windows/Fonts/ARIALNB.TTF",
    "C:/Windows/Fonts/arialbd.ttf",
    "C:/Windows/Fonts/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]

# Every decal is generated at 4x and downsampled, which is what gives the edges
# their clean antialiasing without asking PIL to draw smooth text directly.
SS = 4


def _font(px):
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, px)
            except OSError:
                continue
    return ImageFont.load_default()


def _save(im, name):
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name + ".png")
    im.save(path)
    a = im.getchannel("A")
    lo, hi = a.getextrema()
    covered = sum(1 for v in a.getdata() if v > 8) / (im.size[0] * im.size[1])
    print(f"  {name:22} {im.size[0]:4}x{im.size[1]:<4} alpha {lo}-{hi}  ink {covered*100:5.1f}%")
    return path


def text_decal(name, text, w, h, weight=0.78, tracking=0.0):
    """White text on transparent, fitted to the tile with a small margin."""
    W, H = w * SS, h * SS
    im = Image.new("RGBA", (W, H), (255, 255, 255, 0))
    d = ImageDraw.Draw(im)
    # binary-search a size that fills `weight` of the height
    target = H * weight
    lo, hi = 4, H * 2
    f = _font(int(target))
    while lo < hi - 1:
        mid = (lo + hi) // 2
        f = _font(mid)
        bb = d.textbbox((0, 0), text, font=f)
        if (bb[3] - bb[1]) > target or (bb[2] - bb[0]) > W * 0.94:
            hi = mid
        else:
            lo = mid
    f = _font(lo)
    if tracking:
        # draw glyph by glyph so letter-spacing can be widened
        adv = []
        for ch in text:
            bb = d.textbbox((0, 0), ch, font=f)
            adv.append(bb[2] - bb[0])
        gap = tracking * lo
        total = sum(adv) + gap * (len(text) - 1)
        x = (W - total) / 2
        bb = d.textbbox((0, 0), text, font=f)
        y = (H - (bb[3] - bb[1])) / 2 - bb[1]
        for ch, a in zip(text, adv):
            d.text((x, y), ch, font=f, fill=(255, 255, 255, 255))
            x += a + gap
    else:
        bb = d.textbbox((0, 0), text, font=f)
        d.text(((W - (bb[2] - bb[0])) / 2 - bb[0], (H - (bb[3] - bb[1])) / 2 - bb[1]),
               text, font=f, fill=(255, 255, 255, 255))
    return _save(im.resize((w, h), Image.LANCZOS), name)


def chevron_decal(name, w, h, bars=5, angle=38.0, duty=0.5):
    """Diagonal hazard striping. Alternate bars are transparent, so the armour
    colour shows between them and the decal reads as paint rather than a patch."""
    W, H = w * SS, h * SS
    im = Image.new("RGBA", (W, H), (255, 255, 255, 0))
    d = ImageDraw.Draw(im)
    t = math.tan(math.radians(angle))
    span = W + H * t
    pitch = span / bars
    x = -H * t
    while x < W + pitch:
        d.polygon([(x, H), (x + pitch * duty, H),
                   (x + pitch * duty + H * t, 0), (x + H * t, 0)],
                  fill=(255, 255, 255, 255))
        x += pitch
    return _save(im.resize((w, h), Image.LANCZOS), name)


def concord_insignia(name, size=128):
    """Concord Skyward: a stacked pair of swept wings over a bar. Original mark —
    geometric, readable at a few pixels, and nothing like an existing badge."""
    S = size * SS
    im = Image.new("RGBA", (S, S), (255, 255, 255, 0))
    d = ImageDraw.Draw(im)
    cx = S * 0.5
    for i, (yy, half, th) in enumerate(((0.30, 0.40, 0.085), (0.50, 0.30, 0.075))):
        y = S * yy
        t = S * th
        d.polygon([(cx - S * half, y), (cx, y - t * 1.4), (cx + S * half, y),
                   (cx, y + t)], fill=(255, 255, 255, 255))
    d.rectangle([cx - S * 0.16, S * 0.68, cx + S * 0.16, S * 0.68 + S * 0.06],
                fill=(255, 255, 255, 255))
    return _save(im.resize((size, size), Image.LANCZOS), name)


def panel_frame(name, w, h, stroke=None):
    """A thin open rectangle — a stencilled plate outline to sit behind text."""
    W, H = w * SS, h * SS
    s = stroke * SS if stroke else max(2, int(min(W, H) * 0.045))
    im = Image.new("RGBA", (W, H), (255, 255, 255, 0))
    d = ImageDraw.Draw(im)
    d.rectangle([s, s, W - s, H - s], outline=(255, 255, 255, 255), width=int(s))
    return _save(im.resize((w, h), Image.LANCZOS), name)


def main():
    print("decals ->", OUT)
    # HALCYON's set, from docs/PROMPT_MECH_DESIGN.md and its design sheet.
    text_decal("num_07", "07", 128, 128, weight=0.86)
    text_decal("ser_cs39", "CS-39", 256, 96, weight=0.66, tracking=0.05)
    text_decal("des_av07", "AV-07", 256, 96, weight=0.66, tracking=0.05)
    text_decal("txt_caution_intake", "CAUTION INTAKE", 512, 80, weight=0.58)
    text_decal("txt_no_step", "NO STEP", 256, 80, weight=0.62, tracking=0.04)
    chevron_decal("hazard_bar", 256, 64, bars=6, angle=38.0)
    concord_insignia("insig_concord", 128)
    panel_frame("plate_frame", 256, 96)
    print("done")


if __name__ == "__main__":
    sys.exit(main())
