# CATHEDRAL YARD — Stage Art Brief

**For an external artist or image model producing real 2D parallax art for the
one arena in *Babel Sword: Reignition*.**

This document is self-contained. It assumes no access to the codebase. Every
number in §3 is read out of the running game and is authoritative — the art has
to fit the engine, not the other way round.

---

## 0. The prompt to paste

**Self-contained — paste it on its own.** Attach this file only if the model asks
for more context.

```
I need parallax background layers for a 2D side-scrolling game stage.

Part 1 - The Setting

The stage is CATHEDRAL YARD: an abandoned dockyard suspended at high altitude,
far above a permanent storm layer that covers a dead surface. It was built to
receive ore convoys and fit out flying warships, and it was shut down and left
after a war. It is intact, cold and completely empty, and the lights are still
on because nobody decommissioned the reactor. The name comes from the scale and
the light: enormous vertical girders receding into haze, like the nave of a
cathedral. It is night. There is cold void above and warm dock haze below.
Nobody lives here and nobody is coming back.

Part 2 - Art Direction

Grounded industrial science fiction. Girder, plate, rivet, cable, rust, sodium
lamp. Not fantasy, not clean white utopian sci-fi, not cyberpunk neon.
Painterly semi-realistic rendering with clean confident linework and restrained
detail. Desaturated blue-grey steel with rust brown and warm sodium orange
accents. Lighting is a cold key from above and a warm sodium fill spilling up
from below. Heavy industrial proportions and honest load-bearing engineering
shapes. Mood: cold, vast, empty, awe and altitude.

Keep strict visual consistency across every layer: same lighting direction,
same colour harmony, same line weight, same rust and wear treatment, so all
layers read as one place.

No text. No lettering. No characters. No people. No creatures. No vehicles.
Strict side view, orthographic, 2D platformer style, no perspective
convergence, no vanishing point.

Part 3 - Creating Parallax Background Layers

Generate separate depth layers for a 2D side-scrolling game environment. Each
layer must be created as an individual image file.
The purpose is to create a consistent parallax scrolling background system.
Make the aspect ratio 16:9.

Generate The Following Depth Layers

1. Far Background Layer (Slowest Movement)
Only distant environmental elements: vast hull plating, distant towers and mast
structures, faint gantry silhouettes dissolving into cold haze.
Low contrast and reduced detail. Heavily desaturated cold blue-grey.
No detail smaller than a large window.
No gameplay platforms.
No foreground objects.
No characters.
Leave space in lower areas for stacking additional layers.

2. Mid Background Layer
Environmental structures with medium detail and contrast: cathedral-scale steel
gantry trusses, empty dock cradles and ship berths, catwalks and service
walkways, ladders, cable runs and hanging chains, scattered caged sodium lamps
casting warm pools against cold steel.
Tall vertical girders that leave the top of the frame.
Still no gameplay platforms.
No characters.
Designed to sit in front of the far background but behind gameplay elements.

3. Gameplay Layer
The dock deck: one heavy riveted steel walkway surface running unbroken across
the full width of the image, positioned along the bottom of the frame.
A bright hazard-striped contact lip along its top edge marking the exact surface
that can be stood on.
Solid and completely opaque below that surface line, with floor grating, deck
seams, bolt rows, cable conduit, pipe runs and a low structural kerb.
This is the only walkable surface in the stage - the game is free flight, so
there are no floating platforms and no stairs.
Clean separation from background.
No far background elements included.
Optimized for collision and interaction.

4. Foreground Layer (Fastest Movement)
High-contrast near silhouette elements: massive girder columns passing close to
camera, hanging chains and cable bundles, structural bracing.
Positioned at the bottom and the left and right edges of the frame only.
The centre of the frame must stay clear - that is where the fight happens and
nothing may obscure it.
Near-black silhouettes with minimal internal detail.
No background elements.
No characters.
Designed to enhance depth when moving faster than other layers.

Every layer except the Gameplay Layer must have a fully transparent background,
with alpha where there is no structure. The Gameplay Layer must be transparent
above the deck surface and opaque below it.

No text.
```

### What to do with what comes back

* **Expect 16:9 images.** The engine's strips are 1536x512 and 1536x256, which
  are not 16:9. That is fine — good art at 16:9 crops and scales into the strips
  far more easily than bad art forced to an odd ratio. Send them through as-is.
* **Layer 4 is new.** The engine has three layers today (§3.2). A fast foreground
  layer is a genuine addition and needs a small engine change — a tile sprite
  with a scroll factor above 1. It is worth having, and it is a short job.
