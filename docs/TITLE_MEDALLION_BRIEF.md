# Title Medallion — Art Brief

**For an external artist or image model producing the circular backdrop that sits
behind the title on the title screen of *F.R.A.M.E. 2240*.**

This document is self-contained and assumes no access to the codebase. Every
number in §4 is read out of the running game and is authoritative — the art has
to fit the engine, not the other way round.

**Attach the four existing stage layers alongside this file.** They are the
authority on style, and they matter more than any adjective in §3: the medallion
has to look like it was painted by the same hand, on the same day, for the same
place. If the reference images and this text ever disagree, the images win.

---

## 0. The prompt to paste

**Self-contained — paste it on its own, with the stage layer images attached.**
Attach this file only if the model asks for more context.

```
I am attaching reference images: the parallax background layers for a 2D game
stage. I need a new piece of art for the same game, of the same place, in
exactly the same style as those references.

Part 1 - The Place

The location is CATHEDRAL YARD: an abandoned dockyard suspended at high
altitude, far above a permanent storm layer that covers a dead surface. It was
built to receive ore convoys and fit out flying warships, and it was shut down
and left after a war. Its lift network was cut and never restored, so nobody
lives there and nobody is coming back. It is intact, cold and completely empty,
and the lights are still on because nobody decommissioned the reactor.
Abandoned but powered: lamps lit, nobody home.

The name comes from the scale and the light: enormous vertical girders receding
into haze, like the nave of a cathedral. It is night. Cold void above, warm dock
haze below. A machine standing in it does not look large.

Part 2 - Art Direction

Match the attached reference layers exactly: same lighting direction, same
colour harmony, same line weight, same rust and wear treatment, same level of
detail. This must read as the same place drawn by the same hand.

Grounded industrial science fiction. Girder, plate, rivet, cable, rust, sodium
lamp. Not fantasy, not clean white utopian sci-fi, not cyberpunk neon.
Painterly semi-realistic rendering with clean confident linework and restrained
detail. Desaturated blue-grey steel with rust brown and warm sodium orange
accents. Cold key from above, warm sodium fill spilling up from below.
Mood: cold, vast, empty, awe and altitude.

Strict side view, orthographic, flat 2D elevation. No perspective convergence,
no vanishing point, no three-quarter view.

No text. No lettering. No numbers. No logos. No characters. No people. No
creatures. No vehicles. No machines.

Part 3 - What To Make

A single square image containing one CIRCULAR composition: a view of the yard
contained within a circle, like a round window onto the place.

- Square canvas, 1:1 aspect ratio, 2048x2048.
- Fully transparent background outside the circular composition.
- The imagery must FADE OUT softly toward the edge of the circle into full
  transparency. Do not draw a hard circular border, a ring, a frame, or a rim.
  There should be no crisp edge anywhere - the circle is defined by where the
  art fades away, not by an outline.
- The circle should fill most of the square, leaving a small transparent margin.

Composition rules, which matter more than the subject:

- THE CENTRE MUST BE QUIET. Large lettering is placed on top of the middle of
  this image. The central third should be the emptiest, lowest-contrast,
  least-detailed part of the picture - open haze, distant flat structure, or
  simple large forms. No small detail, no bright spots, no busy linework, and
  no high-contrast edges anywhere near the centre.
- Put the interest in the OUTER RING. The characteristic shapes - cathedral
  scale vertical girders, steel gantry trusses, empty dock cradles and ship
  berths, catwalks, ladders, cable runs, hanging chains - belong around the
  outside, strongest at the upper left and lower right, thinning toward the
  middle.
- KEEP THE CENTRE COLD. Warm sodium lamp light is welcome around the outer
  ring, especially low down, but the middle of the image must stay cold
  blue-grey. Warm gold tones in the centre would destroy the readability of
  what sits on top of it.
- Overall the piece should be LOW CONTRAST and atmospheric - a faded memory of
  the yard rather than a crisp illustration of it. Deliver it at full opacity;
  it will be faded down in the engine.

Part 4 - Also Useful

Provide a second version with the same composition but the outer ring pushed
slightly darker and denser, so the two can be compared against the lettering.

No text.
```

---

## 1. What this is for, in one paragraph

