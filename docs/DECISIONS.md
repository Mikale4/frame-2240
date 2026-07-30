# Decision Log

Append-only record of design and technical decisions, newest section last.
Each entry states the decision, why, and what it cost.

---

## 2026-07-30 — Session 1: audit, core, art pipeline, vertical slice

### D1 — The simulation must not import Phaser

**Decision.** `core/`, `combat/`, `projectiles/`, `mechs/`, `data/` and `ai/`
contain no Phaser reference. `MatchSim.step(playerInput, enemyInput)` is the only
entry point.

**Why.** It makes combat unit-testable in plain Node (70 tests run in ~1.5 s with
no DOM), it keeps determinism auditable, and it means a replay, a second human
and the AI all drive identical code.

**Cost.** The renderer must mirror state every frame rather than owning it, and
`SimEvent[]` has to carry everything the presentation needs.

---

### D2 — Acceleration-based flight, not the reference's `velset`

**Decision.** Momentum-based flight: accelerate toward the input direction, light
coast drag, a hard air brake, and a constant-velocity dash burst.

**Why.** The 2005 reference sets velocity directly each tick (`velset` in
`Statedef 0`), which is extremely snappy but has zero momentum. CLAUDE.md
explicitly requires "momentum, braking, boost, quick dash, and recoil" and
"acceleration, drag, air brake". Pure `velset` cannot express recoil or braking
as anything the player feels.

**How the reference's feel is preserved.** Acceleration is high (0.62 px/tick²
against a 5.2 px/tick cap, so ~8 ticks to top speed), diagonals are normalised
exactly as the reference divided by 1.414, and the dash remains an authored
constant-velocity burst in the spirit of its `vel * 2.25`.

**Cost.** Turning is slightly less instant than the original. Recorded as a
deliberate divergence.

---

### D3 — Overspeed bleeds instead of hard-clamping

**Decision.** The per-tick speed cap is `max(nominalCap, previousSpeed * 0.96)`.

**Why.** The first implementation compared against `currentSpeed * 0.94` *after*
acceleration, which created a feedback loop that settled at ~10 px/tick instead
of the 5.2 cap — caught by `flight.test.ts › respects the speed cap`. But a naive
hard clamp would instantly erase recoil and melee-launch impulses, killing the
momentum D2 exists to provide.

**Result.** Ordinary thrust tops out exactly at the cap; externally applied
overspeed decays 4% per tick, so a launch reads as momentum.

---

### D4 — The Boost button does three jobs

**Decision.** One button: tap + direction = dash, hold + direction = boost,
hold with no direction = air brake. Barrier gets its own key.

**Why.** The reference bound `A` alone to Barrier and `direction + A` to SpeedUp,
proving one button can carry direction-dependent meaning. Air brake needed a home
and "hold with no direction" is the natural free slot. Splitting Barrier onto its
own key keeps the defensive option unambiguous under pressure, which matters more
than exact key parity.

**Cost.** A documented divergence from the original's `A`-only barrier.

---

### D5 — Melee is a hit-confirmed chain that ignores barriers

**Decision.** Three stages (0 → 1 → 2). A chain input is only buffered inside an
authored window, and the chain only advances if the previous stage actually
connected. Melee carries `BarrierResponse.Pierce`. Speed saturation raises the
hit cap from 3 to 6.

**Why.** All four properties are in the reference: the chain window is
`time = [14,26]` with `command = "x"`; the gate is `var(36)`, set only by
`ProjHitTime(21)`/`ProjContactTime(21)`; the cap is `var(41) < 3` rising to
`< 6` under `var(58) = 2`; and the projectile is tagged
`attr = S, HP ; 防壁不能型` — "barrier-impossible type". Together they make
melee the answer to a turtling opponent while keeping whiffs punishable.

---

### D6 — Barrier absorbs into the saturation meter, and can cancel for double cost

**Decision.** A 6-tick action granting 36 ticks of invulnerability; absorbed
shots add saturation charge; bursting out of guard or hitstun costs the normal
price plus a penalty.

**Why.** Straight from the reference. `Statedef 1200` grants `var(53) = 36`
(commented `;(f)`, frames) and ends at `time > 6`; the hint sheet states blocked
shots are "converted into the 集中 gauge"; and entering from `PrevStateNo = 151`
(guard) or `5030` (hitstun) charges a second `PowerMax/4`.