* **Tiling and alpha will need a pass by hand.** Image models rarely produce
  seamless left/right edges or clean alpha on the first attempt. That work is
  straightforward in an editor once the art itself is right, and it is the reason
  the prompt does not lead with it — art direction first, technical conformance
  second.
* **The deck contact row must be measured** from whatever comes back, so
  `NEAR_LIP_ROW` can be set to it. See §3.5.

## 1. The game, in one page

A side-on 2D free-flight mecha fighter. Two machines, one arena, 180 seconds.
Machines fly in unrestricted 8-direction flight with momentum, boost, dash and
recoil; they can also drop out of flight mode, land on the deck and walk, though
in practice fights are almost entirely airborne.

* **Engine**: TypeScript, Phaser 3, WebGL.
* **Logical resolution**: `960 x 540`. All art is authored against this.
* **A mech chassis is ~96 px tall** at logical scale. That is the unit to judge
  every other size against — a gantry a machine can fly through needs to read as
  several chassis wide.
* **Camera**: follows the pair and zooms to frame both, between **0.34x and
  1.34x**. At the low end the *entire* 2400x1200 arena is on screen at once, so
  no part of the stage is ever guaranteed to be off-camera. There is no region
  you can leave unfinished.
* **View is landscape 16:9.** Vertical space matters: pilots fly to the ceiling.

### Visual language

The renderer applies a pseudo-3D depth cue ported from the game's design
reference: things drawn lower on screen are scaled up slightly (0.82x at the top
of the arena to 1.22x at the bottom) and sort in front. **Higher = further
away.** Stage art should support that reading — the deck at the bottom of the
frame is the closest thing to camera, and altitude should feel like distance as
well as height.

---

## 2. The fiction

### 2.1 The world (established canon)

The present is **CE 43**.

The ground has been uninhabitable for four generations. A continuous layer of
storm and suspended particulate begins at roughly **2,000 metres** and covers the
former surface. Above it the air is **clear, cold and thin**. Everything that
survives — settlements, industry, docks — is carried on **spars, masts and
gantries**.

Permanent structures are classed as **yards**: lattices of girder and plate built
to receive ore convoys, process cargo and support a resident population. Yard
control includes the docks, foundries and transit routes attached to it.
**Defensive works are installed inside the same lattice and frequently share
access with civilian cranes and lift machinery** — this is a load-bearing detail
for the art. Nothing here is a purpose-built arena. It is industrial
infrastructure that people also fight in.

The ore itself is the twist: mineral rafts are cut from the storm layer and
consist of material precipitated from the same industrial output that caused the
ground loss. The principal resource above the cloud deck is part of the recorded
cause of the catastrophe. Everyone draws from it.

Five powers, none of them a hero faction:

| Faction | Character |
| --- | --- |
| **CONCORD SKYWARD** | The largest authority. Classifies the Descent as an industrial accident. |
| **EMBERLINE PACT** | Formed CE 25 from seven yards; fought the Seven Yards War. Holds nine yards now. |
| **IRONWAKE COLLIERY** | Cuts the ore seams. Longest extraction series; has never issued a position on the Descent. |
| **FREE LATITUDE** | Unaligned operators. |
| **ASHFALL IRREGULARS** | Irregulars. |

No war has been declared since the Seven Yards War closed in **CE 32**. What
continues is contested docking, claim enforcement and changes of yard control
under standing rules issued case by case. **The fights in this game are that** —
not a war, a dispute with machines.

### 2.2 CATHEDRAL YARD (the stage)

Established in the codebase today:

* The arena is named **CATHEDRAL YARD**.
* It is described as an **abandoned drydock**.
* Its established mood, from the music direction: *"Night dockyard at altitude.
  Cold void above, warm haze below, cathedral-scale girders in cold blue-grey,
  dust drifting through the light."*
* Its stage theme is the only piece of music in the game that **belongs to the
  place rather than to either pilot** — built on scale and reverb rather than
  aggression, "awe and altitude".

**The name is the brief.** It is called a cathedral because of what the structure
does to light and scale: enormous vertical girders receding into haze, the sense
of a nave, a space far larger than the thing fighting inside it. The machines
should look small in it.

### 2.3 Proposed lore — NOT YET CANON, needs the owner's approval

**CATHEDRAL YARD has no Archive entry.** The Archive is the game's canon and is
deliberately complete; it contains 21 entries covering the world, the Descent,
the war, the eight machines and the eight pilots, and the stage is not among
them. Everything in this subsection is a *proposal written to fit the existing
canon*, offered so the art has a story to hang on. **It is not established and
must be approved before anyone treats it as fact.**

