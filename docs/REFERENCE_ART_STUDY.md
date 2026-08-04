# Babel Sword 2005 — art and animation study

Made by reading the original's data directly and by **watching it run**. It is a
**M.U.G.E.N** (WinMugen) game: `chars/rs/sff/0.sff` holds 1087 sprites,
`sff/0.air` defines 1343 animations, `data/fightfx-01.sff` holds 203 effect
sprites, and `chars/rs/pal/` holds 56 `.act` palettes.

Reference frames kept in `docs/reference/`.

> **This document exists because the direction taken in D128 was wrong.** That
> pass darkened and desaturated the mechs to "match" the stage. The original does
> the *opposite*, and the mismatch was not subtle.

---

## 1. The single most important finding: mechs are LOUD, not muted

D128 measured CATHEDRAL YARD's deck at luminance 44 and drove the mechs down
toward it — 133→106 mean, capping highlights at 212. **That is backwards.**

In the original, the environment is **mid-value and busy**, and the mechs and
their effects are **brighter and far more saturated than the background**. In one
captured frame the ground plane is near-*white* city grid; the sky is a mid
purple haze; and the machines read because they are high-chroma orange, white and
red against it — not because they are lighter.

**Separation comes from chroma and hard edges, not from value.** The palette is
white + orange + navy + red hazard stripes + green indicator lights, all at high
saturation, with black separation lines around every component.

Practical consequence: the D128 key-light reduction (1500 → 800) fixed a real
defect (armour blowing to pure white) but the accompanying "ground the mechs to
the stage's value register" reasoning was wrong and should not be extended.

## 2. Animation is true 60 fps, hand-drawn, and that is the fluidity

Parsed from `0.air`, across all 1343 actions:

| frame duration | count | effective rate |
| --- | --- | --- |
| **1 tick (16.7 ms)** | **2502** | **60 fps** |
| 2 ticks | 1071 | 30 fps |
| 3 ticks | 343 | 20 fps |
| 4+ ticks | ~110 | 15 fps and below |

**Over half of every frame in the game is a distinct drawing held for a single
60 fps tick.** Melee actions run **35–47 unique frames**; action `103070` is 43
frames in 43 ticks — 0.72 s with a new drawing every frame. Action `33012` is 47
frames in 74 ticks.

**Reignition does not animate this way at all.** It poses a 13-part rig
procedurally — parts rotate and translate, and no part ever changes shape. That
is why its melee reads as stiff next to the original's, and no amount of texture
work touches it. This is a structural difference, not a polish difference.

## 3. Sprite craft

From `docs/reference/bs2005_hardware_sprites.png` — real weapon and pod sprites
at native resolution:

* **Hard cel shading, roughly 4 value steps per form.** No soft gradients
  anywhere. Reignition's EEVEE renders are continuous-gradient, which is a large
  part of the "came out of Blender" read.
* **Black separation lines** between every adjacent component, not just around
  the silhouette. Reignition has a Freestyle contour on the outside only.
* **Dense greebles**: vents, cylinders, cable runs, bolt rows, antennae.
* **Decals and lettering** — `HH-007M`, `12AKU`, numerals, red diagonal hazard
  stripes, small green status lights. Almost every sprite carries some.
* **Local colour contrast within one unit**: a white body against an orange band
  against a navy block against a black joint, all in ~60 px.

## 4. Size differentiation — the roster is far too uniform

Measured maximum opaque bounding boxes per sprite group in the original: bodies
run from roughly **80 px** for the small frames to **250–370 px** for the heavy
ones, i.e. **3x or more**.

Reignition's eight rigs:

| | scale |
| --- | --- |
| CIRRUS | 0.82 |
| PYRE | 0.89 |
| VESPER | 0.93 |
| HALCYON | 1.00 |
| NULLTIDE | 1.04 |
| NOCTURNE | 1.11 |
| OBELISK | 1.18 |
| TERRAMOTH | 1.29 |

**Total spread 1.57x**, and the middle six sit inside 0.89–1.18 — a 33 % band.
The roster is effectively one size. The original's silhouette range is a primary
identity cue and Reignition is not using it.

## 5. Projectiles — far more types and patterns than Reignition has

Observed in play and in the effect sprites:

**Types**: small "rice" bullets fired in dense streams; long energy beams
(full-screen lances); circular/orb projectiles; capsule rounds arranged in
formation; mines and minefields; homing micro-missiles; radial shockwave rings;
expanding energy spheres.

**Patterns**: spiral, spread/fan, displacement (bullets that shift laterally
mid-flight), ricochet (bounce off surfaces), tracking, side-swiping arcs, and
walls of bullets held in formation before release.

Reignition currently has `line` and `stack` patterns plus simple homing. The gap
here is large and is gameplay-visible, not just cosmetic.

## 6. Confirmed shared design

The original's HUD shows **SHOOT / SPEED / SHIELD** mode badges, a hit counter,
gradient health bars and an OVERHEAT state — the same three-mode saturation
system Reignition already implements. That part of the design is faithful.

## 7. How the original is built, mechanically

* ~20 mechs (`hh-a`, `hm-004a`, `me-nitro`, `ms-z2`, `xd`, …) **all share one
  sprite archive and one `.air`**, differing by `.act` palette and by which
  animation groups and CNS state files they use.
* Palettes are the identity mechanism: `pal1`/`pal2` per mech, 56 `.act` files.
* Effects live in a separate shared archive (`fightfx-01.sff`).

---

## Reading the SFF, for whoever needs it next

SFF v1.01. Header: signature at 0, **image count at offset 20**, first subfile
offset at 24 (512), subheader size 32. Each subfile: next-offset, length, x, y,
group, image, prev-copy index, samepal flag, then a PCX.

Two traps, both of which produced confident-looking wrong output:

1. **The PCX palette is the last 769 bytes of the record**, flagged `0x0C` — not
   at wherever RLE decoding stopped. Reading it from the decode cursor yields a
   plausible but wrong palette and renders everything in magenta and green.
2. **MUGEN characters share one palette.** Most sprites embed a black or
   placeholder palette; applying each sprite's own is wrong. Use a `.act` from
   `chars/rs/pal/`, and note **`.act` stores index 255 first — reverse it**.
