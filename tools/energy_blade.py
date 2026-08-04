"""
Generates the projected-energy blade sprites.

WHY THIS IS NOT GEOMETRY
------------------------
The blade used to be a swept mesh built in `build_mechs.py`. It could not look
right, and the reason is structural rather than a matter of tuning: a mesh has a
**silhouette**. Projected energy does not. The `meleeEnergy` split (D131) gave the
blade its own sprite layer, which is the hook that lets it be drawn here instead.
The hardware — shaft, grip bands, emitter head — stays modelled in Blender.

BUILT UP, NOT CARVED DOWN
-------------------------
The first drawn version filled a tapered ribbon and then chewed its edges with
noise. That is the wrong construction and no amount of erosion fixes it: eroding
a solid gives a solid with a ragged rim, which still reads as an *object*.

The blade is **accumulated from filaments** — many thin luminous streaks running
along the curve, densest at the spine and thinning outward until they detach.
Density, gaps and edge breakup then come out for free, because they are what the
accumulation does rather than something applied afterwards.

Three systems, per the art direction:

1. **Shaft and emitter** — modelled, not here.
2. **Primary blade** — filaments held tightly enough to read as a scythe
   silhouette from a distance.
3. **Secondary breakup** — detached wisps, flare tongues and particle shedding,
   so the boundary frays and reforms instead of sitting still.

    python tools/energy_blade.py

Output: assets/sprites/mechs/<mech>_meleeEnergy.png       (frame 0)
        assets/sprites/mechs/<mech>_meleeEnergy_<n>.png   (frames 1..N-1)
"""

import json
import math
import os
import random

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPRITES = os.path.join(ROOT, "assets", "sprites", "mechs")

# Must match build_mechs.py, or the blade will not sit on its emitter.
PX_PER_BU = 120.0

# Turbulence variants per blade. Four is enough to read as churning and cheap
# enough to keep in the atlas.
FRAMES = 4


def _centreline(spec, size):
    """Blade centreline and half-width, in image pixels."""
    arc_r = spec["arc_r"] * PX_PER_BU
    cx = spec["cx"] * PX_PER_BU
    cz = spec["cz"] * PX_PER_BU
    span = math.radians(spec["span_deg"])
    start = math.radians(spec["start_deg"])
    peak = spec["peak_at"]
    wide = spec["width"] * PX_PER_BU
    c = size / 2

    pts = []
    n = 220
    for i in range(n):
        f = i / (n - 1)
        a = start - f * span
        x = c + cx + arc_r * math.cos(a)
        y = c - (cz + arc_r * math.sin(a))     # Blender +Z up; image +y down
        prof = (f / peak) if f < peak else ((1.0 - f) / (1.0 - peak)) ** 1.25
        pts.append((x, y, max(1.5, wide * prof)))
    return pts


def _normals(pts):
    """Unit normal at each station, for offsetting filaments sideways."""
    out = []
    n = len(pts)
    for i in range(n):
        j, k = min(i + 1, n - 1), max(i - 1, 0)
        tx, ty = pts[j][0] - pts[k][0], pts[j][1] - pts[k][1]
        m = math.hypot(tx, ty) or 1.0
        out.append((-ty / m, tx / m))
    return out


def _filaments(size, pts, nrm, rnd, *, count, spread, span_lo, span_hi,
               bright, wobble, widths):
    """
    Accumulate luminous streaks along the curve.

    `spread` is how far off the spine a filament may sit, **as a fraction of the
    local half-width** — so filaments converge where the blade narrows and the
    taper falls out of the construction rather than being imposed on it.
    """
    acc = Image.new("L", (size, size), 0)
    n = len(pts)
    for _ in range(count):
        # Biased toward the root so the blade visibly springs from the
        # emitter rather than fading in along its length.
        # Power-biased from zero, then nudged negative — raising a *negative*
        # sample to a fractional power yields a complex number, not a small one.
        if rnd.random() < 0.55:
            f0 = rnd.uniform(0.0, 0.90) ** 1.6 - 0.06
        else:
            f0 = rnd.uniform(0.0, 0.90)
        f1 = min(1.02, f0 + rnd.uniform(span_lo, span_hi))
        i0 = max(0, int(f0 * (n - 1)))
        i1 = min(n - 1, int(f1 * (n - 1)))
        if i1 - i0 < 3:
            continue
        base = rnd.uniform(-1.0, 1.0) * spread
        phase = rnd.uniform(0.0, math.tau)
        freq = rnd.uniform(1.6, 4.4)
        path = []
        for i in range(i0, i1):
            x, y, w = pts[i]
            nx, ny = nrm[i]
            t = (i - i0) / max(1, i1 - i0)
            off = base + wobble * math.sin(phase + freq * t * math.pi)
            path.append((x + nx * off * w, y + ny * off * w))
        layer = Image.new("L", (size, size), 0)
        ImageDraw.Draw(layer).line(path, fill=bright, width=rnd.choice(widths))
        acc = ImageChops.add(acc, layer)
    return acc


