"""
Samples a reference animation and prints curves in the terms the rig uses.

WHY
---
`animation examples/` holds ~195 Mixamo clips. They are only useful if the
numbers can be pulled out of them cheaply, in the same units the rig is authored
in — otherwise every question costs a bespoke sampling script, and the answers
get eyeballed instead of measured.

Everything here reports in **normalised swing progress** (0..1 across the clip or
a chosen slice) so a curve drops straight into `swingArcAngle` and friends.

SAFETY
------
**`mechs.blend` must never acquire a Mixamo skeleton** — `build_all` saves that
file on every run. The clip is imported into the live scene and then discarded by
reloading the .blend from disk; see `_discard` for why the two more obvious
approaches both fail. Do not run a build between importing and discarding.

    exec(open(r"<project>/tools/blender/anim_probe.py").read())
    probe("Double Dagger Stab")
    probe("great sword power up", slices=1)

**Verify this still runs before trusting it** — the import path fought the MCP
bridge twice (see `_discard`) and has not been exercised end to end since the
last fix.
"""

import math
import os

import bpy
from mathutils import Vector

ANIM_DIR = r"C:\Games\Babel Sword Claude\animation examples"

# Mixamo names, so callers do not have to know the prefix.
HIPS = "mixamorig:Hips"
R_SHOULDER = "mixamorig:RightShoulder"
R_HAND = "mixamorig:RightHand"
L_HAND = "mixamorig:LeftHand"

# Our chassis height in logical px, for converting the reference's proportions.
# Mixamo figures stand ~1.7 Blender units; a proportion times this is our pixels.
CHASSIS_PX = 104.0


def _discard():
    """
    Throw the imported rig away by **reloading the .blend from disk**.

    Two approaches were tried and both failed:

    * Removing the armature by iterating `bpy.data.objects` and calling
      `remove()` **hung Blender outright** and needed the process killed.
    * Resetting first with `read_homefile()` breaks the importer: it calls
      `object.mode_set`, whose poll needs an active object, and code driven
      through the MCP bridge does not inherit the UI's selection — so the import
      dies with "Context missing active object" even though the startup cube is
      there.

    Reloading the file is neither. It discards everything in memory, restores a
    known-good scene, and touches nothing on disk. **Import into the live scene,
    measure, then call this** — and never let a build run in between, because
    `build_all` would save the Mixamo skeleton into `mechs.blend`.
    """
    blend = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        "assets", "blender", "mechs.blend",
    )
    if os.path.exists(blend):
        bpy.ops.wm.open_mainfile(filepath=blend)


def _load(name):
    path = name if name.lower().endswith(".fbx") else os.path.join(ANIM_DIR, name + ".fbx")
    if not os.path.exists(path):
        raise FileNotFoundError(path)
    bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=True)
    return next(o for o in bpy.data.objects if o.type == "ARMATURE")


def _unwrap(seq):
    """Remove the +-180 wrap, which otherwise reports sweeps that never happened."""
    out = [seq[0]]
    for a in seq[1:]:
        d = a - out[-1]
        while d > 180:
            d -= 360
        while d < -180:
            d += 360
        out.append(out[-1] + d)
    return out


def sample(name, discard=True):
    """Per-frame measurements for one clip.

    Imports into the *live* scene — see `_discard` for why a pre-reset does not
    work — and reloads `mechs.blend` afterwards unless told not to.
    """
    arm = _load(name)
    scn = bpy.context.scene
    act = arm.animation_data.action
    f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])

    def head(b):
        return arm.matrix_world @ arm.pose.bones[b].head

    rows = []
    for f in range(f0, f1 + 1):
        scn.frame_set(f)
        bpy.context.view_layer.update()
        hips, sh = head(HIPS), head(R_SHOULDER)
        hand, lhand = head(R_HAND), head(L_HAND)
        v = hand - sh
        rel = hand - hips
        hm = (arm.matrix_world @ arm.pose.bones[R_HAND].matrix).to_3x3()
        fwd = hm @ Vector((0, 1, 0))
        rows.append({
            "f": f,
            "arm": math.degrees(math.atan2(v.y, v.z)),
            "wpn": math.degrees(math.atan2(fwd.y, fwd.z)),
            "fwd": rel.z,
            "up": rel.y,
            "hands": (hand - lhand).length,
        })
    for k in ("arm", "wpn"):
        un = _unwrap([r[k] for r in rows])
        for r, v in zip(rows, un):
            r[k] = v
    if discard:
        _discard()
    return rows


