# Title Screen Backdrop — Art Brief

**For an external artist or image model producing the parallax backdrop for the
title screen of *F.R.A.M.E. 2240*.**

The title screen currently borrows CATHEDRAL YARD's stage layers, which is wrong
twice over: it spends the game's only arena before the player has seen it, and a
dockyard interior is a cramped first impression for a game about flight. This
replaces it with a vista.

**Subject: the edge of a mountain summit, above an endless cloud sea, at dawn.**

---

## 0. The prompt to paste

**Self-contained — paste it on its own.** Attaching the existing CATHEDRAL YARD
layers as a style reference is optional here and possibly unhelpful: this is a
*natural* vista, not an industrial one, and the only thing it needs to share with
them is palette discipline and painterly weight.

```
I need parallax background layers for the title screen of a 2D game. Each layer
must be a separate image file with a transparent background except where stated.

Part 1 - The Place

A world where the ground is gone. A permanent layer of storm and suspended
particulate begins about two kilometres up and covers the entire dead surface,
so from above it looks like an endless ocean of cloud stretching to the horizon
in every direction. Nothing lives below it.

The viewpoint is the edge of a mountain summit - one of the few peaks high
enough that its bare rock still stands above that cloud ocean. The camera is a
person standing at the very lip of a sheer drop, looking out. Directly below
the edge the rock falls away into nothing. Beyond it: the cloud sea, vast,
still, and going on forever.

It is dawn. Cold thin air. Immense scale. The feeling is awe and exposure - the
beauty of standing somewhere no one should be able to stand.

Part 2 - Art Direction

Painterly semi-realistic rendering. Confident, restrained, atmospheric.
Grounded and naturalistic - not fantasy, not stylised, not cel shaded, not
photographic.

Palette: cold desaturated blue-grey for the rock and the cloud sea, with warm
dawn light - pale gold and soft rose - raking in low from one side and catching
the tops of the clouds and the upper edges of the rock. Deep cool shadow. High
altitude clarity: the air is thin, so distance reads as loss of contrast rather
than as fog.

Vast, dramatic, breathtaking. The scale should feel almost frightening.

No text. No lettering. No characters. No people. No creatures. No vehicles. No
buildings. No structures. No aircraft. Nothing man-made anywhere in any layer.

Strict flat side-on view, orthographic, 2D game background. No perspective
convergence, no vanishing point, no camera lens effects, no lens flare.

Part 3 - The Layers

Generate these as separate images, 16:9, in a consistent style with identical
lighting direction and colour harmony so they read as one place.

1. SKY (furthest, moves least)
The high vault. Dawn gradient - deep cold blue at the top grading to pale gold
near the horizon. Thin high cloud, sparse, flat, catching the low light.
A few fading stars at the very top.
Fully opaque. This is the only layer with no transparency.
No horizon line, no land, no cloud sea.

2. FAR HORIZON HAZE
The band where the cloud ocean meets the sky. Extremely soft, low contrast,
almost featureless - a pale luminous strip that dissolves upward into nothing.
This is what sells the distance.
Transparent above and below the band.

3. CLOUD SEA (the main surface)
The top of the endless storm layer, seen from above and slightly to the side,
running the full width of the image as a horizontal field.
Long slow rolling swell - broad soft undulations like a calm ocean, not fluffy
cumulus and not flat fog. Dense enough to read as a surface you could not fall
through.
CRITICAL: light this FLATLY and EVENLY. Do NOT paint sun glitter, sparkle,
specular highlights, bright rim light on the wave crests, or any strong
directional lighting into this layer. It must be an even, neutral, softly lit
surface. Lighting and shimmer are added separately later, and any highlights
painted in here will fight them.
CRITICAL: this layer must TILE SEAMLESSLY LEFT TO RIGHT. The left edge and the
right edge must match exactly so it can repeat forever.
Transparent above the cloud surface.

4. DISTANT PEAKS
Two or three other summits far away, breaking up through the cloud sea near the
horizon. Small, pale, very low contrast, almost lost in haze.
They exist to give the cloud sea scale and to prove it is a layer with things
under it.
Transparent everywhere else. No detail. No structures.

5. MID CLIFF
The mountain's own mass, falling away below and to one side. Bare stone -
strata, fracture, scree, snow caught in the lee. Lit from the same low dawn
angle, deep cool shadow on the faces turned away.
Positioned low and toward one side of the frame, leaving the centre and the
upper area open.
Transparent everywhere else.

6. FOREGROUND CLIFF EDGE (nearest, moves most)
The lip of rock the viewer is standing on. A near-black, high-contrast
silhouette occupying only the very bottom of the frame and a little way up the
left and right edges.
Almost no internal detail - it is a shape, not a subject.
The centre and the whole upper two thirds of the frame must be completely
empty and transparent.

Part 4 - Composition

- The horizon line should sit LOW, at roughly the lower third of the frame, so
  the sky dominates. This is a picture about air.
- THE UPPER LEFT MUST STAY OPEN AND QUIET in every layer. A large title logo is
  placed there. No peaks, no cloud detail, no high-contrast shapes in that
  region.
- The lower centre must also stay readable - menu text sits there.
- Nothing may cross the exact centre of the frame at mid height.

No text.
```

