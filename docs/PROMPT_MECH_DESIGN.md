# Mech Design Mockups — Commission Brief

Paste **§2 and §3** to the image model. Attach **`docs/MECH_ROSTER_CONTEXT.md`**,
which carries each machine's faction origin, pilot and palette — it is the
authority on who these machines belong to and why they look the way they do.
This file is the authority on **what to draw and what it has to satisfy**.

**Three views per machine**, because these are not illustrations — they are
modelling references for multipart 3D models built in Blender and rendered to 2D
sprites. §4 is the production contract and a design that violates it cannot be
built.

---

## 1. Read this before commissioning

**Part of what looked wrong was a bug, and it is now fixed.** The Freestyle
outline colour was authored as a *linear* value, `(0.035, 0.040, 0.055)`, which
lands at display luminance **~56**. Because the line work is the darkest thing on
a machine, that number was the floor of every sprite in the game: measured min 54,
and **0.0 %** of any mech below luminance 30, against **16.2 %** in the Babel
Sword 2005 reference. The machines had no blacks at all, so every greeble, bolt
row and overlapping plate rendered into one mid-grey band with nothing separating
it. The models were never as bare as they looked.

**So do not commission a redesign to fix contrast or separation.** That is
repaired. What this commission is for is the part a renderer cannot supply:
**silhouette, proportion, colour architecture and markings.**

---

## 2. THE PROMPT

