# CATHEDRAL YARD — Context Pack

**Everything an outside artist or image model needs to know to draw anything for
this stage.** Self-contained; assumes no access to the game.

Attach this alongside any specific layer brief — `UNDER_DECK_LAYER_BRIEF.md`,
or whatever comes next. The layer brief says *what to draw*. This says *what
world it is in and what the picture is for*.

---

## 1. The game, in one page

**F.R.A.M.E. 2240** is a 2D aerial mecha combat game. Two piloted machines fight
one another in free flight — no gravity to fight against, full three-dimensional
thrust flattened to a side view. One arena, one fight, one on one.

The player sees a **strict side elevation**, like a 2D fighting game or a
side-scrolling platformer. There is no perspective, no camera rotation, no
vanishing point. The camera pans and zooms to keep both machines framed, so it
travels a long way horizontally and a fair way vertically.

Machines are roughly 96 pixels tall on a 960×540 logical screen. They are
**small in this stage on purpose** — the arena should feel much larger than the
things fighting in it.

## 2. The world

* The ground is gone. A permanent layer of storm and suspended particulate
  begins at about **2,000 metres** and covers a dead surface. Nothing lives
  below it.
* Everything that survives is carried on **spars, masts and gantries** in the
  clear cold air above that layer. The large permanent structures are called
  **yards**: lattices of girder and plate built to receive ore convoys, process
  cargo, and support a resident population.
* **This is an atmospheric setting, not an orbital one.** No stars-and-vacuum,
  no spacecraft, no planetary curvature, no zero gravity. Cold thin air, real
  weather, real up and down.
* Five powers hold territory. **No war is currently declared.** Disputes —
  contested docking, claim enforcement, changes of yard control — are settled by
  single combat between machines, under rules issued case by case. That is what
  the game is: not a war, a dispute with machines.
* The present is **43 CE** in the local calendar. The last big war, the Seven
  Yards War, closed in 32 CE.

## 3. The stage: CATHEDRAL YARD

**An abandoned high-altitude drydock. Nobody holds it, which is exactly why
fights happen there.**

Canon, in full:

> A drydock yard abandoned after the Seven Yards War. Built to take ore convoys
> and fit out airframes, its lift network was cut during the settlement and
> never restored, so the lattice hangs on residual buoyancy and cannot support a
> population. Nobody holds it, which is why disputes are settled here: it is the
> one structure at this altitude that no power's claim covers, and the standing
> rules permit a contested matter to be resolved on neutral plate. The cradles
> still stand. The gantry lights still run, drawing off a reactor nobody
> decommissioned.

Four things follow, and they are the whole brief for any art in this place:

* **Abandoned but powered.** Lights on, nobody home. Warm sodium lamps still
  burning against cold steel, and **no crew, no traffic, no lit windows with
  people behind them.** It has been empty for thirteen years.
* **The name is the brief.** It is called a cathedral because of what the
  structure does to light and scale: enormous vertical girders receding into
  haze, the sense of a nave, a space far larger than the thing fighting inside
  it.
* **It is a working industrial place that stopped**, not a ruin. Nothing is
  collapsed, overgrown, or picturesque. It is intact, cold, and unused.
* **Night, at altitude.** Cold void above, warm dock haze below.

Its established mood, from the music direction: *"Night dockyard at altitude.
Cold void above, warm haze below, cathedral-scale girders in cold blue-grey,
dust drifting through the light."*

## 4. Art direction

| Property | Value |
| --- | --- |
| Genre | Grounded industrial science fiction |
| Vocabulary | Girder, plate, rivet, cable, truss, crane, cradle, sodium lamp |
| Rendering | Painterly semi-realistic, confident linework, restrained detail |
| Palette | Desaturated blue-grey steel, rust brown, warm sodium orange |
| Lighting | Cold key from above, warm sodium fill spilling up from below |
| Projection | Strict flat side elevation, orthographic, no vanishing point |

**Not** fantasy. **Not** clean white utopian sci-fi. **Not** cyberpunk neon.
**Not** steampunk brass and cogs. Heavy honest load-bearing engineering.

Three things this project has already tried and rejected, so they should not
come back:

* **No cel shading.**
* **No darkening the machines toward the stage** — the mechs stay readable
  against it.
* **No modelling energy as geometry.** Energy in this game is drawn as light,
  never built as an object.

**Never include in any layer:** text, lettering, numbers, characters, people,
creatures, mecha, robots, or aircraft. The machines are drawn by the game.

## 5. How the stage is built

Six parallax layers, back to front. Each is a separate PNG; all but the sky have
real alpha.

| Layer | Size | What it carries |
| --- | --- | --- |
| `arena_sky` | 3072×1024 | The night vault. Opaque. |
| `arena_far` | 3072×1024 | Distant hull plating, masts, faint gantries in haze |
| `arena_haze` | 3072×1024 | The mist band that separates far from mid |
| `arena_mid` | 1536×1024 | Cathedral-scale trusses, cradles, catwalks, lamps |
| `arena_near` | 1536×1024 | The fighting deck and its immediate structure |
| `arena_fore` | 1536×1024 | Near girder columns sweeping past the camera |

**The deck is the only walkable surface.** The game is free flight — there are no
floating platforms, no stairs, no level design in the platformer sense. One
heavy riveted walkway runs unbroken across the whole width, with a bright
hazard-striped contact lip marking the exact surface that can be stood on.

Layers repeat horizontally, so **anything full-width must tile seamlessly left
to right.** Image models never produce matching edges; that is a hand pass in an
editor, every time.

## 6. Composition rules that apply to everything

* **The centre of the frame must stay clear.** That is where the fight happens
  and nothing may obscure it. Detail belongs at the edges and in the distance.
* **A background layer must never pull the eye.** If a viewer notices the
  scenery before the machines, it is wrong — however good it is.
* **Distance reads as loss of contrast, not as fog.** The air up here is thin
  and clear; things far away go pale and flat, they do not disappear into soup.
* **Alpha must be feathered.** Any layer that fades out needs its transition
  spread over hundreds of pixels. A haze band whose alpha falls from full to
  zero in a dozen rows draws a ruled horizontal line across the stage — this has
  already happened once and had to be corrected in the engine.

## 7. Practical notes for anything delivered

* Deliver at the sizes in §5, or at 16:9 and expect cropping. Good art at the
  wrong ratio crops far better than bad art forced to an odd one.
* Real alpha, not white or black behind the subject.
* **Say which way is up and where the light comes from, and keep it.** Layers
  are seen together; a single reversed light source makes the whole stack read
  as a collage.
* Assume it will be seen **dark and small**. Design at the scale that survives:
  large forms, clear silhouettes, broad tonal masses.
