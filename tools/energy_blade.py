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

THIS FILE IS THE ONLY SOURCE OF A PROJECTED BLADE
-------------------------------------------------
`build_mechs.py` used to model the energy as well, which left the manifest tile
coming from Blender while the pixels came from here (D131 left that coupled on
purpose, as the smaller step). It no longer builds any: the five weapons that
project a blade carry emitter hardware only, and this script owns the PNG, the
canvas size and the `meleeEnergy` manifest row. Rebuild order is therefore
Blender first, then merge the manifest, then this — running Blender afterwards
no longer clobbers anything, because it has nothing to say about the blade.
"""

import json
import math
import os
import random

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPRITES = os.path.join(ROOT, "assets", "sprites", "mechs")

# All three must match build_mechs.py, or the blade will not sit on its emitter.
PX_PER_BU = 120.0
LOGICAL_PER_BU = 60.0
CAM_AZIMUTH = math.radians(15.0)
CAM_ELEVATION = math.radians(9.0)

TILE_STEP = 64
TILE_MIN = 320
TILE_MAX = 1024

# Turbulence frames per blade, over one full churn loop.
#
# Four was enough while each frame was an independent noise sample and the churn
# read as a stutter regardless. Now that a frame is a *phase* of one continuous
# motion, the count is what sets how smooth that motion is, and four is visibly
# steppy. Twelve at 14 Hz is a 0.86 s loop, and the per-step change measures
# 1.20 against 1.65 at four -- the frames are a dial only because they are now
# phases of one motion rather than independent samples.
FRAMES = 12


def _project(x, y, z):
    """
    Blender point -> (screen right, screen up), in Blender units.

    **The camera is not axis-aligned** and this was drawn as though it were: the
    first cut mapped Blender X straight to image x and Z to image y, which is
    only true at azimuth 0 / elevation 0. The real rig sits at 15 deg / 9 deg,
    which cost PYRE about 8 px of seating on its own emitter mouth — tolerable
    on one blade inside a 34 px flare, and *not* tolerable for CIRRUS, whose two
    daggers are separated by nothing but their Y offset. Unprojected they draw
    exactly on top of each other and the weapon stops being twin.

    Derived from `setup_camera` rather than sampled: the basis of a camera
    tracking the origin from (D sin az cos el, -D cos az cos el, D sin el).
    """
    ca, sa = math.cos(CAM_AZIMUTH), math.sin(CAM_AZIMUTH)
    ce, se = math.cos(CAM_ELEVATION), math.sin(CAM_ELEVATION)
    return (x * ca + y * sa,
            -x * sa * se + y * ca * se + z * ce)


def _path_xz(spec, n):
    """
    Centreline stations in the weapon's own XZ plane, as (f, x, z).

    Two forms, because one cannot express both shapes honestly:

    * `arc` — centre, radius and swept angle. PYRE's scythe is a 95 deg sweep;
      putting the centre behind the emitter is what makes the blade leave the
      haft at a right angle, so those numbers have to stay stated as an arc.
    * `chord` — root, tip and a `bow` (perpendicular sag at the midpoint). This
      is the natural way to state a sabre or a spike, where what is known is
      where the blade starts and stops, and the curvature is a small correction.
      `bow` 0 gives a dead straight blade with no special case.
    """
    if "arc" in spec:
        a = spec["arc"]
        r, cx, cz = a["r"], a["cx"], a["cz"]
        span, start = math.radians(a["span_deg"]), math.radians(a["start_deg"])
        for i in range(n):
            f = i / (n - 1)
            ang = start - f * span
            yield f, cx + r * math.cos(ang), cz + r * math.sin(ang)
    else:
        c = spec["chord"]
        (x0, z0), (x1, z1) = c["root"], c["tip"]
        bow = c.get("bow", 0.0)
        dx, dz = x1 - x0, z1 - z0
        ln = math.hypot(dx, dz) or 1.0
        nx, nz = -dz / ln, dx / ln          # left normal, in the XZ plane
        for i in range(n):
            f = i / (n - 1)
            b = bow * 4.0 * f * (1.0 - f)   # zero at both ends, max at the middle
            yield f, x0 + dx * f + nx * b, z0 + dz * f + nz * b


def _strands(spec):
    """Y offsets of this weapon's blades. One, unless it is CIRRUS."""
    return spec.get("strands", [0.0])


