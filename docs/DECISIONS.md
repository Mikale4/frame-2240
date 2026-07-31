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

### D28 — Melee gets its own button

**Decision.** `Btn.Melee` is a dedicated, rebindable button (default `U` / pad Y).
The main gun always shoots, at any range.

**Why.** The reference overloaded its main-gun button and switched on proximity
(`var(31)`), and we copied that. In play it is worse than it sounds: a swing
happens *to* you because you drifted into range, the changeover is invisible, and
the trigger distance becomes a hidden tuning knob that has already caused one bug
(see D22b). A separate button makes a swing a deliberate commitment, is far
easier to learn, and is one more thing a player can rebind.

**Consequences.** Melee no longer needs a target or a range check — the authored
startup lunge is what closes distance, so a swing is available from anywhere and
simply whiffs if it falls short. `meleeRange` survives as the distance at which
the *AI* chooses to swing.

---

### D29 — Ground plane and FlyingMode

**Decision.** An arena floor at `GROUND_Y`, plus a FlyingMode toggle. Flight is on
by default; with it off the mech falls, walks, and rests on the deck.

**Why.** The reference is not purely aerial: `var(20)` is a flight flag, statedef
40 is take-off and 55 is landing, and `howto-en.html` lists FlyingMode ON/OFF as a
player toggle with an automatic switch-on during a Level 2 shot. It was one of the
larger gaps in the audit's function table.

**Balance shape.** Grounded trades mobility for durability: you walk instead of
fly, but brace better against damage (`DefenceDef.groundedMul`) and refuel boost
much faster. That keeps the game an aerial fighter — the floor is somewhere you
choose to visit, not somewhere you get stuck.

**Two bugs this surfaced, both now regression-tested.** Chassis separation could
shove a landed mech *through* the deck, and the flight step could not correct it
while the mech was frozen in hitstop — so the floor is now enforced after
separation. And the walk-speed cap was clamping the melee lunge, silently
breaking a grounded swing's authored reach; lunging now bypasses the cap.

---

### D30 — Layered defence multipliers

**Decision.** `DefenceDef { mul, groundedMul }` scales incoming damage per
chassis.

**Why.** The reference layered defence rather than using one flat stat: a base
`defence = 50` in `cns.cns`, an arcade-mode `DefenceMulSet` in statedef -3, and
per-tier multipliers selected by `var(30)` (0.55 / 0.85 / 0.65 / 0.75) in statedef
8000. HALCYON takes full damage; NOCTURNE's heavier armour takes 0.82x, and both
brace further when planted.

---

### D23 — Original naming throughout

**Decision.** Mechs **AV-07 HALCYON** and **AV-13 NOCTURNE**; pilots **NAIA
VESK** and **HALDEN ROOK**; factions **CONCORD SKYWARD** and **EMBERLINE PACT**;
arena **CATHEDRAL YARD**; weapons VULCAN / BREAKER / LANCE / SCATTER / SEEKER /
SALVO / SWORD I–III.

**Why.** The reference's own names (M.A.R.S., its 20 machine codes, its pilots and
its five factions) are catalogued in the audit as *evidence*, never reused.
Nothing from the reference folders ships in this project.

---

## 2026-07-30 — Session 2: rig rotation, saber verification

### D31 — A rig part contributes only the rotation its ancestors have not

**Decision.** `render/RigRotation.ts` owns the rule: a part whose ancestor chain
already contains a `follow: 'turret'` part adds only its own authored offset.
`MechRenderer` builds that inheritance map once per rig and applies it per frame.

**Why.** Container rotations compound down the rig tree, which is the point — a
sword held by an arm should swing with the arm. But every turret part was also
adding the aim itself, so anything parented to an arm rotated twice. Measured in
the running game: at aim −60° the right arm was correctly at −60° while
`mainWeapon`, `subWeapon` and `meleeWeapon` were all at −120°, pointing back
through the chassis. It had been wrong since the rig was introduced and was only
obvious once the beam saber gave it a long, thin object to be wrong with.