**Why it matters.** This is the mechanic that makes the game a *fighter* rather
than a shooter: defence is an offensive investment, and escaping pressure is
possible but expensive.

---

### D7 — Barrier gets its own gauge, separate from weapon energy

**Decision.** Five gauges: life, boost, barrier, weapon energy, saturation.

**Why.** The reference spent one `var(28)` "power" pool on both shots and
barrier. CLAUDE.md requires a "barrier/guard resource and guard break" *and* lists
five distinct HUD gauges. A shared pool cannot express guard break.

**Cost.** More gauges to read; mitigated by making life and saturation long bars
and the other three short.

---

### D8 — Saturation keeps three modes with the reference's asymmetries

**Decision.** Shield / Shoot / Speed, cycled by a dedicated button, activated
with Main+Heavy on a full meter. Shield drains at 2× rate.

**Why.** The hint sheet enumerates exactly three (シールド / シュート / スピード)
with concrete numbers, `0.cmd` cycles them with `var(58) = (var(58)+1)%3` on
Start, activation is `command = "x" && command = "y"`, and Shield's faster drain
is the reference's extra `var(40) = 5` when `var(58) = 0`. The published English
name is "Saturation", which is where CLAUDE.md's term comes from.

**Tuning taken from the sheet.** Shoot: damage ×1.5, projectile speed ×1.6,
homing ×1.8, energy regen ×2.2 and an instant 50% refill. Speed: velocity ×1.75,
melee cap 6, boost tank refilled. Shield: +24 ticks of invulnerability and an
incoming-shot erase bubble.

---

### D9 — Firing anchors movement

**Decision.** While an attack is committed, velocity is multiplied per tick:
0.24 (beam), 0.55 (heavy), 0.76 (missile), 0.9 (bullet).

**Why.** The reference does this explicitly with `velmul 0.2/fvar(10)` during
charge states and `0.5/fvar(10)` during the release. It is what stops the game
degenerating into strafing while holding fire, and it makes heavy weapons a real
positional commitment.

---

### D10 — Mechs are data, following the reference's own architecture

**Decision.** `MechDef` records in `data/mechs.ts`; no per-mech subclasses.

**Why.** `chars/rs/` in the reference is *one* character shared by ~20 mechs,
differentiated by `var(1)` with animations resolved as `61000 + var(1)*10`. That
design shipped 20 machines off one state machine. Copying the shape means a new
mech is data, not code.

---

### D11 — Rig = parent + offset + rotation + explicit draw order + a `follow` mode

**Decision.** `MechRigDef` lists ten parts with `parent`, `x`, `y`, `rotation`,
plus a `follow` field of `chassis | turret | thruster | fixed`, and a separate
`drawOrder`.

**Why.** Two sources converge. The reference builds mechs from one helper per part
(head 6000, upper limbs 6200, arms 6300, backpack 6400, legs 6500/6510) and drives
per-part angles in `fvar(1..5)`. Iron Babel's `light_exo.json` independently
arrived at bones-plus-`drawOrder`, which is the cleanest 2D expression of it. The
`follow` field is this project's addition: it is what lets arms and head track the
target while the chassis banks with velocity, satisfying "multipart mechs with
independent aiming, recoil, banking, and thrusters".

**Rejected.** Iron Babel's monolithic 4.47 MB single-HTML architecture, per
CLAUDE.md.

---

### D12 — Blender parts are rendered pivot-centred, one per PNG

**Decision.** For each part: move its origin to the world origin, point an
orthographic camera at the origin, render a 256×256 transparent PNG.

**Why.** It guarantees the pivot is at the exact image centre, so the runtime can
use `setOrigin(0.5, 0.5)` and place parts purely from rig offsets. The
alternative — rendering parts in situ — would align only in the neutral pose and
would break as soon as a part rotated.

**Scale contract.** `PX_PER_BU = 120`, displayed at 0.5 → **1 Blender unit = 60
logical pixels**, matching the units the rig offsets are authored in.

---

### D13 — `view_transform = 'Standard'` for all game art

**Decision.** Override Blender's default view transform.

**Why.** The first mech render came back washed out with every emissive detail
clipped to flat white. Blender 4/5 default to a filmic/AgX grade, which is right
for photographic renders and wrong for game sprites that need literal palette
colours. Fixing the transform (and dropping emission strengths to ≤2.5) restored
the palette.

