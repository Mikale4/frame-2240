"""
Generates NULLTIDE's shock-baton electricity.

WHY THIS IS NOT `energy_blade.py`
---------------------------------
NULLTIDE no longer projects a blade. The weapon is an extended baton — all
hardware, built in `build_mechs.py` under `blade == "baton"` — and what is drawn
here is *discharge crawling over it*, which is a different thing to draw and
wants a different construction.

`energy_blade.py` accumulates filaments along a centreline until they add up to
a **silhouette**: the blade is the shape the plasma makes, so the generator's
whole job is producing an outline that is dense in the middle and frays at the
rim. Electricity has no silhouette to make. It has **anchors** — the studs,
collars and electrodes on the rod — and it jumps between them along paths that
are nearly straight and violently kinked. So this generator is midpoint
displacement between fixed electrode positions, and nothing here tapers,
breathes or has a width profile.

FRAMES ARE PHASES, AND THIS WAS GOT WRONG ONCE
----------------------------------------------
The first cut made **every frame an independent re-strike**, reasoning that a
real spark is over in a millisecond and the next one is somewhere else. That is
true of a spark and false of this weapon: looked at on screen it read as
*sporadic* — visual noise with no object in it — because nothing on the rod
survived from one frame to the next, so there was never a discharge to follow,
only a new one every 71 ms.

What it needs instead is what a steady arc actually looks like: **the same
channels, persisting, with their kinks travelling.** So the topology is rolled
once and frozen — which electrodes are bridged, how many forks, where they leave
— and each frame is a *phase* of that fixed set, every kink oscillating on its
own smooth cycle. The discharge is then continuously there and continuously
moving, which is the read the reference has.

That makes the frame count a smoothness dial exactly as it is for the blades,
and 10 was far too few. See FRAMES.

    python tools/electric_baton.py

Output: assets/sprites/mechs/nulltide_meleeArc.png       (frame 0)
        assets/sprites/mechs/nulltide_meleeArc_<n>.png   (frames 1..N-1)

Built to the MK-7 electro-tactical baton reference: arcs hugging the shaft the
whole live length, brightest and widest around the strike head, thin and
many-branched rather than a few fat bolts.
"""

import json
import math
import os
import random

from PIL import Image, ImageChops, ImageDraw, ImageFilter

# Shared with the blade generator so the two cannot drift apart on the one thing
# they both have to agree with `build_mechs.py` about: where a Blender point
# lands on the tile.
from energy_blade import (
    PX_PER_BU,
    LOGICAL_PER_BU,
    TILE_MAX,
    TILE_MIN,
    TILE_STEP,
    _project,
)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPRITES = os.path.join(ROOT, "assets", "sprites", "mechs")

MECH = "nulltide"
PART = "meleeArc"

# Phases of one continuous discharge — see the note above. 24 at the renderer's
# 20 Hz is a 1.2 s loop; at 10 the motion was steppy enough to read as the
# sporadic thing the note describes, and the cost of more is only atlas space.
FRAMES = 24

# NULLTIDE's palette, matching the removed blade entry so the machine's colour
# identity survives the weapon change.
DIM = (10, 116, 200)
BODY = (60, 224, 255)
CORE = (230, 252, 255)

# ---------------------------------------------------------------- geometry
#
# All in the weapon's own Blender units, and all of it read off the baton in
# `build_mechs.py`. If the rod is re-proportioned there, these move with it.

# Telescoping runs as (x_start, x_end, radius) — SEGS in the builder, plus the
# grip below and the strike head above.
RUNS = (
    (0.40, 0.80, 0.072),
    (0.80, 1.16, 0.060),
    (1.16, 1.50, 0.049),
)

# Where discharge can attach: the core window, the live stud on each segment
# shoulder, the two bands closing the cage, and the cap window. These are the
# lit fittings on the model, so an arc leaving one has a visible source.
ELECTRODES = (0.47, 0.80, 1.16, 1.48, 1.78, 1.86)

# The strike head, which carries most of the discharge.
HEAD_X0, HEAD_X1 = 1.44, 1.90