**Cost.** One extra pure module, and the rule now lives outside `MechRenderer` so
it can be unit-tested — `src/tests/rig.test.ts` pins arm-held weapons to the aim
at six angles, keeps the head's partial tracking, and asserts the melee spin is
applied once. Those tests fail against the old behaviour.

---

### D32 — The saber bloom is measured off the modelled part, not off `aim`

**Decision.** `BattleScene` reads the `meleeWeapon` part's real world transform
(`MechRenderer.partWorld`, which returns position, angle and scale) and lays the
additive streak along it, sized to the blade's lit section.

**Why.** The bloom was positioned from `c.aim` with a fixed 58px offset and a
198px span. That was wrong three ways at once: it ignored bank, it ignored the
part's double rotation, and it was about twice the length of the blade, so the
glow trailed off into empty space past the tip. Deriving it from the part means
it cannot drift again if the rig or the model changes.

**Note.** `partWorld` takes the angle from the matrix basis (`atan2(b, a)`) rather
than Phaser's `matrix.rotation`, whose decomposition drops the sign on a mirrored
rig — it reports +120° for a part actually drawn at −120°.

---

### D33 — Render tiles are sized per part, not fixed at 320px

**Decision.** `build_mechs.py` projects each part's bounding box onto the camera
axes and picks the smallest tile (multiple of 64) that contains it, holding
`PX_PER_BU` constant by tracking `ortho_scale` to the tile. The chosen size is
recorded per part in the manifest.

**Why.** Parts are framed on their own pivot, so a 320px tile only reaches 160px
from it. The beam saber is 1.7 BU of blade growing forward from a pivot at the
emitter, and was being cut off flat mid-blade — verified from the PNG, whose
alpha reached the last column still 9px thick. Only the two melee weapons need
more; they now render at 448px and everything else is unchanged.

**Cost.** Nothing at runtime: the pivot stays at the tile centre, so the game
still draws every part at origin 0.5,0.5 and `PART_SCALE`, and a larger tile only
adds transparent margin. A full rebuild is still deterministic — re-rendering all
22 parts changed at most one byte-value of dither noise outside the two sabers.

---

## 2026-07-30 — Session 3: the supporter drone

### D34 — The sub-weapon belongs to a drone, not to the chassis

**Decision.** Each machine is escorted by a persistent supporter drone
(`combat/Supporter.ts`). The assist button no longer starts a chassis attack: it
issues an *order*. The drone acknowledges, slews onto the target, and the shot
leaves its own muzzle. HALCYON is escorted by ARBITER, NOCTURNE by WARDEN.

**Why.** This is what the reference does. `howto-en.html` lists the supporter as
its own screen element — "2) supporter - sub shoot" — and the state file
`f-o.cns` is headed サポーター射撃, "supporter shooting". The labelled screenshot
shows a small machine flying below and behind the player. Firing sub-weapons out
of the chassis was a simplification the audit had already flagged as a gap.

**How it feels.** Because the drone does the work, the chassis is not locked into
an attack: you keep flying and shooting while the assist goes out. That is the
point of an assist, and it is the main reason this is not just a reskin of the
old sub-weapon.

**Cost.** One more entity in the simulation, and `fire()` grew an optional origin
so a shot can leave somewhere other than the chassis muzzle. Recoil is suppressed
for drone-fired shots — a drone's missile must not shove its owner around.

---

### D35 — The drone is invulnerable, persistent, and stepped from MatchSim

**Decision.** The supporter cannot be targeted or damaged, it lives for the whole
match, and `MatchSim.step` advances it rather than `Combatant.step`.

**Why, per point.**

*Invulnerable.* The reference draws a **charge** gauge on the supporter (HUD
element 4), never a life bar, and nothing in the supplied material describes
destroying one. Making it hittable would mean inventing a destruction and respawn
system with no evidence behind it, and would put a second collidable body in
front of every shot the player tries to land.

*Persistent.* The reference spawns its helper at `RoundState = 2` and keeps it for
the round.

