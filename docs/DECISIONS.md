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

### D57 — Shield saturation cuts each kind of damage by its own amount

**Decision.** While a Shield burst is up, `SHIELD_TAKEN` sets what gets through:

| Incoming | Plain guard | Shield burst |
| --- | --- | --- |
| Gunfire | 80 % off | **95 % off** |
| Melee | 50 % off | **70 % off** |
| Piercing lance | nothing | **80 % off** |
| Status chip | nothing | **95 % off** |

**Why a table and not one multiplier.** It was one multiplier first — a flat
`0.1` folded into `incomingScale`, which is elegant precisely because every
damage path already reads it. That is also why it could not work: the four
categories resolve down three different branches of `takeHit` plus the status
tick, each already carrying its own scaling, so a single figure applied in the
middle of all that emerges as four different end results (98 / 95 / 90 / 90 %)
rather than four chosen ones. The table states the totals directly.

**It replaces the guard's scaling rather than stacking with it.** `guardScale`
and `meleeGuardScale` are skipped entirely while the burst is up. That is what
lets the numbers above be read as written, and it is also the risk: replacing
rather than stacking makes it possible to author a burst that is *worse* than
simply holding guard. A test pins both against the plain guard figures.

**Melee is the way in, and that is the design.** A sword lands 30 % of its
damage where a rifle lands 5 %. The mode is not a wall, it is a wall with a
known door — the answer to a pilot sitting inside a Shield burst is to close the
distance, with a lance as the middle option. Before this change the ordering was
accidentally inverted: the bubble sweep erased ordinary shots outright but let
`Pierce` through untouched, so a lance was the *best* thing to throw at a
defensive burst and gunfire the worst.

**Saturation gained from being hit is now taken off what landed, not what was
thrown.** Otherwise a pilot inside a burst charges the next one at full rate off
damage they did not take, which is a loop that feeds itself. Identical outside a
burst, where the two are the same number.

**It applies to both pilots,** so versus and AI-vs-AI stay symmetric and the
simulation never needs to know which combatant is human.

**Cost.** Shield already drains the meter at double rate, so this is a short,
expensive window rather than a standing defence.

### D58 — A held guard halves a lance, and Shield saturation takes the button

**Two changes to the barrier, both closing holes the audit in the last session
turned up.**

**A held guard now scales piercing damage** by `pierceGuardScale`, 0.50 (OBELISK
0.38). Since D56 gave every lance on the roster `Pierce`, and the guard branch in
`takeHit` excludes `Pierce`, holding guard against any lance in the game was
worth *exactly nothing* — the shot arrived at full strength and the gauge you
were spending to hold the stance bought you not one point. This is the same
problem `meleeGuardScale` was added to solve, one weapon class later.

A lance still beats a guard: half is a far worse deal for the defender than the
fifth that gunfire gets, so the lance remains the designated answer to turtling.
Holding guard is now a decision instead of a no-op.

**Only the damage was softened.** A guarded lance still returns `'hit'`, not
`'guarded'` — it staggers, cancels what you were doing and knocks the guard
down, and it does not drain the barrier gauge or risk a guard break. Routing it
through the guard branch would have handed it melee's reduced hitstop and
knockback too, which is a much larger change than was asked for.

**Shield saturation now locks the barrier button out.** Saturation already holds
the guard for the whole burst, so the button has nothing left to do — and
leaving it live was an exploit rather than a redundancy. `barrierFree` makes a
burst cost zero, and Shield tops the gauge to full and never lets it fall, so
`barrier >= cost` always passed: a pilot could mash the button for back-to-back
60-tick invulnerability windows across the entire burst. That is strictly better
than the 5–30 % scaling in D57 and would have made the tuning there irrelevant.

The lock-out covers the hitstun escape as well. It costs the burst its melee
repel, which suits the shape of D57 — melee is meant to be the way through a
Shield, and being able to throw the first sword back would have undone that.

### D58a — The Shield lock-out is balance, and the rival respects it

**Status: settled. Do not "fix" this.** The barrier button doing nothing during a
Shield burst is the mechanic working. Anyone arriving at that code from a bug
report should read this entry and `saturation.test.ts` before changing it.

**Why it cannot be costed instead of blocked.** The burst has **no cooldown
anywhere in the game** — `barrierActiveTicks` is set on a burst and read in
exactly one place, the movement lock in `stepMotion`. Nothing gates a second
burst. The 30-point barrier cost *is* the rate limiter, which is why the mechanic
is self-limiting everywhere else: 100 gauge buys three bursts and then the
45-tick regen delay bites.

`barrierFree` therefore does not make bursts cheaper during Shield. It deletes
the only rate limit they have. And because `startBarrier` does
`invuln = Math.max(invuln, guardTicks)`, each press *refreshes* the window rather
than queueing behind it, so no timing is required at all — mashing keeps immunity
from ever lapsing.

The arithmetic, with `shieldBonusTicks` folded in:

| | Immunity per press | Shield burst | Presses to cover it |
| --- | --- | --- | --- |
| HALCYON | 36 + 24 = 60 ticks | 210 ticks | **3.5** |
| OBELISK | 44 + 34 = 78 ticks | 210 ticks | **2.7** |

Four free taps and the entire 3.5-second mode is spent invulnerable, for an
11 % movement-lock tax. That is not a strong option, it is a mode with no
failure state — and it would make D57's 5–30 % scaling irrelevant.

**Where the skill went.** Nowhere. Outside a Shield burst the tap keeps its full
role: timed total immunity plus the melee repel, paid for out of a gauge that
runs dry. Inside one, activation itself still grants 20 i-frames, so *when* you
spend the meter remains a real decision — you simply get one of them instead of
an unlimited supply.

**The rival respects it too** (`RivalAI`). Both the burst and the guard-hold are
gated on `!self.shieldActive`. This was not cosmetic: `shouldBarrier` also gates
the AI's attack, so every tick the rival reached for a barrier it could not have,
it skipped its own offence for a shot it never fired.

---

## D59 — Music: streamed, not decoded

`SoundBank` pulls every effect into memory as an `AudioBuffer`. That is right for
71 files averaging a fifth of a second and catastrophic for sixteen three-minute
tracks: decoded PCM runs about 23 MB per stereo minute, so the same approach
would have cost roughly **a gigabyte** of resident memory for the album.

Each track is therefore an `HTMLAudioElement` through a
`MediaElementAudioSourceNode` — the browser streams and decodes incrementally
(verified: the dev server answers with `206 Partial Content`), and it still lands
in the same `AudioContext` as the effects, so gain, ducking and muting are
ordinary Web Audio. `Sfx.context()` exists purely to share that graph; two
contexts cannot be ducked against each other with sample accuracy, and browsers
cap how many an origin may hold.

The bus is `voice.gain -> duck -> master -> destination`. Every level change is an
`AudioParam` ramp, so nothing needs a per-frame update and a fade survives a
scene transition mid-flight.

**Looping is hand-rolled.** `el.loop` is a hard cut and the cue sheet
deliberately does not ask Suno for seamless loops — asking costs length, and
these tracks are long precisely so a match does not hear the same bar twice.
Instead the track cross-fades into a second copy of itself 2.5 s before the file
ends. Measured at the seam: old voice 1.00 -> 0.02 while the new one climbs
0.07 -> 0.98, then the old voice is dropped. One voice before, one after, no gap.

## D60 — The battle roll draws from what exists, not from all three

`docs/MUSIC_CUE_SHEET.md` describes rolling across all three candidates (both
pilots' themes and the stage's) and falling through when the winner's file is
missing. `pickBattleCue` instead rolls uniformly across the candidates that
*exist*, then falls back to `battle`, then to silence.

The two are **identical once all sixteen tracks are generated** — every candidate
is present, so nothing ever falls through. They differ only while the set is
partial, and there the spec's version is worse: with 2 of 8 themes delivered and
no stage track, roll-then-fall-through piles most matches onto whichever
candidate happens to sit last in the list. Rolling over what exists preserves the
variety the roll is *for* during exactly the period the roll is least able to
deliver it.

**The roll takes its generator as a parameter.** `MatchSim` is seeded and
`match.test.ts` asserts a bit-identical replay; drawing a number from that stream
to choose music would shift every subsequent roll and change the fight. The scene
layer passes `Math.random`. `music.test.ts` proves it: a 600-tick match with the
roll fired every single tick is bit-identical to one with no rolls at all.

## D61 — Two volume buses on one scale, replacing the mute toggle

`AUDIO: ON / MUTED` became `MUSIC` and `SFX`, each 0-10. One switch could not
answer the question people actually have about a soundtrack — not "is there
music" but "is there too much of it".

Both buses share one scale, so `MUSIC 70 / SFX 80` says plainly that music sits
under the effects and levelling the numbers levels the buses. Per-bus maxima
would have made the defaults rounder and the comparison meaningless. Defaults
land on the levels the game already mixed at (effects 0.32, music 0.28) with
headroom above. There is no separate mute: either slider at zero is that bus's
mute, which is finer-grained than the toggle it replaced — the common case is
wanting the music gone and the hit confirmation kept. Persisted under
`bsr.audio.v1`, normalised on load exactly as bindings are.

## D62 — Match length: 1.75x life and a 180-second clock

**Measured, because the complaint was about feel and feel is measurable.** 56
AI-vs-AI matchups per tier, at the shipped life pools:

| Tier | median | p10 | p90 |
| --- | --- | --- | --- |
| EASY | 15.6 s | 11.6 s | 24.7 s |
| NORMAL | 15.0 s | 11.9 s | 26.9 s |
| HARD | 29.8 s | 16.2 s | 63.6 s |
| EXTREME | 43.4 s | 27.3 s | 84.9 s |

Two findings. Matches were finishing in 10-15 seconds against the lower tiers,
which matches what playtesting reported exactly. And **EASY and NORMAL are the
same length** and under half of HARD's — the lower tiers trade damage freely
instead of defending, so the tiers a new player lives in are the ones that end
fastest.

Life pools scaled **1.75x**, uniformly, so the roster's relative durability is
untouched (every ratio preserved to within 0.003 by rounding to the nearest 10).
Medians become EASY 24 s, NORMAL 30 s, HARD 52 s, EXTREME 73 s.

**The clock had to move with it.** The 99-second limit was already producing
draws at the top tiers, and at 1.75x it decided 30 % of EXTREME matches. At 180
seconds no tier draws more than 4 %, so the clock is back to being the fail-safe
it is meant to be rather than a participant.

## D63 — The drone is always deployed, flies itself, and rebuilds once

Three changes to one subsystem, because they only make sense together.

**The launch/recall toggle is gone.** It read well and measured badly: drones
were dying with a 10th-percentile life of **two seconds** and a median of eight,
so the standing decision the button was meant to pose had already been answered
by the opening exchange, and it spent the rest of the match dead. `Btn.Sub` now
orders a volley — which is what it meant two designs ago — rather than becoming a
dead input.

**Hit points 3.5x.** This restores the invariant `SupporterDef.maxLife` already
documented ("around 12 % of the owner's `maxLife`"), which the 1.75x chassis
scale had quietly broken down to 6.9 %.

**One rebuild per match.** Because nothing can pull it to safety any more, and
because `Stowed` was the only state that repaired, permanent death would have
left the supporter absent for 160 s of a 180 s match. A first kill retires it
into `Rebuilding` — visible, *not* hittable, life refilling linearly across 900
ticks — after which it relaunches itself at full health. The second kill is
final. The cap is the point: without a rebuild the drone vanished in the opening
exchange; without the cap it becomes the invulnerable button an earlier pass
already rejected.

**It flies itself** (`Supporter.station`). Formation, plus a lean toward its
firing line when it is healthy and in range, plus repulsion from closing shots —
pushed *perpendicular* to the shot rather than directly away, because running
from something faster than you is how you get hit. Leashed to the owner, and
floored at 46 px from them.

Two bugs the tests caught rather than review: the closing-velocity dot product
had its **sign inverted**, so the drone dodged everything that had already missed
and stood still for everything that had not; and a 46 px support lean against a
64 px follow-back put the drone *inside* its owner's sprite.

## D64 — Per-pilot playstyles, and the lever that had to be defanged

`AI_PROFILES` answers how good a rival is; `PLAYSTYLES` answers who it is. Kept
as separate axes so an EASY CIRRUS and an EXTREME CIRRUS both fight like Mira
Holloway and differ only in how well they pull it off. Every entry is a
multiplier or a small bias, never an override — the tier still decides which
*behaviours* are unlocked — which is why the difficulty ladder is unaffected (it
fights identical machines, so a symmetric lean cancels).

**The first cut made the roster worse, and only measuring found it.** Balance
spread went from 0.555 to **0.854**, and CIRRUS — the pilot the feature was
designed around — fell from -0.11 to **-0.44**, the worst machine in the game.
Ablation, one lever at a time:

| Lever | Spread |
| --- | --- |
| neutral (no playstyles) | 0.555 |
| scalars only | 0.585 |
| drone doctrine only | 0.624 |
| **satPreference only** | **0.944** |
| everything on | 0.854 |

`satPreference` was responsible for essentially all of it. The cause is not the
personalities: it is that **SHOOT is currently the strongest burst** — the same
imbalance the forced-SHIELD trade table records as an open question — so any
pilot told to prefer something else was being told to lose.

Fixed by making a preference **widen the window its mode already wins in**
instead of overriding the situation: a SHIELD-preferring pilot reaches for it at
50 % life rather than 35 %, a SPEED-preferring one from 340 px rather than 220 px,
and both still take SHOOT at range. Everything on now measures **0.511**, better
than the 0.555 baseline — the playstyles express personality *and* tighten the
roster. `playstyles.test.ts` pins the spread so this cannot silently regress.

**Drone doctrines** (`escort`, `screen`, `flank`, `shadow`) come from the same
table. VESPER's screens — it leans far forward on a long leash and dodges *less*,
which looks like a mistake and is the point: every shot spent on the drone is one
not spent on a marksman who needs to hold still.

## D65 — Desperation: saturation opened from the brink

A burst opened at or below a third of a life bar runs in a **desperation** form
with its mode's effect dramatically escalated.

The meter charges off damage *taken*, so the pilot most likely to be holding a
full bar is the one being beaten — and until now that bar bought them exactly the
same burst it bought the pilot who was winning. A comeback mechanic only the
loser can reach is the point, not an oversight. The threshold lines up with
things the game already dramatises: the HUD ring turns amber under a third, and
the `hurt` banter fires there.

| Mode | Desperation form |
| --- | --- |
| SHIELD | **Total invulnerability** until the meter empties. Not 95 % off, not "except lances" — checked ahead of every scaling branch, so gunfire, melee, pierce and status chip all stop dead. |
| SHOOT | Projectiles ×1.85 faster *on top of* the ordinary Shoot scaling, and each individual shot has a 1-in-3 chance of being doubled. |
| SPEED | Melee lock reach ×9 (past the width of the viewport), dash distance ×1.9, and **melee deals true damage** — bypassing chassis defence, drone armour, grounded bracing, guards and Shield saturation alike. |

**Latched at activation, not read live.** Otherwise it is a passive that switches
on whenever a pilot dips low, rather than a property of the decision to spend the
meter while losing. `desperation.test.ts` pins that distinction directly.

**The extra-shot roll is per projectile and comes from the match RNG.** Per
projectile because the roster's volleys already differ in width and a per-volley
roll would pay the widest kit the most; from the match RNG because this is
gameplay and a replay has to reproduce it — the opposite of the music roll (D60),
which must *not* touch that stream. Measured across 12 seeds: 1.15–1.55× the
shots of an ordinary burst, which is the 1.33 the odds predict.

Measuring it needed care. The obvious test — count what is still in the air —
reads the **speed** buff as *fewer* projectiles, because faster shots clear the
arena sooner. Counting spawns is the only honest measure.

## D66 — Desperation resolves the saturation-preference problem from D64

D64 had to defang per-pilot `satPreference` because SHOOT was strictly the
strongest burst, so any pilot told to prefer another mode was told to lose.

Desperation changes that arithmetic where it matters. At or below the threshold
every mode is enormous, so **below that line a pilot now takes their own
preferred burst outright**; above it, a preference still only widens the window
its mode already wins in. CIRRUS takes SPEED on the brink because that is exactly
where SPEED stops being the worse trade and becomes a comeback — and because
taking it is what Mira Holloway would do.

Re-measured after the change, both slots played: roster spread **0.555 at HARD**
and **0.579 at EXTREME**, against the 0.555 baseline from before playstyles
existed. The escalation did not unbalance the roster.

## D67 — Weapons are locked on, unconditionally

Aim used to be gated on `inLockCone` — inside `lockRange` **and** within a facing
cone — and when that failed it fell through to `Math.atan2(input.dy, input.dx)`:
**the direction of travel.** A mech strafing while firing pointed its guns along
its own movement and shot at empty air. It read as the weapons being broken, and
it was the single most visible defect in the game.

There is no distance at which "aim at nothing" is the better answer, so there is
no longer a range check. `inLockCone` is deleted.

**The enemy drone is a valid aim target.** It is permanently deployed since D63,
so it is a real part of the fight. The pilot stays the default and the drone is
only taken when it is `DRONE_LOCK_EDGE` (90 px) *closer* — without that margin
the escort would steal the lock every time it drifted forward and there would be
stretches where shooting the pilot was impossible.

**This changes nothing about the projectiles.** They still fly straight from the
muzzle at the angle the mounts were pointing. Only the drone's own shots home.

## D68 — The camera frames the fight instead of guessing at it

Two bugs, one cause: the zoom was a curve fitted to a feeling rather than to the
viewport. `1.34 - dist / 2400`, clamped at 0.74, with `dist` a single hypot.

* A **purely vertical** separation barely zoomed out at all, because one hypot
  cannot tell the two axes apart.
* The **0.74 floor** could frame about half the arena's width, so at wide
  separation a pilot was simply lost off the edge.

Now it solves for the zoom that actually fits both machines plus a margin, on
each axis independently, and takes the tighter. `CAM_ZOOM_MIN` is 0.34 — low
enough to frame the whole 2400×1200 arena in a 960×540 viewport — so there is no
separation at which a pilot can leave the screen.

**The velocity lead is clamped, not removed.** Leading the action is what makes
the camera feel like it is following a fight, but on its own it shoved a pilot
out of frame whenever one accelerated hard. The lead is applied and then bounded
to the window where both machines remain visible.

**The HUD band is reserved.** Framing solves against the 372 px below the HUD
rather than the full 540, and the view is pushed down by half the band.
"On screen but behind your own life bar" is the other half of *barely being seen*.

Two things caught only by measuring the rendered result:

* **`setBounds` silently overrode all of it.** Phaser clamps scroll to the camera
  bounds, and below ~0.45 zoom the view is larger than the arena, so the clamp
  re-centred the camera and put a pilot back under the HUD however carefully the
  focus had been solved. The framing clamp does not need the help; the bounds are
  gone.
* **The HUD shift compounded.** `cam.midPoint.y` already carries the previous
  frame's shift, so lerping against it and shifting again walked the view off the
  bottom of the arena within a second. The smoothing now runs in un-shifted
  space: undo, lerp, re-apply.

## D69 — The rival never read its own saturation, and a Speed burst did nothing

`preferredRangeFor` consulted `foe.satActive` to work out the *opponent's* reach
and never once looked at its own state. So a pilot holding free, unlimited
dashing and a sword that reaches across the screen kept standing at exactly the
range it had been standing at. The whole mode was thrown away.

Four separate things had to change, and the biggest was not in the range code at
all:

* **`pickTactic` retreated on the brink.** `lifeFrac < 0.3 && chance(0.4)` fires
  on almost every tactic re-roll inside a *desperation* burst, because a
  desperation burst is by definition opened at or under a third of a life bar.
  The pilot was being sent backwards 40 % of the time while holding the best
  closing tool in the game. Now suppressed mid-Speed-burst, at a rate scaled by
  skill.
* **`chooseAttack` gated melee on `def.meleeRange`.** A desperate Speed burst
  extends the lock ninefold, and the rival could not reach for it — the buff
  existed and was unusable. Now `effectiveMeleeRange`, as is `closeOnGuard`.
* **Preferred range collapses to sword distance while a Speed burst is up.** At
  every tier: "I have a movement burst, so I should move" is not a subtle read.
* **`boostReserve` rationed a free gauge.** Nothing to reserve when dashing
  costs nothing; the approach also switches from sustained thrust to dashing,
  because the reason to prefer thrust is that it is cheaper per pixel.

Measured, CIRRUS inside a Speed burst: closes to **3–49 px** (from a mean of 312
and rising), opens 8–43 melee sequences and lands **7–16 melee hits** per burst
set. She takes SPEED on **7 of 7** desperate bursts.

**A measurement trap worth recording.** Mean distance over a burst is a useless
metric — it averages in the approach, so a pilot who closes faster and further
can read as *further away*. Closest approach and melee hits landed are what
actually answer the question.

## D70 — Choosing a desperation burst is a read, not a default

D66 had a desperate pilot simply take their preferred mode. That is right when
nothing is happening and wrong the moment something is: the three desperation
forms are enormous for *different reasons*, so which one is correct depends on
the fight.

`desperationMode` scores all three from two inputs. **Who the pilot is** —
`meleeAppetite` pushes toward SPEED and SHIELD (the two modes that deliver a
sword; SHIELD because total invulnerability is how you *get* to sword range
against someone shooting at you), and the declared `satPreference` counts for
1.4, more than any single situational term. **What is happening** — a turtling
opponent is worth +1.1 to SPEED and −0.7 to SHOOT, because true damage is the
one thing a guard and a Shield burst both fail to stop; inbound fire is worth up
to +1.2 to SHIELD; range past three quarters of the chassis's reach favours
SHOOT; being out-run favours standing and firing.

Scores rather than a branch ladder, because the two inputs have to be able to
outvote each other and no ladder of `if`s expresses "usually the sword, but not
while four missiles are inbound".

**The situational half is gated on `weaponIq`** (HARD and EXTREME), like every
other read in the class. It was not, at first, and that broke the difficulty
ladder outright: **NORMAL measured as *losing* to EASY**, and EXTREME's mirror
drifted to 0.207 against a 0.2 bound. A burst is a large share of a match's
outcome, so handing EASY the same judgement as EXTREME compressed the ladder into
noise. The lower tiers now get their pilot's favourite and have to live with it,
which is what being a lower tier means.

Census at HARD, one row per pilot, first desperate burst of every matchup:

```
HALCYON    SHOOT 9                  NOCTURNE   SHOOT 6
VESPER     SHOOT 3                  TERRAMOTH  SHIELD 12
CIRRUS     SPEED 7                  OBELISK    SHIELD 13
PYRE       SHIELD 5                 NULLTIDE   SHOOT 5, SHIELD 1
```

PYRE prefers SHOOT and reads SHIELD anyway — a close-range brawler using
invulnerability to *reach* the range she wants. That is the read working, not
failing.

Roster spread after all of it: **0.560 at HARD, 0.525 at EXTREME**, against the
0.555 baseline from before playstyles existed. CIRRUS sits at −0.28 at HARD and
−0.14 at EXTREME — she improves markedly where execution can actually exploit the
burst, which is the right shape for a high-risk pilot.

---

## 2026-08-01 — Session: the soundtrack finished, Static repaired, the Archive rewritten

## D71 — The generated music is tracked

**Decision.** `assets/music/` goes into git. Seventeen tracks, 64 MB, against
about 1.5 MB for the entire tracked SFX set.

**Why.** The takes are not reproducible. The same Suno prompt returns different
music, so an accident in that folder is not a rebuild, it is a loss — and until
this commit the only copy of the score was one untracked directory on one disk.
The size objection assumes a cost this repository does not pay: there is no
remote, so nobody clones it and nothing crosses a wire. The generated SFX set was
already tracked for the same reason and says so in `.gitignore`.

**Cost.** Git blobs are permanent. A track committed and later re-rolled leaves
both takes in the pack forever, so tracks go in when they are settled rather than
as drafts.

