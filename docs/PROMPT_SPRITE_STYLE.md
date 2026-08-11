# Mech sprite assets — commission brief

**This commissions game-ready sprite assets, not concept art.** That distinction
sank the first two attempts and it is the whole point of this file.

Separate from `docs/PROMPT_MECH_DESIGN.md`, which settled *what the machines are*
using design sheets. Those were correct for their job. This is a different job:
producing the actual artwork a part gets drawn from.

---

## 1. Two attempts failed, for two different reasons

**Attempt 1 — wrong style.** A dark, desaturated, softly-airbrushed gunmetal
machine. Measured against two real mechs cropped from a 2005 gameplay screenshot:

| | light | chromatic | dark | **mid-grey** |
| --- | --- | --- | --- | --- |
| Reference mech A | 43.5 % | 34.4 % | 12.8 % | **9.3 %** |
| Reference mech B | 45.9 % | 34.7 % | 7.5 % | **11.9 %** |
| Attempt 1 | low | almost none | — | **dominant** |

**The mid-grey figure is the diagnosis.** A reference sprite puts only about a
tenth of its area in the middle of the range — everything else is *light*,
*saturated*, or *near-black*. That bimodal split is not a by-product of the
style, it **is** the style. Hard tonal steps produce it; soft shading cannot.
Reference tonal range: min **0**, p05 **18**, median **119–144**, p95 **205–217**.

**Attempt 2 — wrong deliverable, and that one is on this brief.** It asked for
"front orthographic, side orthographic, three-quarter", a "hero image", and
"mechanical design-sheet illustration — the look of an official model kit
instruction sheet". Those words specify concept art. The model complied. It
produced a presentation document with framed panels, a title block and a stat
table, because that is what was requested.

**Sprite assets have no views, no hero image and no page furniture.** They are
individual pieces of artwork, drawn once at the game's own camera angle, sitting
on a key colour so they can be cut out and used.

---

## 2. Attach these five

| File | Role |
| --- | --- |
| `docs/reference/bs2005_hardware_sprites.png` | **Style** — isolated Babel Sword sprites, no HUD |
| `Screenshots of Original 2005 Babel Sword/babel-sword-01.png` | **Style** — the machines at true size in play |
| Your 3–4 mech-parts asset sheets (green-background ones) | **Format** — how the sheet should be laid out |
| `assets/blender/concepts/halcyon_design_v2.png` | **Subject** — the machine, unchanged |

Say explicitly which attachment is which. The format examples are **not** in the
Babel Sword style and must not be copied for style — only for layout.

---

## 3. Which machine

**Use HALCYON, not CIRRUS.**

The reference style is ~35 % saturated colour. CIRRUS is canonically *the one
unpainted machine* — bare alloy `#D9DEE8` at saturation 0.06, cyan only as small
running lights. It has almost no chroma to give, so it cannot demonstrate a
high-chroma style, and colouring it in would break its canon.

HALCYON is azure `#1A70DB` and hot orange `#FF5C0F` over light armour `#D6E3F0` —
the closest thing on the roster to the reference's white-plus-orange-plus-blue.
Prove the style there, then apply it to CIRRUS and judge that one on **value
structure and black separation** instead of colour.

---

## 4. THE PROMPT