*Stepped from `MatchSim`.* `Combatant.step` returns early through several
branches — hitstop, hitstun, a committed attack, an active melee lock. A state
machine hidden behind one of those returns is exactly how the melee lock-on once
stopped cancelling when hit. Driving the drones at the top level means no
combatant branch can skip them. They step after both chassis have moved (so each
drone chases this tick's position) and before the spawn queue drains (so an
assist shot becomes a live projectile on the same tick as any other).

---

### D36 — Readiness is drawn on the drone, and shows the real constraint

**Decision.** A short bar under each drone, not a sixth gauge in the corner. It
shows whichever of the two gates the player is actually waiting on: the drone's
own cooldown, or the slow sub-charge economy.

**Why.** The reference put its "sub shoot charge indicator" beside the supporter
in world space rather than in the HUD, which keeps the player's eye in the fight.
Showing only the drone's cooldown would have been actively misleading — that
clears in ~22 ticks while a spent charge takes 150, so the bar would have read
full while nothing happened.

A ring was tried first and rejected: at gameplay distance it read as noise around
the chassis rather than as a gauge.

**Also.** A refused order emits `assistDenied`, with a flat negative tone and a
spark. A button that silently does nothing is indistinguishable from a bug.

---

### D37 — Sub charges stall while attacking rather than resetting

**Decision.** The sub-charge timer stops advancing while the machine is in an
attack, but does not reset.

**Why.** The reference zeroed its charge counter outright whenever the machine was
in an action state, so pressure denies the assist and disengaging restores it —
a good rule worth keeping. But its counter refilled far faster than this game's
150-tick charge; losing a whole charge to one vulcan shot would punish ordinary
play far harder than the reference ever did. Stalling keeps the intent and the
pacing.

---

### D38 — The drone is one sprite, not a rig

**Decision.** `build_drone` joins the whole drone into a single object and the
game rotates one sprite.

**Why.** It is ~50 logical px long and turns as a whole to face its target. A part
hierarchy would produce identical pixels for more moving parts. The chassis rigs
exist because arms, head and weapons track independently; nothing on the drone
does.

**Art.** It follows the same language as the chassis — tapered wedges rather than
boxes, a back-heavy engine mass stepping down to a thin prow, swept vanes that
break the hull silhouette, a slung cannon, layered plates with a visible lip, and
a dark identity shade underneath so the top plates read as plates. Deliberately
not a sphere or a cube with a gun.

---

## 2026-07-30 — Session 4: swing arcs, walking, the deck

### D39 — Melee swings through an arc; it does not hold the blade out

**Decision.** `MeleeProfile.arc` authors a wind-up angle, a sweep, and where the
slash starts within the swing. `swingArcAngle()` turns that into an arm angle,
and the renderer carries the arm through it. Alternate hits mirror.

**Why.** The blade was being dragged into the target — a stab, repeated. The
cause was specific: `MechRenderer` decided "is this mech swinging?" from
`attack?.kind === Melee`, and the lock-on sequence never sets `attack`. So the
arm tracked the aim rigidly while the chassis translated into the target.

The 2005 reference animates this properly and the numbers are worth recording.
Its arm helper (statedef 6200) drives an explicit angle: for ~12 ticks the
command rises 5deg per tick to a raised position, then flips to a far-side angle
200-235deg away, which the arm chases at a fixed 5deg/tick — so the visible
motion is a continuous sweep, not a pose change. Four variants exist, mirrored,
selected per swing. `fvar(10)` is even documented as
`回転方向(0:0ff / -1:left / 1:right)` — rotation direction.

**Shape kept, curve retuned.** The reference's command curve `k*time/(time+1)` is
fast off the mark and eases out; ours decelerates the same way, so the blade is
quickest exactly where the hit window is.

**Per chassis.** HALCYON sweeps 202deg from a 74deg wind-up — a fast saber
flurry. NOCTURNE winds higher (96deg) and sweeps less (168deg): heavy overhead
chops. The claw still swings; it is not a thrust.

---

### D40 — Legs are separate parts, so mechs can walk

