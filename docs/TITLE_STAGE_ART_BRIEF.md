# Title Screen Backdrop — Art Brief

**For an external artist or image model producing the parallax backdrop for the
title screen of *F.R.A.M.E. 2240*.**

The title screen originally borrowed CATHEDRAL YARD's stage layers, which spent
the game's only arena before the player had seen it. It was replaced by a vista,
and the vista is now being replaced in turn — see §0.

**Subject: the open edge of a yard's deck, above an endless cloud sea, at dawn.**

---

## 0. The prompt to paste

**Revision 2.** The first pass delivered a mountain summit above the cloud sea.
It was beautiful and it was wrong: a nature scene says nothing about a game whose
entire vocabulary is girder, plate, gantry, sodium lamp and lift spar. A mountain
and a sunrise could front any game.

The composition survives; the subject changes. **You are standing on the edge of
a yard's deck, not a cliff.** Same drop, same cloud sea, same dawn — but the
frame around it is industry, and the distant peaks become *other yards*, which
states the whole setting in one image.

**Also less detailed on purpose.** The first delivery was painted at a uniform
high finish, which made the near rock compete with everything in front of it and
had to be graded back in the engine. This asks for broad flat forms and
silhouette weight instead.

```
I need parallax background layers for the title screen of a 2D game. Each layer
must be a separate image file with a transparent background except where stated.

Part 1 - The Place

A world where the ground is gone. A permanent layer of storm covers the dead
surface, and everything that survives is built on enormous structures suspended
in the cold clear air two kilometres above it. These structures are called
yards: lattices of girder and plate that carry docks, foundries, cranes and a
resident population, held up by reactor-driven spars.

The viewpoint is a person standing at the open edge of one of these yards -
right at the lip of its deck, where the plating stops and there is nothing
below but two kilometres of air and then the cloud. Looking out from that edge:
the cloud ocean, vast and still, going on forever, with a few other yards
floating far away on the horizon.

It is dawn. Cold thin air. Immense scale. The feeling is awe and exposure - and
the quiet of an industrial place before anyone is awake.

Part 2 - Art Direction

Grounded industrial science fiction. Girder, plate, rivet, cable, truss, mast,
crane, deck grating, sodium lamp. Not fantasy, not clean white utopian sci-fi,
not cyberpunk neon, not steampunk. Heavy honest load-bearing engineering.

Painterly, but SIMPLE AND BROAD. This is the single most important instruction
after the subject: use large flat shapes, strong silhouettes and restrained
value ranges. Do NOT render fine surface texture, small rivets, intricate
panelling, detailed rock or individually painted cloud lumps. Each layer should
read clearly as a shape at a glance from across a room. Less detail, bigger
forms, fewer elements. If in doubt, remove.

Palette: cold desaturated blue-grey steel, with warm dawn light - pale gold and
soft rose - raking in low from one side. Deep cool shadow. High altitude
clarity: distance reads as loss of contrast, not as fog.

No text. No lettering. No characters. No people. No creatures. No aircraft. No
robots. No mecha.

Strict flat side-on view, orthographic, 2D game background. No perspective
convergence, no vanishing point, no lens effects.

Part 3 - The Layers

Generate these as separate images, 16:9, with identical lighting direction and
colour harmony so they read as one place.

1. SKY (furthest, moves least)
The high vault at dawn. A clean simple gradient - deep cold blue at the top to
pale gold near the horizon. Very sparse thin high cloud. A few fading stars at
the top. Almost nothing else.
Fully opaque. This is the only layer with no transparency.
No horizon line, no structures, no cloud sea.

2. CLOUD SEA
The top of the endless storm layer, running the full width as a horizontal
field, seen from above. Long slow rolling swell - broad soft undulations like a
calm ocean. Simple large forms only: no fluffy detailed cumulus, no individually
painted lumps.
Light it FLATLY and EVENLY. Do NOT paint sun glitter, sparkle, specular
highlights or bright rim light on the crests - shimmer is added separately later
and painted highlights will fight it.
This layer must TILE SEAMLESSLY LEFT TO RIGHT.
Transparent above the cloud surface.

3. DISTANT YARDS
Two or three other floating yards, far away on the cloud sea near the horizon.
Small, pale, very low contrast, almost lost in haze - flat silhouettes with no
internal detail. Each is a long horizontal industrial platform with a few masts
above and tapering support spars below.
They exist to give scale and to say that this world is inhabited.
Transparent everywhere else.

4. MID STRUCTURE
The near edge of our own yard, off to one side: a mass of gantry trusses, dock
cranes and stacked deck levels, receding away. Mid-dark, simplified, reading as
massing rather than as detail. Lit from the same low dawn angle.
Positioned low and toward one side, leaving the centre and the upper area open.
Transparent everywhere else.

5. FOREGROUND DECK EDGE (nearest, moves most)
The deck plating the viewer is standing on, and the structure immediately around
it. A near-black, high-contrast silhouette: the lip of the deck running along
the very bottom of the frame with a simple safety rail or kerb, and a heavy
girder or crane leg cropping in from one side.
Almost no internal detail - this is a shape, not a subject. It should read as
pure black cut-out at a glance.
The centre and the whole upper two thirds of the frame must be completely empty
and transparent.

Part 4 - Composition

- The horizon should sit LOW, around the lower third, so the sky dominates.
- THE UPPER LEFT MUST STAY OPEN AND QUIET in every layer. A large title logo
  sits there. Nothing high-contrast in that region.
- The lower centre must stay readable - menu text sits there.
- Keep the far middle of the frame clear and simple.

No text.
```

---

## 1. Why not literal water, and why not a mountain

The setting has no sea, and the art must not imply one. The surface of the world
is dead and covered; the "ocean" in this picture is the top of the storm layer,
seen from above. That is why the brief asks for **long slow swell rather than
cumulus** — it has to read as a surface — and why the **distant yards** matter
more than they look: they are the cue that tells the viewer this is a cloud deck
with a world on it rather than water.

**The mountain was canon-safe and still wrong.** A summit above the deck is
legitimate — the cloud begins around 2,000 m and real peaks exceed that — and the
first pass delivered a genuinely beautiful one. But a title screen is a claim
about what a game is, and rock and sunrise are a claim any game could make. This
one is about machines living on structures in the sky, so the thing you are
standing on should be a structure. Swapping the cliff for a deck edge keeps every
part of the composition that worked and changes what the picture is *of*.

The distant yards do a second job the peaks could not: they say the world is
inhabited, and that there are more of these places than the one you are on.

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