> I need **original mech design mockups** for a 2D aerial mecha combat game.
> Eight machines. The attached context document gives each one's faction, pilot,
> history and fixed palette — read it, because the differences between these
> machines are supposed to come from who built them.
>
> **Deliver three views per machine, on one sheet per machine:**
>
> 1. **Front orthographic** — flat-on, no perspective.
> 2. **Side orthographic** — flat-on, facing right.
> 3. **Three-quarter** — rotated **15° in azimuth** and **9° in elevation**.
>    This is the exact angle the game's camera uses, so this view is the one
>    that has to sell the design.
>
> All three of the same machine at the same scale, same lighting, same level of
> finish, laid out left to right on a neutral mid-grey background.
>
> ### What these machines are missing, and what I am buying
>
> They currently read as generic coloured shapes rather than designed hardware.
> The look I want is the one shared by **Babel Sword (2005)**, the **Gundam**
> series (particularly the SD and Battle Assault games), **Super Robot Wars**,
> **Medabots**, and **Armored Core** — machines that read instantly as
> manufactured objects with a manufacturer, a service history and a job.
>
> Concretely, what those share and mine lack:
>
> * **Light neutral armour carrying the mass, with the identity colour as
>   deliberate panels and bands** — not one hue flooding the whole body. A
>   reference sprite is roughly a third light neutral, a third saturated colour,
>   and a sixth near-black. Mine are 14 % neutral and 59 % one colour.
> * **Markings.** Serial codes, unit numbers, red diagonal hazard chevrons, small
>   stencilled text, faction insignia. Almost every reference sprite carries some.
>   Mine carry none, and this is the single biggest "designed object" signal.
> * **Small high-chroma indicator lights** — green and amber lamps, sensor lenses,
>   glowing vents. Tiny, saturated, deliberately placed.
> * **Local colour contrast inside one unit** — a white shoulder against an orange
>   band against a navy block against a black joint, all within a small area.
> * **A silhouette you could identify as a black shape.** Each of the eight must
>   be recognisable in pure outline, at a glance, with no colour.
>
> ### Hard requirements
>
> 1. **Blocky, panelled, mechanical.** These get built from boxes, wedges and
>    cylinders. Flat planes, hard chamfers, overlapping armour plates with visible
>    steps. **No organic curves, no smooth compound surfaces, no sculpted forms.**
> 2. **Readable at very small size.** In play, a whole machine is about 90 pixels
>    tall. Silhouette and large colour blocks do all the work. Fine filigree,
>    thin antennae and small surface tracery are wasted — draw them chunky or not
>    at all.
> 3. **These machines are built as separate parts, not as one object.** This is
>    the constraint most likely to be ignored and it is the one that makes a
>    design unusable. See the section below — read it before drawing anything.
> 4. **Keep each machine's palette exactly as given** in the attached document.
>    You are deciding *where the colours go*, not what they are.
> 5. **Keep each machine's role and weapon loadout** as specified in §3.
> 6. **Black joints and separation.** Recessed joints, dark gaps between plates,
>    near-black structural members. This is what makes the rest read.
>
> ### The machine is thirteen separate objects — design it that way
>
> Each machine is **not one model**. It is thirteen rigid parts, each modelled as
> its own closed object, each **rendered completely alone on a transparent tile**,
> and then stacked back together at runtime in a fixed order. Nothing is ever
> welded. A design that only works as a single fused sculpture cannot be built.
>
> **The thirteen parts, and what each one does in play:**
>
> | Part | Moves how |
> | --- | --- |
> | `core` | Torso. Banks and rolls with the flight direction |
> | `head` | Follows the torso |
> | `backpack` | Follows the torso |
> | `lowerBody` | Pelvis. Follows the torso |
> | `legNear` / `legFar` | The two legs, posed independently |
> | `leftArm` / `rightArm` | **Aim independently at the target**, not with the torso |
> | `mainWeapon` | Held by an arm. Aims with it, and **recoils along its own axis** |
> | `subWeapon` | Shoulder pod. Aims with the arm it is mounted on |
> | `meleeWeapon` | Swings through a wide arc, independent of everything else |
> | `leftThruster` / `rightThruster` | **Gimbal** to vector thrust, and emit exhaust |
>
> Four rules follow, and all four are hard:
>
> * **Every part must be a complete, closed object on its own.** It gets rendered
>   with nothing else in the scene. A shoulder that is only convincing because the
>   torso fills a gap behind it will render as a hole. Draw each part as if it
>   could be picked up by itself.
> * **Every joint needs a collar, cap or overlapping plate that hides the gap
>   through the full range of motion.** An arm that rotates 90° must not expose an
>   empty socket at 45°. Give shoulders a rounded pauldron or a ring collar; give
>   hips a skirt plate; give the neck a collar.
> * **Parts must not interpenetrate ambiguously.** Where two parts overlap, it
>   must be obvious which is in front. Design the overlap deliberately.
> * **The torso is drawn between the two legs.** Back to front, the stack is:
>   backpack, left thruster, left arm, sub-weapon, **far leg, pelvis, torso, near
>   leg**, head, right thruster, right arm, main weapon, melee weapon. That single
>   ordering is the entire depth read of the rig — so the far leg is behind the
>   body and the near leg is in front of it.
>
> **On each of the three views, make the part divisions legible** — draw the seam
> where every part ends and the next begins. Add a small **exploded inset** on the
> sheet showing the thirteen parts pulled apart and labelled with the names above.
>
> ### Style
>
> Clean, confident **mechanical design-sheet illustration** — the look of an
> official model kit instruction sheet or a game's design document. Crisp line
> work, flat-to-lightly-shaded colour, hard shadow edges. **Not** photoreal,
> **not** painterly concept art, **not** a glossy 3D render.
>
> **Original designs only.** Emulate the genre's design language. Do not
> reproduce, quote or approximate any existing mecha franchise's specific
> machine, insignia, head crest, or silhouette.
>
> ### Output — one machine per image, no exceptions
>
> **Produce exactly one machine per image.** Eight separate sheets, each at least
> 2048 px wide, each holding that machine's three views and its exploded inset.
>
> **Do not put two or more machines in the same image, and do not offer to.** A
> contact sheet of the roster is not what this is for: three views plus an
> exploded inset already fill a sheet, and at eight machines to an image every
> view lands too small to model from. If you are tempted to save time by
> combining them, don't — an unusable sheet costs more time than eight good ones.
>
> **Work one machine at a time and stop after each.** Deliver a machine, wait for
> me to accept or correct it, then move to the next. Do not batch ahead. The first
> machine sets the style for the set, and I would rather fix it once than eight
> times.
>
> Start with **HALCYON**.
>
> ### Two mistakes made on the first machine — do not repeat them
>
> * **Do not invent a pilot.** Every pilot is named in the attached document.
>   The first attempt made one up.
> * **Do not restyle the palette.** The first attempt swapped the vivid azure for
>   a muted navy, the hot orange for amber, and the cyan for green, and it looked
>   good — but eight machines have to be told apart instantly at ~90 px and those
>   hues are calibrated for it. Use the hex values exactly as given. You are
>   choosing **where** the colours go, not what they are.
>
> ### Do not draw the far side darker
>
> An earlier version of this brief asked for the left arm, left thruster and far
> leg in a darker variant. **Ignore that.** The engine assigns the darker shade
> per part automatically at material time. Draw both sides in the full colour.

---

## 3. The eight machines

Palette, faction, pilot and history are in `MECH_ROSTER_CONTEXT.md`. This table is
the **hardware contract** — the loadout each design must physically carry.