def _centreline(spec, strand_y, size):
    """
    Blade centreline and half-width, in image pixels.

    `tip` is the width the profile is allowed to fall to at the far end, as a
    fraction of the widest point. **It is never zero.** A taper that runs to
    nothing produces a needle, which is what a ground edge looks like; this is
    plasma, and plasma does not come to a point — it thins until it stops
    holding together and frays out. Ending on real width, and letting the
    tongues and spray dissolve it from there, is what reads as dissipation.
    """
    peak = spec["peak_at"]
    taper = spec.get("taper", 1.25)
    tip = spec.get("tip", 0.14)
    wide = spec["width"] * PX_PER_BU
    c = size / 2

    pts = []
    for f, x, z in _path_xz(spec, 220):
        sx, su = _project(x, strand_y, z)
        if f < peak:
            prof = f / peak
        else:
            prof = tip + (1.0 - tip) * ((1.0 - f) / (1.0 - peak)) ** taper
        # Blender +Z is up; image +y is down.
        pts.append((c + sx * PX_PER_BU, c - su * PX_PER_BU, max(1.5, wide * prof)))
    return pts


def _probe_tile(spec):
    """
    A canvas certain to be large enough to draw on. **Not the final tile.**

    This is an analytic upper bound — every station charged the widest filament
    excursion its local half-width allows — and bounds of that shape are loose,
    because the excursions it adds up never actually co-occur. Measured against
    what the renderer puts down it runs one 64 px step over on three of the five
    blades, which on PYRE is 4 frames x 256 px of atlas height. `_fit` then crops
    to what landed. Reason for the canvas; measure for the tile.
    """
    look = LOOKS[spec["look"]]
    # Filaments and sparks are offset by a fraction of the **local** half-width,
    # so the excursion has to be measured per station. Charging every station the
    # widest point's excursion cost PYRE a whole 768 px tile for a blade that
    # fits in 576 — and the atlas is only 1024 wide, so that is a real price.
    reach = max(look["tongues"]["spread"], look["spray"]["spread"],
                look["body"]["spread"])
    half = 0.0
    for y in _strands(spec):
        # size 0 puts the centre at the origin, i.e. pivot-relative pixels.
        for x, iy, w in _centreline(spec, y, 0):
            half = max(half, abs(x) + w * reach, abs(iy) + w * reach)
    # Emitter bloom, plus headroom for the glow blur, which is not clipped to the
    # shape that cast it.
    need = 2.0 * (half + spec["flare"] + 3.0 * look["glow_blur"])
    steps = math.ceil(need / TILE_STEP)
    return max(TILE_MIN, min(TILE_MAX, steps * TILE_STEP))


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
               bright, wobble, widths, anim=0.0):
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
            # `anim` walks the wobble along the filament between frames. Every
            # frame draws the *same* filaments from the same seed, so the churn
            # is one continuous motion instead of a new sample each time.
            off = base + wobble * math.sin(phase + anim + freq * t * math.pi)
            path.append((x + nx * off * w, y + ny * off * w))
        layer = Image.new("L", (size, size), 0)
        ImageDraw.Draw(layer).line(path, fill=bright, width=rnd.choice(widths))
        acc = ImageChops.add(acc, layer)
    return acc


def _particles(size, pts, nrm, rnd, count, spread, bright, anim=0.0):
    """Sparks shed around the boundary."""
    img = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(img)
    n = len(pts)
    for _ in range(count):
        i = rnd.randrange(int(n * 0.05), n - 1)
        x, y, w = pts[i]
        nx, ny = nrm[i]
        off = rnd.uniform(-1.0, 1.0) * spread
        # Sparks drift on the same clock rather than being re-scattered, or they
        # pop in and out and undo the smoothness the filaments just bought.
        drift = rnd.uniform(0.0, math.tau)
        px = x + nx * off * w + rnd.uniform(-3, 3) + 2.4 * math.cos(drift + anim)
        py = y + ny * off * w + rnd.uniform(-3, 3) + 2.4 * math.sin(drift + anim)
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