**Decision.** `lowerBody` split into a pelvis plus `legNear`/`legFar`, each with
its pivot at the hip. A walk cycle swings them in antiphase, driven from the
simulation.

**Why.** There was no walk animation at all — a grounded mech slid along the deck
with its legs welded to its hips. One `lowerBody` sprite cannot walk, so this had
to start in the art pipeline rather than the renderer.

**Phase is distance, not time.** `walkPhase` advances by ground distance covered,
so the stride matches the speed the machine is actually moving and the feet do
not skate. `stride` eases 0..1 with speed, so starting and stopping settle
instead of snapping, and at rest the legs hold a slightly splayed stance rather
than collapsing into a single overlapping silhouette.

**In the simulation, not the renderer**, so it stays deterministic and a replay
reproduces the same pose.

---

### D41 — The deck is one world line, and every chassis stands on it

**Decision.** `DECK_Y` is the world y of the deck *surface*. Each chassis carries
a `footOffset` — the distance from its body centre to its soles, measured from
the exported leg sprite — and rests at `DECK_Y - footOffset`.

**Why.** The floor was a body-centre height with nothing drawn at it. Two
problems followed: you could not see where the ground was, and because every
chassis rested at the same *centre* height, a long-legged machine and a squat one
could not both have their feet on the floor. HALCYON reaches 84px below its
centre and NOCTURNE 72px; they now touch the same drawn line.

**Drawn where it is.** `arena_near` already contained a hangar deck edge with a
hazard lip; it was being placed at a *screen* offset, so the floor it implied
slid around independently of the floor machines stood on. It is now world
geometry, offset so its own lip row (measured at y=111 in the PNG) lands exactly
on `DECK_Y`, and muted so the hazard diamonds stop out-shouting the machines.
`GroundPlane` fills opaquely below it and draws the contact shadows.

**Shadows are the altitude cue.** A shadow that tightens and darkens as a machine
descends tells a player their height far better than judging themselves against a
parallax backdrop.

---

### D42 — Status elements, from the reference's `var(54)`

**Decision.** `combat/Status.ts` adds four elements — CORROSIVE, CRYO,
INCENDIARY, SHOCK — carried one at a time per machine, applied by weapons on a
clean hit, and shown by pulsing the machine in the element's colour.

**Why.** The reference's variable legend documents
`var(54): 状態B (酸/毒:1 氷:2 火:3 電:4)` — acid/poison, ice, fire, electric —
and both its body and arm helpers react to it with a palette-shifted afterimage
per element (`palbright = 0, 128, 0` for the green acid case). It was the largest
single mechanic Reignition had no answer to at all.

**What each does is ours.** The reference gives the elements an identity and a
colour but keeps their effect inside its own state machine. Here: corrosive
chips, cryo slows, incendiary burns harder over a shorter window, shock drains
energy and stalls regen. One element at a time, as in the single `var(54)` — a
different element replaces the current one, so switching damage type is a real
decision instead of a way to stack every debuff.

**Two guardrails.** Chip damage cannot land the killing blow — being finished by
a burn seconds after the shooter disengaged reads as a bug, not a loss. And an
element only takes hold on a clean hit: guarding or absorbing a shot also turns
aside what it was carrying.

**Identity per chassis.** HALCYON's lance inflicts SHOCK (disruption); NOCTURNE's
missiles inflict INCENDIARY (attrition). Plain kinetic weapons stay elementless.

---

### D43 — The damage flash was six seconds long

**Decision.** `MechRenderer.flashHit()` sets 0.18, not 6.

**Why.** It was set to `6` and counted down with `dt` in *seconds*, so every hit
white-flashed the machine for six real seconds, toggling every half second. It
went unnoticed because hits land often enough to keep re-triggering it, and
because nothing else needed to tint the mech. Adding status colours surfaced it
immediately: an afflicted machine rendered solid white instead. The flash is now
a ~0.18s flicker, which is what the comment always claimed it was.

---

### D44 — The drone became an asset you can lose