The argument was tested within the hour. `theme_cirrus` was re-downloaded and
came back a **different song**; the take that had just been committed was still
recoverable, and the choice between them became a decision instead of an
accident. The replacement was amended into the same commit rather than added on
top, so the rejected take did not become 3.5 MB of permanent dead weight.

---

## D72 — MECH SELECT belongs on the pause menu and the results screen

**Decision.** Both menus gain a `MECH SELECT` row, between `RESTART MATCH` and
`QUIT TO TITLE` on one and between `REMATCH` and `RETURN TO TITLE` on the other.

**Why.** Both lists now read as widening scope: resume this match, restart this
match, change the fight, stop fighting. Wanting a different matchup after losing
one is the commonest thing to want at either moment, and saying so used to cost a
trip out to the title screen and back in through the whole menu — four screens to
express one decision.

**No mode branch was needed.** `MechSelect` reads `session.mode`, which nothing
has touched since the menu set it, so all three modes land on the screen they
should: `aiVsAi` still gets both skill dials, `training` still gets none. And no
`matchIndex` bump either — `MechSelect.start()` already does it, so picking the
same two machines again still gets a fresh seed rather than replaying the
identical fight.

**Cost.** The results menu moved up twenty pixels. Three rows at the old anchor
put the last one three pixels off the hint line.

---

## D73 — Test by playing at EXTREME, in a document that outlives the handoff

**Decision.** Manual and in-browser verification is done at EXTREME, never at the
default NORMAL. `docs/TESTING_PROTOCOL.md` is the durable home for that rule and
for the traps that used to live only in `SESSION_HANDOFF.md`.

**Why.** The tiers are not the same rival with better dice. `AI_PROFILES` gates
whole traits behind tier, and **`resourceIq` and `droneIq` execute at no other
tier at all** — so a fault living in either survives any amount of testing at
NORMAL. EXTREME also produces the longest matches, which means more of everything
happens per run. The rule came from the user; the code agrees with it.

The document exists because §9 of the handoff held the most expensively learned
material on the project and the handoff is rewritten at the end of every session.
That is the wrong home for anything worth keeping.

**One rule in it was wrong and is now corrected there.** The old advice was to
freeze the game by hijacking `requestAnimationFrame`. Phaser's `TimeStep`
schedules itself recursively, so the moment a stub returns without invoking the
callback the loop stops scheduling and is dead for good. Restoring
`window.requestAnimationFrame` does not revive it, `loop.wake()` does not either,
and `loop.running` keeps reporting `true` while `loop.frame` sits still — while a
plain rAF probe still reads a healthy 50 fps, because that measures *your own*
loop. Use `game.loop.sleep()` and `wake()`. Recovery from the old trick needs
`raf.stop()` then `raf.start(loop.step.bind(loop), false)`.

---

## D74 — Static never received D63's scaling, and its decoy was free to ignore

**Decision.** STATIC's life pool goes 110 → 385. `DECOY_STUN_CHANCE` goes 0.05 →
0.15.

**Why the hit points are a bug and not a tuning pass.** D63 scaled every drone's
pool by 3.5: Arbiter 120→420, Warden 125→440, Sightline 100→350, Bulwark
170→595, Wisp 95→335, Aegis 145→510, Ember 130→455. Static went 110→110 and has
carried its pre-D63 value at every commit in the repository, leaving it 2.7×
frailer than the next weakest escort against mech pools that had all grown around
it. 385 is 110 × 3.5, and the roster table in the handoff already recorded it —
the intent was written down and the code never received it.

**The mechanism is worth more than the fix.** Nobody forgot Static. The shared
`DRONE` base template in `rosterExtra.ts` also carried `maxLife`, and D63 scaled
it **110 → 385** along with the seven explicit per-mech values. Static spreads
`...DRONE` and then overrode `maxLife: 110` — a value that, at the time it was
written, was *identical to the base it was overriding*. So the override was
invisible: it changed nothing, it looked like documentation of the default, and
it silently shadowed the one edit that would have fixed it.

**An explicit override that duplicates the default is a landmine.** It is
indistinguishable from redundant noise until the default moves, and then it is
the only thing that does not move with it. Static's line now reads 385, which is
once again exactly the base value — so the override is redundant again and will
be invisible to the next person who changes the base. It is kept, with the
comment above it explaining why the number is what it is, because deleting it
would remove the only record of how this happened.

**Why the stun.** The projection's rounds do no damage, so the stun is the entire
reason to respect them. At one in twenty a decoy would usually throw its whole
volley without landing anything.

Measured across the roster, six seeds per matchup, both slots:

```
                        NULLTIDE Hard   NULLTIDE Extreme   spread H / spread E
  before                    -0.044            +0.009          0.383 / 0.368
  after the hit points      -0.002            -0.016          0.386 / 0.332
  after the stun as well    +0.021            -0.030          0.374 / 0.322
```

NULLTIDE stays mid-pack at both tiers and spread tightens at both, EXTREME most
of all.

**Worth recording because it nearly went the other way.** The first pass at three
seeds read the hit-point change as a **0.068 collapse** at EXTREME. Doubling the
seeds turned it into 0.025. Three seeds is not enough to call a change of that
size, and reporting the first number would have been a false regression.

**Also settled: the decoy does not hide the drone.** `decoyTicks` is read in four
places — decrement, step the projection, set on spawn, and the projection's own
animation age — and the drone's movement never consults it. Sampled over 260
ticks of a live EXTREME match, STATIC is on camera 100 % of the time with or
without a decoy, moves on 99–100 % of ticks either way, and never comes closer
than the 300 px throw distance to its own projection. With a decoy up it averages
**734 px from its owner against 173 px with none** — further forward and more
exposed, not less.

---

## D75 — The Archive is complete on purpose, and the present is 43 CE

**Decision.** Every deliberate gap in the lore is written out in full. The
EW-14's provenance, Io Senna's history and Rook's court of inquiry are answered,
and three new world entries — THE DESCENT, THE SEVEN YARDS WAR, STILLWAKE —
carry the setting's causes.

**Why.** The campaign's plan for this screen is *progressive disclosure*, not
omission: entries will start redacted and unlock as the player reaches the
dialogue, event or investigation that earns them. **You cannot redact a paragraph
that was never written**, so the complete corpus is the prerequisite for the
feature rather than a spoiler of it.

**The three gaps were one gap.** Concord's electronic-warfare programme was built
to collapse a *yard's* lift network, not to fight frames, and was tested on
inhabited Stillwake Yard in 31 CE. The EW-14 is the fourteenth airframe, the one
never recovered. Io Senna flew the trial and was erased from the record rather
than charged, which is why she never finishes a helpless opponent. Halden Rook
flew escort unbriefed, held the evacuation lift nine hours, and testified in open
session — which is why the inquiry cleared him and ended his career with the same
document. Answering them separately would have been three coincidences.

**The Descent closes the setting's loop.** The floating seams Ironwake cuts are
mineral rafts precipitated out of the storm layer that a century of processing
stacks created. The five powers are mining the thing that killed the ground.

**A real inconsistency was fixed on the way.** The world entry was dated common
era 41 while Okonkwo declined a commission in 42 CE, a year that had not
happened. The present is **43 CE** throughout and the full timeline is recorded
in the file header, because it became load-bearing the moment three entries
started depending on it.

---

## D76 — The Archive's theme leaves the soundtrack's house style

**Decision.** A seventeenth cue, `archive`, at 72 BPM. Ambient piano and pads.
No J-rock, no drum and bass, no guitars. `MUSIC_CUE_SHEET.md` records it as the
one documented exception to the shared descriptors.

**Why.** Every other track scores a fight or the approach to one. The Archive is
the only screen with no opponent, no clock and no decision, where the activity is
*reading* for minutes at a time. Racing-anime pop rock behind a page of prose
does not read as atmosphere, it reads as the game having forgotten which screen
you are on. 72 against `results_lose`'s 140, previously the slowest thing in the
set by a wide margin.

Two threads keep it in the same album rather than sounding like another game: the
cold pads and faint data static come from `theme_nulltide`, because this is a
Concord records system and not a library — and when the campaign gates entries,
that texture becomes the sound of the parts not yet unlocked. The piano is the
counterweight, since the Archive is mostly about people.

**Wired as a fallback, not a flag flip.** `ArchiveScene` asks for `archive` if it
is available and `menu` if it is not, so dropping the file in and setting
`present` was the whole job with no third edit waiting to be forgotten.

**A rendering defect surfaced with the longer entries and is fixed here.** A
`Text` object draws its full height wherever it is placed, so scrolling a long
entry moved the body without ever stopping it being drawn — the last paragraph
rendered straight through the hint line and the two became mutually illegible.
The scroll extent had always reserved forty pixels for exactly this; nothing
enforced it. The body now carries a geometry mask cut to the same band, re-cut
whenever `bodyTop` moves, sharing one constant with the scroll maths so the two
cannot disagree again.

---

## D77 — The prose was rewritten by an outside editor, under a canon lock

**Decision.** The Archive's 21 entries were rewritten externally against
`docs/ARCHIVE_REWRITE_BRIEF.md`, through a calibration sample and two review
rounds, and integrated by generator with a byte-for-byte round-trip check.

**Why.** The lore read as machine-written because it was. The brief made that
actionable by counting rather than asserting: over 4,871 words, thirty em dashes
at 6.2 per thousand against a normal one to two, seventy-three negation frames of
the "it is not X" shape across eighty-nine paragraphs, fifteen "rather than",
twenty-three "never", and nine of twenty-one entries closing on a short
punchline. Each line got a target.

The editor's own diagnosis was sharper than the brief's and identified the real
fault: **the Archive had one author impersonating several institutions**. Every
entry understood procurement, private motive and political hypocrisy equally
well. Institutional prose lies differently.

Result, measured over the delivered 4,709 words:

```
  em dashes            30  ->  0
  negation frames    15.5  ->  1.7   per thousand words
  "never"              23  ->  0
  ", which is/was"     12  ->  0
  The/He/She/It        46% ->  24%   of sentence openings
```

**`archiveProse.test.ts` guards the mechanical half**, which review does not
catch: the bodies are string fragments concatenated across source lines, and a
seam that loses its trailing space jams two words together while one that gains a
leading space leaves a double gap. Neither breaks the build, both show on screen,
and the diff makes the seam invisible. It passed on integration day, which is the
day it was written for.

**Cost.** Six rounds of correspondence, and the process only works because the
canon lock is exhaustive. See D78.

---

## D78 — A canon lock has to be audited against the simulation, not remembered

**Decision.** Two statements in the lore were false and are corrected: HALCYON's
saber is not the shortest chain of any sword, and NULLTIDE's arc glaive is not
the longest-reaching.

**Why this is a decision and not a typo.** Both claims had been copied into the
rewrite brief **as canon locks**, so a careful editor would have preserved them
faithfully and permanently. Read out of `meleeLock.hits` and `meleeRange`:

```
  HALCYON 6 hits / 200 reach      CIRRUS    8 / 195
  NOCTURNE 3 / 210                OBELISK   2 / 205
  VESPER   2 / 180                PYRE      3 / 198
  TERRAMOTH 2 / 210               NULLTIDE  5 / 192
```

Six is the second-longest chain, not the shortest. 192 is third-shortest, not
longest. HALCYON now carries the longest reach of any blade, which is true;
NULLTIDE carries the five-hit cascade and **no reach superlative at all**,
because inventing a replacement distinction is how the first one happened.

**These matter more than an ordinary prose error** because the mech-select screen
prints hit counts — it renders `(5 hits)` beside the weapon name — so a player
can disprove either line in about ten seconds. Writing lore against the
simulation is only worth doing if the lore is then correct.

The brief now carries the full authoritative table so the class of error cannot
recur. A related trap was avoided in the same pass: the delivered text described
HALCYON's reach as "at 200", a raw engine value in a document that measures in
metres, where PYRE's 300-metre gun is 820 engine units. A reader converting it
would have been wrong by roughly three to one. The number was deleted rather than
converted, because the mapping is not canon.

---

## D79 — The Archive is a Concord-maintained compilation

**Decision.** The Archive is a records system maintained by Concord that compiles
material from all five powers. Each entry's subtitle names its source document;
the body may be a source document, a compilation of several, or a document with
Archive addenda. **The Archive's editorial voice is Concord's and is therefore
not neutral.**

**Why.** The brief never answered this and several attribution problems turned on
it. It explains how a Concord system holds an Ironwake works log, it lets the
Archive narrate Ironwake's silence about the Descent — because the Archive is not
Ironwake — and it is why Io Senna having no Concord file is meaningful rather
than merely convenient.

**A count was replaced by a rule.** The Archive's self-references were first
capped at two or three across the whole document. That was a count where it
should have been a rule: at the calibration sample's rate it would have reached
fifteen across twenty-one entries. The explicit Archive voice now appears **only
in entries that are genuinely compilations** — `descent`, `factions`, the
`stillwake` addendum and the `nulltide` pilot reconstruction — and is forbidden
in a works log or a ledger that has no narrator. The delivered rewrite used it
four times, in exactly those four entries.

**Cost.** One presentation defect survived every check and was found only by
looking at the screen. The Free Latitude build copy demonstrates its own
unreliability by leaving a form field empty, and a paragraph ending on the bare
label `weight, final:` reads as truncated text rather than a blank field. The two
fields now sit adjacent, so they parse as a pair of rows in which the second
carries a value and the first visibly does not. No words changed. That is the
fourth time this session that approved, tested, verified work read wrong on
screen.

---

## D80 — The desperate Speed close is a shielded dash, not a lunge

**Decision.** While a desperation Speed lock is closing, the mech dashes straight
at the target at `thrust × DESPERATE_DASH`, holds a free guard, and does not begin
its chain until the target is genuinely inside `meleeLock.range`. The 22-tick
timeout that used to end the approach is gone for that case.

**Why.** Reported from a CPU-versus-CPU match: a long-range desperation melee
played its swing animations while still travelling, leaving the attacker exposed
and arriving with nothing left to throw.

The arithmetic is stark. `acquireRange` runs 380–500, so the desperation
multiplier puts the lock at **3,420–4,500** against an arena diagonal of about
**2,680** — the mode genuinely reaches everywhere, which is the whole point of it.
But the approach was a lunge: `thrust` of 12–19 a tick behind a `tracking` lerp,
and `if (dist <= p.range || ml.timer > 22)` handing over to `swing` regardless of
distance once the timer expired. Twenty-two ticks of that covers roughly 250 px.
Every desperation melee opened beyond about a fifth of the arena therefore spent
its entire chain on empty air during the approach, then arrived with the sequence
already over — the exact opposite of what a comeback mechanic should do, and
worse than not having pressed the button.

**The guard is the load-bearing half, not decoration.** A guarded hit returns from
`takeHit` without setting hitstun, and hitstun is what breaks a lock, so the shield
is the only reason a two-second committed approach is not cancelled by the first
stray round. It is free — `barrierFree` gains `desperateClosing` — because the
guard is part of the attack rather than a defensive choice the pilot made, and
charging the gauge for it would mean the move silently costs barrier nobody
elected to spend. A piercing non-melee hit still goes through it and still stops
the charge, which is the counter.

`endMeleeLock` drops the guard, or a broken charge would leave a free guard
standing until something else happened to clear it.

**Measured**, six seeds a matchup, both slots, against the D74 baseline:

```
              HARD                     EXTREME
  cirrus    -0.061 -> -0.044        +0.113 -> +0.134
  everyone else within +/-0.005     within +/-0.005
  spread     0.374 ->  0.376         0.322 ->  0.321
```

Flat everywhere except CIRRUS, which is the correct shape: she is the machine
whose playstyle takes Speed on the brink and the one with an eight-hit chain to
cash in on actually arriving. The magnitude sits near the noise floor at six
seeds, but it is consistent in direction across both tiers and lands on the
predicted machine. A desperation burst is a rare event inside a match, so a small
roster-level number is what a correct fix looks like here.

**Verified in play as well as in the harness.** In a live CPU-versus-CPU match at
EXTREME the AI opened a desperate melee at **1,144 px** and closed to **51 px**
before the first swing, with zero swing frames recorded outside 220 px.

The reported symptom — animations sweeping during travel — is pinned by a test
rather than a screenshot. `spin` drives the arm: it ramps once over eight ticks to
the arc's t=0 wind-up and then holds for the whole approach, and only sweeps in
`swing`. Asserting the pose is constant from tick 10 to contact covers every frame
of the approach, which a single captured frame would not.

---

## D81 — A combo holds itself together; barrier is the only way out

**Decision.** Non-final melee-lock hitstun becomes
`Math.max(14, swing + gap + 2)` rather than a flat 14.

**Why.** Whether a combo could be escaped was never designed. Hitstun was one
hardcoded constant; the interval between hits is `swing + gap`, authored per
weapon and ranging 10 to 26. So the answer was decided by which side of 14 a
weapon's animation happened to land on — and it landed backwards:

```
  weapon      hits  cycle  free frames after hit 1   chain landed
  CIRRUS         8     10                        0        4 of 8
  HALCYON        6     13                        0        4 of 6
  NULLTIDE       5     14                        0        4 of 5
  PYRE           3     19                        5             --
  NOCTURNE       3     20                       10             --
  VESPER         2     21                       14        1 of 2
  TERRAMOTH      2     24                       14        1 of 2
  OBELISK        2     26                       14        1 of 2
```

Twelve free frames is not a twitch. Measured in the sim, the victim used them to
open a melee lock of its own and swing back. The three worst cases are the
two-hit heavies, so their **finisher** — the hit carrying `finisherKnock` and the
30-tick stun — essentially never landed against anyone pressing the button. The
machines whose two heavy strokes *are* their melee identity were the only ones
unable to keep a combo, while CIRRUS's eight-hit flurry was airtight.

**Barrier remains the answer, and is now the only one.** `stepStunned` already
carried a barrier-cancel out of hitstun for double cost, and it still works from
every weapon. Guarding the opener still prevents the stun outright, because a
guarded hit returns without setting one. What is gone is escaping a combo with
the same button that started it, for free, because the stun happened to run out.

Verified across all eight, drones disabled so their fire and hazards could not
contaminate the stun state: mashing melee now yields **zero** free frames and no
counter-lock anywhere, mashing barrier still escapes everywhere, and VESPER,
TERRAMOTH and OBELISK land both hits for the first time.

**This is load-bearing for desperation Speed.** D80 made the long close a
shielded dash so the burst can arrive at all; without this, arriving only
delivered the attacker into a melee trade it had spent its meter to reach. The
two are one feature.

**Measured, six seeds a matchup, both slots, EXTREME leading** because that is the
tier that runs every AI trait:

```
                 EXTREME              HARD
  pyre        +0.179 -> +0.151    +0.163 -> +0.180
  cirrus      +0.134 -> +0.112    -0.044 -> -0.087
  terramoth   +0.020 -> +0.063    +0.178 -> +0.175
  obelisk     -0.005 -> +0.057    -0.033 -> +0.100
  nocturne    -0.025 -> +0.009    -0.002 -> -0.013
  nulltide    -0.035 -> -0.058    +0.017 -> -0.032
  vesper      -0.142 -> -0.135    -0.198 -> -0.158
  halcyon     -0.126 -> -0.199    -0.082 -> -0.164
  spread       0.321 ->  0.350     0.376 ->  0.344
```

**Cost, stated plainly: EXTREME spread widened, 0.321 to 0.350.** OBELISK,
TERRAMOTH and NOCTURNE gained, which is the fix working. HALCYON lost more than
anyone — its own chain was already airtight so it gained nothing, while losing an
escape it had been living on against everyone else — and is now the weakest
machine at EXTREME, overtaking VESPER, who had held that position since the
roster was first measured.

The mechanic is not reverted for it. A correct rule that invalidates a tuning
pass is a retune owed, not a rule to undo — the previous numbers were partly
measuring an accident. The roster wants a pass now that combos actually complete,
and HALCYON is the first thing it should look at.

---

## D82 — Wisp's tether: visible, wider, and allowed to stay out

**Reported.** "Wisp seems to always stay by Cirrus, which defeats the purpose of
this tether" — and, separately, "I don't see a line whenever Wisp is active."

**Both were true, and the second was the more serious.** There was no code
anywhere that drew the wire. `tetherLive` had **zero** references outside
`src/combat/`. An ability whose entire skill is *where you stand relative to a
line* was shipping with the line drawn nowhere.

That is not unique to WISP. Auditing the eight roles: every role that spawns an
**entity** is visible, and every role that is pure **state** is invisible.

```
  STATIC     decoy        false chassis        visible (MechRenderer)
  BULWARK    miner        mine clusters        visible (projectiles)
  EMBER      hazard       burning ground       visible (projectiles)
  SIGHTLINE  interceptor  shoots down shots    visible (absorb sparks)
  WISP       arcTether    live wire            NOTHING
  AEGIS      dome         shot-erasing bubble  NOTHING
  WARDEN     tether       barrier repair beam  NOTHING
  ARBITER    designator   target paint         NOTHING
```

Four of eight abilities have no tell at all. The Archive makes it worse by
describing visuals that were never drawn — WARDEN's "repair beam", AEGIS's
"dome", ARBITER "paints the target". Only WISP is fixed here; the other three are
recorded as open.

### Two wrong diagnoses, both caught by measuring

Worth recording because the measurement discipline is what saved them.

**First guess: Cirrus fights too close for Pincer's 320 px minimum.** Measured:
the gap gate is satisfied **87.9 %** of the time. Not the problem, and stated
before checking.

**Second guess: `flank`'s `offAxis: 78` shoves the drone off the very line that
is the weapon.** Plausible, and wrong — that block sits inside
`if (this.tactic === Escort)`, so it never runs during a Pincer. The change was
a no-op and the probe returned **byte-identical** numbers, which is how it was
caught within one run.

### What was actually wrong

```
  tactic histogram      Escort 39%   Regroup 36%   Pincer 19%   Cover 6%
  tether live                        40.4%
  tether crossing the target         10.1%
  arc hits                           ~3.0 per match  (~102 damage)
```

