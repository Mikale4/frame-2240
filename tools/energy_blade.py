"""
Generates the projected-energy blade sprites.

WHY THIS IS NOT GEOMETRY
------------------------
The blade used to be a swept mesh built in `build_mechs.py`. It could not look
right, and the reason is structural rather than a matter of tuning: a mesh has a
**silhouette**. Projected energy does not. The reference is a turbulent plasma
form — a white-hot spine, ragged flame edges that dissolve into wisps, and no
hard boundary anywhere — and every attempt to coax that out of a solid surface
produced a glowing *object* instead of light.

So the blade is drawn here instead, as a 2D effect, and `meleeEnergy` (D131) is
already a separate sprite layer, which is exactly the hook needed. The hardware —
snath, grip bands, emitter head — stays modelled in Blender where it belongs.

FRAMES
------
Each blade is emitted as several frames with independent turbulence. The renderer
cycles them, so the blade churns rather than merely pulsing: a static shape with
its alpha animated still reads as a decal being dimmed.

    python tools/energy_blade.py

Output: assets/sprites/mechs/<mech>_meleeEnergy.png       (frame 0)
        assets/sprites/mechs/<mech>_meleeEnergy_<n>.png   (frames 1..N-1)
"""

import json
import math
import os
import random

from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPRITES = os.path.join(ROOT, "assets", "sprites", "mechs")

# Must match build_mechs.py, or the blade will not sit on its emitter.
PX_PER_BU = 120.0

# How many turbulence variants each blade gets. Four is enough for the eye to
# read it as churning and cheap enough to keep in the atlas.
FRAMES = 4


def fractal_noise(size, octaves=7, seed=0):
    """Value noise as a greyscale image, built by summing upscaled octaves.

    PIL only — numpy is not available in this environment, and per-pixel Python
    noise over a 512 square is slow enough to matter.
    """
    # Accumulated in L, not F: `Image.blend` rejects F mode outright.
    rnd = random.Random(seed)
    acc = Image.new("L", (size, size), 0)
    amp, total = 1.0, 0.0
    res = 6
    for _ in range(octaves):
        small = Image.new("L", (res, res))
        small.putdata([rnd.randrange(256) for _ in range(res * res)])
        layer = small.resize((size, size), Image.BICUBIC)
        acc = Image.blend(acc, layer, amp / (total + amp))
        total += amp
        amp *= 0.55
        res *= 2
    return acc


def _centreline(spec):
    """Blade centreline and half-width, in render pixels from the part pivot."""
    arc_r = spec["arc_r"] * PX_PER_BU
    cx = spec["cx"] * PX_PER_BU
    cz = spec["cz"] * PX_PER_BU
    span = math.radians(spec["span_deg"])
    start = math.radians(spec["start_deg"])
    peak = spec["peak_at"]
    wide = spec["width"] * PX_PER_BU

    pts = []
    n = 160
    for i in range(n):
        f = i / (n - 1)
        a = start - f * span
        x = cx + arc_r * math.cos(a)
        y = -(cz + arc_r * math.sin(a))          # Blender +Z is up; image +y is down
        prof = (f / peak) if f < peak else ((1.0 - f) / (1.0 - peak)) ** 1.25
        pts.append((x, y, max(1.0, wide * prof)))
    return pts


def _blade_mask(size, pts):
    """Filled tapered ribbon along the centreline, as an L-mode mask."""
    img = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(img)
    c = size / 2
    left, right = [], []
    for i, (x, y, w) in enumerate(pts):
        j = min(i + 1, len(pts) - 1)
        k = max(i - 1, 0)
        tx, ty = pts[j][0] - pts[k][0], pts[j][1] - pts[k][1]
        m = math.hypot(tx, ty) or 1.0
        nx, ny = -ty / m, tx / m
        left.append((c + x + nx * w, c + y + ny * w))
        right.append((c + x - nx * w, c + y - ny * w))
    d.polygon(left + right[::-1], fill=255)
    return img


def _spine_mask(size, pts):
    """A thin line down the middle — the white-hot core."""
    img = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(img)
    c = size / 2
    for i in range(len(pts) - 1):
        x0, y0, w0 = pts[i]
        x1, y1, _ = pts[i + 1]
        d.line([(c + x0, c + y0), (c + x1, c + y1)],
               fill=255, width=max(1, int(w0 * 0.30)))
    return img