def _rod_radius(x):
    """Half-thickness of the rod at x, so arcs can hug it rather than float."""
    if x < RUNS[0][0]:
        return 0.082  # grip
    for x0, x1, r in RUNS:
        if x <= x1:
            return r
    # The cage is the widest thing on the weapon and the arcs should clear it.
    return 0.100


class Channel:
    """
    One persistent discharge path: fixed endpoints, fixed kink structure, and a
    per-kink phase so the whole thing writhes without ever being re-rolled.

    `wob` is the pair the animation turns on. Every subdivision node gets a
    random phase offset and a random cycle rate, drawn **once**, and its
    displacement is then `amp * sin(tau * phase * rate + offset)` — smooth in
    the frame index, periodic over the loop, and different at every node so the
    path ripples along its length rather than swinging as one piece.

    The rates are whole numbers so that every node returns to where it started
    after exactly one loop. A non-integer rate anywhere makes the last frame
    disagree with the first, and the seam shows as a jolt once a second.
    """

    __slots__ = ("a", "b", "jag", "depth", "strength", "wob")

    def __init__(self, rng, a, b, jag, depth, strength):
        self.a, self.b = a, b
        self.jag, self.depth, self.strength = jag, depth, strength
        # Enough nodes for every level of subdivision: 2^depth is the upper
        # bound on midpoints introduced. Each carries **two** oscillators, for
        # the two directions perpendicular to the path — see `_bolt`.
        n = 2 ** depth
        self.wob = [
            (rng.uniform(0.0, math.tau), rng.choice((1, 1, 2, 2, 3)), rng.uniform(0.55, 1.0),
             rng.uniform(0.0, math.tau), rng.choice((1, 1, 2, 2, 3)), rng.uniform(0.55, 1.0))
            for _ in range(n)
        ]


def _bolt(chan, phase):
    """
    One discharge path at a given phase, by midpoint displacement.

    The classic lightning construction and the right one here: a bolt is a
    straight line between two electrodes that has been kinked at every scale, so
    subdividing and displacing perpendicular is not an approximation of the
    shape — it *is* the shape. `jag` is the displacement at the coarsest level
    in Blender units; each level halves it, which is what gives the path detail
    at every zoom instead of one obvious zigzag frequency.

    The displacements come from `chan.wob` rather than from an rng, which is the
    whole reason this animates rather than flickers. **Nodes are consumed in a
    fixed order**, so node k is the same kink in every frame.

    **The kink is displaced in three dimensions, and it was two once.** The first
    cut worked entirely in the weapon's XZ plane — every point had `y = 0` — so
    the whole discharge was a flat ribbon standing on the rod's axis. Seen
    through the camera that reads exactly as it is: arcs tied to the top and the
    bottom of the baton with nothing wrapping the sides. Two perpendiculars are
    needed because a rod is a cylinder, not a line, and the discharge has to be
    able to go round it.
    """
    pts = [chan.a, chan.b]
    amp = chan.jag
    k = 0
    for _ in range(chan.depth):
        out = [pts[0]]
        for a, b in zip(pts, pts[1:]):
            m = ((a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5, (a[2] + b[2]) * 0.5)
            d = (b[0] - a[0], b[1] - a[1], b[2] - a[2])
            ln = math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]) or 1.0
            u = (d[0] / ln, d[1] / ln, d[2] / ln)
            # An orthonormal pair across the path. The reference axis is chosen
            # off whichever component of `u` is smallest, so the cross product
            # never degenerates on a run that happens to lie along it.
            ref = (0.0, 0.0, 1.0) if abs(u[2]) < 0.9 else (0.0, 1.0, 0.0)
            n1 = (u[1] * ref[2] - u[2] * ref[1],
                  u[2] * ref[0] - u[0] * ref[2],
                  u[0] * ref[1] - u[1] * ref[0])
            l1 = math.sqrt(sum(v * v for v in n1)) or 1.0
            n1 = (n1[0] / l1, n1[1] / l1, n1[2] / l1)
            n2 = (u[1] * n1[2] - u[2] * n1[1],
                  u[2] * n1[0] - u[0] * n1[2],
                  u[0] * n1[1] - u[1] * n1[0])
            o1, r1, s1, o2, r2, s2 = chan.wob[k % len(chan.wob)]
            k += 1
            d1 = amp * s1 * math.sin(math.tau * phase * r1 + o1)
            d2 = amp * s2 * math.sin(math.tau * phase * r2 + o2)
            out.append((m[0] + n1[0] * d1 + n2[0] * d2,
                        m[1] + n1[1] * d1 + n2[1] * d2,
                        m[2] + n1[2] * d1 + n2[2] * d2))
            out.append(b)
        pts = out
        amp *= 0.5
    return pts