**Regroup was eating a third of the match.** `chooseTactic` returns `Regroup`
below `REGROUP_LIFE` = 0.35 — and WISP is the frailest escort in the game once
`defenceMul` is counted (335 hit points at 1.15 → **291 effective**, below
EMBER's 306). It got chipped early and then went home for good.

And when the play did run, the geometry was fine — mean `t` along the wire of
0.29 is exactly what parking 210 px beyond the target produces — but the drone
only **held** the station about half the time: 40 % of Pincer ticks the target
was not between the two machines at all. That is a pursuit problem, not a
geometry one, and it is deliberately not addressed here.

### Three changes

1. **`regroup` becomes a per-doctrine value.** A shooter that falls back still
   shoots; a drone whose output *is* a position loses everything. `flank` — the
   doctrine built entirely on holding an angle — drops to **0.15**. Every other
   doctrine keeps 0.35, so the blast radius is CIRRUS and NULLTIDE.
2. **The wire has thickness.** It was tested as a zero-width mathematical
   segment against a 30 px hurt radius. `ARC_TETHER_WIDTH = 14` is now shared by
   the hit test and the renderer, so the cable a player sees lying across a mech
   is the cable that connects with it.
3. **It is drawn.** Under the drones and mechs, at that same width, in two
   states: *slack* when the wire exists but nothing is on it, and *hot* —
   brighter, thicker, crackling along its length — when it is actually cutting
   someone. The crackle is sampled off the sim tick, so a replay looks the same.

### Measured

Tether behaviour, 21 matches, CIRRUS against the roster at EXTREME:

```
                          before    after
  Pincer ticks            10,724   11,036
  crossing the target      48.7%    53.1%
  mean perpendicular miss  200 px   156 px
  target outside the span  39.9%    33.3%
```

Roster, six seeds a matchup, both slots, EXTREME leading:

```
                 EXTREME              HARD
  cirrus      +0.112 -> +0.157    -0.087 -> +0.057
  nulltide    -0.058 -> -0.004    -0.032 -> -0.057
  pyre        +0.151 -> +0.117    +0.180 -> +0.158
  terramoth   +0.063 -> +0.030    +0.175 -> +0.169
  obelisk     +0.057 -> +0.027    +0.100 -> +0.056
  nocturne    +0.009 -> +0.023    -0.013 -> -0.030
  vesper      -0.135 -> -0.121    -0.158 -> -0.136
  halcyon     -0.199 -> -0.229    -0.164 -> -0.218
  spread       0.350 ->  0.386     0.344 ->  0.387
```

**The two `flank` machines gained and nothing else moved much** — CIRRUS +0.045,
NULLTIDE +0.054 — which is exactly the intended blast radius. CIRRUS is now the
strongest machine at EXTREME.

**Cost: spread widened again, and it is entirely HALCYON.** It has now fallen
−0.126 → −0.199 → −0.229 across three consecutive correct fixes, none of which
were aimed at it: it gained nothing from the combo change because its chain was
already airtight, and nothing here because its doctrine is `escort`. It is the
clear weakest machine and the roster wants a pass. Recorded rather than patched,
because a tuning change bundled into a mechanics commit is unattributable — which
is the whole reason these numbers exist.

## D83 — The last three invisible drone roles: a shell, a cable, and a mark

**Closes the open half of D82.** That entry fixed WISP and recorded the rest:
every drone role that spawns an **entity** was visible, every role that is pure
**state** was drawn nowhere. AEGIS's `dome`, WARDEN's `tether` and ARBITER's
`designator` were the three left, and the Archive describes all three as visible
things the game never drew.

No simulation change was intended here and none of the three abilities changed.
What changed is that they can now be seen.

### Additive, or none of it works

The first cut drew the dome in NORMAL blend and it read as a circle somebody had
drawn on the screen rather than as a shield. Every other energy effect in this
game — the blades, `ProjectileLayer`, all of `Effects` — is
`BlendModes.ADD`. Matching that mattered far more than any alpha value did. The
dome and the paint are both additive now.

### Closed shell, not a cage — and the simulation settles it

Asked directly whether the bubble was meant to read as a closed sphere or a
spherical cage. `stepDroneRoles` erases every non-piercing shot *anywhere*
inside `roleValue`; there are no gaps to thread. A lattice of bright bars with
empty space between them would be describing an ability the game does not have,
so it had to read closed.

Three things put the surface there, in order of how much each does:

1. **Fresnel falloff** — nine concentric shells brightening toward the rim on a
   2.6 power. This is the one doing the work: a sphere shows most of itself at
   the edge, where the line of sight runs along the surface. The flat fill in the
   first cut is exactly why it looked like a drawn circle.
2. **A hard rim** at exactly the radius `MatchSim` cuts at, so the boundary a
   player judges an approach against is the boundary their rounds die on.
3. **Seams** — meridians *and* latitudes, on one rotation. Meridians alone are
   ambiguous: equally a globe and a birdcage. The squashed latitude rings are
   what force one reading, because a horizontal ring in perspective only makes
   sense on a solid of revolution.

**The weight is bounded on both sides, and both bounds were found by looking.**
Too faint and the seams dominate and it reads as a cage. Too heavy — 14 shells at
0.16 with a 0.06 fill was tried and photographed — and the additive interior
washes the machine standing inside its own dome into a white silhouette. That
costs more legibility than the surface buys. The kept numbers are the ones that
were looked at.

### The cable is integrated, not drawn

**Reported:** the feed line "should probably be more string-like with string like
physics instead of a straight line."

WARDEN's line is now an 18-point Verlet rope, ends pinned to the drone and the
machine, everything between left to fall and catch up. Measured at 452 px span it
departs **86 px** from the straight chord. Fixed-step on purpose: Verlet under a
varying `dt` changes its own stiffness frame to frame.

**Render-only, and it has to be.** The tether's effect has no geometry at all —
it adds barrier while the drone is on station, from wherever it happens to be.
The straight line was accurate and lifeless; the rope is a lie about nothing,
because there was no geometry to be honest about.

Deliberately **not** applied to WISP's arc. That one is a weapon, drawn taut and
crackling; a slack cable and a live wire read better as different objects.

### `tetherLive` went stale through a rebuild — including WISP's, shipped in D82

Found by measuring rather than by eye, and it is the reason the render gates
changed. `Supporter.step` early-returns for a rebuilding drone and clears
`roleTimer`, `domeActive` and `decoyTicks` — but not `tetherLive`. `stepRole` is
what normally re-derives that flag every tick and it does not run on that path,
so the flag stays set for the whole rebuild.

`MatchSim` never noticed, because its own gate is `onStation`. The renderer read
the flag directly. Caught live:

```
  rebuilding: true   onStation: false   tetherLive: true   tetherBuf: 63
```

Sixty-three draw commands of repair beam running out of a wreck. **The same
defect was in WISP's arc from D82** — a live weapon wire drawn from a drone being
rebuilt.

Fixed in both places, because either alone would have been enough and neither
alone is right:

* `Supporter` now clears `tetherLive` on the rebuild path with the rest of the
  latched role state. This is the root cause.
* The three render gates moved from `s.visible` to **`s.onStation`** — the same
  predicate `stepDroneRoles` uses. `visible` is deliberately a superset that
  includes a rebuilding drone, so drawing on it puts an effect on screen during
  the exact window it provably does nothing.

505 tests still pass, which is the expected result: the simulation never read the
stale flag.

### The paint outlives its source; the sight-line does not

`paintedTicks` lapses over its own 45 ticks after the drone stops refreshing it,
and that decay is what makes killing ARBITER pay. So the mark keeps drawing while
it fades, and the **line home** is gated on `onStation` — the mark visibly loses
its author before it fades out. Brackets rather than a ring, because a closed
circle around a mech already means barrier in this game.

**The sight-line was the same mistake this entry exists to fix, made again.** It
shipped at alpha 0.2 in the first cut, and the command buffer proved it was
there —

```
  lineStyle(1, 0xff6a50, 0.2)  moveTo(725.8, 415.5)  lineTo(1146.5, 393.4)
```

— while nothing on screen showed it. Drawn, and invisible. It is now a 3 px
bloom under a 1 px core at 0.62.

### Raised, not changed

**WARDEN is called a "repair beam" in both the code comment and the Archive, and
it repairs nothing.** It refills the guard gauge at +1.6/tick — 96 a second into a
100 pool — and may never touch life, by an explicit design decision recorded in
`Supporter.stepRole`. The word sets up an expectation the mechanic deliberately
refuses. Canon wording, so it is the user's call, and it joins the EMBER item in
the handoff's open questions.

**Whether a defensive escort should run Pincer at all** was raised and is *not*
settled here. Two facts were checked rather than argued: NOCTURNE's doctrine is
already `escort`, the tightest-but-one on the roster, and `tether` is in
`SPENDS_CHARGES` — WARDEN keeps its gun, so closing to its 700 `fireRange` buys
it real shots while the barrier feed has no range term to lose. The exposure
argument survives that, but it is a balance question and §9 says measure it.
Recorded as a candidate.

**A number put on screen by the harness is not a number the game produced.** A
590 px tether span looked like a drone abandoning its station and was an artifact
of a probe teleporting the opponent every 100 ms. The settled span is ~130 px.

## D84 — The paint mark was drawn underneath the machine it marked

**Found by being asked to show it.** D83 claimed ARBITER's paint was visible. It
was drawn, its command buffer was non-empty, and on screen it was a few arcs
buried inside the chassis. The screenshot is what caught it — which is the third
time on this project that a thing measured correct and read wrong, and the second
time in the same day's work.

The radius was `rig.hurtRadius + 16`. **A hit circle is not a picture of a mech.**
Measured live: 52 px on TERRAMOTH against a silhouette roughly 85 px to the
corner, so the entire reticle sat under the artwork. HALCYON was the same story at
44 px against ~72.

Now sized off **`barrier.radius × 1.8`**. That field is the project's existing
per-chassis "circle that fits this machine" number, hand-tuned from 40 on CIRRUS
to 56 on TERRAMOTH, so the mark scales with the frame for free instead of being
refitted per mech. Checked at both ends of the roster: 72 px on CIRRUS, 101 px on
TERRAMOTH, clear of the silhouette in both.

**The inner ring had to go with it.** At the old radius it was buried and
harmless; at the new one it landed right on the barrier bubble, and a targeting
mark that can be mistaken for a defensive one is worse than no mark. Replaced
with four radial ticks reaching inward from the brackets, breathing on the same
pulse. There is now no closed circle anywhere in the reticle, which was the rule
the first version stated and the geometry quietly broke.

**`getBounds()` on the mech root is not the silhouette.** It reported 412 × 351
for TERRAMOTH against an observed ~170 × 160 — it includes children parked far
off, and anything sized from it would be wildly too big. The extents above were
derived from the screenshot instead.

## D85 — Warden heals, Arbiter guides, and the AI learns to commit

Three requested changes, and then the measurement that came out of them, which
turned out to matter more than any of them.

### Warden's tether returns hull

**Requested**, and it reverses the standing "barrier, never life" decision in
`Supporter.stepRole` — recorded there and now rewritten rather than left
contradicting the code. `TETHER_LIFE_RATE = 0.05`, 3 hull a second, alongside the
barrier feed.

Measured, six seeds a matchup, both slots:

```
  NOCTURNE  EXTREME -0.024 -> +0.046   (+0.070)
            HARD    -0.036 -> +0.031   (+0.067)
  spread    EXTREME  0.406 ->  0.396
            HARD     0.410 ->  0.402
```

Both tiers, same direction, near-identical magnitude, and the roster spread
*narrowed*. The comment first written for it called this "a trickle, not a heal
that wins an exchange" — at +0.070 that overstated its own smallness, and the
comment was corrected rather than the number.

### Arbiter's paint guides the painter's rounds

**Requested**, and it re-adds a mechanic `DESIGNATOR_DAMAGE`'s note explicitly
rejected — see that note first. `DESIGNATOR_HOMING = 0.012` rad/tick, read live
in `stepProjectiles` and never written back, so the bonus dies with the paint.
Gated on the shooter owning a designator rather than on the paint alone, so a
mine never starts flying because somebody else's drone lit the target up.

```
  HALCYON   EXTREME -0.229 -> -0.051   (+0.178)
            HARD    -0.177 -> +0.024   (+0.201)
  spread    EXTREME  0.396 ->  0.302
```

0.302 is the narrowest roster spread measured on this project. It also makes the
stale `mechs.ts` comment — "HALCYON's own shots track a painted mech" — true
instead of deleted.

**A wrong call, recorded because it was nearly acted on.** This was first
reported as reproducing the documented failure exactly: `difficulty.test.ts` went
red with `EXTREME vs HARD: -0.017`. That reading came from the test's **6 seed
pairs**, and at 24 pairs the change measures `+0.022 ±0.050` against a baseline
of `+0.045 ±0.044` — no significant difference. The failure was a small sample
read as signal, which is the exact trap the protocol's own history is made of.

### The measurement that mattered

Chasing that led to measuring the ladder properly, 24 seed pairs with error bars:

```
  HARD vs NORMAL     +0.265 ±0.051
  EXTREME vs NORMAL  +0.364 ±0.052
  HARD vs EASY       +0.440 ±0.045
  EXTREME vs EASY    +0.409 ±0.055      <- below HARD's
  EXTREME vs HARD    +0.045 ±0.044      <- inside its own error bar
```

**The top rung of the difficulty ladder was flat, and had been.** HARD pulls
+0.265 clear of NORMAL; EXTREME managed +0.045 over HARD. `difficulty.test.ts`
asserts `EXTREME vs HARD > 0` on six pairs, so it had been passing on luck — and
that is why it flickered across a homing sweep (0.002 fail, 0.006 pass, 0.008
pass, 0.012 fail) that no monotonic effect could explain.

A per-lever ablation of EXTREME, 20 pairs, mirror machines:

```
  threatSolver     +0.236   real -- but HARD has it
  punishRecovery   +0.159   real -- but HARD has it
  weaponIq         -0.129   actively harmful, at every tier that has it
  energyDiscipline +0.058   noise      rangeIq   +0.039   noise
  droneIq          +0.050   noise      tempoIq   +0.031   noise
  statusIq         +0.041   noise      closeOnGuard +0.026 noise
  frameIq          -0.045   noise      resourceIq +0.009  noise
  leadShots        -0.067   noise
  reaction 3->6    +0.041   noise      skill 1->0.78 +0.045 noise
```

**The two levers that pay are both already at HARD.** Everything EXTREME adds on
top — six exclusive flags, and halving reaction time — is individually
indistinguishable from zero. `RivalAI.ts` claims `rangeIq` is "worth about two
tenths of a health bar, which is most of what separates the top two tiers"; it is
worth +0.039 ±0.066, and that comment has been the project's stated explanation
for the top of the ladder.

### Why knowledge measured as nothing — and it is not what it looks like

The first reading of that table was "knowledge is worth nothing in this game."
That was wrong, and the code says why. `rangeIq`, `tempoIq`, `droneIq` and part
of `statusIq` all write to **the same variable** — `want`, the distance the rival
would like to stand at — which is then clamped:

```ts
  if (!this.p.rangeIq) return (300 - this.skill * 90) * styleMul;
  if (this.p.droneIq && self.supporter.rebuilding) want *= 1.2;
  if (this.p.tempoIq) { ... want *= 1.22 ... want *= 0.72 }
  return Math.max(self.def.rig.hurtRadius * 3, Math.min(want, 900));
```

Four insights, one output channel, and they partly cancel — `droneIq` pushes
`want` up while `tempoIq` pulls it down. That also explains the **non-additivity**
seen when re-tiering: taking `punishRecovery` (+0.159) away from HARD opened the
rung by +0.07, not +0.159, because the survivors still write to the same scalar.

The knowledge was never worthless. It had nowhere to go. The whole decision
output of the class was five movement modes, and no amount of knowing things can
be expressed in "move toward" or "move away".

### Plans

`AiPlan` — a committed multi-tick intent with an entry condition, a body that
outranks the ordinary tactic choice, and an abort. Gated on **`planIq`**, a new
capability true at EXTREME alone: the knowledge flags say what a tier *sees*,
`planIq` says whether it can hold an intent about what it saw.

`Execute` is the surviving plan. `frameIq` already read the recovery window;
now it can spend it — 46 ticks committed to a helpless opponent, aborting the
tick they recover, blocked from re-entry for 40, and dropped entirely below 18 %
life because commitment into a lost fight is sunk cost with a health bar.

```
  plans off              EXTREME vs HARD +0.012   vs NORMAL +0.381
  Execute only                           +0.114             +0.214
  Execute + GuardBreak                   +0.076             +0.244
  all three                              +0.086             +0.249
```

> **Corrected in D86.** Every row above ablates a plan by switching off the flag
> it is gated on — and those flags also drive scalar and tactic behaviour, so
> each delta conflates the plan with everything else its flag does. Re-measured
> with a per-plan mask and the profiles left alone, `Execute` alone is
> **+0.078**, not +0.114. The ordering held; the magnitude did not.

**`Breach` and `GuardBreak` were built, measured, and are not here.** Both lower
the top rung. A plan that commits tens of ticks against an opponent who was never
going to punish the alternative is worse than reacting, and `Breach`'s entry
condition is mech-symmetric, so in a mirror it fires for both sides at every tier
and cancels. Removed rather than disabled behind a flag, because dead code that
once measured badly is an invitation to switch it back on. The lesson is that a
plan earns its keep in its **entry condition**, not its body.

`Execute` alone takes the rung from +0.012 to +0.114 — nine times, and the reason
the suite is green again without `difficulty.test.ts` being touched. The
assertion stopped failing because the quantity stopped being noise.

**The cost is real and is not hidden**: `EXTREME vs NORMAL` falls from +0.381 to
+0.214. Committing against an erratic opponent is worth less than reacting to
one. It still clears the 0.15 floor, and buying a live top rung with some of a
rung that was never in doubt is the trade this was asked for — but it is a trade.

### Still open

* `weaponIq` at **-0.129** is bug-shaped, not tuning-shaped, and drags every tier
  that has it. Untouched here.
* `difficulty.test.ts` measures the tiers with **HALCYON mirror matches**, so any
  change to HALCYON's kit can redden the ladder test. That coupling is why a drone
  change turned the suite red, and it is still there.
* Its six seed pairs still cannot resolve an effect of this size; the assertions
  pass comfortably now, but the instrument has not improved.

## D86 — Starve joins the plan set; Drone-Hunt does not; and D85's number was confounded

### The instrument was wrong first

D85 priced plans by switching off the flag each was gated on. Those flags also
drive scalar and tactic behaviour, so every delta conflated the plan with
everything else its flag does — and the run quoted as "Execute only" had also
disabled `rangeIq` and `resourceIq`, whose scalars were still doing their usual
work in the shipped build.

`setPlanMask` fixes it: a plan can now be removed and nothing else. Re-measured
that way, with the profiles left entirely alone, 20 seed pairs, both slots:

```
  NO PLANS               EXTREME vs HARD +0.012 +/-0.060   vs NORMAL +0.381
  EXECUTE                                +0.078 +/-0.039             +0.277
  EXECUTE + STARVE                       +0.092 +/-0.044             +0.254
  EXECUTE + DRONE-HUNT                   +0.003 +/-0.056             +0.179
  ALL THREE                              +0.034 +/-0.043             +0.154
```

**`Execute` alone is worth +0.066, not the +0.102 D85 implied.** The ordering
survived; the magnitude did not. D85 is annotated rather than rewritten, because
a decisions log that quietly restates its own numbers is worth nothing.

The general lesson, which is the durable part: **ablating a capability by
disabling the flag that gates it only isolates the capability if the flag does
nothing else.** On this AI, none of them do nothing else.

### Starve ships

An opponent whose boost cannot pay for a dash cannot evade, and this game is
built on evasion. `resourceIq` already read that gauge and spent the reading on a
single-tick Approach; as a plan it commits 54 ticks and aborts as soon as the
gauge recovers past 1.6 dashes, or the moment a burst makes thrust free — a Speed
burst means an empty gauge signifies nothing at all.

Worth +0.014 on top of `Execute`. Small, and it is what carries the rung past its
own error bar for the first time: **+0.092 +/-0.044**, where 2 SE is 0.088. That
is a marginal pass, not a comfortable one, and it should be read as such.

### Drone-Hunt does not, and the codebase predicted it

Priced at **-0.075** on the rung and **-0.098** against NORMAL. Removed.

The striking part is that this exact failure is already written down. The
pre-existing drone-chase branch in `pickTactic` carries this note:

> the first cut said "worth crossing the yard for" ... EXTREME abandoned its
> spacing to chase an escort and **lost 0.09 of a life bar to HARD** for it. The
> kill is a bonus to collect, not a plan to follow.

`DroneHunt` reproduced that at -0.075, having been written with a deliberately
narrower entry condition than the version that failed before. "The kill is a
bonus to collect, not a plan to follow" turns out to be the general rule, and the
narrow entry did not rescue it.

### Where the plan set stands

Five plans have now been built and measured. Two ship:

```
  EXECUTE     +0.066   ships
  STARVE      +0.014   ships -- carries the rung past significance
  BREACH      -0.028   removed (D85)
  GUARDBREAK  -0.010   removed (D85)
  DRONE-HUNT  -0.075   removed
```

Three of five made things worse. Every one of the three shares a shape: it
commits tens of ticks to a payoff that was **not certain**. The two that ship
both trigger on a state where the opponent has already lost an option — cannot
act, or cannot dodge. That is the entry condition test for anything added next,
and it is a stronger predictor than any reasoning about what the behaviour does.

## D87 — Vigil, preemption, and the discovery that commitment is a scarce resource

`EXTREME vs HARD` now measures **+0.147 +/-0.055**, from +0.012 with no plans at
all. Twelve times the baseline, and comfortably outside its own error bar for the
first time.

Getting there required a mistake and the finding that came out of it.

### The plan cooldown is load-bearing, not a bug

`Vigil` waits out an opponent's saturation burst so `Execute` can punish the
burnout — and the global 40-tick cooldown `Vigil` set on ending locked `Execute`
out of exactly the window it had been waiting for. That looks like an obvious
bug, and it was "fixed" by making the cooldown per-plan.

Measured on identical seeds, that fix cost `Execute + Starve` **0.081 of a life
bar** against HARD:

```
  global cooldown      EXTREME vs HARD +0.092 +/-0.044
  per-plan cooldown                    +0.011 +/-0.057
```

Caught only because the control row of the next batch disagreed with the previous
run. **Always re-run the control.** A batch whose baseline has moved is measuring
the baseline, not the batch.

The rate limit is doing real work. Without it the rival is inside some plan
almost continuously, and permanent commitment is precisely what removed three
plans already. **A plan is worth something because it is rare.**

### Commitment is a budget, and cheap plans spend it

That reframes every failure so far. A global cooldown means a fixed number of
commitments per match, so each additional plan does not compete on merit — it
competes for **scarcity**, and spends the budget on a lesser window. Every plan
added on top of the shipped pair lowered the rung:

```
  Execute + Starve                     +0.092
  + Vigil                              +0.066
  + Counterpunch                       +0.028
  + both                               +0.007
```

Not one of them was bad in isolation. They were crowding `Execute` out.

### Preemption, and the handoff that makes Vigil work

The fix is targeted rather than blanket: `Execute` — and only `Execute` — may
interrupt a running plan and ignore the cooldown. A helpless opponent is the most
certain damage on the field and must never be skipped because the rival is
mid-commitment to something smaller.

```
  Execute + Starve, preempting         +0.061 +/-0.041
  + Vigil                              +0.147 +/-0.055   <- ships
  + Counterpunch                       +0.020
  + both                               +0.067
```

Preemption **alone is slightly negative** (+0.092 -> +0.061). It only pays with
`Vigil`, and `Vigil` only pays with preemption: neither is worth anything without
the other, which is why either measured alone would have been discarded. The two
form a mechanism — `Vigil` spends the tail of a burst getting into range for a
burnout that is on a timer rather than a guess, and preemption is what lets
`Execute` collect it the tick it lands.

That is the first interaction on this AI where two levers are worth more together
than the sum of their parts, and it argues for pricing candidates in small
*combinations* rather than strictly one at a time from now on.

### Where the plan set stands

Seven built, three ship:

```
  EXECUTE       ships, and preempts everything
  STARVE        ships
  VIGIL         ships -- worth +0.086, and only alongside preemption
  BREACH        removed (D85)
  GUARDBREAK    removed (D85)
  DRONE-HUNT    removed (D86)
  COUNTERPUNCH  removed -- +0.020 against +0.061; still crowds Execute out
```

`Counterpunch` deserves a note, because its premise was sound: a pilot who has
burst their barrier and cannot afford another has no defensive answer when the
invulnerability lapses. It is a real window and the rival now simply does not
spend a commitment on it. The lesson is not that the read was wrong — it is that
**a correct read is not sufficient justification for a plan** while commitments
are scarce.

### Still open

* `EXTREME vs NORMAL` sits at +0.275, down from +0.381 with no plans. Plans still
  cost against an erratic opponent. Above the 0.15 floor, and the trade was asked
  for, but it has not been recovered.
* `weaponIq` remains at **-0.129**, untouched, dragging every tier that has it.
* `difficulty.test.ts` still measures the ladder on HALCYON mirrors with six seed
  pairs. The assertions now pass with real margin rather than on luck, but the
  instrument has not improved.

## D88 — The select screen documents the drone's ability, and Vesper is not a sniper

### Four faults on the select screen, all reported by eye

**The cursor was sized to the cell, not the artwork.** 96x96 sitting 2px high,
against a portrait plate of 92x76 — so it hung 8px below the picture and cut
through the machine's name. Now 96x80 centred on the plate, with the label moved
from y=44 to y=49 to clear it.

**The detail block ran through the control hint.** The hint appeared *inside* the
drone description rather than below it. Fixing that by sliding the block up drove
it into the stats instead: stacked, the two blocks wanted 195px in the 123px
between the stats and the hint, and no amount of shaving font sizes closes 54px.

The column was the real constraint. It started at `0.62 * VIEW_W` with 351px to
wrap into, and the drone lines are whole sentences, so they wrapped two and three
deep. Moved to `0.36` — clear of the portrait panel, which ends at 308, and clear
of the grid above — and **split into two columns**, weapons beside drone. Each is
now five to seven lines. Checked across all eight machines rather than the one on
screen: worst bottom 502 against a hint at 508, no overlap anywhere.

**The drone's ability was documented nowhere in the game.** The screen printed
the drone's hit points and its *passive*, and stopped. The **role** — the thing
that actually distinguishes eight otherwise similar escorts — appeared on no
screen at all. A player could learn that WISP refills boost at double rate and
still have no idea it strings a live wire across the arena.

`ROLE_BRIEF` in `data/droneRoles.ts` gives all nine roles a name and a sentence,
written against `stepDroneRoles` and `stepRole` rather than against the fiction.
Kept in one table so the nine read as a set and can be compared; eight
descriptions written next to eight stat blocks would drift.

`interceptor`'s line says "around **you**" deliberately: the radius is measured
from the pilot, not from the drone, and a player who assumes otherwise will
position the escort to protect something it is not protecting.

### Sightline is doing its job. Vesper is not doing its job.

**Asked**: does SIGHTLINE actually help a marksman? Measured, VESPER's mean lead
against the whole field, six seeds a matchup, both slots:

```
  screen + interceptor (current)   EXTREME -0.146   HARD -0.114
  escort + interceptor                     -0.201        -0.156
  shadow + interceptor                     -0.217        -0.156
  screen + shooter                         -0.239        -0.271
  shadow + shooter                         -0.234        -0.314
```

**The current configuration is the best of the five, on both tiers.** The
hypothesis going in was that `screen` wastes the frailest escort on the roster —
312 effective hit points, carrying the best damage passive — on exposure that
interception does not need, since the radius is centred on the pilot. That was
wrong: pulling the drone back to `escort` costs 0.055 and to `shadow` costs 0.071.
The body-blocking is worth more than the deaths. Handing SIGHTLINE its gun back
instead of point defence is a disaster at -0.093 to -0.157.

So the drone is not why VESPER is last.

### The roster is spatially homogeneous

The follow-up question — does VESPER actually *play* like a marksman — has a
harder answer. Median separation held, EXTREME, three seeds against the field:

```
  pyre       751px   in melee reach 12.1%
  terramoth  721px                  11.1%
  vesper     709px                  15.7%
  halcyon    693px                  15.0%
  nulltide   692px                  18.1%
  nocturne   686px                  12.5%
  obelisk    673px                  14.1%
  cirrus     567px                  35.2%
```

**VESPER holds 709px against a field median of 693 — a 2% difference — and spends
more of the fight inside melee reach than both heavies and the hazard machine.**
Its `rangeMul: 1.18`, the longest reach on the roster and a negative melee
appetite produce no distinguishable spatial behaviour.

Only CIRRUS has a real spatial identity. Seven of eight machines fight at
essentially the same distance, which makes "marksman", "brawler" and "siege
frame" descriptions of stat blocks rather than of anything observable. That is a
far better explanation for VESPER being the weakest machine than anything to do
with its escort, and it is a roster-wide finding rather than a VESPER one.

`preferredRangeFor` clamps its result to `[hurtRadius * 3, 900]` and both pilots
are solving for distance at once, so a stated preference gets averaged away by
the opponent's. Not addressed here; recorded because it reframes the balance
work.

## D89 — The portrait column was placed by coincidence

**Reported by eye**: the pilot portrait "is hugging the smaller portraits, and
unevenly at that."

Measured, it was worse than it looked. The panel sat at `VIEW_W * 0.20` and the
grid began at `VIEW_W / 2 - ((COLS - 1) * 108) / 2 + 40`. Two independent
expressions, no relationship between them, and the result:

```
  left margin          76px
  gap to the grid       4px
  panel top vs grid   +50px below it
  panel bottom        +84px past the grid's
```

None of those numbers was chosen. They were what two unrelated fractions happened
to produce at this viewport, and they would have been different at another.

The grid's geometry — `CELL_W`, `PLATE_W`, `GRID_X`, `GRID_Y` — is now hoisted to
module constants, and the portrait is derived from it: centred in the band left
of the grid, top aligned to the grid's top.

```
  left margin          40px
  gap to the grid      40px
  panel top            81px  = grid top
```

`buildGrid` uses the same constants rather than its own local copies, so the two
cannot drift apart again — which is the actual fix. The old code had the plate
size written as a literal `92, 76` in one place and the cursor sized to `96, 96`
in another, and nothing tied either to the other.

**The general fault, worth naming**: a layout expressed as independent fractions
of the viewport is not a layout, it is several layouts that happen to coexist. It
looks deliberate at the size it was authored at and has no defined behaviour
anywhere else. Every position on this screen that matters is now expressed
relative to the thing it must line up with.

## D90 — weaponIq is not a defect, and a probe that could not measure zero

Investigated `weaponIq`, which D85's ablation priced at **-0.129** — the AI
playing measurably better without it, the last bug-shaped finding on the list.
It is not a defect. Three corrections came out of the attempt, and the third is
worth more than the investigation was.

### The -0.129 no longer reproduces

That figure was measured **before the plan layer existed**. Re-measured against
the current AI, the whole branch is worth -0.014 — inside noise:

```
  shipped, all rules       EXTREME vs HARD +0.147 +/-0.055
  weaponIq off entirely                    +0.161 +/-0.054
```

A behaviour's value is a property of the AI it sits in, not of the behaviour.
Any number in this log older than a structural change to `RivalAI` should be
re-measured before being acted on, and D85's table is now in that category.

### `weaponIq` splits into three mechanisms, and two of them are excellent

The flag gates situational weapon choice, the status-element read, and the
energy-banking gate — and `energyDiscipline`'s only call site is *inside* it, so
ablating either flag silently ablates part of the other. D85 priced them as if
they were independent. Split with a rule mask:

```
  minus heavyOnExposed   -0.043   -> the rule is worth +0.190
  minus heavyAtRange     -0.040   ->                   +0.187
  minus heavyOnGuard     +0.027   ->                   +0.120
  minus element          +0.147   ->                    0.000, byte-identical
  minus bankEnergy       +0.174   ->                   -0.027
```

Its heavy-weapon rules are among the most valuable behaviours in the class.
`element` produces byte-identical results in a HALCYON mirror, meaning it never
fires there — not that it is dead roster-wide, which a mirror cannot show.

### The probe that could not measure zero

`bankEnergy` looked like the drag, so it was priced per machine, and the result
was a near-perfect monotonic relationship with `energyRegen`:

```
  TERRAMOTH +0.066 regen 2.7      PYRE     -0.061 regen 3.3
  NOCTURNE  +0.088 regen 2.9      CIRRUS   -0.079 regen 3.6
  HALCYON   -0.006 regen 3.1      NULLTIDE -0.085 regen 3.9
```

A gate scaling with how long a machine takes to earn a heavy shot was written on
the strength of it. **All of it was an artifact.**

The probe compared `duel(seed, banking)` against `duel(seed + 3331, not
banking)` — two *different fights*. When the rule was inert the arms still
differed, purely from the seed, and that constant difference was being read as
the rule's value. The tell was CIRRUS re-measuring at **exactly -0.079** after a
change that should have disabled the rule for it entirely: an inert rule was
reporting a large effect.

Rebuilt to hold the seed and swap only which side banks:

```
  halcyon +0.024   vesper +0.000   cirrus   +0.000
  nocturne +0.024  terramoth +0.004  pyre   +0.000
  obelisk -0.003                    nulltide +0.000
  ROSTER  +0.006 +/-0.005  (noise)
```

The exact zeros are the point. **An inert rule must measure exactly zero, and
that property is the probe's own self-test.** Any A/B on this project whose two
arms differ by anything other than the thing under test cannot report zero, and
therefore cannot report anything.

The reactor gate was reverted. It was justified by a broken measurement and
measures nothing against a correct one.

### What `bankEnergy` actually is

Near-inert. It fires on `energy < mainCost * 2.5`, which for VESPER is 145 out of
a 1150-point reactor — a condition the rival is almost never in. It is not a rule
with a personality, it is a rule that hardly ever runs. Left alone rather than
removed: it costs nothing, and removing near-dead code on the strength of one
mirror measurement is how the last three hours went wrong.

### Kept

`setWeaponRules`, alongside `setPlanMask`. Sub-rule ablation is now twice the
technique that found the real answer where a single flag could not, and both
masks exist because a flag in this class never gates only one thing.

## D91 — The roster is spatially homogeneous, the cause is known, and the fix is blocked on the instrument

**Requested**: give each machine real spatial identity, since D88 measured seven
of eight fighting at the same distance. The diagnosis is solid and is the useful
output here. The fix is reverted, and the reason it is reverted matters more than
the fix did.

### The preference is computed correctly and then thrown away

`preferredRangeFor` is not broken. Sampled every tick across the whole field at
EXTREME, the eight machines want **very** different spacing — and get none of it:

```
  mech        wants   gets   diff   on-station   APPR  HOLD  RETR  STRF  EVAD
  nocturne      332    685   +352         15%      31     5     4     1    58
  halcyon       350    635   +286         18%      35     9     3     2    50
  terramoth     514    708   +195         21%      27     8     3     5    57
  obelisk       520    650   +130         26%      25     7     5     7    57
  cirrus        690    597    -92         22%      21    29     5     7    38
  pyre          745    774    +29         22%      24     9     5    11    52
  nulltide      815    616   -199         20%      29    16     8    15    33
  vesper        876    650   -225         30%      18    11     7    14    50
```

Targets span 332 to 876 — a 2.6x spread, exactly the differentiation the stat
blocks promise. Machines are **on station 15-30% of the time**, and **33-58% of
every fight is spent in `Evade`**, which scores nine directions purely on threat
clearance and has no notion of preferred range at all. Add `Approach` and the
tactics that honour the preference are a minority: NOCTURNE spends 10% of a fight
in Hold, Retreat or Strafe.

**Half of every fight is movement with no character in it, and it averages the
other half away.** That is the whole finding.

### The fix, and the two ways it was wrong

Adding a range term to `solveEvade`'s scoring — a tiebreaker among dodges that
are equally safe, weighted well under the wall penalty — works, and works
strongly. "Gets" became monotonic in "wants" where before it was noise, and
on-station went from 15-30% to 46-49% on the machines that want to be close.

It failed the gate twice, and both were the same mistake in different clothes:
**identity was gated on a difficulty tier.**

* **Ungated**, it steered HARD too. `rangeIq` is EXTREME-only, so at HARD
  `preferredRangeFor` returns a flat `(300 - skill * 90) * styleMul` — one number
  every machine shares regardless of opponent. Steering toward that dragged the
  tier into close range against everyone: roster spread 0.79 against a 0.7
  ceiling, **HARD vs EASY 0.440 -> 0.033**.
* **Gated on `rangeIq`**, only EXTREME paid the positioning cost, and **EXTREME
  vs HARD fell +0.147 -> +0.000** — the entire margin D87 exists to create.

Extracting `identityRange`, computed the same way at every tier, fixed both:
`EXTREME vs HARD` passed again and roster balance passed. **How far a machine
likes to fight is not a measure of its pilot's competence** and must not be tiered.
That is the durable design lesson, and it is worth more than the feature.

### Why it is still reverted

At that point two marginal assertions remained (EXTREME vs NORMAL 0.135 against a
0.15 floor; the HARD mirror at 0.229 against 0.2), and tuning `RANGE_PULL` to
clear them produced this:

```
  0.25   EXTREME vs HARD passes
  0.15   EXTREME vs HARD -0.120
  0.10   EXTREME vs HARD passes, EXTREME vs NORMAL 0.080
```

Non-monotonic swings far larger than the effect. `difficulty.test.ts` asserts on
quantities with +/-0.05 standard errors using **six seed pairs**, so it cannot
resolve a change of this size — D85 established that and it is still true. Tuning
against it is fitting noise, which is the one thing this project's protocol
exists to forbid.

So the feature is reverted whole. It is not that it does not work; it is that
**it cannot be shown to work with the instrument available**, and shipping an AI
change on a gate that flickers is how the playstyle regression happened.

### The next step is the instrument, not the feature

Raising `difficulty.test.ts` to ~24 seed pairs with floors set from measured
values and error bars is now a **prerequisite** for this work, not housekeeping.
The diagnosis above is measured and will keep.

**Correction, D92:** this originally said the implementation was "in git at this
commit's parent". It is not. It was reverted with `git checkout --` before the
commit, so it was never committed and no parent holds it. What survives is the
description here, which is enough to rebuild it — roughly twenty lines: an
`identityRange(self, foe)` that runs `preferredRangeFor`'s `rangeIq` body at
every tier, and a term in `solveEvade`'s per-direction score of
`(nowErr - endErr) * RANGE_PULL`, where the errors are `|distance - pref|` now
and at the end of the lookahead. `RANGE_PULL` around 0.25, well under the 280
wall penalty.

## D92 — Rebuilding the instrument the ladder is measured with

D91 stopped because `difficulty.test.ts` could not resolve the change under test.
This fixes that, and it found a second fault while doing it.

### The rungs were asserted at roughly 1 sigma

Calibrated at 32 seed pairs, the ladder and its standard errors:

```
  NORMAL v EASY     0.193 +/-0.053      HARD v EASY       0.287 +/-0.039
  HARD v NORMAL     0.241 +/-0.052      EXTREME v EASY    0.310 +/-0.043
  EXTREME v HARD    0.099 +/-0.044      EXTREME v NORMAL  0.283 +/-0.046
```

The file used **six** pairs, where each of those errors is ~2.3x larger. So
`EXTREME v HARD > 0` was measuring 0.099 +/-0.102 against a floor of zero — a
coin toss, and the direct cause of both the sweep that flickered
(0.002 fail / 0.006 pass / 0.008 pass / 0.012 fail) and a drone change turning
the suite red while measuring no significant difference at 24 pairs.

**Common random numbers were tried and rejected on measurement.** Pairing the two
slot orders on one seed moved the error only 0.053 -> 0.047, because swapping
which tier holds which slot changes the fight too much for the draws to cancel.
The variance is intrinsic; the only honest fix is samples.

Samples are now spent where the margin is thin rather than uniformly:
`EXTREME v HARD`, the narrowest rung, takes 40 pairs; the other five take 16.
Every floor now sits about **2.5 standard errors** below its measured value.
Suite runtime goes from ~10s to ~24s, which is the price of a gate that answers
the question it is asked.

Floors are set from the calibration rather than from taste, and **failures now
report the standard error and the sigma distance to the floor**, because
"expected 0.03 to be greater than 0" cannot be acted on: it does not say whether
the ladder broke or the dice did.

The seeds are fixed, so this is not run-to-run flakiness. The risk being managed
is **sensitivity** — an unrelated change nudging a measurement across a floor it
was already sitting on top of.

### "Roughly even against itself" was measuring noise

The symmetry check asserted `|lead(d, d)| < 0.2`, and `lead` compares
`duel(seed)` against `duel(seed + 3331)` — **two different fights**. Between
identical opponents that difference is pure sampling noise, so the assertion
could never read zero however symmetric the harness was, and it passed or failed
on the spread of the roll rather than on any property of the game.

Same fault as the `bankEnergy` probe in D90, in the project's own test suite:
**an A/B whose arms differ by more than the thing under test cannot measure
zero, and therefore cannot measure anything.**

Replaced with the quantity actually worth knowing — the harness's slot bias, a
true mirror on one seed. Measured at 32 pairs: EASY -0.143, NORMAL -0.071,
HARD -0.089, EXTREME -0.022, consistently favouring the right slot. Kept as a
smoke check with a loose bound, because every threshold above is a lead of the
form `(duel(a,b) - duel(b,a)) / 2`, which cancels slot bias by construction — a
bias would be worth knowing about but does not invalidate anything.

### What this unblocks

D91's spatial-identity work, which is the thing that could not be judged. Also
every future AI change: three separate times this session a measurement was
believed and then overturned — the plan ablation confounded by shared flags, the
`bankEnergy` probe that could not read zero, and this file. The pattern is
constant and worth stating plainly: **on this project, check the instrument
before believing the result.**

## D93 — Spatial identity does not pay for itself, measured six ways

D92 rebuilt the ladder test so D91's spatial-identity work could be judged. It
has now been judged, on a gate that resolves it, and the answer is no.

### Every implementation costs the top rung

`EXTREME vs HARD` measures **+0.099 +/-0.044** without any of this. With it, at
40 seed pairs each:

```
  weighted, gated on rangeIq        +0.000
  weighted, tier-independent        -0.013 +/-0.042
  tiebreak, TIE_EPS 26              +0.055 +/-0.047
  tiebreak, TIE_EPS 10              -0.067 +/-0.046
  tiebreak, TIE_EPS  4              -0.030 +/-0.052
```

Six implementations — two weightings, three tie tolerances — **every one below
baseline**. Individually each difference is one to two standard errors and could
be dismissed; collectively the direction is not in doubt. The best of them,
`TIE_EPS 26`, passes the suite at **1.2 sigma from its floor**, which is the exact
marginal condition D92 was written to eliminate. Shipping it would have
reintroduced the flakiness on the same day it was fixed.

### The mechanism, now identified three times

**EXTREME's advantage is disproportionately made of evasion quality**, so any
constraint on how it selects a dodge taxes the top tier hardest. This is the
third independent finding of the same shape:

* Designator homing: steering shots erode dodging, and EXTREME measured as
  *losing to HARD*.
* The plan layer: committing to an intent costs `EXTREME vs NORMAL`, because a
  commitment is a constraint on responding.
* This: even choosing between "equally safe" dodges is a constraint, and 26px of
  clearance turns out not to be equal.

`solveEvade` is load-bearing to a degree nothing else in this class approaches.
It should be treated as such: changes to it are changes to the difficulty ladder,
whatever else they are about.

### What was actually learned, and is worth keeping

The diagnosis from D91 stands and is not affected by the fix failing. The eight
machines want 332px to 876px and get none of it, because 33-58% of every fight is
`Evade` and `Evade` has no opinion about range. A tiebreak *does* deliver
identity to the half of the roster that wants to fight close — HALCYON's
on-station went 18% -> 42%, TERRAMOTH 21% -> 49% — and delivers nothing to the
half that wants distance, because **closing is achievable unilaterally and
withdrawing is not**. A machine that wants 900px cannot have it against one that
wants 300px and is willing to chase.

That asymmetry is a property of the game, not of the AI, and it is the real
obstacle. Any future attempt should start there rather than in the evade solver:
spacing has to be something a marksman can *enforce* — a cost imposed on closing
— before a preference for it can be expressed.

### Method

Two attempts were made to tune out of the problem, and both ended in noise: the
`RANGE_PULL` sweep (0.25 pass, 0.15 -0.120, 0.10 pass-then-fail) and the
`TIE_EPS` sweep above, where tightening the tolerance made the ladder *worse*,
which is backwards and therefore was not a signal. **When consecutive
configurations disagree in a direction the mechanism cannot explain, the
measurement has run out of resolution and the answer is not in that dial.**

The aggregate of six same-direction results was worth more than any of the
individual comparisons, none of which was significant alone.

## D94 — Pilots fight the way they are written

**Requested**: every machine should play to its strengths. PYRE is a brawler and
was fighting at the longest average distance on the roster; VESPER is a marksman
and could not keep anyone off him.

### The personality was dead code at EXTREME

`preferredRangeFor` computes `styleMul` from the pilot's `rangeMul` and then uses
it **only in the `!rangeIq` early return**. The three reach branches below never
touch it. So at EXTREME — the tier this game is meant to be played at — a pilot's
range preference did nothing at all, and the comment beside it claimed it applied
"at every difficulty".

Restoring it was not enough on its own, because the reach calculus produces
numbers the 900px clamp flattens: PYRE wanted 1674, and 1674 x 0.72 is still over
the clamp. The personality could not survive a multiplication it never reached.

So a pilot whose `meleeAppetite` is *decided* now chooses the branch outright,
and the reach comparison decides only for pilots with no strong view — which is
five of eight. Measured, median separation and time in melee reach:

```
  before                     after
  PYRE      751px  12.1%     596px  14.7%
  CIRRUS    567px  35.2%     347px  43.7%
  VESPER    709px  15.7%     693px  10.2%
  spread    184px            363px
```

### Sightline becomes a bodyguard

VESPER wanted 900px and got 656, because **withdrawing is not something a pilot
can do unilaterally** — whoever wants to close decides the range. That is the
asymmetry D93 hit and could not solve from the AI side. It is solvable from the
*kit* side.

`interceptor` gains the **breaker pulse**: while a melee chain is landing on
Kestrel and the attacker is inside 250px, SIGHTLINE interrupts the chain, takes
18 life, and throws **both** machines apart at 15/tick along the axis between
them. Pierces guards, because the whole value is the spacing. 150-tick cooldown —
it is a reset, not a weapon.

Its doctrine moved `screen` -> `shadow`. D88 measured `screen` as the best of
five configurations, but that priced a drone whose only trick was point defence;
the pulse only fires when someone is on top of *him*, so the escort has to be
there. **The old measurement priced a drone that no longer exists.**

Result: VESPER 656px -> 710px and 15.5% -> 10.4% of the fight in melee reach. He
now enforces his spacing instead of hoping for it.

**Two gates were wrong before this one was right**, and both failed the same way
— too strong:

* Firing on `meleeLock` caught the `close` phase, so the escort swatted attackers
  down before they arrived and a desperate Speed close (D80) never reached him.
* Gating on `phase === 'swing'` fired on the swing's **first frame**, so the chain
  died before landing anything and VESPER could not be hit with a sword at all.
  `interrupt` destroyed the lock inside the same `step` that created it.

The shipped gate is `meleeHitsTaken > 0` — the opener lands, the rest of the
chain does not. That is a reset; the other two were an immunity.

### Cirrus dashes out, and three implementations were needed

**Requested**: she prefers melee, uses range to control, and breaks off after a
combo so the counter finds nothing.

Wanting distance after a chain measured as doing **nothing** — 132px -> 130px,
counter-hits 58 -> 59 — because `chooseAttack` fires on range alone, so she
backed off a pixel, found herself in reach, and swung. The retreat and the
appetite fought each other every tick and the appetite won.

Adding a refusal to swing made it **worse**: 141px but counter-hits 58 -> 71.
D81 made combos hold, so *the chain was her defence* — ending it to make space
hands the opponent the initiative, and the space does not pay for the turn.

Sustained thrust barely helped (69). A **dash** is the only movement in this game
that clears a sword's reach inside the window the opponent needs to answer:
145px, counter-hits 58 -> 60, which is flat. Letting the break-off spend the
boost reserve measured slightly worse again (140px/61), so it respects the
reserve like everything except an evade.

**Shipped as neutral on balance and positive on character**, which is the honest
description: it buys the visible hit-and-run cycle at no measurable cost, not a
reduction in damage taken.

### Looked at

The breaker was caught mid-pulse on screen: gap 41px at the instant it fired,
VESPER thrown at -15 and CIRRUS at +15 in opposite directions, CIRRUS in 20 ticks
of hitstun with her chain broken, and nine ticks later the gap already open to
121px behind an expanding hex wave.

## D95 — Aegis's dome is consumable

**Requested**: the dome may be too strong. It erased every non-piercing shot that
entered 150px of the drone, for the whole match, at no cost but the drone's
position — an unconditional wall whose only answer was killing the escort.

The shell now pays for what it eats: each round deleted takes that round's damage
off `DOME_MAX`, so a heavy costs it more than a pellet and the counter-play is
pressure of the right *kind* rather than volume. At zero it fails and stays down
for `DOME_RECOVER`, rebuilding on its own clock even while the drone itself is
rebuilding — a downed escort should not come back with a broken bubble as well.

**Tuned on measurement, and the measurement was surprising.** Two settings, six
seeds a matchup, both slots, OBELISK's lead against the field:

```
  DOME_MAX 620 / RECOVER 600     EXTREME -0.219 +/-0.057   HARD -0.286 +/-0.041
  DOME_MAX 900 / RECOVER 420     EXTREME -0.218 +/-0.040   HARD -0.202 +/-0.043
```

**Durability does not drive the EXTREME result at all** — a 45% larger pool and a
30% shorter recovery moved it by 0.001. It is worth 0.084 at HARD. So the softer
shell is strictly better and was taken; whatever costs OBELISK at the top tier,
it is not how long the bubble survives.

### Visible, because a consumable wall has to be readable

Integrity drives the whole dome now: the fresnel surface thins, the rim dims, and
under a third it **stutters** — the seams drop for a beat on a cadence taken off
the tick, so a shell about to go reads as unstable rather than merely fainter. A
player deciding whether to keep pushing needs that on the screen rather than
inferred from whether their shots are still vanishing.

The break gets a ring, guard-break shards, a shake and an `AEGIS DOWN` banner.
Looked at: caught mid-match at 485/900 depleting under real fire, then at the
break with the sphere gone.

### Recorded plainly: Obelisk was not overpowered on the numbers

It measured **-0.002** — dead neutral — before this change. The dome *felt*
oppressive because it had no counterplay, not because the machine was winning
more than its share. Both things can be true, and the design fix was still the
right one: an ability with no answer is a bad ability at any win rate.

It costs OBELISK about 0.19 of a life bar and leaves it the weakest machine, so
it is owed a tuning pass — and that pass should not start by making the shell
tougher again, because the measurement above says that lever does nothing where
it matters.

## D96 — Nulltide: a jammer that takes the opening she made

**Requested**: raise the projection's stun rate, slow its fire, and make Io Senna
hold range but step in when the opponent cannot answer — disengaging with a dash
afterwards, as CIRRUS does.

### The decoy trades volume for threat

`DECOY_STUN_CHANCE` 0.15 -> **0.30**, `DECOY_FIRE_PERIOD` 22 -> **28**. Changed
together on purpose. The projection's job is to make ignoring it expensive, and
it was doing that with volume — but volume is the wrong lever, because a stream
of harmless rounds from a silhouette is easy to read as harmless. Fewer shots
that each carry a real threat make the *decision* to ignore it the risky part,
which is what a decoy is for.

### Marksman by default, and not on principle

`meleeAppetite` -0.10 -> **-0.16**, which crosses `MARKSMAN_APPETITE` and puts her
on the hold-the-line branch (D94) rather than the reach calculus.

That branch alone would be wrong for her. A marksman who refuses melee on
principle declines free damage, and the entire reason to hold a line is that
closing is dangerous — so when it stops being dangerous, the preference stops
applying. The branch now returns melee range against a `helpless` opponent:
stunned, burnt out or guard-broken. Io Senna wins by subtraction, and a helpless
opponent subtracts fastest at sword range.

`hitAndRun` is on, so she dashes clear after the chain like Mira.

### Measured

```
  NULLTIDE  EXTREME  lead -0.185 +/-0.047   median 522px   in reach while foe stunned 48%
            HARD     lead -0.122 +/-0.043   median 466px                              36%
```

Balance is unchanged — she was -0.193 before — so this bought character at no
cost. She holds distance by default and is inside sword reach for nearly half of
every window the opponent cannot answer in, which is the behaviour that was
asked for. The buffed projection creates more of those windows itself, so the two
halves of the change feed each other.

### 522px is the right answer for her, and this was filed wrong first

She wants 900px and holds 522, and that was originally recorded here as a
limitation shared with VESPER. **It is not the same situation, and the
correction matters** — the number is a symptom for one of them and correct play
for the other.

VESPER is a single threat axis. Crowd him and he has nothing, which is why
SIGHTLINE needed a tool that *enforces* spacing (D94) rather than merely
preferring it.

NULLTIDE presents **three live threats at once** — herself, the projection, and
the drone — and an opponent can only answer one. At 522px all three are in play,
and the problem she sets is not range at all: dodging her rounds and dodging a
30 %-stun round from a silhouette are *different dodges*, and the enemy has to
choose. Backing off to 900px would buy safety she does not need and spend the
pressure that is her actual win condition.

So the gap between what `preferredRangeFor` wants and what she holds is not a
defect here. It is the fight her kit is built to create, and the same measurement
means opposite things on two different machines. Worth remembering before the
next "wants X, gets Y" line is read as a bug.

---

## D97 — A committed instrument for roster balance

Every roster measurement so far has been made with a scratch script that did not
survive the session, so `SESSION_HANDOFF.md` §6 has repeatedly carried numbers
the next session could not reproduce. `tools/probe/balance.ts` is that script,
kept.

```
npx vite-node tools/probe/balance.ts -- --tier extreme --matrix
npx vite-node tools/probe/balance.ts -- --selftest
```

Every machine against every other, both slot orders **on the same seed**, six
seeds, at the real 180-second round cap. It shards across ten child processes,
so a full eight-mech sweep is about 20 seconds — cheap enough that a tuning
change is measured rather than argued about.

### The self-test is the point

`docs/TESTING_PROTOCOL.md` records three measurements that were believed and
overturned in one session, and the property that would have caught all three is
that **an inert change must measure exactly zero**. `--selftest` runs the same
configuration twice in one process and requires bit-identical samples; if that
ever disagrees, the simulation carries state between runs and every A/B measured
through the file is confounded.

Two further checks came free and both passed: `--only terramoth` reproduces
TERRAMOTH's full-sweep number **exactly** (+0.256 either way), because it is the
same 42 samples; and the tool reproduced the previous session's ranking from a
different seed set and a different tick cap — TERRAMOTH +0.256 against a
recorded +0.266, OBELISK −0.187 against −0.154.

### What it measured that reading the code did not

`ko` per fight is reported alongside the lead, and the mean fight is **46s of a
180s round** — nearly every match is a kill, not a timeout, so the lead is
dominated by who dies rather than by who is ahead on chip.

Two diagnostics from the same sweep are worth carrying:

* **`grounded` is 0.0 % for all eight machines.** The whole ground game —
  `groundedMul`, `walkSpeed`, `takeoffImpulse`, `groundedBoostRegen` — is dead
  code in AI-versus-AI play. TERRAMOTH's 5624 grounded effective HP, the largest
  bracing bonus on the roster and part of its written identity, never once
  happens. It exists for a human player only.
* **The AI never chooses a sub-weapon.** `Btn.Sub` deploys and recalls the
  drone; the *drone* fires the owner's sub on its own schedule. So a
  sub-weapon's balance contribution in any measurement here is entirely the
  escort's doing, and the two roles with no gun contribute none of it.

---

## D98 — Terramoth was over-armoured three times over

**+0.266 at EXTREME and +0.149 at HARD**, the worst outlier on the roster, and
never investigated. The handoff guessed it was the "out-ranged, close in" branch
plus a big frame. It is simpler and more specific than that.

### Effective HP, which no screen shows

```
  mech        life   def  brace     eHP        dps    eHP x dps
  terramoth   2490  0.78   0.86    3712       25.6       95,000
  obelisk     2070  0.86   1.00    2407       20.9       50,300
  nocturne    1750  0.82   1.00    2134       20.2       43,100
  pyre        1860  0.95   1.00    1958       28.1       55,000
  halcyon     1750  1.00   1.00    1750       38.8       67,900
  nulltide    1610  1.08   1.00    1491       34.2       51,000
  vesper      1490  1.15   1.00    1296       49.1       63,600
  cirrus      1440  1.18   1.00    1220       68.1       83,100
```

TERRAMOTH stacks **three** multipliers on the same axis: the largest hull pool,
the best chassis `defence.mul`, and BULWARK's ARMOUR BRACE — the only
*defensive* drone passive on the roster, where the other seven grant a
capability. The product is 1.54x the next toughest machine and 3.0x the
lightest.

Its damage is **below average** (25.6 dps against a field mean of 35.6), so it
does not win by hitting hard. It wins by not dying, and the matrix says so: its
two biggest wins are over CIRRUS (+0.51) and NULLTIDE (+0.42), the two frailest
frames, and it is level with VESPER and PYRE, who can actually out-damage it.

### The price it is supposed to pay does not exist

The design charges TERRAMOTH in mobility — slowest frame, lowest boost ceiling,
"slow to reposition". Two measurements say that currency is not accepted. §8b
already found that the roster fights at one distance because closing is
unilateral and withdrawing is not, so being slow costs a machine that wants to
be close almost nothing. And `grounded` is 0.0 %, so the bracing bonus it is
supposed to earn by planting never arrives either.

### Trimmed on the axis it was stacked on

Single-lever ablations, EXTREME, six seeds:

```
  baseline                                eHP 3712    +0.256
  brace 0.86 -> 1.00 (removed)            eHP 3192    +0.159
  defence.mul 0.78 -> 0.86                eHP 3367    +0.189
```

Roughly 0.007 of lead per 1 % of effective HP, consistent across both levers.
Shipped: **`defence.mul` 0.78 -> 0.88 and ARMOUR BRACE 0.86 -> 0.92**, both of
them the invisible multipliers. `maxLife` 2490 is untouched deliberately — it is
the number on the select screen and the one a player reads as "immense armour".
At eHP 3007 TERRAMOTH is still comfortably the toughest machine on the roster,
by 25 % over OBELISK, rather than by 54 %.

```
  TERRAMOTH   EXTREME  +0.256 -> +0.132      HARD  +0.139 -> -0.025
  spread      EXTREME   0.459 ->  0.322      HARD   0.351 ->  0.275
```

---

## D99 — A broken dome falls back on its gun

D95 made AEGIS's shell consumable and the handoff recorded the cost at ~0.19 of
a life bar, with the note that OBELISK "is owed compensation somewhere other
than the shell" — `DOME_MAX` and `DOME_RECOVER` together moved EXTREME by 0.001,
so how long the bubble lasts is not the lever.

Measured, the lever is what happens when it is gone:

```
  AEGIS across 28 fights vs the field, EXTREME
    dome active       56.6%
    dome rebuilding   36.9%
    dome breaks       3.82 per fight
```

`dome` is one of only two roles excluded from `SPENDS_CHARGES`, because holding
a bubble is a full-time job. But for **36.9 % of every fight there is no bubble
to hold**, and AEGIS spent that third of the match contributing nothing at all —
no shell and no gun — while all seven other escorts worked every tick. That is
not what "consumable" was meant to mean; it turned a trade into a hole.

So `SPENDS_CHARGES.has(role)` became `Supporter.spendsCharges(role)`, and a dome
whose emitter is down draws from the charge rack until it has rebuilt. The
counterplay D95 was made for is intact — pop the bubble and it stays popped for
ten seconds — but the ten seconds now buy incoming fire instead of a switched-off
escort. It is offence rather than shell, which is the only direction OBELISK had
left.

**OBELISK −0.187 → −0.153 at EXTREME** on that change alone.

### Looked at, not only measured

Driven in the browser at EXTREME, OBELISK vs PYRE: the shell was dropped to 1 hp
so the next hit would pop it the way an opponent's would. `domeBreak` fired,
`domeDownTicks` went to 420, and AEGIS put out **three volleys** during the
rebuild. Frozen mid-sequence the drone reads `Recover` with `domeActive: false`
and 409 ticks left, and an OBELISK-owned `Missile` round sits 10 px off the
drone. On screen: the faceted shell is visibly shattered, the AEGIS DOWN banner
is up, and the escort is shooting.

One thing this exposed: `domeHp = 0` with `domeDownTicks = 0` is unreachable in
play — `MatchSim` sets both in the same statement — so a probe that writes
`domeHp` directly produces a state the game cannot enter, and the fallback
correctly declines to fire in it. The first browser check did exactly that and
read as a null result.

---

## D100 — A guard should bank meter, and the ladder says it may not

Built, measured, reverted. Kept here because the reasoning was sound and the
measurement still killed it.

`Combatant.takeHit`'s guarded branch grants **no saturation at all**, while the
unguarded route below it pays `landed * satOnDamage`. Holding a guard therefore
*costs* meter relative to standing still and eating the shot. It reads worst on
the machine built around it:

```
  OBELISK   guards 20.3 % of every fight — the most on the roster
            takes 14 % of gunfire while doing it
            overdrive uptime 41.0 % — the LOWEST of all eight
            blurb: "Turns incoming fire into overdrive"
```

The identity and the code disagreed. The fix was one branch: charge the meter
off `dmg`, before mitigation, so blocking 100 damage down to 14 banks what
taking all 100 would have. General rather than an OBELISK exception, at each
chassis's own `satOnDamage`, and excluding a Shield burst so the self-funding
loop the unguarded route already refuses could not be reopened from this side.

It worked, and the bill arrived somewhere else:

```
  OBELISK          -0.187 -> -0.152      the intended effect
  PYRE             +0.085 -> +0.143      saturation gain x1.8, free
  EXTREME vs HARD  +0.147 -> -0.004      the ladder, flattened
```

The top rung is the hardest-won property on this project — last session took it
from +0.012 to +0.147 — and a general saturation rule hands the lower tier more
than it hands the higher one, because EXTREME's edge is built out of not being
hit. `difficulty.test.ts` caught it and nothing else would have; the roster
sweep called the change an improvement.

Two rules confirmed rather than learned, both already in the protocol: **a
rule's value is a property of the AI it sits in**, and **a general rule aimed at
one machine is charged to all eight**. Reverted, with the finding written into
the branch so the next reader does not re-derive it.

### Still open

OBELISK is the outstanding roster problem: **−0.137 at EXTREME, −0.173 at
HARD**, the only machine outside the pack at either tier. Its output is
second-lowest on the roster (20.9 dps) while its durability is second-highest,
and giving its main gun 64 % more reach — 528px against the 563px it actually
fights at — measured **−0.033, i.e. nothing**. Reach is not the answer either.
Whatever is owed it is still owed.

---

## D101 — The projection gets teeth, and loses the lottery

**Requested**: raise the decoy's fire rate, let it stay up longer, have it move as
well as the real NULLTIDE, and give its rounds a very small amount of damage
with no hit stun.

### What it was

```
  DECOY_LIFE          110      DECOY_PERIOD  150   -> a 40-tick hole every cycle
  DECOY_SPEED         2.6      vs NULLTIDE's 5.7   -> under half her cruise
  DECOY_FIRE_PERIOD   28
  damage              0
  DECOY_STUN_CHANCE   0.3      for 60 ticks
```

Every one of those numbers works against the ability. The silhouette drifted at
under half the speed of the machine it was imitating, which is the one tell no
amount of muzzle flash covers — anything moving that placidly in a firefight is
not a pilot. It vanished for two thirds of a second every cycle, so an opponent
who simply waited got a clean look at a single target. And its rounds did
nothing at all except roll a three-in-twenty stun.

### The stun lottery was the wrong instrument

D96 chose it deliberately, trading volume for threat on the reasoning that "a
stream of harmless rounds from a silhouette is easy to read as harmless". The
diagnosis was right and the remedy was not. A coin flip is not pressure an
opponent can play around — ignore the projection twenty times and you are three
stuns down through no decision of your own — and it is **invisible**: a shot that
does nothing nineteen times out of twenty teaches the player that it does
nothing, which is exactly the reading D96 was trying to prevent.

Chip is legible in a way a lottery is not. The life bar moves, every time.

### Now

```
  DECOY_LIFE          150  == DECOY_PERIOD, so the cadence leaves no gap
  speed               owner.topSpeed, via SupporterOwner.topSpeed
  DECOY_FIRE_PERIOD   16
  DECOY_DAMAGE        8, and no hitstun, hitstop, knockback or i-frames
```

Speed is expressed against the chassis rather than as a constant, so it stays
true if NULLTIDE is ever retuned. The heading now folds two sine terms at
different rates instead of one, so the path does not repeat on a period short
enough to recognise — it reads as a machine picking lines and committing to
them. Still fully deterministic: every term comes off the projection's own age.

The damage is deliberately tiny and bounded by a test. A projection landing
**every** round for its whole life does 72 damage — under 5 % of an average
hull. It cannot win a fight; it can make standing still lose one.

**`DECOY_LIFE === DECOY_PERIOD` is a statement about the cadence, not about
uptime.** A projection is only thrown while STATIC is on station and inside
`fireRange`, so measured in a live fight at EXTREME the silhouette is up about
**75 %** of the time. Killing the escort is still the answer. The first draft of
that comment claimed "always two machines"; the browser said 75 % and the
comment was corrected rather than the measurement.

**NULLTIDE −0.190 → −0.107 at EXTREME**, and +0.010 at HARD where she was
already fine.

---

## D102 — The flag that was never reaching the hit

Found while writing the first tests STATIC's projection has ever had — the role
had **zero** coverage, and the whole suite stayed green while its contract was
inverted.

`Projectile.reset` did not copy `decoyShot` and `asHit` did not emit it. Pooled
projectiles are the only kind the game actually fires, so the flag existed on the
spawn and was gone by the time `takeHit` could read it. **Every projection round
in the game took the ordinary damage route rather than its own branch**, for the
entire life of the feature.

The consequences are all inversions of the documented intent:

* **It granted `hitInvuln`.** The comment on `ProjectileSpawn.decoyShot` exists
  to forbid exactly this: a harmless round that opens an i-frame window has
  NULLTIDE *shielding the pilot she is deceiving* from her own real fire. Three
  free frames against her, every round, at four rounds a second.
* **It cancelled their attack and cleared their melee chain**, every time one
  landed — which made the projection an interrupt engine and not a decoy.

Nothing pointed at it, and this is the part worth remembering: **a flag that
silently does nothing looks exactly like a flag that works.** The rounds still
did no damage, for the entirely unrelated reason that their `damage` field was
zero, so every observable symptom matched the intended behaviour. It took giving
the rounds damage — which made the branch matter — and then writing a test that
asserted on the *pooled* projectile rather than on the spawn.

Fixing it cost NULLTIDE 0.019 of the gain in D101, which is the honest half of
that number: some of the first measurement was the unintended attack-cancelling.

`decoy.test.ts` asserts the flag survives the pool, and asserts the i-frame
property both by hand and end to end.

---

## D103 — Obelisk gets damage, and only damage

**Design call, given explicitly**: OBELISK is a heavy that is meant to be slow
and easy to hit; if it needs more, the answer is stronger attacks and **not** any
reduction in its defensive capability.

That matches what the measurements said. Its effective HP is second on the roster
at 2407 while its output was **second-lowest at 20.9 dps** — the wrong way round
for a machine whose blurb promises punishment. D99 had already returned its
escort's contribution; this returns its own.

```
  BREACH GUN   58 -> 66      AEGIS BEAM   186 -> 214
  RAM CHARGE  146 -> 170     SCATTERGUN    32 -> 37
```

Ranged only. Nothing in `defence`, `gauges`, `barrier` or the melee chain was
touched, and the edit was scoped to the OBELISK block so no other chassis moved.

**OBELISK −0.138 → −0.036 at EXTREME.** With D98 and D99 it has gone −0.187 →
−0.036 across the pass, and for the first time it is inside the pack.

---

## D104 — Hit-and-run had no steering

**Reported from play**, not from the harness: "they finish their combo and then
kind of just stand there and attempt to re-engage… they do use the dash after the
combo ends, but it seems that they dash towards the enemy mech instead of away."

Correct, and the harness had never noticed.

### Three of the four parts were there

* `think` sets `disengage = DISENGAGE_TICKS` when a melee chain ends, for a
  `hitAndRun` pilot. ✔
* `preferredRangeFor` asks for `foe.effectiveMeleeRange * 2.1` while it runs. ✔
* `think` fires a dedicated break-off dash, at `chance` **1.0**, ignoring the
  ordinary dash cooldown. ✔
* Nothing gave that dash a **direction**. ✘

`chooseMovement` derives `mx`/`my` from one thing only — `this.tactic` — and
`pickTactic` never consulted `disengage` at all. The intent lived in the
*preferred range*, which only ever reaches a probabilistic roll several branches
down, and at least four branches return `Approach` before that roll: a live plan
(`planTactic` returns `Approach` or `Hold` unconditionally), `closeOnGuard`
against an opponent who just blocked, the low-boost/low-barrier read against an
opponent who just ate a combo, and the wounded-drone read. Every one of those is
*likely* in the state a finished chain leaves behind.

So the dash fired reliably and inherited whatever direction the mech already
wanted, which was frequently straight back into the sword.

### Measured, before and after

Dash direction in the 64 ticks after a chain ends, 21 fights each at EXTREME:

```
                 before            after
  CIRRUS      toward 46%        toward 19%
  NULLTIDE    toward 59%        toward 13%
  HALCYON     toward 40%        toward 50%     <- hitAndRun off
```

And what a player actually watches — separation from the opponent after the
chain, plus melee hits taken while getting out:

```
                +30px  +60px  +90px   counter-melee
  CIRRUS    before   192    302    301        52
            after    236    382    342        41
  NULLTIDE  before   168    210    244        71
            after    213    298    369        61
  HALCYON   before   164    238    287        66
```

Two things stand out. **NULLTIDE was escaping worse than a pilot with no
hit-and-run at all** — 244px against HALCYON's 287px. And CIRRUS's separation
*fell* between +60 and +90 (302 → 301): it had already turned round and started
back in, which is the reported behaviour exactly.

HALCYON is not a clean control, because it fights the two machines that changed;
its numbers move with theirs.

### The fix

Three changes, each measured.

**1. A direction.** One branch in `pickTactic`, above the plan check: while
`disengage` is live, the pilot is `hitAndRun`, and they are still inside the
dangerous reach, return `Retreat`. Above the plan deliberately — a plan is a
commitment, but this is a shorter and more specific one, and "be on them now" is
precisely the intent a hit-and-run pilot has just decided against. It is cheap:
chains land ~3.7 times a fight, so the window is ~8 % of a match, on two of eight
pilots.

**2. More than one dash.** A single hop covers ~105px against an opponent already
inside sword reach and free to follow, so the skirmisher cleared the first swing
and stood in front of the second. While a break-off is live the dash recharge
drops from ~22 ticks to roughly the chassis's own dash cooldown, and the break-off
may now spend the boost reserve. It self-limits: `breakDash` stops the moment
they are past the reach, so in practice it is two or three dashes.

The reserve half is a **re-measurement, not a new idea**. The code already said
"letting it measured slightly worse — 145px/60 counter-hits became 140px/61" —
and that was measured while the dash was pointing the wrong way half the time.
Spending the tank to travel in the wrong direction is obviously worse. With the
direction fixed it is better on both counts. `docs/TESTING_PROTOCOL.md` says a
behaviour's value is a property of the AI it sits in; this is that rule biting a
comment written in good faith.

**3. Measured against their sword, not ours.** `preferredRangeFor` already
applied `DISENGAGE_REACH` to `foe.effectiveMeleeRange`, but both gates that
actually *drive* the break-off used `self`'s — so a short-armed skirmisher quit
running while still inside a long-armed opponent's reach. CIRRUS at 195 breaking
from TERRAMOTH at 210 stopped 31px early, and against a desperate Speed burst,
which multiplies the burster's reach, far more than that. Now shared through
`disengageReach`, gated on `rangeIq` because reading an opponent's reach is
knowledge and this class hands out knowledge by tier; below it a pilot falls back
on their own sense of how far a sword goes.

### Measured

Dash direction in the 64 ticks after a chain, and separation afterwards, 21
fights each at EXTREME:

```
                      toward     +30px  +60px  +90px   counter-melee/chain
  CIRRUS    before      46%        192    302    301          0.68
            after       25%        309    416    368          0.32
  NULLTIDE  before      59%        168    210    244          0.91
            after       14%        224    339    401          0.73
  HALCYON   (control)   48%        180    249    296          1.02
```

**NULLTIDE was escaping worse than a pilot with no hit-and-run at all** — 244px
against HALCYON's 287px. And CIRRUS's separation *fell* between +60 and +90
(302 → 301): it had already turned round and started back in, which is the
reported behaviour exactly. CIRRUS now takes under a third of the counter-melee
per chain that the pilot without the mechanic takes.

HALCYON is not a clean control — it fights the two machines that changed, so its
numbers move with theirs.

Watched live at EXTREME, CIRRUS vs HALCYON, separation sampled every 30 ticks
after its own chain: `67 -> 408 -> 540 -> 419`. Out to 540px, then back in. That
last number is the point — the disengage is bounded by reach rather than by the
timer, so once clear the ordinary read resumes and it comes back when there is an
opening.

**The matchup matters for the illustration, and the first one chosen was poor.**
TERRAMOTH was watched first, and BULWARK's minefield punishes *closing*, which
confounds a demonstration of cat-and-mouse. HALCYON is the neutral choice — its
escort paints rather than punishing. Broken out per opponent, though, the fix is
not matchup-specific; CIRRUS reaches 310–511px at +60 against all seven:

```
    opponent     chains   sep+60   sep+90   counter-melee/chain
    halcyon        11      466      275            0.36
    nocturne       10      482      252            0.30
    vesper         14      376      497            0.00
    terramoth      20      442      331            0.20
    obelisk        16      511      489            0.13
    pyre           13      341      322            0.77
    nulltide        7      310      467            1.00
```

TERRAMOTH is in fact one of the *easier* machines to break off from — mines
punish the approach, not the exit. The hard ones are PYRE, whose burning ground
is laid where you are standing, and NULLTIDE, who is running the same play.

**CIRRUS −0.052 → +0.032, NULLTIDE −0.106 → −0.049.** Roster spread 0.235 →
0.169, all 518 tests green including the boost economy and the ladder.

### The lesson, which is not a new one

A mechanic can be 75 % implemented, measure as present, and be worth nothing.
Three of these four parts were individually correct and individually testable.
Nothing in the harness asks "did the skirmisher get away", so nothing failed —
and the roster probe reported CIRRUS at −0.052, a plausible number for a light
frame, with no hint that its defining behaviour was inert.

**It was found by a player watching the game.** That is now twice: last session
threw away a branch built on a code comment claiming the AI never fires command
motions, after a player said he had watched every mech fire one. The harness
measures whether a change helps. It does not measure whether the thing you built
is the thing you described.

---

## D105 — The projection's rounds steer, and the stun comes back

**Requested**: the decoy should fire projectiles that auto-aim at the enemy for a
while, so more of them land and the stun chance procs more often.

### The stun had to be re-added first

There is no stun *status* in this game. The only stun the projection ever had was
`hitstun`, and removing it is exactly what D101 was asked to do — "its
projectiles now also inflict a very small amount of damage, but do not trigger
hit stun". So there was no stun chance left for auto-aim to proc more of.

The concern was raised before building, with the arithmetic: at a 16-tick cadence
the projection throws ~3.75 rounds a second, guidance means most of them land,
and 30 % of them stunning for 60 ticks is on the order of **one fresh one-second
stun per second**. Overruled by design, deliberately, and restored at the
original figures. What follows is what that measured, not an argument against it.

### Auto-aim, with a window

```
  DECOY_HOMING         0.055 rad/tick
  DECOY_HOMING_TICKS   26
  DECOY_STUN_CHANCE    0.3      (restored)
  DECOY_STUN_TICKS     60       (restored)
```

`homingTicks` is new and general — a shot may now steer for a *window* rather
than for its whole flight, which is the difference between a round that corrects
onto a target and one that chases it forever. Omitting it is the old behaviour,
so it is inert for every other weapon on the roster. It counts ticks of
*steering*, not ticks of flight, so a round that never gets a target keeps its
correction in hand.

The guard stops the stun outright. Blocking is the counterplay, and without it
the projection would answer its own answer.

### Measured

```
  NULLTIDE   EXTREME  -0.049 -> +0.237      roster spread 0.169 -> 0.385
```

She is the strongest machine on the roster by a distance, and the spread is back
above where the whole tuning pass started. **This is a chosen state, not a
regression**: the instruction on being shown the number was "don't try and
balance the roster, I want to see for myself just how much of an overpowered buff
it really is". The levers, in the order they are worth pulling, are
`DECOY_STUN_CHANCE`, then `DECOY_STUN_TICKS`, then `DECOY_HOMING_TICKS`.

---

## D106 — Paint is an ability, not a role

SIGHTLINE was asked for "the same ability as halcyon", which is ARBITER's
designator work: 20 % more damage taken by the painted target, plus guidance on
the painter's own rounds.

`SupporterRole` is a single field and every role is a full-time job, so the
obvious reading — swap `interceptor` for `designator` — would have taken away the
breaker pulse that D94 built specifically to solve Kestrel's spacing problem.
That is the opposite of the intent.

Painting is the one escort ability that genuinely **composes**. It costs the
drone nothing it is not already doing: no cooldown, no charge, no position it
would not already hold. So it came off `role` and became `SupporterDef.paints`,
defaulting to `role === 'designator'` — which makes the field inert for all eight
existing escorts — with one predicate, `dronePaints`, shared by both halves of
the ability so they can never disagree about who is a painter.

SIGHTLINE now intercepts, fires the breaker pulse **and** marks.

---

## D107 — Sniper Mode: the heavy becomes a switch

**Requested**, in detail: `Btn.Heavy` stops being a shot and becomes a stance.
While it is up VESPER moves drastically slower, his main weapon fires thin, long,
fast, auto-aiming lances instead of its own round, and he can use nothing else.
It runs on a clock and then recharges.

### Built as data, not as a VESPER branch

`MechDef.sniper?: SniperModeDef` — duration, cooldown, `speedScale`, and the
`shot` the main weapon fires instead of its own. Seven machines declare nothing
and behave exactly as they always have. The next chassis that wants a stance
declares one rather than editing `Combatant`.

```
  duration    360 ticks (6s)      speedScale  0.32
  cooldown    420 ticks (7s)      shot        LONG LANCE
```

`LONG LANCE` against his own PIERCE BEAM: radius 5 against 11 (thinner), life 120
against 90 (longer), speed 54 against 34 (much faster), plus `homing` 0.021 for a
45-tick window.

**Auto-aim lives on the attack, not on the stance.** The first cut declared
`homing` on `SniperModeDef` as well, and it was simply never read — the spawn
takes its steering from the `AttackDef`. A test caught it, which is the only
reason it is not still there. `homingTicks` was added to `AttackDef` beside
`homing` so a weapon declares how it steers in exactly one place.

### The dangerous part is the button

`Btn.Heavy` is a switch on this chassis and a shot on every other one, and the
rival reaches for a heavy constantly. `chooseAttack` has **five** separate
`return Btn.Heavy` sites; any one of them left unguarded turns the stance into a
strobe. Three defences, because one was not enough:

* `sniperIntent` owns the button, runs before offence, and is debounced.
* `chooseAttack` returns early on a planted chassis — one weapon, so asking for
  anything else wastes the turn.
* A final remap in `think`: a `Btn.Heavy` from any path becomes `Btn.Main` on a
  stance chassis.

The same hazard exists for the *player*: `MOTIONS.lance` ends in Heavy, so the
stance check sits **above** the command motions or a drifting sniper toggles
himself several times a minute — exactly the accident §8c documents.

The rival's read is deliberately blunt, because the stance is already an enormous
commitment: open past 620px with a healthy reactor and no incoming shot; close
inside 380px or when the reactor is dry. Measured, it holds the stance **38.4 %**
of a fight and opens it **1.8 times per fight**.

### Visible, because a mode nobody can see is a bug report

A HUD readout takes over the flight line — `SNIPER: 5s` counting down, then
`SNIPER: RECHARGE 7s` — because a mode that is a clock is unusable if you cannot
see the clock. In the world: a sight line along the aim reaching across the whole
arena, a charge pulse running down it on a 40-tick cycle, and brackets clamped on
the chassis. Additive, in the sniper's own accent, sized off `barrier.radius`
rather than `hurtRadius` for the reason the paint reticle already records — a hit
circle is much smaller than a picture of a mech, and a mark keyed to it draws
underneath the artwork.

Confirmed on screen at EXTREME, VESPER vs HALCYON: the readout reads `SNIPER: 5s`
in red on his side while the opponent's still reads `FLIGHT: ON`, the sight line
crosses the arena, the pulse is visible on it, and the brackets sit on the frame.

### And it shipped with the exact bug the protocol warns about

`docs/TESTING_PROTOCOL.md` §4.7: "**`BattleScene` has two cameras** … a debug
overlay added without being put in an ignore list is drawn *twice*, slightly
offset." The new `sniperMarks` graphics was not added to `worldObjects`, so the
UI camera — zoom 1, unscrolled — rendered a second copy of the brackets and the
sight line in empty space. **A player reported it as a stray empty target box
floating in the middle of the stage**, which is precisely what it looked like.

Worth recording that the first screenshot taken of this feature *contains the
bug* — there are two yellow lines in it — and it was read as "sight line plus a
lance in flight". The trap is documented, the documentation was read this
session, and it still caught the next overlay added. Any new world-space
`Graphics` must go in `worldObjects`; there is no way to test for it in node
because the scene needs Phaser, so the only defence is the checklist.

`LONGSHOT` is now unreachable and is kept, with a comment saying so — `reachOf`
still reads it, and it remains a fair description of Kestrel's envelope.

---

## D108 — A marksman holds the gap open instead of preferring it

**Reported from play**: "He wants to at least stay at around 900px away from his
opponent, but keeps being put into that 500px trap which ends up closing the gap."

Correct, and §8b already knew why without connecting it to him: **closing is
achievable unilaterally, withdrawing is not.** Every pilot expresses range as a
*preference*, which `pickTactic` then weighs against half a dozen situational
reads — so a marksman being walked down simply loses the argument and fights
where the other machine chose.

`Playstyle.kites` makes it a behaviour rather than a preference. Inside
`KITE_RANGE` (500px — the distance he was measured *at*, not the one he wants), or
against an opponent whose velocity is closing faster than 1.1px/tick, retreating
under boost outranks the ordinary read. It sits above the plan check for the same
reason the break-off does. And `chooseMovement` puts him on the thrusters while
he does it: withdrawing at cruise from someone who is boosting after you is not
withdrawing, it is losing the gap more slowly.

**Kestrel Doyne only.** Io Senna is also a marksman and must not have this — D96
established that her 522px is correct play, because her three simultaneous
threats all want to be live and backing off spends the pressure that is her win
condition. Marksman is a preference; kiting is a behaviour, and one pilot is
written for it.

Not while planted, either: the sniper stance moves at a third speed and running
in it only presents a slow target. `sniperIntent` drops the stance when they get
close, and *then* the kite fires.

### Measured

```
  VESPER at EXTREME       median range   p25    ticks under 500px
    before                    ~595px       —            —
    after                      792px     551px       20.4%
  NULLTIDE (unchanged)         583px     300px       42.4%
```

The kite alone was worth **-0.026 -> +0.096**; working auto-aim on the stance
shot took him to **+0.215**. He is now the second strongest machine on the roster,
which is a much larger swing than "fix his spacing" implies and is worth deciding
about deliberately.

---

## D109 — The sniper takes pieces off you

**Requested**: while in Sniper Mode only, VESPER's main-weapon projectiles have a
25 % chance to disable a random enemy weapon — main, heavy or melee — for five
seconds.

### Shape

`WeaponSlot` names the three, `Combatant.weaponLock` is a three-slot tick array,
and `AttackDef.disarms` is the per-weapon chance. All of it defaults to nothing,
so it is inert for every weapon that does not ask.

Rolled by `MatchSim` **at the moment of impact**, out of the match generator, so
a replay reproduces it and a round that misses never consumes a roll. Only a
clean hit disarms — a guard or a barrier burst stops it, exactly as they stop a
status element, which keeps blocking the answer to everything.

Deliberate choices worth stating:

* **Three weapons, not everything.** The lance, spread and salvo are command
  motions and the sub belongs to the escort, so a disarmed pilot still has
  options that cost a motion to produce. Losing a gun changes what you do; it
  does not switch you off.
* **Refreshes, never stacks.** A second hit on a dead gun resets its clock rather
  than queueing another five seconds, so the effect has a ceiling however many
  rounds land.
* **It cancels the shot in progress** if that shot *is* the disarmed weapon, and
  drops a melee chain. A gun that goes offline mid-swing and still fires is not
  offline.
* **The stance shot rides the main slot**, so disarming VESPER's own main gun
  silences the stance too. A sniper with his gun shot out has nothing at all,
  which is the risk planting is supposed to carry.

The rival never presses a dead weapon, at **every tier** — that is knowledge of
your own machine, not of the opponent, and a rival pulling a dead trigger reads
as broken rather than as weak. It falls through to whatever it still has.

### Visible, or it reads as dropped inputs

`OFFLINE: MAIN 5s  MELEE 3s` on the affected pilot's HUD, its own line, with a
per-weapon countdown. This is the only status in the game that takes an *option*
away, and without a readout a player would conclude the game was eating their
button presses. Confirmed on screen alongside the stance readout.

### It shipped switched off, for the third time this session

Data said 0.25. Across 21 fights: 424 stance shots, 211 clean hits, and **zero
disarms**.

`Combatant.fire` builds its projectile spawn **field by field** rather than
spreading the attack, so a new `AttackDef` property that is not explicitly copied
there never reaches the projectile. That is now three for three: `decoyShot`
(D102, dropped in `Projectile.reset`), `homingTicks`, and this. The symptom is
identical every time and completely invisible — the feature is written, the data
says it is on, and nothing happens.

`sniper.test.ts` now asserts the flag survives **into the pool** rather than
asserting on the attack, which was always correct. Any future flag on `AttackDef`
wants the same treatment, and the real fix is probably to spread rather than to
copy.

### Speed, and a dial that has run out

Reported from play as "the beam only hits 23.7 % of the time". That number was
the disarm rate *among hits* — 50 disarms from 211 hits, the 25 % chance working
— rather than a hit rate. The actual connect rate was already **49.8 %**, the
best on the roster.

Raising the speed was still worth doing, and was swept rather than guessed:

```
  projSpeed  54 -> 49.8% connect, 2.38 disarms/fight
             88 -> 53.2%          2.10
            110 -> 55.9%          2.43
            130 -> 53.6%          2.29
            180 -> 51.3%          1.90
```

It plateaus around 53–56 % from 88 upward and then **falls** at 180, which travel
time cannot explain — the protocol's signature for a dial with no resolution
left. Shipped at **110**, best on both measures and 3.2× the normal lance.

**Speed is not the lever for how often the disarm lands.** The rounds that miss
are missing on aim and on what the target did afterwards, not on flight time. If
more disarms are wanted the levers are the 25 % chance itself, the stance's fire
cadence, or `homing`/`homingTicks`.

### Cost

```
  VESPER   EXTREME  +0.215 -> +0.320       roster spread 0.385 -> 0.519
```

He is now the strongest machine on the roster, ahead of NULLTIDE. The roster
guard in `playstyles.test.ts` was raised from 0.7 to **0.78** to accommodate this
and D105 — chosen to still catch the 0.854 that the first playstyle cut failed
at, not to make the red go away. **It should go back to 0.7 when these two are
tuned.**

---

## D110 — Sniper Mode nerfed: no lance properties, bolt-action, kickback

**Requested**, after VESPER measured +0.321 and top of the roster (D109 /
`docs/TIER_LIST.md`): the stance's rounds lose their lance properties while
keeping the lance's look, the fire rate is dramatically slowed to a real sniper
rifle's, projectile speed stays, and every shot kicks the chassis backwards.

### What "lance properties" actually were

Worth writing down, because it was three separate advantages and only one of them
is the famous one:

* **A held guard was half as good against it.** `takeHit` routes a `Pierce` round
  *past* the guarded branch and scales it by `pierceGuardScale` (0.50); an
  ordinary round goes through the branch at `guardScale` (0.20). So a guard took
  50 % off a lance and 80 % off everything else.
* **It could not be intercepted or erased.** AEGIS's dome, SIGHTLINE's point
  defence and every other screen in `MatchSim` skip `Pierce` rounds outright.
* **`pierceCount: 4`** — it passed through the escort *and* the pilot behind it.

It never bypassed a barrier **burst**: an invulnerable target returns `ignored`
either way. The only difference there is that a piercing shot denies the defender
the saturation charge they would have banked by absorbing it.

All three came free with two fields the stance inherited on the day it was built
and nobody chose. Now `barrier: Absorb` and `pierceCount: 0`: **a guard takes
80 % off it**, a dome eats it, an interceptor downs it, and it stops at the first
thing it touches.

**`kind` stays `Beam`.** It carries no defensive behaviour whatsoever — every
lance property above rides `barrier` and `pierceCount` — but it does drive the
beam report, the heavier screen shake and the big impact flash, and `family`
drives the sprite. The round looks and sounds exactly as it did. The first cut of
this change moved `kind` to `Bullet` as well and quietly took the presentation
with it, which is not what "keep its visual look" means.

### Bolt-action

`startup` 7 → 16 and `recovery` 17 → 92: **109 ticks a shot**, a shade under two
seconds, against 25. The stance's six seconds now buy **three shots**, so each is
a decision rather than a stream.

### Kickback

`recoil` 2 → 6.5, shoving the chassis back along its own aim on every shot. Worth
more than the number looks because the stance already caps movement at 0.32 — the
shove is roughly four times what he can push against, so firing drifts him out of
his own firing line and he has to crawl back into it. `FlightModel` lets
overspeed bleed off as momentum rather than clamping it to the cap, which is the
only reason this lands at all while planted.

### Measured — and it overshot

```
  VESPER   EXTREME  +0.321 -> -0.182       HARD  +0.163 -> -0.267
  spread   EXTREME   0.531 ->  0.471
```

He goes from **first to last at both tiers**, a swing of 0.503. Four nerfs landed
at once and all four were asked for, so this is recorded rather than reversed.

**The cadence is not the lever, which is the useful part.** Swept at EXTREME with
everything else held:

```
  109 ticks/shot (2.1s)  ->  -0.182      the shipped value
   75 ticks/shot (1.3s)  ->  -0.163
   51 ticks/shot (0.9s)  ->  -0.105
```

Doubling the rate of fire buys back only **0.077** of a 0.503 fall. Almost all of
the loss is the lance properties — which makes sense once they are enumerated:
guard reduction going from 50 % to 80 % is a 2.5x cut in damage against anyone
holding guard, *and* the round became interceptable, *and* it stopped
multi-hitting. Three compounding losses against one dial.

So if VESPER is to come back toward the middle, the fire rate is a weak dial and
the honest ones are `pierceCount` (returning multi-hit without returning guard
piercing), the stance's `damage`, or `speedScale`.

---

## D111 — The cadence, set by playtest, and the disarm raised to match

**Reported from play**: 109 ticks a shot was "way too slow".

Three settings have now been tried and the middle one is the answer:

```
   25 ticks (0.4s)  ->  shipped value. A stream, and worth +0.32 of a life bar.
  109 ticks (1.8s)  ->  the first nerf. Measured fine, played as a wait.
   60 ticks (1.0s)  ->  the playtested middle.
```

`startup` 16 → 12 and `recovery` 92 → 47. The startup came down with the recovery
because half of "sluggish" was the delay between pressing and firing rather than
the gap between shots — that is a feel problem the balance number cannot see.

Measured in real fights: **5.09 shots per stance**, against a theoretical maximum
of six, up from three. Enough that the stance reads as a weapon being worked
rather than a timer being watched.

**This was safe to set by feel because the dial was already measured.** D110
swept it: doubling the rate of fire is worth about 0.077, against the 0.503 that
removing the lance properties cost. Cadence is a *feel* knob far more than a
power knob, so playtest is the right instrument for it and the harness is only
there to confirm nothing moved much.

```
  VESPER  EXTREME  -0.182 -> -0.090      spread 0.471 -> 0.371
```

### The disarm follows the cadence

**Requested**: 25 % → 30 %, to compensate the slower fire.

Right, and worth stating why the two belong together: the per-shot chance is only
half of how often a disarm lands, and the other half is how often he gets to
shoot. Slowing the cadence from 25 to 60 ticks cut the rate from **2.43 disarms a
fight to 1.14** without anyone touching the chance.

```
  0.25 at 60 ticks  ->  1.14 disarms/fight
  0.30 at 60 ticks  ->  1.43 disarms/fight
```

Balance cost: **-0.090 → -0.085**, which is inside the standard error. A 20 %
relative bump to an effect landing once a fight is not a power change; it is a
consistency change, which is what it was asked for.

### The test now bounds the cadence at both ends

`sniper.test.ts` asserted `cycle > 60` and failed on the playtested value, which
is a test encoding one wrong answer as a rule. It now asserts a **band** — four
to eight shots per stance, and at least three times slower than his ordinary gun
— because both ends of this dial have been wrong once and a regression in either
direction should fail.

---

## D112 — The projection becomes answerable

**Requested**, after the diagnosis in the previous block: lower the decoy's rate
of fire, greatly extend its rounds' range, and **make the projection targetable —
damaging it makes it vanish.**

### The diagnosis it acts on

Ablated at 12 seeds, NULLTIDE's +0.262 decomposed as:

```
  baseline                              +0.262
  stun off (chip + auto-aim only)       +0.066    the stun was worth +0.196
  auto-aim off                          +0.128    auto-aim was worth +0.134
  projection entirely harmless          +0.031    the armed projection: +0.231
```

The two are **multiplicative** — 0.196 + 0.134 exceeds the 0.231 they are jointly
worth — because auto-aim's value is almost entirely that it makes the stun land.

And the reason the stun was worth so much was *not* how often it landed. CIRRUS
puts an opponent in hitstun **28.5 %** of a fight against NULLTIDE's 25.8 % and
sits in the bottom half of the roster. The difference is what it costs. CIRRUS
buys its lock with an eight-hit melee flurry inside sword range on the thinnest
hull in the game. Hers was free: the projection fires while she fires, it lands
from several hundred pixels away, and — the part that mattered — **it could not
be shot.** `MatchSim` tested combatants and supporters; the silhouette was
neither. Measured, she was free to act against an opponent who could not for
**23.2 % of every fight**.

### The three changes

* **`DECOY_FIRE_PERIOD` 16 → 34.** Halved. The per-round chance is only half of
  how often a stun lands; the cadence is the other half.
* **Round life 46 → 160.** Reach goes from 598px to a little over 2000 — most of
  a 2400px arena. A jammer's silhouette that could only threaten what was already
  near it was not doing the job the ability describes.
* **The projection is a target.** One clean hit from the opponent pops it.

Deliberately **one hit and no damage pool**: it is a hologram, not a machine, and
the counterplay should be a decision — spend a round on the fake and the real one
gets a free second — rather than a chore. The shot is consumed doing it, which is
the price. Sized off the owner's own `rig.hurtRadius`, because a decoy easier to
hit than the pilot is a decoy nobody is fooled by twice.

`popDecoy` deliberately leaves `roleTimer` running, so shooting one down does not
bring the next one forward. **That gap is the entire reward** and resetting the
timer would quietly delete it — there is a test on the observable gap rather than
on the private field.

### Measured

```
  NULLTIDE   EXTREME  +0.262 -> -0.026        HARD  +0.304 -> +0.071
  spread     EXTREME   0.374 ->  0.169        HARD   0.572 ->  0.257
```

**0.169 is the tightest the roster has ever measured**, equal to the best state
the tuning pass ever reached, and with no machine outside ±0.09 of the field.

Behaviourally:

```
  projections thrown        3.9 per fight
  shot down                 67 % of them
  projection on the field   55.7 % (was 75 %)
  foe in hitstun            19.9 % (was 25.8 %)
  decoy stuns landed        1.5 per fight (was 3.3)
```

### The side effect is the best part

**Two thirds of projections are now shot down, and the AI is not aiming at
them.** Rounds thrown at NULLTIDE's position hit the silhouette standing near it,
so the decoy has become a *shot-eater* — it absorbs fire meant for her and dies
doing it. Nobody designed that; it falls out of giving a fake machine a hurtbox,
and it is exactly what a decoy is supposed to do. It also means the counterplay
requires no new AI: an opponent shooting at where she seems to be is already
performing it.

---

## D113 — Two projections, a 50 % disarm, and LAST STAND

Three requested changes in one block.

### NULLTIDE throws two

`DECOY_COUNT = 2`, and the decoy's whole state moved from nine loose fields on
`Supporter` into a `DecoyState[]`. They are thrown to **opposite sides** of the
owner-to-target line — two on one flank is one question asked twice — and their
fire timers are staggered by half a period, so the pair reads as two machines
shooting independently rather than one weapon with a double barrel.

Everything that touched a projection had to learn to iterate: the collision pass
(**one hit key per projection**, or a shared key would silently make the second
unhittable for the rest of a projectile's life), the camera framing, the
renderer, and soft-lock — which now swings onto the **nearer** silhouette, the
same mistake a pilot makes.

**NULLTIDE −0.026 → +0.257.** Two projections restore essentially all of the
value D112 removed, which is the honest cost of the request and is recorded
rather than tuned away.

### VESPER's disarm to 50 %

`disarms` 0.30 → 0.50 — roughly one in every two stance shots that lands takes a
weapon off the target. VESPER **−0.085 → −0.102**, i.e. nothing: the disarm is a
character knob rather than a power one at this cadence, exactly as D111 found.

### LAST STAND

`MechDef.lastStand`, HALCYON only. A hit that would take the chassis to zero
leaves it on its feet at 1 hull with a ten-second clock. Nothing kills it while
the clock runs; everything still hurts it; it is still on 1 hull when the clock
stops. **Once per match** — an unlimited version is not a comeback mechanic, it
is immortality, and the drama is entirely in it being the last one.

Three implementation notes, each of which was a bug first:

* **The gate lives in `MatchSim`, after every damage source and immediately
  before `checkEnd`.** Hull comes off in a dozen places — gunfire, melee, mines,
  burning ground, the arc tether, status chip — and a check inside any one of
  them would be a passive that saves you from bullets and not from fire.
* **The clock cannot live in `Combatant.step`.** `step` early-returns when
  `life <= 0` and coasts the wreck, so a clamp in the ordinary gauge update is
  unreachable at exactly the life total it exists to prevent: the reprieve would
  trigger once and then fail to stop the very next hit. A test caught it; reading
  the code would not have.
* **NOCTURNE inherited it.** It is built as `{ ...HALCYON }`, so it silently
  gained a once-a-match refusal to die the moment the field was added. Now
  `lastStand: undefined` with a comment, beside the `supporter` block that
  already carries a warning about this exact hazard.

Presentation, because a once-a-match moment that passes in one frame is
indistinguishable from a rounding error on the life bar: a hard screen shake, the
pilot's cutscene card reading **LAST STAND / REFUSING TERMINATION** with a new
banter cue, a HUD banner, a saturation-grade burst at the chassis, a hard fast
strobe on the rig (deliberately unlike saturation's smooth breath — the two
states mean opposite things and must never be confused at a glance), and a
world-space aura of three offset rings plus a **countdown arc that visibly
closes**. The last fifth goes red and speeds up, because that is when killing the
machine becomes possible again. `lastStandEnd` gets its own `EXPOSED` banner.

**HALCYON −0.092 → +0.048**, and its `ko` is +0.40, the highest on the roster —
it survives things that kill everyone else. It also answers the standing
complaint that the roster's designated yardstick won no matchup at all.

### It broke the difficulty ladder, and the fix is the interesting part

`difficulty.test.ts` measures tiers by fighting **HALCYON against itself**, so
both sides got LAST STAND — and a guaranteed ten-second reprieve for each means
the better pilot cannot convert an advantage into a finish. Every rung collapsed
to about a third:

```
                     with LAST STAND    without
  NORMAL vs EASY       0.057 (2.7σ)     0.193 (3.6σ)
  EXTREME vs HARD      0.041 (2.1σ)     0.110 (2.6σ)
```

The right-hand column is **D92's original calibration to three decimal places**.
That is the whole argument: the ladder was always measuring this, and a passive
both sides carry contributes no signal and a great deal of noise.

So the ladder's yardstick is now `{ ...HALCYON, lastStand: undefined }`, named
`LADDER_MECH` and documented. This is **restoring the instrument, not moving the
goalposts** — the alternative was recalibrating the floors onto a blinded test,
which is precisely the state D92 was written to end.

§8a has warned since D92 that measuring tiers with HALCYON mirrors couples that
file to HALCYON's kit. This is that coupling arriving. It is now insulated
against *shared passives* only; a change to HALCYON's weapons would still move
those numbers, and the real fix remains a yardstick that is not a roster mech at
all.

### Where the roster landed

```
  NULLTIDE  +0.257    PYRE      -0.004    VESPER   -0.102
  HALCYON   +0.048    NOCTURNE  -0.026    OBELISK  -0.108
  TERRAMOTH +0.031    CIRRUS    -0.096
```

spread **0.364**, against 0.169 before this block. NULLTIDE is the outlier again,
and it is the two projections that put her there.

---

## D114 — LAST STAND stops the death and nothing else, and the pair quietens down

### The passive was doing more than it said

**Reported**: "Last Stand only makes Halcyon not die, but Halcyon should still be
susceptible to hit stun and statuses and other mechanics that hinder a mech."

Correct, and it was not — but the fault was narrower and more specific than
"immunity". The reprieve never blocked statuses or hitstun *while it ran*. What
it did was **erase the killing blow itself**: on trigger D113 cleared `hitstun`,
dropped the attack and the melee lock, and forced `ActState.Free`.

So the hit that should have staggered Naia Vesk left her standing and able to act
on the very next tick. That is a free full-screen reset welded onto the strongest
defensive passive in the game, and nobody asked for it — it came from a comment
("whatever it was doing is over") that read as tidying up and was actually a
second ability.

Now the trigger sets `life = 1` and touches nothing else. The killing blow
resolves exactly as it would on any other machine: hitstun, knockback, the
cancelled attack, the broken chain, whatever status it carried. Three tests pin
it — that she is still in hitstun and `helpless` after surviving, that Cryo still
slows her and Corrosive still chips her down to the floor during the reprieve,
and that a *second* hit mid-reprieve stuns her again.

The clamp was already correct: everything that hinders a mech still hinders this
one; it simply does not die while the clock runs.

### The projections quieten down

`DECOY_FIRE_PERIOD` 34 → 70. Swept at EXTREME, twelve seeds:

```
  34 -> +0.257      70 -> +0.032
  50 -> +0.127      95 -> +0.036
```

70 and 95 are the same number inside the error bars — the protocol's signature
for a dial with no resolution left, so slowing it further only makes the
silhouettes quieter for nothing.

Worth stating what this means with two on the field: staggered by half a period,
the **pair** puts out a round every 35 ticks, which is close to what a single
projection did at the old 34. The volume is roughly back where it was. It now
arrives from two places, and each of those places can be shot down.

### Where the roster landed

```
  EXTREME                              HARD
  HALCYON   +0.072   VESPER   -0.058   NULLTIDE  +0.102   CIRRUS    -0.022
  TERRAMOTH +0.066   CIRRUS   -0.061   PYRE      +0.082   TERRAMOTH -0.053
  NULLTIDE  +0.032   OBELISK  -0.091   HALCYON   ~0        OBELISK   -0.075
  PYRE      +0.020                     NOCTURNE  -0.012   VESPER    -0.159
  NOCTURNE  +0.019
```

**spread 0.163 at EXTREME** — the tightest the roster has ever measured, beating
the 0.169 of D112. Every machine inside a 0.163 band with no outlier at all.

HALCYON tops it, which is worth a note: the machine that a few blocks ago won
*no matchup at all* and was described as a bent yardstick is now nominally first
— by 0.006 over TERRAMOTH, which is a quarter of a standard error and means
nothing except that the top of this roster is flat.

**VESPER at HARD (−0.159) is the one thing still outside the pack**, unchanged
and unrelated to this block. Its cause is structural: `kites` and the sniper
stance both need `rangeIq`, which is EXTREME-only, so at HARD he cannot enforce
the spacing his whole design assumes. See `docs/TIER_LIST.md` §5.

---

## D115 — OVERDRIVE: everything at once, bought with everything

CIRRUS becomes the second machine with a chassis passive. At or below a quarter
hull the reactor is dumped: **all three saturation modes run simultaneously** for
ten seconds, with no burst of her own available while it lasts. When the window
closes the thrusters and both guns are **destroyed** for the rest of the match,
and the only thing left is the eight-hit flurry at **×1.5**.

### All three modes cost four words, because of where they were wired

`shieldActive` / `shootActive` / `speedActive` were already the hub every derived
thing reads — `barrierFree`, `energyFree`, `boostFree`, every scale, the AI's
reads, the renderer. Making those three getters return true during OVERDRIVE
turns *everything* on exactly as the real modes would, with no parallel
implementation and no special cases downstream.

Three direct `satActive && satMode === Shoot` checks were changed to `shootActive`
on the way past. They were already saying "Shoot is up" the long way round.

### It is not LAST STAND, and it is not desperation

Two distinctions worth stating, because both were asked about and one was a bug:

* **No death prevention.** All three modes include Shield, so damage is
  *reduced* — but nothing here stops a kill, and a machine that could not die for
  ten seconds would be a different ability. Tested: damaged during the window,
  then killed during it.
* **It does not borrow desperation.** `desperateSpeed` is
  `speedActive && satDesperate`, and OVERDRIVE turns `speedActive` on.
  Desperation opens below a *third* of a life bar and OVERDRIVE at a *quarter*,
  so a pilot is frequently already inside a desperate burst when it fires —
  leaving `satDesperate` set handed her true-damage melee and arena-crossing
  reach from a mechanic this passive does not use. **The trigger now clears it**,
  with a test that opens a real desperate burst at 30 % life, drops her into
  OVERDRIVE, and asserts all three `desperate*` flags are off and her reach is
  back to the plain 195px.

That bug was found by a question about why the desperation *tests* were being
touched, not by the harness.

### The burnout rides the disarm predicate

`weaponDisabled` already gates the input path, the rival's weapon choice and the
HUD, so routing destroyed guns through it meant none of them needed to learn a
second concept. `overdriveSpent` never clears — these are destroyed, not
disabled, and the distinction is the whole moment.

### Two staged scenes, because it is two moments

**OVERDRIVE** — shake, three saturation bursts fanned in time so it reads as
three things firing at once, a card reading `OVERDRIVE / ALL SYSTEMS — TEN
SECONDS`, and an aura of three counter-rotating broken rings in the three mode
colours plus a white fuse arc that visibly closes.

**BURNOUT** — deliberately not a smaller version of the first. Harder shake, the
burnout cue rather than the saturation one, a blade flare on the aim axis, and a
red card reading `BURNOUT / THRUSTERS AND GUNS DESTROYED — BLADE ONLY`. The aura
does not stop, it *changes*: one dim red ring and a blade flare, because the
machine is still transformed — it has simply spent everything into the sword.

The rig animation now distinguishes four whole-machine states by alpha alone, and
they must not be confusable: saturation is a smooth 0.86–1.00 breath (power
held), LAST STAND a hard strobe at nine (refusal), OVERDRIVE pinned bright at
fourteen and barely dipping (nothing held back), and burnt-out dim and *unsteady*
— two detuned sines beating against each other so the flicker never settles,
which reads as damage rather than as an effect.

HUD: `OVERDRIVE: 10s` counting down, then `BLADE ONLY`.

### Two test files needed decoupling, for the same reason

`desperation.test.ts` drives CIRRUS to a fifth of a life bar to test desperate
SPEED, which is now also under OVERDRIVE's threshold — so the passive fired
mid-test and turned on all three modes, failing an assertion about Shield and
Shoot not extending reach. Its subject is now `{ ...CIRRUS, overdrive: undefined }`,
the same fix and the same reasoning as `LADDER_MECH` in D113: strip the passive
that is not under test rather than let it confound the measurement.

`banter.test.ts`'s conditional-trigger rule was generalised from a hard-coded
`lastStand` special case into a table driven off the mech definitions, so the
next passive is covered the moment it is declared.

### Measured

```
  CIRRUS   EXTREME  -0.061 -> +0.204        ko +0.69, the highest on the roster
  spread   EXTREME   0.163 ->  0.316
```

She is the outlier, and it is OVERDRIVE that put her there — ten seconds of
everything at a quarter hull is an enormous comeback window, and the ×1.5 melee
state afterwards is still potent on the fastest frame in the game. Recorded
rather than tuned, as with NULLTIDE's projections.

If it wants trimming, the dials in order of leverage are `ticks` (the window),
`threshold` (when it opens), and `meleeMul`.

**One thing worth a look**: the opening fires three full saturation bursts at
once, which fills a quarter of the screen for about a second. It communicates
"all three" unambiguously and it is transient, but it is very loud, and one
burst with a tri-colour treatment would say the same thing more quietly.

---

## D116 — Overdrive's window cut from ten seconds to four

CIRRUS shipped at **85 % of matches won** against a next-best 66 %, and a lead of
+0.204 against +0.041 — five times the second machine, about 6σ clear, and in the
same bracket as the two worst outliers this project has ever measured
(TERRAMOTH's +0.266, NULLTIDE's +0.257).

### The window was the whole problem, and the measurement said so plainly

Across 42 fights at EXTREME:

```
  ended DURING the window   17 fights   won 17, lost 0
  ended AFTER burnout       13 fights   won  7, lost 6
  never fired at all        12 fights
```

The blade-only aftermath is a coin flip — it was already fair. Everything came
from the phase she never lost. That ruled out the obvious-looking lever of making
the burnout harsher: it would have hit the half that was working.

### Swept, not guessed

```
  600 (10s) -> +0.204, 85% wins, roster spread 0.316
  480  (8s) -> +0.180, 78%
  360  (6s) -> +0.154, 72%
  300  (5s) -> +0.124,           roster spread 0.225
  240  (4s) -> +0.096, 58% wins, roster spread 0.200
```

A clean monotonic dial with no plateau — unusually well-behaved for this project,
where most dials run out of resolution before they run out of range.

**240 is where it stops paying.** She lands *inside* the top group rather than
above it — +0.096 against TERRAMOTH's +0.055 is 1.3σ — and below this the spread
is bound by OBELISK's −0.104 floor rather than by her ceiling. Zeroing her
entirely would only reach ~0.16, so shortening further would cost the moment and
buy nothing.

A shorter window also shifts weight onto the blade-only phase, which is the half
that already measured fair. That is the right way round.

### A note on what this number is worth

The 85 % was an AI-versus-AI figure and probably flattered the second half of the
passive. During the blade-only phase the rival holds a mean **212px** from a mech
with no thrusters and no guns; a human backs off and shoots it, which is what a
player reported after HALCYON beat this build twice. The nerf is aimed at the
window rather than the aftermath partly for that reason — the aftermath is the
part the harness understands least.

### The probe now reports win rate

Related, and prompted by the same conversation: `balance.ts` reported life-bar
*margin* and it was being read as *record*. They are different numbers and in
CIRRUS's case sharply different ones. Win rate is what a player thinks in, so it
is now the first column on every row.

### Two tests had pinned the literal

`overdrive.test.ts` asserted `ticks: 600` twice and broke on the tune. Both now
derive from the definition — the threshold and the melee multiplier are design
constants and stay pinned; the window is a balance dial and is bounded instead.

---

## D117 — Last Stand's window cut from ten seconds to five

### It was worth twenty-nine points of win rate

The roster table hid this, because HALCYON's *lead* was an unremarkable +0.054.
Ablated:

```
  HALCYON as shipped        81 % of matches won
  HALCYON, passive stripped 52 %
```

It fired in **48 %** of her fights and she went on to win **60 %** of those. The
machine described a few blocks ago as a bent yardstick that won no matchup at all
had become the best machine on the roster by the metric a player actually
experiences.

**This is the clearest case yet for reporting both numbers.** LAST STAND does not
win fights *bigger*, it wins them *more often* — it converts losses into narrow
survivals. Lead cannot see that and win rate cannot miss it.

### The number that shaped the options

Across the whole ten-second window the opponent lands **69 damage** on her — 4 %
of a life bar. So the reprieve was never absorbing punishment. It was ten seconds
in which she could not lose, with **no counterplay whatsoever**: nothing the
opponent did for that duration mattered. That is the same fault D95 fixed on
AEGIS's dome by making it consumable, and a damage pool was offered as the
alternative here.

Shortening was chosen instead.

### Swept

```
  600 (10s) -> 70 % wins, lead +0.054
  420  (7s) -> 63 %,      lead +0.026
  300  (5s) -> 60 %,      lead +0.012
  180  (3s) -> 52 %,      lead -0.006
```

**180 is the floor and it is a hard one**: 52 % is exactly what she measures with
the passive removed entirely, so at three seconds LAST STAND is decorative. That
is a useful thing to have measured — it says the whole ability lives between 3
and 10 seconds, and there is no room below.

**300 shipped.** She lands at 60 % against CIRRUS's 60 % and TERRAMOTH's 58 % — a
three-way tie at the top by win rate — with a mid-pack lead of +0.012. The
passive is still worth +8 points over her stripped baseline, so it does something
without deciding matches.

### It barely moved the spread, and that is the point

```
  roster spread   0.200 -> 0.208
```

Unchanged inside the noise, because **HALCYON was never the outlier on lead** —
she was the outlier on *record*. The spread is bound by OBELISK's −0.100 floor at
both ends of this change. Anyone reading only the spread would have concluded
there was nothing to fix here, which is exactly the trap the win-rate column was
added to close.

Both chassis passives now run a similar window — OVERDRIVE four seconds, LAST
STAND five — which was not designed for but reads consistently.

### The tests had pinned the literal again

`lastStand.test.ts` asserted `ticks === 600` and hard-coded 620- and 700-tick
loops. All of them now derive from `HALCYON.lastStand.ticks`, one commit after
`overdrive.test.ts` learned the same lesson. A balance dial should never be
pinned by an equality assertion; bound it instead.

---

## D118 — Obelisk stops buying shell with the meter it earns

**Requested**: buff OBELISK, under a standing constraint — *"He is a heavy class
mech, so of course he's going to move slower and stand out as a big target. If
you want him to hit harder then increase dps by making his attacks stronger, but
do not do this at the cost of his defensive capabilities."*

Three previous passes had ruled out dome durability (D95/D99, worth 0.001),
reach (D100, worth −0.033) and part of raw damage (D103, worth ~+0.10), and it
was still last on the roster at both tiers on both metrics: **36 % / −0.100 at
EXTREME, 32 % / −0.114 at HARD**, and the only machine with no winning matchup
anywhere.

### The instrument came first

`balance.ts` says who is losing and nothing about why, which is how three passes
went on hypotheses. `tools/probe/telemetry.ts` is the counterpart: same duels,
same seeds, reporting what each machine did with its 180 seconds. Two faults had
to be fixed in the probe before anything it said could be believed, and both are
worth knowing about:

* **Status chip damage emits no `hit` event.** It is applied inside
  `Combatant.step` and never reaches the event stream, so damage read off events
  omits every burn and acid tick on the roster. It made PYRE measure as the worst
  machine in the game. It now reads hull deltas instead.
* **`MatchSim` culls rounds 260 px outside the arena**, deactivating them *with
  life left* — the exact signature of being eaten. Conflated with contact,
  OBELISK's main gun read as 52 % effective. It is 17 %.

### What it found

Not what any of the three previous passes assumed. In the currency `lead` is
made of, OBELISK dealt **75.4 bar/min, the lowest on the roster**, and took 82.6,
the second-lowest. A tank that cannot hurt anyone.

**It is not an accuracy problem.** Against the other heavy, connect rates were
within two points across the board — main 17 % vs 15 %, heavy 25 % vs 23 %,
spread 7 % vs 9 % — and TERRAMOTH was +0.059. The same gun, opposite results.

The leak was that its rounds **died in open air**: 48 % of BREACH GUN rounds and
62 % of SCATTERGUN pellets expired before reaching anything. Giving them reach
does not fix it — a `projLife` sweep went −0.057 / −0.091 / −0.098, non-monotone
and inside noise, which is a dial that has run out of resolution rather than a
lever. That is D100 confirmed from a second angle.

The actual finding was upstream of all of it. **OBELISK generates more saturation
than anything on the roster** — 11.4 charge/s against CIRRUS's 5.9, because the
dome and the guard between them eat some seventy-five rounds a minute — and it
spent every point on SHIELD, the one mode that adds no offence *and* drains the
meter at double rate for half the duration. The most-charged pilot in the game
was buying more of the only thing it already had a surplus of, in the shortest
bursts available.

### The change

Two lines, no stat touched.

1. `PLAYSTYLES.obelisk.satPreference` **Shield → Shoot**.
2. `Supporter.spendsCharges` — a `dome` keeps its gun permanently, rather than
   only while its own shell is broken.

Shoot is the *specific* answer to the measured leak rather than a generic
uplift: it grants unlimited projectile lifetime, and expiry falls exactly where
predicted — BREACH GUN 48 % to 34 %, SCATTERGUN 62 % to 47 %.

The second is OBELISK-only because AEGIS is the only `dome` on the roster, and
it is pure addition. D99 had already softened the gate to "a broken emitter falls
back on its weapon"; the round counts showed what that was worth — AEGIS fired
1179 rounds across a 12-seed sweep where BULWARK, doing a comparable job for the
other heavy, fired 3147. That ratio *is* the share of the match its shell spends
broken. The gun was gated on the escort failing.

### Measured — 12 seeds, both slot orders, n = 84

```
  EXTREME   36 % / -0.100  ->  57 % / +0.053
  HARD      32 % / -0.114  ->  61 % / +0.040
```

Zero winning matchups became **three of seven**, and three of the four remaining
losses are −0.02, −0.03 and −0.03 — coin flips rather than defeats. Its worst
matchup went from −0.21 to **−0.10**, and no new lopsided pairing was created.
Roster-wide, matchups inside ±0.10 went **13 of 28 → 15 of 28**.

Worth being exact about, because the intermediate measurement disagreed: the
saturation change *alone* produced five winning matchups and a worse worst case
(−0.19). Adding the escort's gun redistributed rather than added — OBELISK gained
against NULLTIDE and lost ground against HALCYON and PYRE. The final shape is
flatter and fairer than the bigger-sounding number.

**The defensive constraint held, and was measured rather than asserted**: every
defensive stat is untouched, it still absorbs 72 rounds a minute, and damage
taken rose **6 %** while damage dealt rose **22 %**.

### What was measured and rejected

| option | EXTREME | why not |
| --- | --- | --- |
| RAM CHARGE 170 to 260 | 44 % / −0.007 | +53 % damage for less than a free change |
| SCATTERGUN reach | noise, non-monotone | not a lever; confirms D100 |
| `meleeAppetite` 0.1 to 0.3 | 38 % / −0.061 | small, and the dial is a threshold |

`meleeAppetite` measured *identically* at 0.3, 0.5 and 0.75, which looked like
the `hitAndRun` failure of D104. It is not: the value is consumed as a threshold
(`>= BRAWLER_APPETITE`), so saturation above it is correct behaviour.

### The spread did not move, and that is the expected result

```
  EXTREME spread   0.208 -> 0.216
```

Lifting the floor made VESPER the floor: he was one of the few machines OBELISK
lost to, and OBELISK now beats him +0.14, taking him −0.083 to −0.119. Nothing at
the top moves the spread until VESPER comes up too, which is the next task.

### A behavioural test, not a screenshot

The AEGIS change is invisible from outside: the escort fired before, drew the
same muzzle flash, spent the same charges, and only a round count showed it was
doing so for a third of the match. So the guard asserts on the *conditional* —
a shot leaving while `domeActive` is true — and was checked red against the old
gate before being kept. Firing at all proves nothing, because the old behaviour
fired too.

`playstyles.test.ts` had named OBELISK as its Shield-preferring exemplar and went
red on a change it had nothing to say about — the same coupling as the ladder
test's dependence on HALCYON. It now derives the fixture from the property.

---

## D119 — The Shield drain becomes a chassis dial

**Requested**, and the request was the correct instinct.

The first version of the OBELISK fix considered lowering the Shield burst's
double drain rate. Measured roster-wide it worked and cost too much elsewhere:
at 1.0 it took OBELISK to 52 % / +0.012 and simultaneously handed TERRAMOTH — the
roster's other Shield pilot — a jump from 58 % to **71 %**, a new outlier at the
top. A single shared constant cannot say "this machine is good at guarding".

So `MechDef.gauges.satShieldDrain` is now per-chassis, defaulting to the standing
2, with OBELISK at **1**. It is the only machine that gets a full-length Shield
burst, which is the correct place for the barrier specialist to be different.
Verified OBELISK-only: TERRAMOTH sat unmoved at +0.032 to +0.033 across the change.

### It measures as inert in AI play, and that is honest

With D118 in place the rival never *picks* Shield on OBELISK, so the harness
cannot see this at all: +0.057 to +0.053, well inside a 0.029 standard error. It
is a human-facing buff, and the AI-vs-AI instrument is structurally unable to
value it — the same blind spot as §8f, where the rival never chooses a
sub-weapon either.

That is worth stating plainly rather than quoting the flat number as if it were
a disappointment. A player who picks OBELISK and holds SHIELD gets twice the
burst; nothing in the measurement disagrees, it simply never runs the experiment.

### The alternative it replaced, and why HARD killed it

Keeping OBELISK on Shield and making the per-chassis drain the load-bearing
change measured *better* at EXTREME than the change actually shipped — 55 % /
+0.067 and a roster spread of **0.177**, the best number seen all session.

At HARD it collapsed to **37 % / −0.083**, against a 32 % / −0.114 baseline:
barely moved. The fix was EXTREME-only, which is the same structural disease
VESPER has and the reason HARD is run as a corroborating second sample at all.
An EXTREME-only spread of 0.177 is worth less than a fix that works at both
tiers, and reading only the first number would have shipped the wrong one.

---

## D120 — Vesper: slow cruise, violent dash, a shorter bet

**Requested**, as a design package rather than a number: *"His Sniper Mode should
only last 3 seconds. Increase the disability chance from 50% to 60%. Lower
Vesper's overall base movement speed, but improve his Dash to make it faster and
extend a longer distance. That way, he still keeps his sniper mentality by using
slow movements and then when he needs to get out of danger he can dash instead of
moving regularly. Also while in Sniper Mode, slightly increase his movement speed
VERY slightly, and allow him to dash."*

VESPER was **35 % / −0.119 at EXTREME and 38 % / −0.165 at HARD** — the sole
outlier once OBELISK came up in D118, and the holder of the one lopsided matchup.

### The handoff's diagnosis was wrong, and checking it mattered

`SESSION_HANDOFF.md` said VESPER's kit "rests on `kites` and the sniper stance,
and holding range depends on `rangeIq`, which is EXTREME-only" — structural, not
numeric. **Neither is gated on `rangeIq`.** The kite retreat in `pickTactic`
checks `style.kites`, `!sniperActive` and a constant `KITE_RANGE`; `sniperIntent`
checks constants and energy. `foeClosing` is ungated. What *is* gated is
`preferredRangeFor` and `disengageReach` — and measured, his mean engagement
distance differs by 25px between the tiers, so it barely expresses.

The "worse at HARD" premise was also over-read: **−0.119 ± 0.036 against
−0.165 ± 0.037** is a difference of 0.046 ± 0.052, and his *win rate* was
actually higher at HARD (38 % against 35 %). He was about equally bad at both.

That mattered because it changed the whole approach. He did not need a
tier-independence fix. Telemetry said what he did need, and it was the exact
inverse of OBELISK's problem: **he dealt the third-highest damage on the roster
(161 bar/min) and took the highest (185)**. Not short of offence — short of
survival. `defence.mul` 1.15 on the second-thinnest hull.

### What was measured before the package

* **More stance is worse.** Sweeping `sniper.cooldown` 420 → 340 → 270 → 200
  moved his lead −0.119 → −0.132 → −0.123 → −0.123. Flat to negative. His
  best-connecting weapon by far — the stance shot lands **81 %**, against his
  main gun's 17 % — and giving him more of it does nothing, because the stance's
  price is standing still and standing still was killing him.
* SIGHTLINE's gun (the D118 trick applied to `interceptor`) was worth +0.085.
* `defence.mul` 1.15 → 0.96 was worth +0.118.

Neither was used. The requested package was better and it is in character.

### The package, and what each part is worth

Measured alone, from the −0.119 baseline, 12 seeds, n = 84:

| change | alone | worth |
| --- | --- | --- |
| stance `duration` 360 → 180 | 43 % / −0.039 | **+0.080** |
| `dashSpeed` 14→18, `dashTicks` 7→9 (98 → 162px) | 47 % / +0.019 | **+0.138** |
| stance `speedScale` 0.32 → 0.38 **and `dashSpeedScale: 1`** | 55 % / +0.065 | **+0.184** |
| `accel` 1.6→1.4, `maxSpeed` 5.1→4.5, `boostMaxSpeed` 8.8→8.0 | 42 % / −0.079 | **+0.040** |
| `disarms` 0.50 → 0.60 | 36 % / −0.114 | **+0.005 — nothing** |

Every part of the request pays except the disarm, and **cutting the stance in
half is a buff**, which the cooldown sweep above had already predicted and which
is the least obvious thing here: a shorter bet on the same read is worth more
than a longer one when being wrong is fatal.

`SniperModeDef.dashSpeedScale` is new. The stance already allowed dashing — it
simply scaled the dash by `speedScale`, so the panic button moved him about a
third of a body length. Splitting the dash out of the movement penalty is what
"allow him to dash" means mechanically, and it is the single largest component.

**Sub-additive, heavily.** The five parts sum to +0.447 and the package measures
+0.221. The dash and the stance-dash-exemption are substitutes rather than
complements — either one alone provides the escape — which is why an
ablation-from-full initially showed both as worth nothing and nearly sent this
the wrong way. Decomposing from the baseline instead is what made it legible.

### The disarm was reverted, deliberately

**By request, after being measured at +0.005 against a 0.035 standard error.** It
was proposed on the sound logic that halving the stance halves the number of
shots, so the per-shot chance should rise to compensate — the same reasoning D111
used. It simply does not show up. Reverting rather than keeping it as a free
flourish: a dial that measures at nothing is a dial the next reader assumes is
load-bearing, and this one already carries three tuning notes.

Reverting it also improved the roster spread, 0.171 → 0.156, inside noise.

### Result

```
  EXTREME   35 % / -0.119  ->  51 % / +0.102     spread 0.216 -> 0.156
  HARD      38 % / -0.165  ->  57 % / +0.064     spread 0.269 -> 0.216
```

**0.156 is the tightest the roster has ever measured**, and matchups inside
±0.10 went 15 of 28 to 18 of 28, the best fairness on record. The old lopsided
pairing — CIRRUS over VESPER at +0.34, the one bad fight in the game for many
sessions — is **fixed at −0.05**.

His +0.102 lead reads as top of the roster and is not what it looks like. The
whole of it is one matchup: across the other six he averages **+0.037**, and on
win rate he is **51 %, fifth of eight**. This is the clearest case yet of the two
columns answering different questions.

### The one broken matchup, and why it is being kept

**VESPER over TERRAMOTH, +0.59.** Bigger than the CIRRUS/VESPER fight it
replaced. It is not an excess in any one dial: measured separately, the stance
cut puts it at +0.50, the dash at +0.40 and the stance mobility at +0.50, each on
its own. The only change that leaves it alone (+0.13) is the one that made VESPER
*slower*. **Any mobility whatsoever breaks it** — the slowest machine on the
roster cannot answer a marksman who can disengage at all.

**Left as it is, by design decision**, and the reasoning is worth recording so a
future session does not read it as an oversight and "fix" it: *"even with its
disadvantage towards high mobility opponents, its hp is so high that it genuinely
can outlast most opponent due to high bulk and trading/exchanges."*

The measurement supports that at EXTREME, and more strongly than the tier list
suggests. TERRAMOTH's exchange rate is **the most even on the roster — 76.7
bar/min dealt against 76.5 taken, net +0.2** — on the lowest damage intake in the
game, and excluding VESPER its matchup row averages **+0.063**, above average,
with only two marginal losses. It sits at 52 % wins. The attrition identity works.

The honest caveat, recorded and not acted on: it is 33 % / −0.140 at HARD, last
on both metrics — and that predates this change entirely (37 % before the VESPER
work, 38 % before D118). It is a separate problem from this matchup.

### Tests

Four sniper tests went red, none of them a regression, all of them coupled to
`duration` — a balance dial:

* Two collected projectiles for 280 ticks and asserted every one was a stance
  shot. At six seconds the loop never outlived the stance; at three it does, and
  the ordinary main gun correctly carries no disarm and is not a beam. Both now
  gate on `sniperActive`, which makes them independent of the dial rather than
  merely re-tuned to it.
* The cadence band asserted 4–8 shots per stance and now gets 3. The floor moved
  to 3 — a design change, stated as one in the test.
* `disarms` was pinned with `toBeCloseTo(0.5)`. Bounded now. That is the third
  file this session to make the same mistake after `lastStand.test.ts` and
  `overdrive.test.ts`, and the rule stands: **never pin a balance dial with an
  equality assertion.**

---

## D121 — A burn can kill

**Found by a player**, which is now four for four. The report: *"Ive test out Pyre
and she seems to do well vs the rest of the cast; not lagging behind, but also not
feeling overpowered. Im not sure why her win rate says 38% because it feels more
like in the high 40s. She doesnt really do poor against any mech."*

Every aggregate agreed with him and none of them explained it. PYRE's margin was
−0.045, near even. Her exchange rate was 132.6 bar/min dealt against 134.8 taken,
near even. Her matchup row was the flattest on the roster — nothing worse than
−0.14. And her record was the worst in the game.

### `tools/probe/outcomes.ts`

A third instrument, because the first two could not see it. `balance.ts` reports
a margin and a record derived from it; `telemetry.ts` reports what a machine did
with its ticks. Neither says *how a fight ended*. This one splits outcomes into
kills, clock decisions and draws, and counts two things nothing else did.

The first thing it found was about the harness rather than the game: **every
fight on the roster ends by KO.** 1344 duels, **zero** decided by the clock. The
180-second cap is never reached, so `lead` — documented as the game's timeout
tiebreaker — never actually acts as one in AI play. It is a proxy for how
comfortably a machine kills, and nothing else.

The second thing was the answer:

```
  mech        n   KO-W  KO-L   leftAt1   clamp/fight
  PYRE      168     60   105        20          32.1
  NULLTIDE  168     82    80         6          32.1
  VESPER    168     85    77         6           0.0
  HALCYON   168     95    68         0           0.3
```

**PYRE left an opponent alive at exactly one hull point in 20 of 168 fights**,
four times the roster's next worst, and pinned opponents at that floor for 32
ticks a fight. She dropped the entire field low and confirmed nothing.

### The cause

`Combatant.step` applied status chip as `Math.max(1, life - chip)`. **A burn
could not land the killing blow.** Not "rarely" — never, by construction.

The reason given was that *"being finished by a lingering burn seconds after the
shooter disengaged reads as a bug, not a loss"*. That concern is real, but the
rule was far broader than the case, and the case turns out to be small: **a burn
lasts 120 ticks**, and `Status.apply` restarts that clock on every hit that
inflicts it. The worst thing the clamp was preventing is dying **two seconds**
after the last round landed — a legible death. The duration had already bounded
the problem; the clamp bounded it a second time and charged PYRE for it.

It only ever fell on her, because fire is the only damaging status anyone
carries. **Acid is carried by no weapon on the roster at all** — `Element.Corrosive`
is fully implemented, tuned at 0.42/tick, referenced only in test files.

| element | dmg/tick | carried by |
| --- | --- | --- |
| Incendiary | 0.95 | **PYRE ×7**, NOCTURNE ×2 |
| Shock | 0 → **0.05** | OBELISK ×2, NULLTIDE ×4, HALCYON ×1 |
| Cryo | 0 → **0.10** | NULLTIDE ×3 |
| Corrosive | 0.42 | **nobody** |

### The change

The clamp is gone: `Math.max(0, ...)`. **By request, every element also now
does damage** — Shock 0.05/tick and Cryo 0.10/tick, which is 8 and 15 hull over
a full application. Deliberately token: Shock's bite is `energyDrain` and
`blocksEnergyRegen`, Cryo's is `speedScale` 0.66. The numbers exist so that no
status is one a machine can safely ignore, and so each can finish something it
has already shut down.

A brief attempt at a middle path — lethal only while the burn is *fresh*, gated
on `Status.fraction` — was built, swept (0.9/0.7/0.5/0.3 → 40/41/43/45 %) and
thrown away. Once the 120-tick duration was understood there was nothing left for
it to protect.

### Measured — both arms with the corrected probe

```
  EXTREME   PYRE  37 % / -0.045  ->  41 % / -0.044
  HARD      PYRE  40 % / -0.011  ->  43 % / +0.013
  spread    EXTREME 0.156 -> 0.143      HARD 0.206
  win-rate range   21 points -> 16 points
```

The mechanism moved as intended: **`leftAt1` fell from 20 fights to 6**, and the
ticks opponents spend pinned at one hull from 32 to 19.

**+4 points, not the +8 first reported.** The first counterfactual was measured
through a probe bug found later in the same session — see below — which was
inflating PYRE specifically. The corrected figure is +4, and the player's "high
40s" is still above it. That gap is expected and is not this defect: he is
describing *human* play, where a pilot finishes a burning opponent with a gun.
The rival never chooses a command motion (§8d) or a sub-weapon (§8f) and will
still wait for the fire.

### The probe bug this uncovered

Letting a status kill made **double KOs** possible — both machines dying on the
same tick. They went from about 3 per machine to 11 of PYRE's 168 fights.

`balance.ts` scored a draw as `(fwd.win > 0 ? 1 : 0)`, giving the left side
nothing, while the right side's share is derived as `2 - wins` — so **a draw was
scored as a full win for whichever machine was listed later in `ROSTER`**. Both
slot orders are sampled, so it did not cancel in the average; it moved a fixed
amount of credit down the roster order. PYRE is seventh of eight and was
collecting it.

Harmless while draws were rare, which they were until this change. Now
`drawAware` gives half a win to each side. Every number in this entry is measured
with the fix, on both arms.

**The lesson generalises**: a metric that is fine under current conditions can be
made wrong by a gameplay change, and nothing will announce it. The tie branch had
been there since D97 and was correct-by-irrelevance the whole time.

---

## D122 — "Last" is not "outlier"

**A correction, and the instrument that stops it recurring.**

At the end of D121 the roster was reported as having one remaining problem:
*"The next real outlier is NOCTURNE — 43 % / −0.055 at EXTREME, 38 % / −0.087 at
HARD, and unlike PYRE the aggregates all agree it's genuinely losing the
exchange."* The user asked why that word had been used. It should not have been.

### The claim did not survive checking

Computed across the eight machines at EXTREME:

```
  mean lead +0.000   SD 0.050        mean win 49.9 %   SD 5.4 pts

  VESPER      z(lead) +1.75    z(win) -0.16
  CIRRUS              +1.17           +1.31
  NULLTIDE            +0.08           +0.54
  OBELISK             -0.06           +0.05
  HALCYON             -0.21           +0.54
  TERRAMOTH           -0.75           +0.54
  PYRE                -0.87           -1.57
  NOCTURNE            -1.10           -1.35
```

**Nothing exceeds ±2σ at either tier.** NOCTURNE is −1.10σ, PYRE is further out
on record at −1.57σ, and the most extreme machine in the field is **VESPER at
+1.75σ — at the top of the table**. The gap between NOCTURNE's −0.055 and PYRE's
−0.044 is 0.011 against a ±0.030 standard error on each.

What actually existed was "NOCTURNE has the lowest lead at EXTREME". That was
reported as a much stronger claim, which is the same failure as reading a lead
column and calling it a record: a number was used to answer a question it does
not answer.

### It also produced wasted work

Two investigations ran off the back of it before the word was challenged — a
per-matchup decomposition against HALCYON, which is not how this roster is meant
to be read (a bad matchup is acceptable by design), and a stat sweep looking for
a fix to a machine that did not need one. Both were sound measurements of the
wrong question.

One thing found along the way is worth keeping, since it was measured: **HALCYON
with LAST STAND stripped is 36 % / −0.113, worse than NOCTURNE.** The AV frame is
the weakest chassis in the game and HALCYON's standing is almost entirely her
passive. That is a design observation about where the identity gaps are, not a
balance defect, and no change was made.

### The instrument

`balance.ts` now prints, on every full sweep:

* a **`z` column** per row, lead and win rate;
* a **dispersion line** — SD of each, plus the **noise-corrected** figure;
* an explicit **outlier verdict** at |z| >= 2, which says *"none — the field is
  one population"* when there is nothing there.

**Noise correction matters more than it sounds.** Each row carries its own
standard error, so observed dispersion is inflated by it: `observed² ≈ true² +
SE²`. At 12 seeds, EXTREME reads SD 0.050 of which the true component is
**0.041** — 18 % of the visible spread is measurement error. A 0.01 gap between
adjacent machines is noise by construction, and the probe now says so rather than
leaving it to be inferred.

The threshold is a flag rather than a verdict: with eight machines, one landing
past 2σ is unremarkable. Its value is the negative direction — when nothing
trips it, "X is the outlier" is not a claim the data supports.

### The guard needed a guard

The first cut computed dispersion whenever there were three or more rows, which
included `--only` runs. `--only X` gives X a full 84 samples and every other
machine the 12 from their single pairing, so it printed a lead SD of 0.125, a
spread of 0.352 and a straight-faced *"no outliers"* over numbers that meant
nothing — a more confident version of exactly the error being fixed.

It now suppresses itself when the rows disagree on `n`, detected from the data
rather than from reading `opts.only`, so any future sampling mode that skews the
plan is caught by the same check.

### Where this leaves the roster

After D118, D120 and D121 there is **no machine these measurements can
distinguish as broken**: spread 0.208 → 0.143, win-rate range 21 → 16 points, and
no row beyond 2σ at either tier. Further work on any individual machine is now a
design choice about identity — NOCTURNE is the only frame without a signature —
and not something the numbers are asking for.

---

## D125 — The floor was decorative

**Reported by a player**, five for five: *"I do see a floor layer on the map, but
Ive also seen the mechs fly right through or shoot through the floor layer."*

Both halves were true and had the same cause. The entire ground clamp lives
inside `if (intent.flying === false)` in `FlightModel.stepFlight`. **In flight
mode there was no deck collision at all** — and `flying` defaults to true, with
`grounded` measuring 0.0 % of every fight, so the floor has never once been solid
in anything a player has seen. A flying machine was bounded only by the arena's
bottom edge, which sits 30 px below the deck and is measured against the body
centre rather than the feet:

```
  mech         feet reach below the drawn deck
  HALCYON / VESPER          86 px
  OBELISK                   84 px
  PYRE                      82 px
  NOCTURNE / TERRAMOTH      79 px
  NULLTIDE                  73 px
  CIRRUS                    64 px
```

Invisible for as long as the floor was a placeholder bar. Not invisible against
the art committed in the previous change, which is why this surfaced now.

### The fix

`clampToArena` takes a `floorY`, and `Combatant` passes its own `groundY` at all
four call sites. **Not fixed inside the grounded branch**, because the dash path
returns early — a floor enforced later in the step would be punched straight
through by a dash, which is exactly the move most likely to reach the deck.

The floor kills downward velocity rather than bouncing it. A wall throwing you
off reads as impact; a floor you are hovering against should stop you, or a
machine held down against the deck jitters on it every tick.

`MatchSim.enforceFloor` also lost its `!c.flying` gate. It existed because
separation and other post-motion nudges can push a mech below the deck during
hitstop, when the flight step will not correct it — and that is no more true of a
landed machine than a flying one.

### Measured

```
  before   41298 ticks sampled, 63 below the deck, worst 82.1 px
  after    40044 ticks sampled,  0 below the deck, worst  0.0 px
```

### It moved the balance, and the first explanation was wrong twice

**Amended after the fact.** The original version of this entry credited the
balance shift to the deck removing an escape axis from whoever was closing on
VESPER, since he is the only pilot with `kites`. A player disputed it from
playtesting — *"mechs barely reach the very bottom of the deck, so I believe this
to be a non-issue"* — and the measurement agreed with him, not with the entry:

```
  height above the deck, 495262 samples at EXTREME

  mech        median   within 100px   within 20px
  VESPER         539          8.5 %        2.3 %
  TERRAMOTH      447          7.9 %        1.5 %
  HALCYON        480          5.9 %        1.6 %
  OBELISK        528          2.8 %        0.1 %
```

Machines sit a median of 440–580px above the deck and spend 0.1–2.3 % of ticks
anywhere near it. There is nowhere near enough deck contact for the stated
mechanism to move a roster by ten points of win rate. **Sixth play report, sixth
time the player was right.**

### The real cause was an incidental change, not the fix

The commit did two things and the entry conflated them: it raised the floor
**and** changed the arena's bottom edge from bouncing (`vy = -vy * 0.25`) to
absorbing (`vy = 0`), on the reasoning that a floor should stop you rather than
throw you off. That sounded right and was never measured.

Ablated with the floor height held constant:

```
  bounce (original)     VESPER 49 %   spread 0.143
  absorb               VESPER 61 %   spread 0.229
```

**The incidental change was worth more than the bug fix it was smuggled in
beside.** Vertical rebound off the arena edge is load-bearing for the whole
flight model and nothing about adding a deck justified touching it. Bounce is
restored.

### What each half actually costs, measured cleanly

With the bounce confound removed:

| | spread | VESPER |
| --- | --- | --- |
| no floor at all | 0.143 | 49 % / +0.088 |
| **mechs stop at the deck** | **0.218** | 57 % / +0.130 |
| **+ rounds stop at the deck** | 0.237 | 60 % / +0.136 |

The projectile half costs **0.019**. The mech half costs **0.075** — the opposite
of the first reading, which had also been taken through the bounce bug.

### And the mechanism is small

Telemetry, VESPER, with and without the deck:

```
  bar/min dealt   141.9 -> 148.3   (+4.5 %)
  bar/min taken   124.2 -> 127.1   (+2.3 %)
  net             +17.7 -> +21.3
  engagement dist   768 ->   776
```

A 4.5 % output gain against a 2.3 % intake gain, and *that* is what an
eight-point record swing is made of. **The roster is packed inside 0.14, so a
small net edge flips a lot of near-even matchups.** That is worth holding onto as
a general fact about this game now: at this spread, record is a very sensitive
function of margin, and a mechanical change with a couple of percent in it will
look like a balance event.

The main gun's connect rate reads 17 % → 39 % across the change and that is
**not** an accuracy gain — `telemetry.ts` classifies a round stopped by the deck
as contact rather than as a fly-off. Ask what a number means before acting on it.

### Rounds stop at the deck too

The second half of the report is fixed in the same pass. Rounds are tested
against their lower edge rather than their centre, so a shell buries itself in
the plate instead of sinking half its radius first, and an impact is emitted so
it reads as hitting something rather than expiring.

Mines were the worry — OBELISK carries SHOCK MINE and MINEFIELD as chassis
weapons and TERRAMOTH's BULWARK runs the `miner` role — but at 0.019 of spread
the whole projectile half is close to free, and neither machine moved
meaningfully.

### Left as measured

VESPER at 57–60 % is a balance question, not a correctness one, and the roster
underneath him has moved three times today. It deserves its own measured pass
rather than being folded into a bug fix. Flagged, not silently corrected.