def render_blade(spec, seed, size=512):
    """One frame of a projected blade, RGBA."""
    pts = _centreline(spec)
    body = _blade_mask(size, pts).filter(ImageFilter.GaussianBlur(5.0))
    spine = _spine_mask(size, pts).filter(ImageFilter.GaussianBlur(3.2))

    # Turbulence chews the edges into flame. Applied to the *body* only: the
    # spine has to stay continuous or the blade looks severed.
    turb = fractal_noise(size, seed=seed)
    # **Domain warp.** Dissolving the edge with noise only erodes it — the result
    # is a blob with a soft rim. Displacing *where the mask is sampled from*
    # drags the boundary into tongues and filaments, which is what makes flame
    # look like flame. Two independent fields, one per axis.
    wx_f = fractal_noise(size, octaves=4, seed=seed + 501)
    wy_f = fractal_noise(size, octaves=4, seed=seed + 977)
    WARP = 22.0

    bpx, tpx = body.load(), turb.load()
    wxp, wyp = wx_f.load(), wy_f.load()
    torn = Image.new("L", (size, size))
    out = torn.load()
    for y in range(size):
        for x in range(size):
            dx = int((wxp[x, y] / 255.0 - 0.5) * WARP)
            dy = int((wyp[x, y] / 255.0 - 0.5) * WARP)
            sx = min(size - 1, max(0, x + dx))
            sy = min(size - 1, max(0, y + dy))
            b = bpx[sx, sy]
            if not b:
                continue
            # Below ~0.5 body the noise bites hard, which frays the rim while
            # leaving the middle solid.
            n = tpx[x, y] / 255.0
            k = b / 255.0
            edge = 1.0 - min(1.0, k * 1.9)
            v = k * (1.0 - edge * (1.05 - 0.85 * n))
            out[x, y] = max(0, min(255, int(v * 320)))
    torn = torn.filter(ImageFilter.GaussianBlur(1.0))

    # Wisps: a wider, fainter, noisier copy licking off the blade.
    wisp = torn.filter(ImageFilter.GaussianBlur(11.0))
    wpx = wisp.load()
    for y in range(size):
        for x in range(size):
            w = wpx[x, y]
            if w:
                wpx[x, y] = int(w * (0.05 + 0.70 * (tpx[x, y] / 255.0)) * 0.80)

    core_rgb = spec["core"]
    body_rgb = spec["body"]
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    px = img.load()
    tor, spn = torn.load(), wisp.load()
    sp = spine.load()
    for y in range(size):
        for x in range(size):
            a = tor[x, y]
            wv = spn[x, y]
            alpha = min(255, a + wv)
            if alpha <= 2:
                continue
            hot = sp[x, y] / 255.0
            r = int(body_rgb[0] + (core_rgb[0] - body_rgb[0]) * hot)
            g = int(body_rgb[1] + (core_rgb[1] - body_rgb[1]) * hot)
            b = int(body_rgb[2] + (core_rgb[2] - body_rgb[2]) * hot)
            px[x, y] = (r, g, b, alpha)
    return img


# Blade shapes, in Blender units relative to the part pivot, mirroring the arc
# `build_mechs.py` used for the modelled version. `cx`/`cz` place the arc centre
# **behind the emitter on the haft axis**, which is what makes the blade leave
# the shaft at a right angle instead of continuing along it like a spear.
BLADES = {
    "pyre": dict(
        arc_r=1.25, cx=1.58 - 1.25, cz=0.02, span_deg=108.0, start_deg=0.0,
        width=0.34, peak_at=0.18,
        # Yellow-amber rather than the hot orange of the first pass, sitting
        # near PYRE's own glow colour (255, 194, 71) so the blade reads as part
        # of the machine rather than as a separate effect bolted on.
        body=(255, 186, 34), core=(255, 252, 226),
    ),
}


def main():
    for mech, spec in BLADES.items():
        for i in range(FRAMES):
            img = render_blade(spec, seed=1000 + i * 37)
            name = f"{mech}_meleeEnergy.png" if i == 0 else f"{mech}_meleeEnergy_{i}.png"
            img.save(os.path.join(SPRITES, name))
            print(f"  {name}  {img.size}")
    print(f"{len(BLADES)} blade(s) x {FRAMES} frames")


if __name__ == "__main__":
    main()