def _strikes(rows):
    """Frame indices where angular speed peaks — one per slash in the clip."""
    vel = [0.0] + [rows[i]["arm"] - rows[i - 1]["arm"] for i in range(1, len(rows))]
    peak = max(abs(v) for v in vel)
    hits, i = [], 1
    while i < len(vel):
        if abs(vel[i]) > peak * 0.6:
            j = i
            while j + 1 < len(vel) and abs(vel[j + 1]) > peak * 0.6:
                j += 1
            hits.append(((i + j) // 2, round(sum(vel[i:j + 1]), 1)))
            i = j + 8          # skip past this strike before looking for the next
        i += 1
    return hits


def probe(name, slices=None):
    """
    Print a clip in rig terms.

    **Clips often contain several strikes**, and timing one against the whole clip
    is how `windupFrac` was once set to 0.19 when the truth was 0.60. `slices`
    splits the clip evenly; omit it and the strike detector reports how many it
    found so the caller can choose.
    """
    rows = sample(name)
    n = len(rows)
    hits = _strikes(rows)
    print(f"\n  {name}  —  {n} frames, {len(hits)} strike(s) detected")
    for k, (f, sweep) in enumerate(hits):
        print(f"    strike {k}: frame {rows[f]['f']}  sweep {sweep:+.0f} deg")

    parts = slices or max(1, len(hits))
    seg = n / parts
    ups = [r["up"] for r in rows]
    fwds = [r["fwd"] for r in rows]
    span_up = (max(ups) - min(ups)) * CHASSIS_PX / 1.7
    span_fwd = (max(fwds) - min(fwds)) * CHASSIS_PX / 1.7
    hands = [r["hands"] for r in rows]
    print(f"    hand travel: {span_fwd:.0f} px forward, {span_up:.0f} px vertical "
          f"(at {CHASSIS_PX:.0f} px chassis)")
    print(f"    hand separation: {min(hands):.3f}-{max(hands):.3f} "
          f"({min(hands) / 1.7 * 100:.1f}-{max(hands) / 1.7 * 100:.1f}% of height)")

    for s in range(parts):
        a, b = int(s * seg), int((s + 1) * seg) - 1
        sub = rows[a:b + 1]
        if len(sub) < 4:
            continue
        vel = [0.0] + [sub[i]["arm"] - sub[i - 1]["arm"] for i in range(1, len(sub))]
        pi = max(range(len(vel)), key=lambda i: abs(vel[i]))
        print(f"\n    slice {s}  frames {sub[0]['f']}-{sub[-1]['f']}  "
              f"windupFrac ~{pi / len(sub):.2f}  peak {vel[pi]:+.0f} deg/frame")
        print("        t     arm°   weapon°     fwd      up")
        for i in range(0, len(sub), max(1, len(sub) // 8)):
            r = sub[i]
            print(f"      {i / len(sub):.2f} {r['arm'] - sub[0]['arm']:8.1f} "
                  f"{r['wpn'] - sub[0]['wpn']:9.1f} {r['fwd']:7.3f} {r['up']:7.3f}")
    print("")
    return rows


def catalogue():
    """Every clip name, for picking one."""
    names = sorted(f[:-4] for f in os.listdir(ANIM_DIR) if f.lower().endswith(".fbx"))
    print(f"{len(names)} clips")
    return names