def _particles(size, pts, nrm, rnd, count, spread, bright):
    """Sparks shed around the boundary."""
    img = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(img)
    n = len(pts)
    for _ in range(count):
        i = rnd.randrange(int(n * 0.05), n - 1)
        x, y, w = pts[i]
        nx, ny = nrm[i]
        off = rnd.uniform(-1.0, 1.0) * spread
        px = x + nx * off * w + rnd.uniform(-3, 3)
        py = y + ny * off * w + rnd.uniform(-3, 3)
        r = rnd.choice([0.5, 0.5, 1.0, 1.5])
        d.ellipse([px - r, py - r, px + r, py + r], fill=bright)
    return img


def _emitter_flare(size, pts, rnd, radius, bright):
    """
    A bloom at the emitter mouth, plus a little spill back along the shaft.

    Without this the blade **butts up against the brass head and reads as pasted
    on**: energy that simply begins at a hard boundary has no source. The sprite
    layer draws over the modelled weapon, so a bloom here spills onto the metal
    and fuses the two.
    """
    img = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(img)
    x0, y0, _w = pts[0]

    # Concentric discs, brightest at the mouth.
    steps = 9
    for i in range(steps):
        t = i / (steps - 1)
        r = radius * (0.18 + 0.82 * t)
        v = int(bright * (1.0 - t) ** 1.7)
        if v <= 0:
            continue
        d.ellipse([x0 - r, y0 - r, x0 + r, y0 + r], fill=v)

    # Tongues licking backwards over the head, so light crosses the join.
    tx, ty = pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]
    m = math.hypot(tx, ty) or 1.0
    bx, by = -tx / m, -ty / m          # back along the blade, i.e. onto the shaft
    for _ in range(14):
        ln = rnd.uniform(6.0, radius * 1.5)
        jitter = rnd.uniform(-0.5, 0.5)
        ex = x0 + bx * ln + (-by) * jitter * ln * 0.5
        ey = y0 + by * ln + (bx) * jitter * ln * 0.5
        d.line([(x0, y0), (ex, ey)], fill=int(bright * 0.55),
               width=rnd.choice([1, 1, 2]))
    return img.filter(ImageFilter.GaussianBlur(2.2))