> **I need sprite assets for a 2D game. Not concept art, not a design sheet, not
> a presentation document — the actual artwork that gets cut up and drawn on
> screen.**
>
> I am attaching:
>
> * **Style reference** — sprites from *Babel Sword* (2005), plus a gameplay
>   screenshot of it. **This is how the art must look.**
> * **Format reference** — mech-parts asset sheets on a green background. **This
>   is how the sheet must be laid out.** Their art style is *not* what I want —
>   ignore their look entirely and copy only their structure.
> * **The machine** — HALCYON AV-07, already designed. Do not redesign it.
>
> ### Format: an asset sheet
>
> Exactly like the green-background examples:
>
> * **Flat pure green `#00FF00` background**, edge to edge. It is a chroma key
>   and will be removed, so nothing may bleed onto it — no shadows, no glow, no
>   gradient, and no antialiasing against the green on any sprite's outer edge.
> * **Sprites laid out in rows, grouped by part**, with a small plain text label
>   for each group. Evenly spaced, generous gaps, each sprite fully isolated.
> * **No panel boxes, no frames or borders around sprites, no drop shadows, no
>   title card, no info block, no stat table, no palette swatches, no decorative
>   chrome of any kind.** Just labelled rows of sprites on green.
> ### Perspective: FLAT 2D SIDE VIEW
>
> **This is the instruction the last attempt got most wrong, because the brief
> said "three-quarter" and that was simply incorrect.**
>
> This is a 2D side-scrolling game. Look at the style reference: every gun, pod,
> booster and unit on that sheet is drawn in **pure side profile**. Flat. Zero
> rotation toward the viewer.
>
> * **Draw every part in flat side view, facing RIGHT.**
> * **No three-quarter view.** Not 45°, not 15°, not "slightly turned".
> * **No front view, no back view, no turnaround, no multiple angles.**
> * **No perspective and no foreshortening.** Orthographic profile only.
> * Every part faces the **same** direction so they stack into one machine.
>
> If a part looks like it is turning toward the camera, it is wrong.
>
> ### Contents — thirteen parts, one machine
>
> One row per group, labelled with these exact names:
>
> ```
> core          head          backpack      lowerBody
> legNear       legFar        leftArm       rightArm
> mainWeapon    subWeapon     meleeWeapon   leftThruster    rightThruster
> ```
>
> Each part is a **separate, complete, closed sprite**. It will be rendered
> alone and composited with the others at runtime, so a shoulder that only works
> because a torso fills a gap behind it is unusable. Every joint needs a collar
> or cap so no empty socket shows when the part rotates.
>
> Draw the parts **large and clearly** — this artwork is the reference the final
> assets get made from, so I need to see how each one is stepped, lined and
> detailed.
>
> ### Form language — study how the reference pieces are actually BUILT
>
> **This matters more than the shading, and previous briefs got it backwards by
> asking for blocky panelled forms.** Look at the style reference sheet. Almost
> nothing on it is a box. The construction vocabulary is:
>
> * **Smooth curved outer shells.** Swooping aerodynamic fairings, teardrop
>   nacelles, tapered blades and fins. Aircraft cowling, not armour plate.
> * **Dark mechanical guts showing underneath.** A clean pale shell over a
>   near-black interior of struts, pistons, claws and framework, exposed at the
>   gaps and edges. The contrast between smooth shell and dark machinery is the
>   signature of the style.
> * **Cylinder stacks.** Weapons and boosters are built from cylinders, rings,
>   canisters and tubes threaded along an axis — not from rectangular slabs.
> * **Long tapering silhouettes** with rhythm: a heavy body narrowing to a
>   barrel, ending in a muzzle or nozzle. Thick to thin.
> * **Thin black armatures.** Spindly dark limbs, claws and struts poking out
>   from beneath the shells, drawn almost as pure black shapes.
>
> **Do not draw chamfered rectangular armour panels.** Do not draw a boxy
> mech. If a part could be built out of cubes, it is wrong for this style.
>
> ### Style: hit these numbers
>
> Measured from two mechs in the attached screenshot:
>
> | | target |
> | --- | --- |
> | Light armour | **~44 %** of the machine |
> | Saturated colour | **~35 %** |
> | Near-black | **~10 %** |
> | Mid-grey | **under 12 %** |
> | Darkest value | **0** — true black, not dark grey |
> | Brightest value | **~210** |
>
> **A previous attempt came back almost entirely mid-grey.** If your sprites are
> mostly mid-tone, they are wrong however good they look.
>
> ### Six techniques, all mandatory
>
> 1. **THREE OR FOUR FLAT TONES PER SURFACE, HARD EDGES BETWEEN THEM.** No
>    gradients, no airbrush, no soft falloff. A curved surface is two or three
>    flat bands with a visible step, never a smooth ramp. Most important rule
>    here.
> 2. **A BLACK LINE BETWEEN EVERY COMPONENT** — not only around the outside.
>    Between every plate, cylinder, joint, barrel and panel. Two adjacent forms
>    touching with no black line between them is wrong.
> 3. **TRUE BLACK IS A COLOUR, NOT A SHADOW.** Joints, recesses and gaps are
>    drawn near-black and take roughly a tenth of the area.
> 4. **LIGHT ARMOUR CARRIES THE MASS**, with saturated colour applied as
>    deliberate blocks and bands on top. A white robot with coloured parts, not
>    a coloured robot.
> 5. **SMALL HIGH-CHROMA DETAIL EVERYWHERE.** Red diagonal hazard chevrons,
>    green and amber indicator dots, orange bands wrapping cylinders. A few
>    pixels each, and the reference is covered in them.
> 6. **CHUNKY AND SIMPLIFIED.** Bold shapes, nothing delicate. A whole machine
>    is ~120 px tall in the source game and every form survives that. If a
>    detail would vanish at that size, draw it bigger or leave it out.
>
> **Crisp aliased pixel edges.** No antialiasing blur, no soft glow, no bloom.
> Where something glows, it is built from hard-edged shapes.
>
> ### HALCYON, unchanged
>
> Concord Skyward general-service interceptor, 8.2 m. Pilot Naia Vesk. Rifle,
> twin boosters, compact 6-tube missile pod, and a beam sabre — draw only the
> emitter hardware, never the blade, which is a separate 2D effect.
>
> Concord issues crisp factory markings: unit number `07`, pattern serial
> `CS-39`, `CAUTION INTAKE`, hazard chevrons, a winged faction insignia.
>
> Palette, exactly:
>
> ```
> light armour     #D6E3F0     <- must be the largest area
> identity azure   #1A70DB
> panel azure      #0F428F
> far-side azure   #0D3370
> structure/joint  #1A1F2B
> accent orange    #FF5C0F
> indicator cyan   #33E6FF
> ```
>
> Plus **true black** for separation lines and recesses.
>
> ### Check your own output before answering
>
> * Is any surface smoothly shaded? It must not be.
> * Can you find two touching components with no black line between them?
> * Is it mostly light, or mostly mid-grey? It must be mostly light.
> * Are there red chevrons, green dots and orange bands? There must be.
> * Is the background flat pure green with nothing bleeding onto it?
> * Did you draw multiple view angles or a hero image? You should not have.