# How each weapon burns. **Shape alone does not separate five blades** — four of
# the five glow colours sit in the same blue-cyan corner of the palette, because
# that is what those machines are, so the way the energy *behaves* has to carry
# most of the difference at gameplay scale.
#
# Counts are per strand and scale with blade length, not area: a narrow blade
# wants the same filaments per unit length as a wide one, which is exactly what
# concentrates a sabre into a coherent hot line instead of a sparkler. That
# concentration is why `field_norm` and `heat_norm` climb as blades get thinner —
# the same overlap through a quarter of the width is four times the density, and
# leaving the normalisers alone bleaches the whole blade white (D133).
LOOKS = {
    # PYRE. A wide, unstable, burning crescent. The reference look.
    "scythe": dict(
        body=dict(count=230, spread=0.92, span_lo=0.30, span_hi=0.80,
                  bright=42, wobble=0.15, widths=[1, 1, 2, 2]),
        mass=dict(count=120, spread=0.52, span_lo=0.40, span_hi=0.90,
                  bright=46, wobble=0.10, widths=[2, 2, 3]),
        core=dict(count=52, spread=0.15, span_lo=0.45, span_hi=0.95,
                  bright=72, wobble=0.05, widths=[1, 2, 2]),
        tongues=dict(count=90, spread=1.55, span_lo=0.05, span_hi=0.24,
                     bright=26, wobble=0.42, widths=[1]),
        spray=dict(count=220, spread=1.7, bright=55),
        field_norm=340.0, heat_norm=300.0, glow_blur=7.0,
    ),
    # HALCYON. A Concord beam saber: the most *disciplined* blade in the game.
    # Long parallel filaments, almost no wobble, little shedding — it should
    # read as contained rather than burning.
    "beam": dict(
        body=dict(count=96, spread=0.86, span_lo=0.45, span_hi=0.95,
                  bright=40, wobble=0.06, widths=[1, 1, 2]),
        mass=dict(count=54, spread=0.46, span_lo=0.55, span_hi=1.00,
                  bright=44, wobble=0.04, widths=[2, 2, 3]),
        core=dict(count=30, spread=0.13, span_lo=0.60, span_hi=1.00,
                  bright=70, wobble=0.02, widths=[1, 2, 2]),
        tongues=dict(count=22, spread=1.25, span_lo=0.04, span_hi=0.16,
                     bright=20, wobble=0.26, widths=[1]),
        spray=dict(count=46, spread=1.35, bright=42),
        field_norm=520.0, heat_norm=460.0, glow_blur=6.0,
    ),
    # VESPER. A bayonet is a point, not an edge: the tightest, hardest, least
    # decorated blade on the roster, with the breakup pulled almost to nothing.
    "spike": dict(
        body=dict(count=54, spread=0.78, span_lo=0.55, span_hi=1.00,
                  bright=42, wobble=0.05, widths=[1, 1, 2]),
        mass=dict(count=32, spread=0.42, span_lo=0.65, span_hi=1.00,
                  bright=46, wobble=0.03, widths=[2, 2]),
        core=dict(count=20, spread=0.12, span_lo=0.70, span_hi=1.00,
                  bright=74, wobble=0.02, widths=[1, 2]),
        tongues=dict(count=12, spread=1.10, span_lo=0.04, span_hi=0.14,
                     bright=18, wobble=0.22, widths=[1]),
        spray=dict(count=26, spread=1.20, bright=38),
        field_norm=470.0, heat_norm=430.0, glow_blur=5.0,
    ),
    # CIRRUS. Eight alternating hits: the flurry is the identity, so these two
    # shards are the least stable things on the roster — heavy shedding, high
    # wobble, filaments that detach and stream.
    "shard": dict(
        body=dict(count=64, spread=0.95, span_lo=0.35, span_hi=0.85,
                  bright=38, wobble=0.22, widths=[1, 1, 2]),
        mass=dict(count=34, spread=0.50, span_lo=0.45, span_hi=0.95,
                  bright=44, wobble=0.16, widths=[2, 2]),
        core=dict(count=18, spread=0.14, span_lo=0.55, span_hi=1.00,
                  bright=72, wobble=0.06, widths=[1, 2]),
        tongues=dict(count=40, spread=1.70, span_lo=0.05, span_hi=0.20,
                     bright=24, wobble=0.55, widths=[1]),
        spray=dict(count=76, spread=1.75, bright=48),
        field_norm=540.0, heat_norm=470.0, glow_blur=5.5,
    ),
    # NULLTIDE. A polearm cleaver — broad enough that a five-hit sweep has a
    # shape to sweep. Between the scythe and the saber: real mass, moderate fray.
    "cleaver": dict(
        body=dict(count=132, spread=0.90, span_lo=0.35, span_hi=0.85,
                  bright=40, wobble=0.12, widths=[1, 1, 2, 2]),
        mass=dict(count=72, spread=0.50, span_lo=0.45, span_hi=0.92,
                  bright=45, wobble=0.09, widths=[2, 2, 3]),
        core=dict(count=32, spread=0.14, span_lo=0.50, span_hi=0.96,
                  bright=72, wobble=0.04, widths=[1, 2, 2]),
        tongues=dict(count=48, spread=1.45, span_lo=0.05, span_hi=0.22,
                     bright=24, wobble=0.38, widths=[1]),
        spray=dict(count=110, spread=1.6, bright=50),
        field_norm=400.0, heat_norm=350.0, glow_blur=6.5,
    ),
}