**Decision.** The supporter drone is now a deployable unit with its own hit
points and a passive, and the assist button deploys and recalls it instead of
firing it. It fires on its own initiative while on station, still paying from the
same sub-charge rack. Destruction is permanent for the match.

**Why.** The assist button was a third weapon: press it, a volley comes out.
Nothing about it was a decision — there was never a reason *not* to press it when
the charge was up, so it was a damage-per-second tax on remembering to hit `L`.

Making the drone an object in the world rather than a button gives it something
to trade. Deployed, it earns: free volleys and a passive that is meaningfully
strong (45 % more energy regeneration, double barrier refill, 14 % more damage —
big enough to be worth protecting). Stowed, it earns nothing but cannot be hit,
and it repairs. So the button now asks a real question every time the fight
turns, and the answer changes depending on whether you are winning the exchange.

**Damageable reverses D-era reasoning, deliberately.** The 2005 reference draws
only a charge gauge on its supporter, never a life bar, and the first pass here
made the drone invulnerable and untargetable on that evidence. That was right
while it was a muzzle on a stick. It stops being right the moment the drone
carries a passive: an invulnerable source of permanent stat buffs is a
strictly-better button with no counterplay. Hunting an escort is now a real thing
to spend attention on, and the drone's hit points (95–170, against 820–1420 for a
chassis) are tuned so a stray shot does not delete it and deliberate fire does.

**One lever per passive.** Each drone changes exactly one number, enforced by a
test. A passive touching three stats is neither feelable in play nor balanceable
against the other seven. The only outward-facing one is NULLTIDE's STATIC, which
halves the *opponent's* energy regeneration — an electronic-warfare frame should
starve the other pilot rather than feed its own, and it is worth one asymmetry.

**Auto-fire is gated on the existing economy, not a new one.** The drone asks its
machine for a volley and the machine pays or refuses, so the charge rack the HUD
already shows stays the single source of truth for how much sub-weapon there is.

### D45 — Eight drones, eight silhouettes

**Decision.** Each chassis gets its own drone mesh in `build_mechs.py`, keyed by
`DRONE_BUILDERS`, rather than one mesh in eight palettes.

**Why.** Colour is the first thing lost at gameplay scale, in motion, against a
lit arena — and both drones on screen are small, fast and near their owners. Eight
recolours of one dart were indistinguishable in a fight, which mattered little
when a drone was a muzzle and matters a great deal now that killing one is a
goal. The designs are separated by *outline* first: SIGHTLINE is a rifle with an
engine, AEGIS is the only one taller than it is long, WISP is mostly a hole,
BULWARK is a shield with thrusters behind it. Each says something about the
passive it carries.

**Rebuilt through a separate entry point.** `tools/blender/rebuild_drones.py`
re-renders the eight drone sprites and patches their manifest rows, leaving the
other 104 part renders untouched. A full `build_all` to change one part is slow
and is a good way to disturb art that was already correct.

---

### D46 — Each saturation mode makes one resource free, and burning out hurts

**Decision.** The three modes were reshaped around a single idea: for the length
of the burst, one resource stops costing anything. Shield frees the barrier,
Shoot frees energy, Speed frees boost. When the meter empties the pilot is
stunned for 38 ticks and cannot barrier-cancel out of it.

**Why the shared shape.** The old modes were three unrelated bags of
multipliers — longer i-frames, ×1.5 damage, ×1.75 movement — and nothing tied
them together or told you what a mode was *for*. "Your X is free right now" is
one sentence per mode, it is legible mid-fight, and it makes each mode change
how you play rather than only how hard you hit.

* **Shield** — the guard comes up and stays up, the gauge cannot fall, and you
  can attack from behind it. The projectile-erasing bubble stays as well. Still
  drains the meter at double rate, which is now the price of getting the most.
* **Shoot** — either weapon button fires main *and* heavy together, through a
  second attack slot that only this mode ever loads. Nothing costs energy.
* **Speed** — thrust is free, boost and dash run at ×1.85 while ordinary flight
  and walking get a smaller ×1.25, and every melee sequence gains three swings
  on top of the chassis's own count. Splitting the movement multiplier in two
  was necessary: one number could make the thrusters dramatic or ordinary flight
  controllable, never both.