def _channels(rng):
    """
    The discharge topology, rolled **once** and then held for every frame.

    This is the fix for the sporadic read: which electrodes are bridged, how
    many forks each run carries and where the strays leave from are properties
    of the *weapon*, not of the moment. Only the kinks move.

    Tamer than the first cut throughout — the jag figures here are roughly two
    thirds of what they were, and the strays are fewer. Wild amplitude was doing
    the same damage as the re-rolling: a discharge that flails is not a weapon
    that is switched on, it is interference.
    """
    out = []

    def surface(x, theta, clear=0.018):
        """A point on the rod's surface at axial x and angle theta round it."""
        r = _rod_radius(x) + clear
        return (x, math.cos(theta) * r, math.sin(theta) * r)

    # 1. Shaft runs: electrode to electrode, **spiralling round the rod**.
    #
    #    `SPOKES` runs per gap, started at evenly spaced angles, each advancing
    #    its angle along the run. **Three, not five.** Five wrapped the rod
    #    correctly and doubled the channel count to 66, which stopped reading as
    #    a baton with discharge on it and started reading as a spindle of light
    #    with a handle. Three still puts a run on every face; the density that
    #    survived review is about thirty channels total. The spacing is what makes the discharge sit
    #    all round the baton instead of on two faces of it, and the advance is
    #    what carries each arc across the silhouette from front to back so the
    #    rod reads as round rather than as a flat strip.
    SPOKES = 3
    for a, b in zip(ELECTRODES, ELECTRODES[1:]):
        base = rng.uniform(0.0, math.tau)
        for s in range(SPOKES):
            th0 = base + s * math.tau / SPOKES
            th1 = th0 + rng.choice((-1, 1)) * rng.uniform(0.8, 1.9)
            ch = Channel(rng, surface(a, th0), surface(b, th1),
                         jag=0.020, depth=5, strength=1.0)
            out.append(ch)
            # Forks. The reference's arcs are *many-branched* — that is most of
            # what makes them read as electric rather than as a drawn squiggle.
            for _ in range(rng.randint(0, 1)):
                f = rng.uniform(0.25, 0.75)
                root = surface(a + (b - a) * f, th0 + (th1 - th0) * f)
                tip = surface(a + (b - a) * f + rng.uniform(-0.09, 0.09),
                              th0 + (th1 - th0) * f + rng.uniform(-1.1, 1.1),
                              clear=rng.uniform(0.03, 0.075))
                out.append(Channel(rng, root, tip, jag=0.012, depth=3, strength=0.62))

    # 2. The strike head: denser, wider, brighter. This is the reference's
    #    strongest read and the reason the head was modelled with a cage — the
    #    arcs are meant to be seen crawling over and through it. Endpoints are
    #    taken all round the cage, not just above and below it.
    for _ in range(7):
        x0 = rng.uniform(HEAD_X0, HEAD_X1)
        x1 = rng.uniform(HEAD_X0, HEAD_X1)
        t0 = rng.uniform(0.0, math.tau)
        t1 = t0 + rng.uniform(-2.4, 2.4)
        out.append(Channel(rng,
                           surface(x0, t0, clear=rng.uniform(0.02, 0.075)),
                           surface(x1, t1, clear=rng.uniform(0.02, 0.075)),
                           jag=0.034, depth=5, strength=1.0))

    # 3. Strays: a whip leaving an electrode and going nowhere, which is what
    #    stops the effect looking like it is confined to a tube. It leaves
    #    *radially*, along its own angle, so a stray on the far side goes away
    #    from the camera rather than always up or down the screen.
    #
    #    **`jag` is an absolute displacement, so it has to be read against the
    #    path's length, not chosen on its own.** At a flat 0.045 over a 0.30
    #    excursion these came out very nearly straight, and a straight bright
    #    line at an angle to the rod does not read as a stray arc — it reads as a
    #    scratch on the sprite. The shaft runs get away with a small absolute
    #    figure because they are anchored at both ends and much shorter.
    for _ in range(2):
        a = rng.choice(ELECTRODES)
        th = rng.uniform(0.0, math.tau)
        root = surface(a, th)
        tip = surface(a + rng.uniform(-0.12, 0.12), th + rng.uniform(-0.5, 0.5),
                      clear=rng.uniform(0.08, 0.14))
        span = math.sqrt(sum((p - q) ** 2 for p, q in zip(root, tip)))
        out.append(Channel(rng, root, tip, jag=span * 0.34, depth=5, strength=0.5))
    return out