Proposed:

> A drydock yard abandoned after the Seven Yards War. Built to take ore convoys
> and fit out airframes, its lift network was cut during the settlement and never
> restored, so the lattice hangs on residual buoyancy and cannot support a
> population. Nobody holds it, which is why disputes are settled here: it is the
> one structure at this altitude that no power's claim covers, and the standing
> rules permit a contested matter to be resolved on neutral plate. The cradles
> still stand. The gantry lights still run, drawing off a reactor nobody
> decommissioned.

Two things this buys the art:
1. **Abandoned but powered.** Lights on, nobody home. Warm sodium against cold
   blue, and no crew, no traffic, no lit windows with people behind them.
2. **A reason both fighters are here** that fits a setting where no war is
   declared.

Open canon question for the owner: the codebase currently calls it an
**"abandoned orbital drydock"**, in `README.md` and `tools/blender/build_arena.py`.
**"Orbital" contradicts the established setting** — the world is explicitly
atmospheric, above a cloud deck at ~2,000 m, on spars and gantries. It should
probably read "high-altitude drydock" or just "drydock". Flagged rather than
changed.

---

## 3. Technical specification

**These are the numbers the engine uses today. Art must fit them, or the spec
changes and the engine changes with it.**

### 3.1 World geometry

| Quantity | Value | Meaning |
| --- | --- | --- |
| Arena width | **2400** px | Playable, x from 0 to 2400 |
| Arena height | **1200** px | Playable, y from 0 to 1200. **y increases downward.** |
| Logical view | **960 x 540** | The design resolution |
| `DECK_Y` | **1170** | The floor. A landed machine's **feet** rest on this line. |
| Camera zoom | 0.34 – 1.34 | At 0.34 the whole arena is visible |
| Chassis height | ~96 px | Scale reference |

The deck sits **30 px above the bottom of the arena**. Below `DECK_Y` the engine
draws an opaque slab 250 px deep, so diving to the floor can never reveal sky
through a gap underneath.

### 3.2 The current three-layer stack

| Layer | File | Size | Depth | Scroll rate | Engine tint | Alpha |
| --- | --- | --- | --- | --- | --- | --- |
| Far | `arena_far.png` | **1536 x 512** | −90 | **0.06** | `0x6f7fa8` | 0.85 |
| Mid | `arena_mid.png` | **1536 x 512** | −80 | **0.18** | `0x9aa8c8` | 1.0 |
| Near | `arena_near.png` | **1536 x 256** | on the deck | **world-anchored** | `0x8d97bb` | 1.0 |

Notes that matter:

* **All three are horizontally tiling sprites.** They must tile seamlessly on the
  x axis at their stated width.
* **All three are tinted by the engine at runtime**, multiplicatively. Author them
  closer to neutral/desaturated than the final look; the tint supplies the cold
  cast. The far layer is additionally baked darker so parallax reads as depth.
* **The near layer is not parallax.** It is world geometry: a strip 3200 px wide
  pinned at world x = −400, drawn *behind* the machines, representing the deck's
  own structure. It scrolls 1:1 with the world.
* **`NEAR_LIP_ROW = 111`.** The first fully opaque row of `arena_near.png` is at
  y = 111 in the image, and the engine positions the strip so that row lands
  exactly on `DECK_Y`. **If the near layer is redrawn, either preserve that row
  or tell us the new one** — this is what makes the drawn floor and the simulated
  floor the same line.
* Vertical parallax exists: as the camera rises, far and mid shift down and the
  far layer's tile offset moves, so flying to the ceiling reveals sky and diving
  reveals the dock floor.

### 3.3 Sky

Drawn procedurally in-engine as a vertical gradient plus a star field, **not an
image**. Nothing needs to be authored for it.

| Stop | Hex | Luminance | Position |
| --- | --- | --- | --- |
| Void overhead | `#0C1224` | 22 | 0.00 |
| | `#1B2742` | 42 | 0.22 |
| | `#2C3C5E` | 66 | 0.45 |
| | `#3A4C6C` | 78 | 0.70 |
| Storm glow below | `#47516A` | 82 | 1.00 |

**This gradient is the palette anchor for the whole stage, and it is pitched to
sit *under* the art rather than behind it.** Its first version ran luminance
15–54 against layers that measure 72–98 once tinted — up to six times brighter
than their own sky — so the parallax floated on a void instead of receding into
one. New art should land in the same blue-dominant family; anything warm or
red-dominant fights it, which is what the old bottom band `#3A2C3C` did.