**Why a burnout.** Saturation used to end with no downside, so the only question
was *when* to spend it, never whether. A stun at the end makes the last second
of a burst a liability you have to plan around. It is deliberately the one stun
with no barrier-cancel escape — every other stun is something an opponent did to
you, whereas this is the bill for a burst you chose.

### D47 — Saturation activation moved to Boost + Barrier

**Decision.** The combo is Boost + Barrier, and it accepts "both held, either
pressed this tick" rather than requiring a same-tick press.

**Why.** It was Main + Heavy, and it was very nearly impossible to trigger by
hand. Whichever weapon button landed first immediately began its own attack, and
the activation check lived inside `tryStartAction`, which is never reached while
an attack is running — so the second button was never seen. Only a press of both
inside one 16.7ms tick worked. This was found by trying to use the feature in
the live game and watching a full meter sit there unspent.

Boost and Barrier start no attack, so the combination has nothing to race, and
it leaves the weapon buttons free during a fight. The check now runs from `step`
ahead of the attack dispatch, and the activation tick suppresses its own dash
and skips `tryStartAction`, so opening a burst never also spends a dash or fires
a barrier burst.

---

### D48 — Saturation got a button of its own, and a way to be spent early

**Decision.** Activation is a single dedicated button on the slot `Btn.Lock`
used to hold. It works at any charge above 25 %, not only on a full meter, and
what you spend is what you get: multipliers, duration and the opening top-up all
scale with the charge. A forced burst ends in an **overheat** — two seconds of
helplessness plus 5 % of maximum life — where a full one merely burns out.

**Why a dedicated button.** Both chord versions failed in the live game. Main +
Heavy was effectively untriggerable (see D47). Boost + Barrier worked, but it
still asked for a chord and it occupied two buttons a pilot is using constantly.
`Btn.Lock` was free in the truest sense: lock-on became permanent, the toggle
stopped doing anything, and the action was still sitting in the rebinding screen
promising a control that did nothing. Spending a dead control beat adding a
tenth button.

**Why allow a partial spend.** A meter you may only spend at exactly 100 % is a
timer, not a decision. Allowing an early spend turns it into a gamble with a
legible price: you can reach for it when you are about to lose the round, and it
will probably not be enough, and the overheat may finish what your opponent
started. The 25 % floor exists because below it the burst is too short to use,
so the press is refused rather than silently wasting the meter.

**Never lethal.** The overheat cannot take the last point of life. Being killed
by your own overdrive rather than by the pilot opposite reads as the game
cheating, whatever the numbers say.

### D49 — The pilots talk, and saturation stops the match to let them

**Decision.** Three layers of dialogue: a written exchange per matchup at the
top of the round, reactive one-liners during the fight, and a cutscene when
saturation opens.

**Matchup openings are the expensive one, and worth it.** All 36 pairings —
28 cross plus 8 mirrors — carry five conversations each. Generic per-pilot intro
lines were the cheap version and they read as eight people talking past each
other. Written per pair, the factions start doing work: two CONCORD pilots
sound different against each other than either does against the Emberline
veteran, and a mirror match can acknowledge that it is one.

**Lines are queued, not fired.** Both halves of an exchange arriving on the same
tick is not a conversation, it is two people talking over each other. A queue
releases one at a time with a gap longer than the box's own fade.

**Priorities, because the box is one box.** A KO line must never be swallowed by
a combo line still on screen, and a combo line must never stomp a KO. Equal
priorities do not interrupt, so a line always finishes against its own kind.

**The cutscene is a real pause.** Saturation is the largest commitment in the
game and it used to open with roughly the weight of a dash. It now stops the
match for about a second — letterbox in, portrait push, mode and line — and the
freeze consumes ticks that would have gone to the simulation, so neither pilot
gains or loses a frame of advantage from it.

**Everything is seeded.** Line choice comes from the scene's own generator, so a
replayed match says the same things in the same order.