def render_blade(spec, seed, size=512, anim=0.0):
    """
    One frame of a projected blade, RGBA.

    `anim` is the churn phase, 0..tau over one loop. **Frames share a seed and
    differ only by this**: the filament set is identical and its wobble travels,
    so consecutive frames are a small continuous change. Independent seeds per
    frame — which is what this did first — make every switch an uncorrelated
    jump, and adding more of them lengthens the loop without smoothing anything.
    """
    rnd = random.Random(seed)
    look = LOOKS[spec["look"]]
    zero = Image.new("L", (size, size), 0)
    body = mass = core = tongues = spray = flare = zero

    # Each strand is a whole blade in its own right and accumulates into the same
    # field, so CIRRUS's pair overlap and bloom into each other where they cross
    # rather than being composited as two cut-outs.
    for si, sy in enumerate(_strands(spec)):
        pts = _centreline(spec, sy, size)
        nrm = _normals(pts)
        # A different stream per strand, or twin daggers churn in lockstep.
        srnd = random.Random(seed * 31 + si * 7717)

        def fil(key):
            return _filaments(size, pts, nrm, srnd, anim=anim, **look[key])

        # --- primary blade: dense, long, near-parallel. Carries the silhouette.
        body = ImageChops.add(body, fil("body"))
        # A denser inner band. Without it the accumulation is evenly sparse and
        # the blade reads as a sparkler; the reference has real mass down the
        # middle and frays only at the boundary.
        mass = ImageChops.add(mass, fil("mass"))
        # A tight bright bundle down the middle: the white-hot core.
        core = ImageChops.add(core, fil("core"))
        # --- secondary breakup: short, wide-ranging, faint. Tongues and spray.
        tongues = ImageChops.add(tongues, fil("tongues"))
        sp = look["spray"]
        spray = ImageChops.add(
            spray,
            _particles(size, pts, nrm, srnd, sp["count"], sp["spread"], sp["bright"], anim))
        # Bloom at the emitter mouth, spilling back over the metal so the blade
        # has a visible source instead of beginning at a hard boundary.
        flare = ImageChops.add(
            flare, _emitter_flare(size, pts, srnd, radius=spec.get("flare", 30.0), bright=150))

    glow = ImageChops.add(body, mass).filter(ImageFilter.GaussianBlur(look["glow_blur"]))
    field = ImageChops.add(ImageChops.add(body, mass), tongues)
    field = ImageChops.add(field, spray)
    field = ImageChops.add(field, flare)
    field = ImageChops.add(field, glow.point(lambda v: int(v * 0.85)))
    field = field.filter(ImageFilter.GaussianBlur(0.7))
    hot = ImageChops.add(core, core.filter(ImageFilter.GaussianBlur(3.0)))
    hot = ImageChops.add(hot, flare.point(lambda v: int(v * 0.75)))

    field_norm = look["field_norm"]
    heat_norm = look["heat_norm"]
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
            inten = min(1.0, f / field_norm)
            heat = min(1.0, h / heat_norm)
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