def _to_px(path, size):
    """Weapon-local (x, y, z) -> tile pixels, through the real camera basis."""
    c = size / 2.0
    out = []
    for x, y, z in path:
        sx, su = _project(x, y, z)
        # Blender +Z is up; image +y is down.
        out.append((c + sx * PX_PER_BU, c - su * PX_PER_BU))
    return out


# How much dimmer an arc is on the far side of the rod than the near side.
#
# The camera sits at negative Y (see `_project`), so +Y is away from it. Without
# this the discharge wraps the rod correctly and still reads flat, because the
# half of it passing *behind* the baton is exactly as bright as the half in
# front — and the layer is drawn above the hardware, so there is no occlusion to
# supply the cue. This is the only depth information the sprite carries.
FAR_DIM = 0.46


def _depth_mul(y):
    """1.0 nearest the camera, `FAR_DIM` furthest, smooth between."""
    # +/-0.2 BU covers the widest excursion round the rod.
    t = max(0.0, min(1.0, (y + 0.2) / 0.4))
    return 1.0 + (FAR_DIM - 1.0) * t


def render_arcs(channels, phase, size):
    """One phase of the discharge, as an RGBA tile."""
    paths = [(_bolt(ch, phase), ch.strength) for ch in channels]

    # Three passes, widest and dimmest first. The glow is blurred hard and the
    # core is left at one pixel: an arc is a *thread* with a haze around it, and
    # drawing it at any real width immediately reads as a painted stroke.
    glow = Image.new("RGB", (size, size), (0, 0, 0))
    body = Image.new("RGB", (size, size), (0, 0, 0))
    core = Image.new("RGB", (size, size), (0, 0, 0))
    dg, db, dc = ImageDraw.Draw(glow), ImageDraw.Draw(body), ImageDraw.Draw(core)

    # Drawn **segment by segment**, not as one polyline, so the depth cue can
    # vary along a path. A spiralling arc crosses from the near side of the rod
    # to the far side within its own length, and one strength for the whole
    # channel would throw that away — which is most of what makes it read round.
    for path, strength in paths:
        px = _to_px(path, size)
        if len(px) < 2:
            continue
        for i in range(len(px) - 1):
            seg = (px[i], px[i + 1])
            k = strength * _depth_mul((path[i][1] + path[i + 1][1]) * 0.5)
            dg.line(seg, fill=tuple(int(v * k) for v in DIM), width=9)
            db.line(seg, fill=tuple(int(v * k) for v in BODY), width=3)
            if k > 0.55:
                dc.line(seg, fill=tuple(int(v * k) for v in CORE), width=1)

    glow = glow.filter(ImageFilter.GaussianBlur(7.0))
    body = body.filter(ImageFilter.GaussianBlur(1.3))
    lit = ImageChops.add(ImageChops.add(glow, body), core)

    # Alpha from luminance: the sprite is drawn over the rod, so where nothing
    # was struck it has to be genuinely transparent rather than black.
    r, g, b = lit.split()
    alpha = ImageChops.lighter(ImageChops.lighter(r, g), b)
    out = Image.merge("RGBA", (r, g, b, alpha))
    return out