def render_blade(spec, seed, size=512):
    """One frame of a projected blade, RGBA."""
    rnd = random.Random(seed)
    pts = _centreline(spec, size)
    nrm = _normals(pts)

    # --- primary blade: dense, long, near-parallel. Carries the silhouette.
    body = _filaments(size, pts, nrm, rnd, count=230, spread=0.92,
                      span_lo=0.30, span_hi=0.80, bright=42, wobble=0.15,
                      widths=[1, 1, 2, 2])
    # A denser inner band. Without it the accumulation is evenly sparse and the
    # blade reads as a sparkler; the reference has real mass down the middle and
    # frays only at the boundary.
    mass = _filaments(size, pts, nrm, rnd, count=120, spread=0.52,
                      span_lo=0.40, span_hi=0.90, bright=46, wobble=0.10,
                      widths=[2, 2, 3])
    # A tight bright bundle down the middle: the white-hot core.
    core = _filaments(size, pts, nrm, rnd, count=52, spread=0.15,
                      span_lo=0.45, span_hi=0.95, bright=72, wobble=0.05,
                      widths=[1, 2, 2])

    # --- secondary breakup: short, wide-ranging, faint. Tongues and spray.
    tongues = _filaments(size, pts, nrm, rnd, count=90, spread=1.55,
                         span_lo=0.05, span_hi=0.24, bright=26, wobble=0.42,
                         widths=[1])
    spray = _particles(size, pts, nrm, rnd, 220, 1.7, 55)
    # Bloom at the emitter mouth, spilling back over the metal so the blade has
    # a visible source instead of beginning at a hard boundary.
    flare = _emitter_flare(size, pts, rnd, radius=spec.get("flare", 30.0), bright=150)

    glow = ImageChops.add(body, mass).filter(ImageFilter.GaussianBlur(7.0))
    field = ImageChops.add(ImageChops.add(body, mass), tongues)
    field = ImageChops.add(field, spray)
    field = ImageChops.add(field, flare)
    field = ImageChops.add(field, glow.point(lambda v: int(v * 0.85)))
    field = field.filter(ImageFilter.GaussianBlur(0.7))
    hot = ImageChops.add(core, core.filter(ImageFilter.GaussianBlur(3.0)))
    hot = ImageChops.add(hot, flare.point(lambda v: int(v * 0.75)))

    dim_rgb = spec.get("dim", spec["body"])
    body_rgb = spec["body"]
    core_rgb = spec["core"]

    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    px = img.load()
    fp, hp = field.load(), hot.load()
    for y in range(size):
        for x in range(size):
            f = fp[x, y]
            h = hp[x, y]
            if f <= 3 and h <= 3:
                continue
            # Normalisers, not density, control how much of the blade goes
            # white. Raising the filament count without raising these drove
            # nearly the whole blade past the core threshold and bleached the
            # yellow out of it.
            inten = min(1.0, f / 340.0)
            heat = min(1.0, h / 300.0)
            # Colour climbs dim -> body -> white with accumulated density, so the
            # blade is hottest exactly where the most filaments overlap.
            if inten < 0.55:
                k = inten / 0.55
                r = dim_rgb[0] + (body_rgb[0] - dim_rgb[0]) * k
                g = dim_rgb[1] + (body_rgb[1] - dim_rgb[1]) * k
                b = dim_rgb[2] + (body_rgb[2] - dim_rgb[2]) * k
            else:
                r, g, b = body_rgb
            k = max(heat * 0.85, max(0.0, inten - 0.90) / 0.10)
            r += (core_rgb[0] - r) * k
            g += (core_rgb[1] - g) * k
            b += (core_rgb[2] - b) * k
            a = min(255, int(f * 1.15 + h * 0.75))
            px[x, y] = (int(r), int(g), int(b), a)
    return img


# Blade shapes, in Blender units relative to the part pivot. `cx`/`cz` put the
# arc centre **behind the emitter on the haft axis**, which is what makes the
# blade leave the shaft at a right angle instead of continuing along it.
BLADES = {
    "pyre": dict(
        # Must mirror the scythe branch in build_mechs.py — the modelled emitter
        # sits at the arc's root, and a mismatch detaches the blade from it.
        arc_r=2.20, cx=1.58 - 2.20, cz=0.02, span_deg=95.0, start_deg=0.0,
        width=0.34, peak_at=0.16, flare=34.0,
        dim=(214, 96, 12), body=(255, 186, 34), core=(255, 253, 232),
    ),
}


def _tile_for(mech):
    """
    Canvas size, taken from the manifest rather than hardcoded.

    Blender still builds the scythe's energy geometry and records its tile; this
    generator then overwrites the PNG. Deriving the canvas from that recorded
    tile is what keeps the two from silently disagreeing — they matched at 512
    by coincidence once, and a longer blade would have broken it.
    """
    path = os.path.join(SPRITES, "manifest.json")
    try:
        with open(path, encoding="utf-8") as fh:
            m = json.load(fh)
        return int(m["parts"][mech]["meleeEnergy"]["tile"])
    except (OSError, KeyError, ValueError, TypeError):
        return 512


def main():
    for mech, spec in BLADES.items():
        size = _tile_for(mech)
        print(f"{mech}: canvas {size} (from manifest)")
        for i in range(FRAMES):
            img = render_blade(spec, seed=1000 + i * 37, size=size)
            name = f"{mech}_meleeEnergy.png" if i == 0 else f"{mech}_meleeEnergy_{i}.png"
            img.save(os.path.join(SPRITES, name))
            print(f"  {name}  {img.size}")
    print(f"{len(BLADES)} blade(s) x {FRAMES} frames")


if __name__ == "__main__":
    main()