---

### D50 — A guard now stops swords, and a burst can throw one back

**Decision.** A held guard cuts ordinary damage by 80 % (`guardScale` 0.20, from
0.32) and melee damage by 50 % (`meleeGuardScale`, new). A barrier burst timed
onto the **opening** strike of a melee sequence repels it: no damage, the
attacker is thrown back and stunned for a second, and their sequence dies.

**Why melee stopped ignoring guards.** "Melee is unblockable" was inherited from
the 2005 reference and it made a sword the unconditional answer to a guard —
correct as an anti-turtle tool, wrong in that the defender had no read to make.
Halving it instead keeps melee clearly the better option into a guard while
giving the defender something to do about it. Melee keeps its `Pierce` marking,
so the Shield-saturation bubble still cannot erase a sword and an absorb still
cannot bank one as meter; only the guard branch changed.

**Why the repel is gated to the opening hit.** A parry available at any point in
a combo is a get-out-of-jail card that punishes the attacker for having
committed. Gated to the first strike it is a *read*: the defender has to call the
approach before it lands. `meleeHitsTaken` tracks it, and resets the moment
hitstun ends.

**Why a separate `repelTicks` rather than reusing `invuln`.** Being hit grants
i-frames. If the repel keyed off those, every trade would silently become a
parry. Only a deliberate burst opens the window.

**Why `interrupt()` exists.** Collisions resolve after both combatants have
stepped, so setting `hitstun` on the attacker would let a lock-on sequence run
one more frame. The repel has to stop the swing on the frame it is thrown back.

### D51 — The sound set is trimmed and level-matched

**Decision.** All 71 files are RMS-normalised toward −16 dBFS mean, limited by a
−1.6 dBFS peak ceiling, with leading and trailing silence removed. Scripted in
`tools/normalise_audio.py` so it is reproducible and reviewable.

**Why RMS rather than peak.** Perceived loudness tracks mean level. The set
spanned **28.6 dB** of mean volume — `ui_confirm` sat at −33.4 dBFS against
`fire_autocannon_3` at −4.8 — so peak-normalising would have left the sparse,
transient-heavy cues still sounding inaudible next to dense ones. After the pass
the spread is **10.4 dB**. `SoundBank.ts` already carried a per-cue `gain`, but
every value there is ≤ 1: it can quieten a loud cue and could do nothing at all
for a quiet one.

**Why the ceiling is −1.6 and not −1.0.** An mp3 round-trip does not preserve
peaks. Encoding to −1.0 measured back at −0.0 dBFS on the densest file, so the
ceiling has to absorb the codec's overshoot as well as leave mixing headroom.

**What it deliberately does not do.** `AUDIO_CUE_SHEET.md` lists a target
duration per cue, several far shorter than what was generated — `fire_vulcan`
wants 0.10 s and the file carries audio across its full 0.52 s. Those targets
were written before the audio existed. Cutting real content to them is a
judgement to make by ear, not by a script, so the pass removes only silence.

### D52 — Projectile art is drawn, not rendered

**Decision.** The sixteen projectile families are procedural Canvas 2D shapes
(`src/render/ProjTextures.ts`), packed into one texture at runtime. Blender keeps
the mech parts, the drones and the portraits; it does not make bullets.

**Why.** The brief was the 2005 look, which the user identified — correctly — as
the same idiom Touhou uses: flat additive 2D shapes with a hot white centre and a
saturated rim. That is a 2D drawing problem. A Blender render of a missile is a
better *object* and a worse *forty-pixel bullet*: at the size these draw, modelled
form turns to mush and the silhouette is all that survives. Procedural also costs
nothing in payload, keeps every shape recolourable per pilot, and makes a tweak a
one-line edit instead of a modelling round trip plus `pack_atlases.py`.

**Why one packed texture rather than sixteen.** Every shot draws three sprites.
Sharing a texture keeps them in one batch; sixteen separate canvas textures would
break the batch on every family change on screen.

### D53 — A shot is three additive layers, not one tinted sprite