**Corollary.** The arena's first pass was also blown out — area-light power falls
off with distance squared and the arena lights sit ~30 units out, so the
mech-rig energies were ~10× too high at that range.

---

### D14 — A separate unzoomed camera for the HUD

**Decision.** `BattleScene` adds `uiCam`; the main camera ignores UI objects and
`uiCam` ignores world objects.

**Why.** The camera zooms between 0.74 and 1.34 to keep both pilots framed.
`setScrollFactor(0)` exempts an object from *scrolling* but **not** from zoom, so
at zoom 1.3 the HUD scaled about the camera centre and the top gauges left the
screen — visible in `renders/debug/shot_battle_melee.png` before the fix.

**Knock-on.** The parallax backdrop could not stay on `scrollFactor(0)` either,
because at zoom 0.74 a 960-wide layer covers only 710 px and leaves gaps. It is
now positioned at `camera.worldView` and scaled by `1/zoom` every frame, which
covers the view exactly at any zoom.

---

### D15 — Effects are procedural and deliberately restrained

**Decision.** Generate glow/spark/ring/streak/slash/shard/hex textures on a
canvas at boot; throttle thruster emission to every other call; keep glow scales
small.

**Why.** Procedural keeps every effect original and recolourable per mech at zero
asset cost. The restraint is a bug fix: two nozzles per mech emitting an additive
128 px glow every frame with a 7–14 frame life stacks ~28 sprites and completely
erased the chassis. Effects now read as effects rather than as light bloom.

---

### D16 — Audio is synthesised, not sampled

**Decision.** All 18 sounds come from Web Audio oscillators and filtered noise in
`audio/Sfx.ts`.

**Why.** Guarantees originality, ships no audio payload, and gives per-event
parametric control (melee pitch rises with chain stage). The context is created
lazily and unlocked on the first gesture, as browsers require.

**Cost.** Less characterful than authored samples; revisit in M8.

---

### D17 — The CPU plays through the player's own input interface

**Decision.** `RivalAI.think(...)` returns an `InputFrame`. It reads only
positions, velocities, gauges and live projectiles — the things a player can see.

**Why.** "Fair CPU behaviour" is a definition-of-done item. Emitting input frames
makes cheating structurally impossible: the AI cannot exceed a speed cap, fire
without energy, or act during hitstun, because it goes through `Combatant` like
the player. Reaction delay scales from ~13 ticks at skill 1 to ~4 at skill 8,
and eight levels mirror the reference's `ai_1`…`ai_8`.

**Verified.** `match.test.ts` asserts `pressed ⊆ held` every tick over 600 ticks,
that gauges never go negative over 1200 ticks, that the AI damages an idle
opponent, and that a scripted aggressor can damage it.

---

### D18 — Attack frame 0 is consumed on the tick the attack starts

**Decision.** `stepAttack` advances `attackTick` *before* evaluating the phase and
firing, and the starting tick runs `stepAttack` immediately.

**Why.** The first implementation did neither, so every attack ran a tick late and
`phase` reported `Active` before the hit actually existed — an inconsistency that
would have made all published frame data wrong by one. Caught by
`combat.test.ts › walks startup → active → recovery`.

**Semantics now.** `attackTick` is the 1-based frame number; an attack with
`startup: 3` spawns its hit on frame 3.

---

### D19 — Phaser objects must survive their scene's shutdown

**Decision.** `Menu` marks itself dead on the scene's `SHUTDOWN` and `DESTROY`
events, and every public method early-returns when dead.

**Why.** A scene shutdown destroys its game objects without going through
`Menu.destroy()`, leaving `Text` instances with a null canvas context. Any later
`refresh()` threw inside Phaser's `updateText`. A `destroyed` flag alone was not
enough because nothing called `destroy()` on that path.

---

### D20 — `tsc` only type-checks `src/`

**Decision.** `tsconfig.json` includes `src` only.

**Why.** `vite.config.ts` uses Node builtins (`node:fs`, `node:path`, `Buffer`,
`process`) for the dev screenshot sink and the build-output cleanup. Including it
in the app's `tsconfig` demanded `@types/node`, and adding a dependency purely to
type-check a file that Vite compiles through esbuild anyway is not worth it.

---

