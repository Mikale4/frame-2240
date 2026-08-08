# Under-Deck Layer — Art Brief

**For an external artist or image model producing one additional parallax layer
for CATHEDRAL YARD, the arena in *F.R.A.M.E. 2240*.**

This is a small, specific job: **the structure underneath the fighting deck.**
Everything else in the stage already exists.

---

## 0. The prompt to paste

**Attach two things alongside this prompt:** `arena_near.png`, the existing deck
layer, and `docs/CATHEDRAL_YARD_CONTEXT.md`, which carries the game, the world
and the stage's own lore. The image is the authority on how it must look — the
new layer has to be the same drawing continued downward, by the same hand, in
the same palette. The context pack is the authority on what the place *is*.

```
I am attaching one layer from a 2D game stage: the deck of an industrial
dockyard, seen in strict side view. The deck surface runs across the top of it
and some structure hangs beneath, but that structure stops partway down and the
rest of the image is empty.

I need a NEW image that continues that structure downward - the underside of
the deck, going down into darkness.

Part 1 - What This Is

The stage is CATHEDRAL YARD: an abandoned dockyard suspended high in the air,
above a permanent storm layer that covers a dead surface. The fighting deck is
a heavy riveted steel walkway. Underneath it there is nothing but two kilometres
of cold air, and then cloud.

So this layer is what you would see if you looked over the edge and down: the
deck's own underside and supporting structure, receding into dark.

Part 2 - What To Draw

The underside of a heavy industrial deck:
- Main girders and cross-bracing running beneath the walkway, seen edge-on.
- Truss work and lattice bracing between them.
- Hanging cable runs, chains, and conduit dropping down and swinging slightly.
- Pipe runs and ducting following the underside.
- The tops of long tapering support spars descending out of frame.
- Occasional small caged sodium lamps on the understructure, warm and dim.

It must get DARKER AND EMPTIER TOWARD THE BOTTOM. The top of the image is dense
structure directly under the deck; by the bottom it should be almost entirely
black with only a few isolated silhouettes - a single cable, the edge of one
spar - fading out completely.

Part 3 - Art Direction

Match the attached layer exactly: same palette, same line quality, same rust and
wear treatment, same lighting logic. This must read as the same drawing
continued, not as a new picture.

Cold desaturated blue-grey steel, rust brown, occasional warm sodium. Painterly
semi-realistic. Grounded industrial science fiction - not fantasy, not neon,
not steampunk.

Lighting: this is the shadowed side. Everything here is in shade, lit only by
weak spill from above and the occasional lamp. Nothing here is brightly lit.
Keep the whole image DARK - it sits under a floor.

Strict side view, orthographic, flat 2D elevation. No perspective convergence,
no vanishing point.

No text. No characters. No people. No creatures. No aircraft. No mecha.
No sky, no clouds, no horizon, no ground.

Part 4 - Format

- 1536 x 1024 pixels.
- Transparent background (real alpha) wherever there is no structure.
- The structure must run FULL WIDTH across the top edge of the image and be
  densest there.
- It must TILE SEAMLESSLY LEFT TO RIGHT: the left and right edges must match
  exactly, because this repeats horizontally forever.
- Fade to fully transparent before the bottom edge.

No text.
```

---

## 1. Why this layer is needed

The deck art (`arena_near.png`) carries its own underside for **172 world pixels
below the contact line** — its last opaque row is 920 of 1024. The camera, driven
to the bottom of the arena with both machines low and far apart, reaches **354
world pixels** below that line.

So there is a band roughly 180 pixels tall that no art covers. It is currently
filled by `GroundPlane`, a flat graded rectangle whose real job is to guarantee
the floor is never see-through. That fill is a safety net, not scenery: a smooth
wash under a hand-painted industrial stage reads as an undrawn rectangle no
matter what colour it is, which is exactly the complaint that produced this
brief.

**The fill stays** once this layer exists. It moves to near-black and sits behind
the art as backing, so a gap can never show sky again — but nothing about the
look depends on it any more.

## 2. Where it goes in the engine

* New key `arena_under`, loaded beside the other arena layers in `BootScene`.
* Drawn as a `tileSprite` like `arena_near`, positioned so its **top edge sits at
  the deck contact line** (`DECK_Y`), directly continuing the deck art above it.
* Depth: immediately behind `arena_near` and in front of `GroundPlane`'s fill.
* Scroll factor: the same as `arena_near`. It is physically part of the same
  structure, so any parallax difference between them would tear the deck apart.

## 3. What to check when it arrives

* **Look at it from the arena floor**, not from the normal fighting height. The
  route is training mode with both machines driven low and apart, which makes
  the camera zoom out and drop — that is the only view where this layer is
  visible at all.
* **Check the seam at the deck line.** The join between `arena_near`'s underside
  and this layer's top must be invisible; if the two disagree on where the main
  girders are, the deck will look like two separate structures.
* **Check the tile seam.** Image models do not produce matching left and right
  edges; this repeats forever, so the usual offset-and-heal pass is required.
* **Check it is dark enough.** Anything brightly lit down here will pull the eye
  away from the fight, which is the one thing a background layer must never do.