**Decision.** Every projectile draws as `halo` (tinted, soft, stretched to the
shot's proportions), `shell` (tinted silhouette) and `core` (the same silhouette,
smaller, left white).

**Why it cannot be one sprite.** Phaser's tint is a multiply. Tinting a white
texture crimson makes all of it crimson — there is no white left for a core. The
hot centre inside a coloured shell is the single most recognisable property of
both the reference's art and the Touhou bullets it shares an idiom with, so it
has to be its own untinted layer composited additively over the shell.

**The flicker.** The reference alternates each projectile frame between two
additive strengths (`A` / `A1`). Ours is driven off the projectile's age in
*ticks*, not the render frame, so it stays a 60 Hz shimmer on a 144 Hz display.

**Drawn size is decoupled from the hitbox.** `AttackDef.visualScale` sizes the
sprite; `projRadius` still sizes the hit. The reference draws a 6×6 box as a shot
many times that size and deliberately keeps the two apart. Ours used to derive
the sprite from the radius, which is why every weapon looked like a scaled copy
of every other one.

### D54 — Volley patterns, and per-family motion

**Decision.** Five arrangements — `line`, `stack`, `bundle`, `ripple`, `arc` —
plus per-family `velMul` / `accel` / `swerve`.

**Why patterns.** The reference draws a volley as four to six thin streaks of
slightly different length side by side. A single angular fan cannot express that,
and the long streaks in its screenshots turn out to be short trails on fast
shots fired in a bundle, not long trails on one shot.

**Why the weave integrates a sinusoid's derivative.** The heading stays exactly
`aim + swerve · sin(t)`, so a weaving shot oscillates about its aim line and
never drifts off it. A weave that accumulated could not be led by the player and
would defeat the AI's dodge prediction, which reads a straight line off velocity.

**Why the motion values are gentler than the reference's.** 2005 runs `velmul`
0.945, which over our projectile lifetimes brings a shot nearly to a halt and
would quietly halve several weapons' range — a nerf disguised as an art pass.
Ours sit in 0.99–1.0 with a floor at 0.35× launch speed, and
`projectiles.test.ts` asserts every weapon still covers ≥70 % of the distance it
did at constant velocity.

**Homing ordnance is excluded.** `Projectile.step` already accelerates a homing
shot; a family curve on top would fight or compound it. Missiles coast unless the
art table asks otherwise.

### D55 — Denser volleys at the same damage

**Decision.** Six weapons fire more shots than they did — VESPER's FLECHETTE
3→5, CIRRUS's TWIN SMG 2→4, OBELISK's MINEFIELD 3→5, PYRE's FIRESTORM 4→6,
NULLTIDE's ARC SPRAY and DISRUPT NET 4→6 — with per-shot damage and guard damage
divided by the same ratio.

**Why the damage is held.** A full connect is worth exactly what it was worth
before, so no chassis was re-tuned to buy an art change. What does change is
texture: partial hits are finer-grained and a guard chips in smaller steps.
`projectiles.test.ts` pins the resulting totals against the pre-change numbers,
because raising a count without dividing the damage is a silent roster-wide buff
that no other test would catch.

### D56 — All eight lances ignore a held guard

**Decision.** HALCYON's and NOCTURNE's lances take `BarrierResponse.Pierce`,
which the six expansion lances already had.

**Why the hesitation was misplaced.** The concern on record was that a
three-segment stacked lance with the flag would become the strongest anti-guard
tool in the game. Measured, it does not: only the first segment cashes in,
because landing it raises `hitInvuln` and the rest are ignored behind it.
Damage through a held guard goes 57.6 → 96.0 for HALCYON and 47.2 → 78.7 for
NOCTURNE, against 153–241 for the six lances that already pierce. Both remain the
*weakest* anti-guard lances on the roster.

**What `Pierce` actually does.** It does not defeat a barrier *burst* — an
invulnerable target still returns `ignored`; the shot is merely denied to them as
saturation charge. It skips the held guard's damage reduction. Those are easy to
confuse and the distinction is the whole reason the change is small.