The title screen shows the game's name as two blocks of drawn lettering on a
diagonal — `F.R.A.M.E.` high and left, `2240` low and right — over a slowly
turning train of gears. Behind all of that there is currently a piece of
placeholder line art: a "gantry rose window", a rose window drawn as an
engineering elevation. It was always a stand-in. This brief replaces it with an
actual view of the yard the game is fought over, faded back so the name reads
over the top.

**It is a backdrop, not an illustration.** Nothing in it should ask to be looked
at. If a viewer notices the medallion before they notice the title, it is wrong.

---

## 2. The world, for context

Enough to make the art make sense. None of this needs to be depicted literally.

* The surface of the world is gone — a permanent storm layer covers it. What is
  left of civilisation lives on structures suspended in the upper atmosphere:
  spars, gantries, lattices and yards, roughly two kilometres up. **This is an
  atmospheric setting, not an orbital one.** No stars-and-vacuum, no spacecraft,
  no planetary curve.
* Five powers hold territory up there. No war is currently declared. Disputes —
  contested docking, claim enforcement, changes of yard control — are settled by
  single combat between piloted machines, under standing rules issued case by
  case. That is what the game is.
* **CATHEDRAL YARD is where those disputes get settled**, precisely because no
  power's claim covers it. It is the only structure at that altitude that is
  genuinely neutral, which is the entire reason anyone still goes there.
* It has been empty for thirteen years. The cradles still stand. The gantry
  lamps still burn.

## 3. Style authority

**The attached stage layers are the style guide.** Match them on:

| Property | What to match |
| --- | --- |
| Lighting | Cold key from above, warm sodium fill from below. Never reversed. |
| Palette | Desaturated blue-grey steel, rust brown, warm sodium orange |
| Rendering | Painterly semi-realistic, confident linework, restrained detail |
| Projection | Strict flat side elevation, orthographic, no vanishing point |
| Wear | Honest structural rust and grime, not decorative damage |

Things this project has already tried and rejected, so they do not come back:
**no cel shading, no neon, no energy drawn as glowing geometry.** Energy in this
game is drawn as light, never modelled as an object.

## 4. Technical specification

These are the numbers the engine uses.

| Property | Value |
| --- | --- |
| Delivered file | `title_yard.png` |
| Delivered size | 2048x2048, square |
| Colour | RGBA with a real alpha channel |
| Outside the circle | Fully transparent (alpha 0) |
| Circle edge | Soft alpha falloff, **no hard rim** |
| Drawn size in game | ~520 px across, on a 960x540 logical screen |
| Drawn opacity | ~0.30, set in the engine — deliver at full opacity |

Two consequences worth stating plainly:

* **It is displayed at roughly a quarter of its delivered resolution.** Fine
  detail will not survive. Design at the scale that reads: large forms, clear
  silhouettes, broad tonal masses.
* **It is displayed at about 30 % opacity.** Anything subtle in the original
  becomes invisible. Anything high-contrast in the original becomes the only
  thing you can see. Aim the composition at how it looks faded, not at how it
  looks in the file.

### The keep-out zone

The lettering occupies a band across the middle. In the delivered 2048x2048
image, treat the **central horizontal third — roughly y 680 to y 1370, full
width — as a quiet zone.** Structure may pass through it, but only as large,
soft, low-contrast form. No bright lamps, no crisp edges, no fine linework, no
warm accents in that band.

## 5. What to do with what comes back

* **Check it faded, not at full strength.** Drop it to 30 % over a dark
  blue-violet background before judging it. That is the only view that matters.
* **Check the centre against the lettering**, not on its own. The failure mode
  is a medallion that is beautiful in isolation and eats the title.
* **Alpha will likely need a hand pass.** Image models tend to produce either a
  hard circular cut or a muddy grey halo instead of clean transparency. A soft
  radial alpha mask in an editor fixes both, and is easier than re-prompting.
* **Reject any version with a drawn ring or border.** It turns the piece into a
  badge sitting on the screen instead of a view opening behind it.
* Drop the finished file at `assets/ui/title_yard.png`, then set
  `TITLE_MEDALLION_ART` to `true` in `src/scenes/BootScene.ts`. Until that flag
  is flipped the engine draws its own placeholder, because a missing asset is
  served an HTML page by the dev server rather than a 404, and the image decoder
  hangs on it forever.