---

## 1. Why not literal water

The setting has no sea, and the art must not imply one. The surface of the world
is dead and covered; the "ocean" in this picture is the top of the storm layer,
seen from above. That is why the brief asks for **long slow swell rather than
cumulus** — it has to read as a surface — and why the **distant peaks** matter
more than they look: they are the only cue that tells the viewer this is a cloud
deck with a world under it rather than water.

The mountain is canon-safe for the same reason it is interesting. The deck begins
at about 2,000 m; real peaks exceed that. A summit above the cloud is one of the
very few places in this world where bare ground still exists in open air, and
nobody has any reason to be standing on one.

## 2. Animating the cloud sea

Parallax alone will not sell it. The plan, in order of how much each buys:

**a. Shader displacement on the sea layer.** Phaser supports custom WebGL
pipelines. A fragment shader offsetting the sample point by two or three
superposed sines — `uv.x += sin(uv.y * f + t * s) * a`, at different frequencies
and speeds — produces a rolling swell that never repeats visibly. Runs on the
GPU, costs effectively nothing, and is the reason the art must be delivered
**flat**: displacement moves whatever is painted, so baked highlights would swim
with the surface and read as liquid metal.

**b. A procedural glint layer, additive.** Sparse bright specks generated at
runtime the way `render/Textures.ts` already generates effect textures, scrolled
slowly and pulsed. This is what actually reads as *light on a surface*, and it
needs no art at all. Cheap and disproportionately effective.

**c. Two sea plates at different scroll rates**, the near one slightly larger and
more transparent. Gives depth to the swell without a second piece of art.

**d. Drifting wisps.** A sparse transparent layer blowing across the deck faster
than anything else, to break the stillness.

**(a) plus (b) is the recommendation.** (c) and (d) are cheap additions once the
first two are working. Note that (b) alone, without (a), already looks better
than parallax — worth doing first to see how far it gets.

## 3. Technical specification

| Property | Value |
| --- | --- |
| Delivery | One PNG per layer, 16:9 |
| Colour | RGBA; only SKY is fully opaque |
| Engine strips | Wide layers 3072x1024, near layers 1536x1024 |
| Sea layer | **Must tile seamlessly left to right** |
| Logical screen | 960x540 |

Expect 16:9 images that do not match the strips. That is fine and is how the
CATHEDRAL YARD layers were handled — good art at 16:9 crops and scales into the
strips far more easily than bad art forced to an odd ratio.

**Seamless tiling will need a hand pass.** Image models do not produce matching
left and right edges. For the sea layer this is not optional, because it scrolls
forever; the usual offset-and-heal in an editor is the fix.

## 4. What this changes in the engine

* `TitleScene` currently draws `arena_far` and `arena_mid` directly. It would
  take its own layer set instead, so the title screen and the arena stop sharing
  art and can diverge freely.
* `BootScene` loads arena layers from a hand-maintained list. **Add title layers
  the same way and only once the files exist** — the dev server answers a missing
  path with `index.html` and a 200, so a load for an absent PNG hands the decoder
  an HTML document and boot hangs forever.
* The two showcase mechs currently stand at 17 % and 84 % width, mid height.
  Against a cloud sea they read as hovering, which is correct for aerial frames —
  but their placement should be re-checked against the new horizon.