# Blade shapes, in Blender units relative to the part pivot, **measured off each
# mech's emitter hardware in mechs.blend**. Root sits on the emitter mouth; tip
# holds the modelled reach the weapon already had, so converting a blade changes
# how it reads and not how far it appears to go.
#
# Colour is that mech's palette `glow` opened into three steps: `dim` a deeper,
# more saturated version of it, `body` the identity itself, `core` near-white
# with the hue still in it. Four of the five sit in the blue-cyan corner because
# four of these machines do; `LOOKS` carries the separation.
BLADES = {
    "pyre": dict(
        # The modelled emitter sits at the arc's root — a mismatch detaches the
        # blade from it. Mouth at x=1.58, prongs reaching to 1.93.
        arc=dict(r=2.20, cx=1.58 - 2.20, cz=0.02, span_deg=95.0, start_deg=0.0),
        width=0.34, peak_at=0.16, taper=1.25, tip=0.17, flare=34.0, look="scythe",
        dim=(214, 96, 12), body=(255, 186, 34), core=(255, 253, 232),
    ),
    # HALCYON: lens at x=0.23, prongs at 0.26. Modelled blade ran 0.26 -> 1.54.
    "halcyon": dict(
        chord=dict(root=(0.25, 0.0), tip=(1.54, 0.0), bow=0.018),
        width=0.085, peak_at=0.09, taper=0.40, tip=0.11, flare=26.0, look="beam",
        dim=(14, 84, 214), body=(96, 200, 255), core=(234, 250, 255),
    ),
    # VESPER: emitter wedge at x=0.24, spike ran 0.30 -> 0.94 at z=-0.02. Dead
    # straight — a thrusting weapon has no belly.
    "vesper": dict(
        chord=dict(root=(0.29, -0.02), tip=(0.94, -0.02), bow=0.0),
        width=0.055, peak_at=0.12, taper=1.00, tip=0.08, flare=20.0, look="spike",
        dim=(14, 150, 142), body=(120, 240, 214), core=(234, 255, 251),
    ),
    # CIRRUS: paired lenses at x=0.19, y=+/-0.10; blades ran 0.22 -> 0.78 at
    # z=0.02. The Y offset is the *only* thing separating the two on screen,
    # which is what makes `_project` load-bearing here rather than cosmetic.
    "cirrus": dict(
        chord=dict(root=(0.21, 0.02), tip=(0.78, 0.02), bow=0.02),
        # Widened from the modelled +/-0.10 to +/-0.15, matched in build_mechs.py.
        # At 0.10 the pair projected 6 px apart and merged into one fuzzy shard
        # at gameplay scale, which loses the entire point of a twin weapon.
        strands=[0.15, -0.15],
        width=0.058, peak_at=0.14, taper=0.80, tip=0.13, flare=18.0, look="shard",
        dim=(48, 130, 205), body=(150, 216, 255), core=(242, 251, 255),
    ),
    # NULLTIDE: head at x=1.02..1.12, prongs at 1.10. The modelled rod ran from
    # (1.15,-0.03) to (1.75,0.15) — 16 deg above the haft. Same root and tip, but
    # broad and bellied instead of a rod: a five-hit sweep needs a blade with a
    # face to sweep with.
    "nulltide": dict(
        chord=dict(root=(1.15, -0.03), tip=(1.75, 0.145), bow=0.05),
        width=0.125, peak_at=0.34, taper=0.85, tip=0.16, flare=26.0, look="cleaver",
        dim=(10, 116, 200), body=(60, 224, 255), core=(230, 252, 255),
    ),
}


# Kept between the drawn edge and the tile edge. The bound below is measured at
# alpha > 2, i.e. at the point the blade stops being visible at all, so this only
# has to cover the faintest fringe rather than guess at one.
FIT_PAD_PX = 10.0


