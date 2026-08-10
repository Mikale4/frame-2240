# Design sheet deviations, and how they are resolved

Each sheet is the modelling target for its chassis, but a few carry errors or
ambiguities. **The resolutions below win over the sheet.** Read this before
modelling anything from `assets/blender/concepts/`.

Nothing here is worth regenerating a sheet for — an image model redraws the whole
image to change three words, and the designs are good. Fix them here instead.

---

## HALCYON — `halcyon_design_v2.png`

Use **v2**. `halcyon_design_v1.png` is kept only as a record: it invented a pilot
(Aurelian Hastings, who does not exist — it is Naia Vesk) and restyled the palette
into a muted navy. v2 corrects both and adds the missing `meleeWeapon`.

No outstanding issues.

## TERRAMOTH — `terramoth_design_v2.png`

Use **v2** for the machine and its numbers. v1 stated 7.1 m, which would have
made the largest machine in the game the *shortest* — `hull` is
`(0.88, 0.54, 0.44)` against HALCYON's `(0.62, 0.34, 0.30)`, about 1.4x in every
dimension. v2 corrects it to **11.6 m / 128.3 t**, fixes the garbled
"LOAD LIMIT 21.4.7 t", and preserves every marking and the conversion story
verbatim.

Critically, **v2 kept the squat proportion**. The risk in asking for "bigger" was
that it would come back stretched into a tall walker, which would have destroyed
the one silhouette that is unmistakable at 41 px. It did not — the shoulder
blocks, the wide stance and the arch between the legs all survived.

**But v2's exploded diagram lost the legs.** It labels `subWeapon` twice and
omits `legNear` and `legFar` entirely; v1's diagram has all thirteen correct.
**Take the leg parts from `terramoth_design_v1.png`** and everything else from
v2. Not worth a third generation to fix two labels.

A measurement warning for anyone re-running the silhouette comparisons: **v2's
sheet has a dark navy background where every other sheet is grey.** Thresholding
on darkness to isolate the silhouette will capture the background instead and
return a meaningless bounding box. It produced a confident, wrong "the silhouette
is broken" reading here before being caught by looking at the panels directly.

## CIRRUS — `cirrus_design_v1.png`

No errors. One modelling note:

The exposed frame — pistons, cabling, thin open structure — **will not survive to
screen**. Silhouette-tested at 41 px, CIRRUS is identified entirely by its wings;
the limb detail is gone. When modelling, express "barely armoured" as **fewer,
larger open bays** rather than many thin members. Anything under ~2 px on screen
does not exist.

## NOCTURNE — `nocturne_design_v1.png`

No errors.

Known and accepted: **NOCTURNE and HALCYON are the weakest silhouette pair in the
set.** That is deliberate — the fiction is that NOCTURNE *is* a rebuilt AV-13
airframe, so family resemblance was briefed for. They separate by size (hull 0.76
vs 0.62), by bulk, and in play by colour (crimson vs azure). Do not "fix" this by
making NOCTURNE a different shape.

## OBELISK — `obelisk_design_v1.png`

Two things, both resolved here rather than by regenerating.

**1. Three exploded labels are missing:** `legNear`, `legFar` and `meleeWeapon`.
All three objects are drawn — the two legs at the left of the second row, and the
tall slab between them and `leftThruster`. Only the text is absent.

**2. It is drawn with two ram shields, and the rig has one `meleeWeapon` slot.**
Resolution: **the right-side slab is `meleeWeapon`** — it is the one that rams and
delivers the two-hit bash. **The left-side slab is armour belonging to `leftArm`.**
Model it that way. Do not try to fit both shields into the melee part.

The palette swatch list shows six values and omits the far-side violet `#2B244D`.
Harmless — the engine assigns the far shade per part at material time and never
reads it from the sheet.

## VESPER — `vesper_design_v1.png`

No errors. The only sheet delivered clean on the first pass — correct pilot,
all seven palette values, all thirteen labels.

Two modelling notes:

* **The thin limbs will not survive to screen**, same as CIRRUS. At 41 px VESPER
  is carried by its splayed bracing stance and its sighting mast, not by limb
  detail.
* **The railgun is longer than the machine is tall.** `required_tile()` sizes
  each part's render tile from its bounding box, so `vesper_mainWeapon` will
  produce a far larger tile than any other part and VESPER's atlas will grow
  accordingly. Expected, not a fault.

## PYRE — `pyre_design_v2.png`

Use **v2**. `pyre_design_v1.png` is kept as a record of why.

v1 was a good design that failed at gameplay size: PYRE and NOCTURNE are the
closest pair on the roster in size (hull 0.70 vs 0.76), both were symmetrical
bulky humanoids, and they are the only two warm-coloured machines. v1's two
distinguishing features both vanished — the cleaver was a thin curve that
disappeared at 41 px, and the fuel tank was back-mounted so it barely showed at
the camera's shallow 15 degree azimuth.

v2 moves the tanks to the shoulders and stows the cleaver proud above the
shoulder. **That makes PYRE the only asymmetric silhouette in the set**, and it
now separates from NOCTURNE cleanly at 41 px. Aspect went 0.73 to 0.66.

**The v2 biography text is corrupted — do not treat it as canon.** The
regenerate garbled two phrases that were correct in v1: "chats through final
approach" became "funds through illicit approach", and "requisitioning" became
"drywhistling". Rasa Volkov is reckless and cheerful, **not** a criminal.
`MECH_ROSTER_CONTEXT.md` is the authority on her.

This is a general risk: **every regenerate can corrupt body text that was
already correct.** Regenerate only when the *design* is wrong.

## NULLTIDE — `nulltide_design_v1.png`

No errors, and it solved the hardest brief in the set.

**Its markings panel is deliberately empty and must stay that way.** A blank
plate reading `NO MAKER'S PLATE`, a struck-out identification field reading
`IDENTIFICATION BY EMITTER SIGNATURE ONLY`, and a provisional threat rating that
was entered once and never replaced. Programme hulls carried no maker's plate by
specification, to allow operational denial. **Do not add markings to this machine
later for consistency with the other seven.** The absence is the design.

One modelling note: the numerous thin emitter vanes will merge at 41 px. Build
them as fewer, larger blades.

Note also that NULLTIDE and CIRRUS are the closest silhouette pair at gameplay
size — both small and spiky. They are separated by value rather than by outline:
`#D9DEE8` near-white against `#243B4A` near-black, the widest colour gap on the
roster. **Do not lighten NULLTIDE.**

---

## Standing notes for every sheet

* **The engine applies the far-side darkening.** Sheets draw both sides in the
  full identity colour; `build_mechs.py` assigns the `far` palette entry to
  `leftArm`, `leftThruster` and `legFar` automatically. A sheet that draws them
  darker is wrong, not right.
* **Markings cannot be applied by the current pipeline.** The meshes carry no UV
  maps — every material is box-projected in object space — so there is no way to
  place a serial or a chevron at a specific spot. This needs a decal system:
  small textured quads, which arrive with their own UVs and need no unwrap. Until
  that exists, the markings on these sheets are aspirational.
* **Detail below ~2 px on screen does not exist.** A whole machine is ~90 logical
  px and the battle camera runs at ~0.44 zoom, so a part occupies 35-100 px and a
  machine about 41. Every sheet is drawn far finer than that. Simplify toward
  fewer, larger forms when modelling.