def _probe_tile():
    """Canvas certain to hold the widest strike, rounded to the atlas step."""
    # Longest extent from the pivot is the cap, plus the widest stray excursion.
    reach = (HEAD_X1 + 0.34) * PX_PER_BU
    size = int(math.ceil(reach * 2.0 / TILE_STEP) * TILE_STEP)
    return max(TILE_MIN, min(TILE_MAX, size))


def _fit(frames):
    """
    Crop every frame to one tile that holds all of them.

    **Rectangular, unlike the blade generator's square fit, and it has to be.**
    A baton is a long thin thing and the discharge is a band along it: measured,
    the content is about 360 x 90 px inside a 512 square, so three quarters of
    every tile is empty. Squared off at 24 frames that produced a 2048x4224
    atlas for one chassis — **past the 4096 maximum texture size a good deal of
    hardware reports**, which is not a wasted-bytes problem but a will-not-load
    one.

    Both axes still stay centred on the pivot, because that is what lets the
    layer be drawn at the melee weapon's own offset with a centred origin.
    """
    pw, ph = frames[0].size
    cx, cy = pw / 2.0, ph / 2.0
    hx = hy = 0.0
    for im in frames:
        bb = im.getchannel("A").point(lambda v: 255 if v > 2 else 0).getbbox()
        if bb is None:
            continue
        hx = max(hx, abs(bb[0] - cx), abs(bb[2] - cx))
        hy = max(hy, abs(bb[1] - cy), abs(bb[3] - cy))
    hx += 10.0
    hy += 10.0
    step = lambda h, lo: max(lo, min(TILE_MAX, int(math.ceil(h * 2.0 / TILE_STEP) * TILE_STEP)))
    w = step(hx, TILE_MIN)
    # No TILE_MIN floor on height — that floor exists to keep a blade's square
    # tile sane, and applying it here would put back most of what this saves.
    h = step(hy, TILE_STEP)
    ox, oy = int((pw - w) / 2), int((ph - h) / 2)
    return [im.crop((ox, oy, ox + w, oy + h)) for im in frames], (w, h), (hx, hy)


def _manifest_row(size, half):
    w, h = size
    hx, hy = half
    dims = (round(2.0 * hx / PX_PER_BU, 4), 0.0, round(2.0 * hy / PX_PER_BU, 4))
    return {
        "file": f"{MECH}_{PART}.png",
        # Two numbers, not one: this layer's tile is a band, not a square.
        "tile": [w, h],
        "dims_bu": list(dims),
        "dims_logical_px": [round(v * LOGICAL_PER_BU, 1) for v in dims],
        # No `root_px`. The blade needs one because it breathes and a sprite
        # scales about its centre; the arc layer never scales, so a centred
        # origin is exactly right and an anchor would be a value nothing reads.
        "source": "tools/electric_baton.py — drawn, not modelled; no Blender object",
    }


def _update_manifest(row):
    """
    Writes the `meleeArc` row into `manifest.json`.

    Same warning as the blade generator: `build_all(only=[...])` writes a
    *partial* parts map, so a merge base has to be restored before this runs.
    This only touches its own row and cannot repair anything else.
    """
    path = os.path.join(SPRITES, "manifest.json")
    with open(path, encoding="utf-8") as fh:
        meta = json.load(fh)
    parts = meta.setdefault("parts", {})
    parts.setdefault(MECH, {})[PART] = row
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(meta, fh, indent=2)
        fh.write("\n")
    return path


def main():
    probe = _probe_tile()
    # One topology, held across the loop; only the phase advances. See the
    # module note — this is the difference between a discharge and a flicker.
    channels = _channels(random.Random(4200))
    frames = [render_arcs(channels, i / FRAMES, probe) for i in range(FRAMES)]
    frames, size, half = _fit(frames)
    print(f"{MECH}: {len(channels)} channels x {FRAMES} phases, "
          f"probe {probe} -> tile {size[0]}x{size[1]} "
          f"(content half {half[0]:.0f}x{half[1]:.0f} px)")
    for i, img in enumerate(frames):
        name = f"{MECH}_{PART}.png" if i == 0 else f"{MECH}_{PART}_{i}.png"
        img.save(os.path.join(SPRITES, name))
    print(f"manifest: {_update_manifest(_manifest_row(size, half))}")


if __name__ == "__main__":
    main()
