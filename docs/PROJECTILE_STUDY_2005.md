# How Babel Sword 2005 draws its projectiles

Findings from `Babel Sword 2005/chars/rs/` — the animation table `sff/0.air` and
the state files `st/f-*.cns` — plus the screenshots in
`Screenshots of Original 2005 Babel Sword/`.

Read this before implementing per-mech projectile art. Nothing here is copied;
it is a description of *technique* so ours can be built from scratch to the same
standard.

---

## 1. There are sixteen projectile families, not one

`grep "projanim = .* + var(21)"` across the state files returns sixteen distinct
base animation numbers:

```
12000  12060  12100  12200  12330  12360  12400  12430
12500  12530  12560  12600  12700  12800  12830  12860
```

Each base owns a run of 20–30 consecutive animation numbers. **The base is the
weapon; the offset is the angle.** That is the single most important structural
fact: the game does not rotate one sprite, it draws a pre-made sprite per
direction.

## 2. The offset is a firing direction, mirrored

```
st/f-a.cns:242
var(21) = Abs( var(20) % 20 - 20*(var(20)%20>10) ) + 10*(var(20)>20)
```

`var(20)` is the firing direction. The expression folds 0–19 into 0–10 (a
mirror about the vertical), then adds 10 for the other half. Animation `12020`
also carries a `V` flag — a vertical flip — so one drawn sprite covers up to
four directions.

Practical consequence for us: our projectiles are drawn with a rotation, which
is *not* what the reference does, and it is why ours look like one texture
turned rather than a designed shape per angle. A middle path is to author a few
distinct silhouettes and rotate them, which we already do — the gap is that we
use **one** silhouette for everything.

## 3. Everything is additive, and it flickers every frame

A typical entry:

```
[Begin Action 12000]
10200,10,0,0,1,,A          ; one-frame spawn flash, additive
loopstart
Clsn1Defalt: 1
 Clsn1[0] = -3,-3,3,3
10100,10,0,0,1,,A1         ; body, additive at half destination
10100,10,0,0,1,,A          ; body, full additive
```

Three things worth taking:

* **`A` = `trans_add`.** Every projectile frame in the bank is additive. Nothing
  is drawn opaque. This is where the glow comes from.
* **`A1` = `AS256D128`.** The body alternates between two additive strengths on
  consecutive frames — a one-frame **intensity flicker** at 60 Hz. That shimmer
  is a large part of why the shots read as energy rather than as sprites.
* **A separate one-frame spawn flash** (group `10200`) is baked into the front of
  the animation rather than spawned as its own effect.

## 4. The hitbox is tiny and the glow is not

`Clsn1` is `-3,-3,3,3` (6×6 px) or `-4,-4,4,4` on the larger families, and
`projscale = 0.5`. The *drawn* shot is many times larger than the thing that
actually hits. Ours currently sizes the sprite off `projRadius`, which ties the
look to the hitbox — the reference deliberately does not.

## 5. Trails are AfterImage, and they are very short

```
st/f-a.cns:842
type = AfterImage
time = 2
length = 2
TimeGap = 1
FrameGap = 1
trans = none
```

Only **two** frames of smear, one frame apart. The long streaks in the
screenshots are not long trails — they are short trails on **fast** projectiles,
plus the fact that several are fired at once in a fan. Worth knowing before
building a 20-node trail that would look nothing like it.

## 6. Motion is not linear

Sampled from three families in `f-a.cns`:

| | `velmul` | `accel` | `projremovetime` | damage |
| --- | --- | --- | --- | --- |
| 12430 family | 0.945 | `vel/30` | 120 | 50 |
| 12830 family | 1.0 | `vel/8` | 90 | 30 |
| 12860 family | 0.97 | `vel/30` | 90 | 20 |

So shots variously decelerate hard, accelerate hard, or coast. Combined with the
per-family sprite this is most of what makes each weapon feel different in
flight. We currently fire everything at a constant velocity.

## 7. Secondary effects are Explods, randomised and depth-scaled

```
type = Explod
anim = 100021
scale = 0.65 * fvar(35), 0.65 * fvar(35)
facing  = Ifelse(Random < 500, -1, 1)
vfacing = Ifelse(Random < 500, -1, 1)
ownpal = 1
```

* `fvar(35)` is the pseudo-3D depth scale — effects shrink with distance exactly
  as the mechs do. Ours already does this via `depthScaleAt`.
* Both flips are randomised per spawn, so a small sprite bank reads as varied.
* The trigger list ramps: `time > 12 && time%6`, then `time%4`, then `time%2`,
  then every frame — the effect **accelerates** as the state runs, rather than
  emitting at a constant rate.

## 8. What the screenshots add

From `babel-sword-01.png` and `babel-sword-03.png`:

* **Parallel bundles.** A volley is drawn as four to six thin streaks of slightly
  different length side by side, not one thick line.
* **Ring / donut shapes** — bright annulus with a dark centre, fired in an arc.
* **Spiked star orbs** — slow, round, with a jagged silhouette.
* **Needles** — very thin, very long, near-white core with a coloured fringe.
* **Colour is per pilot, not per weapon.** One mech's whole output is crimson,
  the other's is magenta/violet, including their thruster plumes.
* Impacts throw small hot dots that fall — the same shape as our new stun sparks.

---

## What this means for Reignition

Current state: one texture (`fx_streak` or `fx_glow`) tinted per projectile
kind, sized from the hitbox radius, moving in a straight line. Five kinds, eight
mechs, one look.

The gap, in priority order:

1. **A shape per weapon family, not per kind.** Eight mechs × six weapons is too
   many to author individually; the reference's answer is a bank of ~16 families
   reused across the roster with per-mech colour. That is the right scale.
2. **Additive everywhere, with a per-frame intensity flicker.** Cheap, and it is
   most of the "energy" read.
3. **Decouple drawn size from hitbox.** Add an explicit visual scale to
   `AttackDef` rather than deriving from `projRadius`.
4. **Per-family motion** — `velmul` / `accel` equivalents so a slug decelerates
   and a rocket accelerates.
5. **Bundles for multi-shot weapons**, drawn as several offset thin streaks.
6. **Muzzle and impact effects keyed to the family**, randomised flips, ramping
   emission.

Where the art comes from is an open question. Blender can render projectile
sprites the same way it renders mech parts (orthographic, transparent PNG,
packed into an atlas), which would match the pipeline we already have and give
real shapes per family. Procedural canvas textures are the cheaper alternative
and are what `Textures.ts` does today.