| Mech | Role | Body pitch | Main weapon | Boosters | Sub-weapon | Melee |
| --- | --- | --- | --- | --- | --- | --- |
| **HALCYON** `AV-07` | All-round interceptor | 24° forward | Rifle | Twin | Compact 6-tube pod | Beam sabre |
| **NOCTURNE** `AV-13` | Heavy assault, line-holder | 15° | Rotary cannon | Single, large | 12-cell missile rack | Hydraulic claw |
| **VESPER** `AV-12` | Marksman, longest reach | 26° | Railgun | Twin | Compact pod | Beam bayonet |
| **TERRAMOTH** `HV-03` | Siege walker, heaviest | 10° | Siege mortar | **Quad** | Spoil-hopper racks | Pile driver |
| **CIRRUS** `LT-21` | Skirmisher, fastest, frailest | 30° | SMG | **Wing** | Compact pod | Twin daggers |
| **OBELISK** `GD-09` | Bulwark, largest barrier | 12° | Breach gun | Single | Missile rack | Ram shield |
| **PYRE** `IN-05` | Incendiary brawler | 18° | Flamer | Twin | Missile rack | Thermal scythe |
| **NULLTIDE** `EW-14` | Electronic warfare | 28° | Arc projector | **Wing** | Compact pod | Shock baton |

**Body pitch** is how far the torso leans forward — these are flight frames, and
the lean is part of each silhouette. TERRAMOTH stands nearly upright and heavy;
CIRRUS is pitched hard forward and light.

**Silhouette must separate them.** Currently the roster is far too uniform — the
reference game differentiates its machines by size and shape far more aggressively
than we do. TERRAMOTH (2490 HP) and CIRRUS (1440 HP) should not read as the same
machine at different scales.

---

## 4. Production contract — a design that breaks this cannot be built

| | |
| --- | --- |
| Built in | **Blender**, from box / wedge / cylinder primitives |
| Model form | Multipart rigid body; **13 named parts**, each its own object |
| Part names | `core`, `head`, `leftArm`, `rightArm`, `lowerBody`, `legNear`, `legFar`, `backpack`, `leftThruster`, `rightThruster`, `mainWeapon`, `subWeapon`, `meleeWeapon` |
| Rendering | Each part is rendered **alone**, then composited in-engine |
| Game camera | Orthographic, azimuth **15°**, elevation **9°** |
| Scale | 120 render px per Blender unit, displayed at 0.5, so **60 logical px per unit** |
| On screen | The battle camera runs at ~0.44 zoom — a whole machine is **~90 px** tall |
| Outline | Every part carries a near-black contour and crease line, drawn from geometry |
| Escort drone | Each machine also has a small autonomous drone — design optional, but note it exists |

Two consequences worth stating plainly:

* **Parts are rendered in isolation, so they cannot cast shadows on each other.**
  Depth between components has to come from the design — overlapping plates,
  recessed joints, and value contrast — not from lighting.
* **Anything smaller than about 2 px on screen does not exist.** At 60 logical px
  per unit and 0.44 zoom, a 5 cm detail is invisible. Design at the scale of
  hand-sized panels and larger.

---

## 5. Accepting a set

1. **Silhouette test.** Fill each design solid black. Can you name all eight?
   That is the test the current roster fails.
2. **Squint test at thumbnail size.** Shrink a sheet to 90 px tall. Does the
   machine still read as that machine, or does it become a blob?
3. **Part test.** Can you point to all thirteen parts and see where each one
   separates from its neighbour? Is there an exploded inset, and are the parts
   labelled with the exact names?
4. **Isolation test — the one that decides buildability.** Cover everything
   except one part. Does that part still look like a finished object, or does it
   have a hole where its neighbour used to be? Do this for the shoulders, the
   hips and the neck, which is where it fails.
5. **Rotation test.** Imagine each arm swung 90° and each thruster gimballed 30°.
   Does a joint open up and expose an empty socket? If so, the joint needs a
   collar or a cap.
6. **Canon test.** Is the pilot the one named in `MECH_ROSTER_CONTEXT.md`, and
   are the palette hex values exactly as given? Both were wrong on the first
   attempt at HALCYON, and both look plausible enough to slip through.
7. **Buildability test.** Could this be made from boxes, wedges and cylinders? If
   a form needs a sculpted compound curve, it cannot be built.
8. **Palette test.** Is the identity colour used as deliberate panels, with light
   neutral carrying the mass — or has it flooded the body again?
9. **Markings test.** Does it carry a serial, a number, a chevron, a lamp? If it
   is clean, it is not finished.
10. **Set test.** All eight side by side. Same artist, same afternoon, same level
   of finish — and eight clearly different machines.

---

## 6. Canon constraints — do not violate

* **`2240` is a survivor count, not a year, and the misreading is deliberate.**
  Nothing player-facing may gloss it. **Do not put it on a machine.**
* **NULLTIDE carries no maker's plate**, by specification — it was built for
  operational denial. It is the one machine that must stay unmarked, and that
  absence should be conspicuous against seven machines covered in stencils.
* **Mechs are "it".** Pilots get their own pronouns. The present is **43 CE**.
* Settled and **not** to be re-proposed: no cel shading, do not darken the mechs
  toward the stage, do not model energy as geometry. The projected blades are
  drawn as 2D effects, not modelled — design the **emitter hardware**, not the
  blade.