def _content_half(frames):
    """Furthest any frame's visible pixels reach from the shared pivot."""
    probe = frames[0].size[0]
    c = probe / 2.0
    half = 0.0
    for im in frames:
        bb = im.getchannel("A").point(lambda v: 255 if v > 2 else 0).getbbox()
        if bb is None:
            continue
        half = max(half, abs(bb[0] - c), abs(bb[2] - c), abs(bb[1] - c), abs(bb[3] - c))
    return half


def _fit(frames):
    """
    Crop the probe canvas down to the smallest tile that holds every frame.

    Cropping is exact rather than an approximation of re-rendering: the blade is
    drawn in absolute pivot-relative coordinates, so taking an equal bite off all
    four sides leaves every pixel where it was and the pivot still dead centre.
    Both sizes are multiples of `TILE_STEP`, so the bite is always whole pixels.

    The union across turbulence frames is what matters — they are the same blade
    churning, so fitting one and clipping another would flicker at the tip.
    """
    probe = frames[0].size[0]
    half = _content_half(frames)
    steps = math.ceil(2.0 * (half + FIT_PAD_PX) / TILE_STEP)
    size = max(TILE_MIN, min(probe, steps * TILE_STEP))
    if size == probe:
        return frames, size, half
    o = (probe - size) // 2
    return [im.crop((o, o, o + size, o + size)) for im in frames], size, half


def _root_px(spec, size):
    """
    Where the blade leaves its emitter, in render px from the tile centre.

    The renderer needs this to breathe the blade *from its root*. A sprite scales
    about its own centre, and these blades are not centred on their roots — on
    PYRE the root sits 183 px out, so a 5 % scale slides it ~9 px off the emitter
    mouth and the energy visibly detaches from the staff. Short sabres hide the
    same error because their roots are only ~29 px out.
    """
    pts = _centreline(spec, _strands(spec)[0], size)
    rx, ry, _w = pts[0]
    return (round(rx - size / 2, 1), round(ry - size / 2, 1))


def _manifest_row(mech, spec, size, half):
    """The `meleeEnergy` row this generator now owns outright."""
    span = round(2.0 * half / PX_PER_BU, 4)
    dims = (span, 0.0, span)
    rx, ry = _root_px(spec, size)
    return {
        "root_px": [rx, ry],
        "root_logical_px": [round(rx * 0.5, 2), round(ry * 0.5, 2)],
        "file": f"{mech}_meleeEnergy.png",
        "tile": size,
        "dims_bu": list(dims),
        "dims_logical_px": [round(v * LOGICAL_PER_BU, 1) for v in dims],
        # Loud, because a reader who finds no such object in mechs.blend should
        # not conclude the manifest is stale.
        "source": "tools/energy_blade.py — drawn, not modelled; no Blender object",
    }


def _update_manifest(rows):
    """
    Writes the generated rows into `manifest.json`.

    `build_all(only=[...])` writes a *partial* parts map, so the caller must
    merge a pre-build base back in before this runs — this only touches the
    `meleeEnergy` rows and cannot repair anything else.
    """
    path = os.path.join(SPRITES, "manifest.json")
    with open(path, encoding="utf-8") as fh:
        meta = json.load(fh)
    parts = meta.setdefault("parts", {})
    for mech, row in rows.items():
        parts.setdefault(mech, {})["meleeEnergy"] = row
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(meta, fh, indent=2)
    return path


def main():
    rows = {}
    for mech, spec in BLADES.items():
        probe = _probe_tile(spec)
        # One seed for the whole loop; only the churn phase advances.
        frames = [render_blade(spec, seed=1000, size=probe,
                               anim=i * math.tau / FRAMES)
                  for i in range(FRAMES)]
        frames, size, half = _fit(frames)
        print(f"{mech}: {spec['look']}, {len(_strands(spec))} strand(s), "
              f"probe {probe} -> tile {size} (content half {half:.0f} px)")
        for i, img in enumerate(frames):
            name = f"{mech}_meleeEnergy.png" if i == 0 else f"{mech}_meleeEnergy_{i}.png"
            img.save(os.path.join(SPRITES, name))
        rows[mech] = _manifest_row(mech, spec, size, half)
    print(f"manifest: {_update_manifest(rows)}")
    print(f"{len(BLADES)} blade(s) x {FRAMES} frames")


if __name__ == "__main__":
    main()