---

## 5. Accepting it

1. **The mid-tone test.** Squint. An even mid-grey mass is a reject — the
   reference is under 12 % mid-tone.
2. **Any two touching components** — is there a black line between them?
3. **Any gradient anywhere** is a fail.
4. **Shrink a part to game size.** The reference reads perfectly small; if yours
   turns to mush, the detail was too fine.
5. **Count the accent marks.** Chevrons, dots, bands. Zero is a fail.
6. **Is it cuttable?** Flat green, no spill, no shared frames — could each sprite
   be lifted out and used as-is?

---

## 6. The question this does not answer

Even a perfect sheet leaves the hard decision open: **the game renders 3D parts,
and this style is hand-drawn.** Three routes with real costs:

* **Style the render harder** — black lines on internal creases, far fewer tones,
  detail painted through the decal system rather than lit. Keeps the multipart
  rig, independent arm aiming, recoil and banking. Approaches the look without
  matching it.
* **Hand-draw the sprites** — matches it exactly, and costs the rig: thirteen
  parts across every pose and animation frame, by hand, with no independent
  aiming.
* **Hybrid** — 3D for silhouette and pose, styled hard enough to read as sprite
  art at the **41 px** the battle camera actually shows.

**`CEL_SHADE` is not the answer.** It exists in `build_mechs.py`, it works, and it
was tested against this exact question: median 166 → 142, unique tone count
242 → 239. It quantises only lighting and multiplies the albedo back in, so the
tonal range stays continuous — and flat box faces under four soft area lights
give quantisation almost nothing to bite on. A slight flattening, not a
transformation.