The stage is **night**, and that is not a free choice: every delivered layer has
its sodium lamps lit, and lamps burning in daylight read as an error.

110 stars sit above the strips, concentrated in the upper 62 % of frame with a
slow shallow twinkle and a 0.02 parallax. They are canon — the Archive has the
air above the storm layer as "clear, cold and thin". There is deliberately **no
traffic**: no ships, no distant machines. CATHEDRAL YARD's whole character is
that nobody holds it and nobody comes back, and a moving object in the sky would
contradict that as well as competing with the fight for the eye.

A drifting dust field of 44 additive motes, tinted `#9FC4FF`, floats over the
backdrop at varying depths.

### 3.4 Deliverables

**Produce the actual image files**, not descriptions of them. At minimum,
replacements for the three existing layers:

| File | Size | Must be |
| --- | --- | --- |
| `arena_far.png` | 1536 x 512 | Tileable on x, alpha everywhere except structure |
| `arena_mid.png` | 1536 x 512 | Tileable on x, alpha everywhere except structure |
| `arena_near.png` | 1536 x 256 | Tileable on x, deck solid below the contact row |

More layers are welcome if justified — the engine can take them, and a four- or
five-layer stack with a distinct silhouette band would likely read better than
three. Say what you want and why.

Authoring at **2x** (3072 x 1024 etc.) is fine and probably preferable; the game
downsamples cleanly and it leaves headroom if the logical resolution ever rises.
Say which you delivered.

### 3.5 The three things most likely to go wrong

Stated plainly because they are the failure modes, not nitpicks. If any of them
cannot be met, **say so** — a layer that fails one of these silently costs more
to discover than to be told about.

1. **Seamless horizontal tiling.** Every layer repeats on the x axis forever. A
   visible seam is visible every 1536 px, permanently, in the middle of every
   fight. Image generators are bad at this by default. Generating wider and
   cropping to a matching pair of edges, or mirroring, are both acceptable
   solutions; claiming it tiles when it does not is not.
2. **A real alpha channel.** The sky is a gradient drawn by the engine *behind*
   these layers. A layer with a dark background baked in will occlude it and the
   whole depth effect collapses. Transparent must mean transparent, not "dark
   navy that looks like sky".
3. **The deck contact row.** `arena_near.png` is positioned so that its first
   fully opaque row lands exactly on the floor the simulation uses. It is row
   **111** in the current asset. New art does **not** have to hit 111 — but the
   real number must be measured and reported, because the engine constant
   `NEAR_LIP_ROW` gets set to it. An unreported or guessed value puts the drawn
   floor and the simulated floor in different places, which is precisely the bug
   this arena already had once.

---

## 4. What the stage must support

Practical requirements that come from the fight, not from the fiction:

1. **Readability first.** Two machines, drones, projectiles, explosions and
   beams are on screen constantly. The backdrop must never compete. Existing
   art already had to be muted at runtime because hazard stripes on the deck lip
   pulled the eye harder than the machines did.
2. **Silhouette contrast.** Mechs are lit, saturated and mostly mid-tone. The
   stage should stay darker and lower-saturation than the machines at all times.
3. **The vertical axis is play space.** Pilots fight at every altitude from the
   deck to the ceiling. The stage cannot be interesting only at the bottom.
4. **No busy detail in the mid-frame band.** That is where the fight happens.
5. **The deck must read as a floor you could land on** — it is a real surface in
   the simulation, and a landed machine's feet touch a specific line.

---

## 5. Known engine issue the artist should know about

**The floor is currently decorative while flying.** The deck collision is
implemented only in grounded mode; in flight a machine is clamped to the arena
bounds, not to the deck, so it can descend until its **feet sit 64–86 px below
the drawn floor** depending on chassis. Projectiles have no deck collision at
all and pass straight through.

This is a gameplay bug, not an art problem, and is being tracked separately. It
is mentioned here only so that art is not designed around a floor that machines
currently sink through — **assume the floor will be solid** once fixed, and draw
it accordingly.

---

## 6. Style guardrails

* **Grounded industrial science fiction.** Girder, plate, cable, rust, sodium
  lamp. Not fantasy, not clean white utopian sci-fi, not cyberpunk neon.
* **Cathedral scale.** Verticals that leave the top of the frame. Structure that
  implies far more of itself than is drawn.
* **Abandoned, not ruined.** It was shut down, not destroyed. Nothing here was
  bombed. It is intact, cold and empty, with the lights still on.
* **No people, no lit windows with occupants, no traffic.**
* **Nothing that reads as a specific faction.** The stage belongs to nobody —
  that is the whole point of it, in the fiction and in the music.