### D21 — Blender operators run under `temp_override`

**Decision.** Every `bpy.ops.object.*` call in the build scripts is wrapped in
`bpy.context.temp_override(object=…, active_object=…, selected_objects=…)`.

**Why.** Driven over the MCP bridge — especially after any file open or reset —
`bpy.context` has no area/region and `bpy.ops.object.join` fails its poll with
"context is incorrect", even though selection and active object are correct.
Supplying the objects explicitly makes the scripts work regardless of UI state,
which also makes them usable in `blender --background`.

---

### D22 — Part objects are namespaced per mech

**Decision.** Blender part objects are named `<mech>_<part>`; `render_parts`
raises if any expected part is missing.

**Why.** The second mech's `core` collided with the first's, so Blender renamed it
`core.001`, the name lookup missed, and **all ten NOCTURNE sprites were silently
never written** — surfaced only as ten Phaser load failures in the browser. The
lesson is the guard, not just the rename: a pipeline that can silently produce
nothing must fail loudly instead.

---

### D22b — Melee trigger range is explicit data, not derived from the hit radius

**Decision.** `MechDef.meleeRange` (200 for HALCYON, 210 for NOCTURNE) decides
when the main-gun button swings instead of shooting.

**Why.** It was previously computed as `melee hit radius + hurt radius + 26` =
**92px** — narrower than the 104px-tall chassis. Two mechs that visually overlapped
were still "too far apart" to swing, so melee felt broken. The reference solved
the same problem by *lunging*: its melee startup ran `posadd 4.2-5.0 · cos(angle)`
to close distance. Our lunge was under-scaled too (7.4 px/tick against the
reference's 4.2-5.0 in a 320-wide space, which is ~13-15 in our 960-wide space).

**Fix.** Generous explicit trigger range plus a correctly scaled lunge (13.2 /
14.5 / 15.5 per chain stage). Pinned by tests asserting the range exceeds 1.5x
the chassis height, that 60-180px all swing, and that lunge reach covers the
trigger range.

---

### D23b — The mech designs were wrong, and why

**What was wrong.** The first models were upright humanoid bipeds with a small
rifle. Babel Sword's machines are nothing like that.

**Why it happened.** The audit covered the `.cns`/`.cmd` *logic* and the gameplay
screenshots, but never the mech art — the sprites live in binary `.sff` archives,
so the modelling was done from imagination and defaulted to generic mecha. That
is a research gap, not a tooling limit.

**How it was found.** The 2018 build ships its documentation as HTML, and
`data/bs1/howto/rs/mars1/p-*.gif` holds portrait art for all 20 machines. Those
were assembled into a contact sheet **in the scratchpad, outside the project**,
purely for study.

**The actual design language.** Hunched, forward-pitched torso; reverse-joint
("chicken walker") legs with the knee swept back onto wide splayed feet; an
oversized weapon held forward that dominates the silhouette; a tiny cockpit pod
rather than a head; a large rounded shoulder pauldron with a disc hub; a wide
horizontal composition; near-monochrome armour with a single saturated accent;
far-side limbs shaded distinctly darker for depth. The sprites are visibly 3D
renders downsampled to pixel art — which means the Blender pipeline was already
the right approach.

**Result.** `build_mechs.py` was rebuilt to that anatomy, and the rig offsets in
`data/mechs.ts` were re-authored to match.

---

### D24 — Procedural surface detail instead of flat albedo

**Decision.** Armour materials are a node network: Pointiness-driven machined
edge wear (also glossier there), a crossed Wave pair for panel seams in object
space, and two Noise scales for grime and broad tonal drift.

**Why.** Flat base colour is exactly what makes a model read as "clunky and
unfinished". The reference sprites carry edge highlights, panel divisions and
uneven tone. Doing it procedurally keeps the result original and ships no
texture files.

**Two calibration mistakes worth recording.** The seam ramp was initially
authored with its stops reversed; with CONSTANT interpolation that yields
isolated dots at the band crossings instead of a line grid. And the first
working grid was far too dense — a part is only ~35 logical px on screen, so
panel scale had to drop from 11/8 to 2.2/1.7 before it read as panelling rather
than halftone.

---

### D25 — Each mech is a distinct chassis, not a palette swap

**Decision.** `CHASSIS` in `build_mechs.py` drives hull mass, body pitch, leg
length/thickness, weapon type, booster layout, shoulder pod and melee hardpoint
per mech. Each mech gets its own rig in `data/mechs.ts`.

**Why.** NOCTURNE began as a recolour of HALCYON, which reads as one machine in
two colours. The reference roster is 20 visibly different frames.

**The two frames now differ in.** HALCYON: slim hull, 24° pitch, long legs, a
scoped drum-fed precision rifle, twin slim thruster bells, a compact 6-tube pod,
and a folded beam edge for melee. NOCTURNE: broad hull with an ammo hopper, 15°
pitch, short thick legs with extra shin plating, a six-barrel rotary cannon with
a belt feed running back to the hull, one wide caged burner with exhaust stacks,
a 12-cell missile rack, and a hydraulic breaching claw. Palettes are off-white
versus gunmetal so the two read apart instantly in play.

**Sync risk.** The Blender pivots and the TypeScript rigs are two copies of the
same numbers. `manifest.json` now records `pivots_px` and the chassis spec so a
drift is at least visible; a generator would be better and is queued for M4.

---

### D26 — Bindings are stored by physical key code, not character

**Decision.** `KeyboardEvent.code` ('KeyW', 'ShiftLeft'), never `key`.

**Why.** `code` is layout-independent: a binding made on QWERTY sits on the same
physical key on AZERTY, which is the behaviour players expect from WASD-style
schemes. It is also unambiguous to capture in a rebinding prompt, where `key`
would vary with modifier state.

**Consequences.** Phaser's keyboard plugin wants keys registered up-front by
name, which cannot work when any key may become meaningful at runtime. Input now
reads a single window-level tracker (`KeyState`) that also survives scene
changes, clears held keys on blur/tab-hide so nothing sticks down, and exposes a
"capture the next key" hook plus key-down edges for menus.

**Safety.** Assigning a key removes it from every other action first, so one
physical key can never drive two things. Stored bindings are merged over the
defaults with per-field validation — anything malformed, unknown or over-length
is discarded, so a corrupt entry cannot leave the game unplayable. Actions may
be deliberately left unbound, and the panel warns when they are. Menu confirm
and cancel keep fixed `ENTER`/`ESC` fallbacks so an over-enthusiastic unbind
cannot trap the player.

**Testing note.** 25 unit tests cover the model. Live verification had to lean on
localStorage and actual gameplay rather than reading the module: a dynamic
`import()` from the browser console resolves to a *different* module instance
than the app's graph (Vite serves it under a `?t=` URL), so `getBindings()` read
that way returns a stale second copy. The real proof was that a rebound key
fired the main gun in the running match.

---

### D27 — Pseudo-3D depth scaling is presentation only

**Decision.** Sprite scale is driven by arena Y — 0.82 at the top, 1.22 at the
bottom — and render order sorts lower objects in front. Mechs, projectiles and
effects all share the transform. Collision does **not** scale.

**Why.** Ported from the 2005 reference, which kept

```
fvar(35) = (ScreenPos Y + 25) / 240.0 * 0.4 + 0.8
```

a ~1.5x span over its 240px field. It is most of why the reference arenas read as
having depth rather than being a flat side-view plane.

**Why collision stays flat.** The reference applied that factor to the drawing
scale of its part helpers, so keeping it visual is the faithful reading. It is
also the better design: altitude never changes how big a target you are, the
arena-containment guarantees in the test suite stay provable, and the simulation
stays trivially deterministic. Pinned by a test asserting identical dynamics for
the same inputs run at two very different altitudes.

**Placement.** `core/Depth.ts` is shared by the renderer and the effects layer,
and `Effects.emit` applies it automatically from the particle's own Y so no call
site has to thread it through.

---

### D23 — Original naming throughout

**Decision.** Mechs **AV-07 HALCYON** and **AV-13 NOCTURNE**; pilots **NAIA
VESK** and **HALDEN ROOK**; factions **CONCORD SKYWARD** and **EMBERLINE PACT**;
arena **CATHEDRAL YARD**; weapons VULCAN / BREAKER / LANCE / SCATTER / SEEKER /
SALVO / SWORD I–III.

**Why.** The reference's own names (M.A.R.S., its 20 machine codes, its pilots and
its five factions) are catalogued in the audit as *evidence*, never reused.
Nothing from the reference folders ships in this project.
