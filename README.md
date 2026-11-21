# F.R.A.M.E. 2240

**Field-Rated Aerial Manoeuvre Element.** Nobody says the five words any more.
Developed under the working title *Babel Sword: Reignition*.

An original free-flight mecha combat game in **voxels** — momentum flight,
soft-lock gunnery, a hit-confirmed sword chain, a barrier that banks damage into
your super meter, and a three-mode **Saturation** overdrive.

The fight is a side-on plane, exactly as it always played, standing in a wide
three-dimensional voxel drydock and seen from above and in front, the way
KNOCK//BACK frames its stage. The machines are voxelized from their Blender
models; the pilots are live voxel busts.

Built with TypeScript · Phaser 3 (interface) · Three.js (the voxel world) ·
Vite · Vitest. All art is generated from the scripts in `tools/`; all sound is
synthesised at runtime. Nothing from the reference material is redistributed.

---

## Quick start

**Windows — just double-click:**

```
run-game.bat
```

It checks for Node.js, installs dependencies on first run, starts the dev server
and opens your browser.

**Any platform:**

```bash
npm install
npm run dev
```

Then open <http://localhost:5173/>.

Requires **Node.js 20 or newer**.

### Build a distributable copy

```
build-game.bat
```

or

```bash
npm run build      # runs tsc, then bundles into dist/
npm run preview    # serve the built copy
```

The result in `dist/` is a static site — host it anywhere or open it through any
web server.

---

## Controls

**New to it? Pick `TUTORIAL` on the main menu** — a hands-on course, played for
real against a practice dummy, that walks through every control below one lesson
at a time, in your own key bindings. See [Tutorial](#tutorial).

**Every control is remappable.** `SETTINGS` → `CONTROLS` on the main menu: arrows
to choose an action, `ENTER` then press the key or pad button you want,
`BACKSPACE` to unbind, `R` to restore defaults, `ESC` to close. Bindings save
automatically and persist between sessions.

Keys are stored by *physical position*, so a binding made on QWERTY stays on the
same physical key on AZERTY/QWERTZ. Assigning a key that already belongs to
another action moves it, so nothing is ever double-bound. Each action holds up to
two keys and two pad buttons.

The defaults below are what you start with; any gamepad works and can be plugged
or unplugged mid-match.

### Flight

| Action | Keyboard | Gamepad |
| --- | --- | --- |
| Move (8-direction free flight) | Arrow keys | D-pad / left stick |
| **Boost** — hold *with* a direction | `Space` | `RB` / `RT` |
| **Dash** — tap *with* a direction | `Space` | `RB` / `RT` |
| **Air brake** — hold with *no* direction | `Space` | `RB` / `RT` |
| Flight mode on/off | `A` | R-stick click |

> One button, three jobs. Dashing spends a chunk of boost, moves you fast, and
> **cannot guard** — it is a commitment.

**Flight mode.** You start airborne. Toggling flight off drops you to the deck,
where you walk instead of fly, brace better against damage and refuel boost
faster; on the deck the boost button jumps. Taking off kicks you upward, and a
heavy shot takes off automatically.

### Weapons

| Action | Keyboard | Gamepad |
| --- | --- | --- |
| Main gun (hold to auto-fire) | `Z` | `A` |
| Heavy shot | `X` | `X` |
| **Sword / melee** | `C` | `Y` |
| Scatter shot | `↓` `↘` `→` + `Z` | same motion |
| Lance beam | `↓` `↙` `←` + `X` | same motion |
| Drone salvo | `↓` `↘` `→` + `S` | same motion |
| Switch target (pilot ↔ its drone) | `E` | — |
| Hold the sword drawn (cosmetic) | `V` | — |

Motions read **forward as toward the rival**, whichever way you face. Weapons
lock on by themselves; firing anchors you, slowing your flight while you shoot.
**Melee has its own button** — every swing lunges forward, and a chain continues
only while each swing connects.

**Your supporter drone.** You do not carry the sub-weapon — a small drone flying
with you does, and every machine has its own (HALCYON's is **ARBITER**,
NOCTURNE's **WARDEN**; all eight differ in hit points, reach and passive). It
fights on its own: when its volley charge fills it fires at whatever you are
fighting, if it is in range, and its passive is live while it is out. It can be
shot down; it then **rebuilds itself and relaunches**, but its bonus is gone
until it does. Both bars are drawn on the drone: hit points on top, volley charge
below. The salvo motion orders a volley *now* — even out of the drone's own
range — for two missile charges, the pips under your gauges.

### Defence and meter

| Action | Keyboard | Gamepad |
| --- | --- | --- |
| Barrier burst (tap) / guard (hold) | `D` | `LB` / `LT` |
| Cycle Saturation mode | `Left Shift` | `Select` |
| **Activate Saturation** | `Q` | L-stick click |

### System

| Action | Keyboard | Gamepad |
| --- | --- | --- |
| Pause (the lesson menu, in the tutorial) | `Esc` or `Enter` | `Start` |
| Debug readout | `F1` | — |
| Hitbox / hurtbox view | `F2` | — |

---

## How the fight works

**Five gauges.** Life, **BST** boost, **BAR** barrier, **NRG** weapon energy,
and **SAT** saturation. Missile charges show as pips beneath them.

**Firing anchors you.** Any attack scales your velocity down while it is
committed — heavily for the lance beam, lightly for the vulcan. You cannot
strafe freely with the trigger held.

**Barrier is offence.** A barrier burst gives you 36 frames of invulnerability,
and every shot it absorbs is **converted into saturation charge**. You can also
burst out of blockstun or hitstun — at double the cost.

**Holding** the button instead is a guard. It cuts ordinary damage by **80%**
but drains the barrier gauge; empty it and you are **guard broken** and helpless
for nearly a second.

**Melee is the answer to a turtle — but not a free one.** A guard only cuts
sword damage by **50%**, so holding it against a blade is losing ground slowly
rather than stopping it. And a sword still cannot be erased by the
Shield-saturation bubble. Stage 1 into stage 2 into a launching finisher — but a
chain only continues if the previous swing actually **connected**, so whiffing
leaves you in recovery.

**Repel.** Time a barrier **burst** onto the *opening* strike of a melee
sequence and you throw the attacker off: they are knocked back and stunned for a
full second, their sequence dies, and you take nothing. It only works on the
first hit — once a sword is already landing on you, bursting is an escape, not a
parry.

**The pilots talk.** Every round opens with an exchange written for that exact
pairing — all 36 of them, mirrors included, with five conversations each, so a
rematch does not replay the same opening. During the fight they react in their
own voices to first blood, long combos, a drone going down, a guard break and
the KO, from a box in their own corner of the screen.

**Spending saturation stops the match.** A short cutscene pushes in on the
pilot's portrait, names the mode, and gives them a line — five per pilot when
the meter is full, and five more desperate ones for when it is not.

**Saturation — three modes, pick before you spend.** Cycle the mode with `Q`,
then spend the meter with **`E`**. Each mode makes one resource free for the
whole burst — that is the shape of all three.

| Mode | While it lasts |
| --- | --- |
| **SHIELD** | Your guard comes up and **stays up**, and the barrier gauge cannot fall — no drain, no guard break, no cost to burst. You can attack from behind it. The bubble that erases incoming shots stays too. Burns the meter twice as fast, so it runs 3.5s against the others' 7s. |
| **SHOOT** | **Either weapon button fires both guns at once.** Damage ×1.5, projectile speed ×1.6, sharper homing, and **nothing costs energy** — not the guns, not the lance, not the sword. |
| **SPEED** | **Thrust is free**: boosting and dashing cost nothing and the tank stays full. Boost and dash speed ×1.85, ordinary flight and walking ×1.25, and every melee sequence runs **three extra swings** on top of your mech's own count. |

**Burnout.** When the meter empties you are **stunned for a full second**, and
unlike every other stun in the game you cannot barrier-cancel out of it.
Overdrive is a window you have to get value out of *and* survive the end of —
spend it somewhere you can afford to stand still afterwards.

**Forcing it early.** You do not have to wait for a full meter. Press `E` at any
charge above a quarter and the burst opens anyway — but **everything scales down
with it**: a half-charged burst is half the multipliers for half the time, and
it does not get the free top-up a full one does. Worse, it ends in an
**overheat** instead of a burnout: two seconds of helplessness *and* damage. The
pilot tells you which one you took — a forced burst is announced in red, and the
cutscene line changes from confidence to something closer to panic.

**Winning.** Reduce the rival to zero life, or hold the higher life fraction when
the clock expires.

---

## Modes

The **title screen** runs a live, silent CPU-vs-CPU fight in the yard behind
the wordmark — two random machines on EXTREME, a new matchup after every
knockout. It never touches your last picks.

* **Versus CPU** — you against the rival frame.
* **Free Orbit** — the fight in three dimensions, from over your shoulder, and
  every machine transforms; see below.
* **CPU vs CPU** — both sides driven by the AI; useful for watching balance.
* **Tutorial** — the hands-on course; see below.
* **Training** — the rival stays passive until you land the first hit, and the
  clock is effectively disabled.

### Tutorial

`TUTORIAL`, first of the modes on the main menu, is a **hands-on course played
for real**: a live fight in CATHEDRAL YARD on HALCYON against NOCTURNE as a
practice dummy. A card along the bottom gives one lesson at a time **in your own
key bindings** (and pad buttons, with a pad connected), with a bar for the goal;
the next lesson opens by itself once you have done it. The dummy only acts when a
lesson needs it — holding still to be shot, firing so you can guard, rushing in
so you can repel — and nobody can be knocked out until the last lesson, where it
fights back on EASY.

| # | Section | Lesson | You do |
| --- | --- | --- | --- |
| 1–2 | Welcome | The tutorial, reading the gauges | Read; press the main gun |
| 3 | Movement | Free flight | Fly into three beacons |
| 4 | Movement | Air brake | Get moving, stop dead with boost and no direction ×3 |
| 5 | Movement | Boost | Boost for two seconds |
| 6 | Movement | Dash | Dash four times |
| 7 | Movement | Flight mode | Land on the deck, take off again |
| 8 | Weapons | Lock-on and the main gun | Six main-gun hits |
| 9 | Weapons | Heavy shot | Two heavy hits |
| 10 | Weapons | The sword | A sword hit |
| 11 | Weapons | Sword chain | A three-hit chain |
| 12 | Command motions | Scatter shot | ↓ ↘ → + main gun |
| 13 | Command motions | Lance beam | ↓ ↙ ← + heavy |
| 14 | Your drone | The escort | Let your drone fire a volley |
| 15 | Your drone | Drone salvo | ↓ ↘ → + sub |
| 16 | Your drone | Switching target | Lock the rival's drone, then the pilot |
| 17 | Defence | Guard | Guard five shots |
| 18 | Defence | Barrier burst | Absorb three shots |
| 19 | Defence | Repel | Burst a sword rush's opening blow |
| 20 | Saturation | Saturation modes | Cycle the mode three times |
| 21 | Saturation | Spend it | Activate, then four hits while it lasts |
| 22 | Final lesson | Spar | Knock the rival down once |

`Esc` opens the lesson menu: skip a lesson, go back, restart it, start over, or
quit. Only lessons actually done count toward the tally on the last card.
`src/tests/tutorial.test.ts` plays the whole course through the real simulation
with scripted button presses, so no lesson can ship that a player cannot finish.

### Free Orbit

`FREE ORBIT` is a **third-person 3D mecha fighter**: the whole CATHEDRAL YARD —
the deck, the gantry and the air over it — fought from a lock-on camera over
your pilot's shoulder. Same roster, same weapons, same gauges and the same
sword sequences as the side-on game, in a volume instead of on a plane. Pick
your machine, the rival and its skill as for VERSUS CPU.

**Every machine transforms.** Press **TRANSFORM** and it folds into its
**mobile form** — the frame lies prone, the legs trail into a V tail, the arms
swing forward so the rifle becomes the nose, and the engines slide aft — and
flies like an aircraft:

| | Mech form | Mobile form |
| --- | --- | --- |
| Movement | ↑ close on the rival · ↓ back off · ← → circle it | ← → turn · ↑ ↓ pitch the nose |
| Boost | hold with no direction: climb · tap with a direction: dash · hold with a direction: boost | afterburner |
| Speed | the machine's own | faster cruise that costs no boost |
| Weapons | everything | the nose gun only (`Sword` or `Heavy` transforms back) |
| Defence | guard, burst | none — and any hit knocks it back into a mech |

Default keys: arrows move, `Space` boost / dash / climb, `A` transform, `Z`
fire, `X` heavy (`↓`+`X` while backing off fires the lance), `C` sword — one
press runs the machine's whole sequence — `S` salvo, `D` guard (tap: burst),
`Q` Saturation, `Left Shift` Saturation mode, `Esc` pause. Rebinding the
side-on controls rebinds these too.

Two rules exist only here: a **lock-on lead** on your shots (most of the way to
where the rival is going), and a **down value** — a long string of gunfire
knocks the victim down, briefly untouchable, so a stream of fire cannot hold a
machine forever. The CPU transforms too, to cross long gaps and to break away.

### Rival skill

**Rival skill 1–8** (ROOKIE → LEGEND) changes reaction delay, aggression,
preferred range and how readily the CPU barriers incoming fire. It never gets
extra resources — the AI plays through the same input interface you do.

---

## The machines

| | AV-07 **HALCYON** | AV-13 **NOCTURNE** |
| --- | --- | --- |
| Pilot | NAIA VESK | HALDEN ROOK |
| Faction | CONCORD SKYWARD | EMBERLINE PACT |
| Power / Speed / Range | 3 / 4 / 4 | 4 / 3 / 3 |
| Character | Balanced interceptor | Heavier, harder hits, wider salvo |

Arena: **CATHEDRAL YARD**, an abandoned orbital drydock.

---

## Project layout

```
src/
  core/         config, seeded RNG, math, cross-scene session
  combat/       the deterministic simulation (no Phaser here)
  projectiles/  pooled projectiles + swept collision
  mechs/        rig and stat type definitions
  data/         mech definitions (mechs are data, not code)
  ai/           rival CPU — emits the same InputFrame you do
  orbit/        FREE ORBIT: the 3D simulation and its rival (no Phaser here)
  input/        keyboard + gamepad → InputFrame
  voxel/        the 3D world: voxel kit, stage, voxel mechs, the yard,
                effects, projectiles, overlays, pilot busts
  render/       rig maths and the older sprite renderers
  ui/           HUD and menus
  audio/        procedural Web Audio SFX
  debug/        F1 text readout, F2 hitbox view
  scenes/       Boot → Title → Battle / Orbit → Results
  tests/        Vitest suites (70 tests)
assets/
  voxels/          one voxelized chassis per machine (from mechs.blend)
  sprites/mechs/   part PNGs, pivot-centred (energy blades are voxelized from these)
  arenas/          3 parallax layers
  blender/         editable .blend sources
tools/blender/     the scripts that generate all art
docs/              reference audit, implementation plan, decision log
renders/debug/     previews and captured screenshots
```

Combat never imports Phaser. That is what lets `npm test` run the entire fight
model in plain Node, and it is why replays, the AI and a human all drive exactly
the same code path.

---

## Development

```bash
npm test           # 732 tests: combat, AI, data, the voxel layer, and the tutorial played through
npm run test:watch
npm run typecheck
npm run dev
npm run build
```

### Regenerating the art

With Blender running and the MCP bridge connected:

```python
exec(open(r"<project>/tools/blender/build_mechs.py").read())
build_all(r"<project>")

exec(open(r"<project>/tools/blender/build_arena.py").read())
build_arena(r"<project>")
```

Mechs render as eleven separate pivot-centred parts each — core, head, left/right
arm, main/sub/melee weapon, lower body, backpack, left/right thruster — plus a
single-sprite supporter drone. The scale contract is 120 render px per Blender
unit displayed at 0.5, i.e. **1 Blender unit = 60 logical game pixels**, which is
the unit the rig offsets in `src/data/mechs.ts` use.

Each part is framed on its own pivot, so tile size is chosen per part from the
projected bounding box rather than fixed: most parts fit 320px, the beam sabers
need 448px. `px_per_bu` is identical at every tile size, so a larger tile only
adds transparent margin and the game still draws every part at origin 0.5,0.5.

### Regenerating the voxel machines

The fight draws `assets/voxels/<mech>.json`, sampled from the Blender models.
After changing a machine in `mechs.blend`, re-run (headless, read-only — the
.blend is never saved; under a minute for the roster):

```bash
"C:/Program Files/Blender Foundation/Blender 5.1/blender.exe" -b assets/blender/mechs.blend   --python tools/blender/voxelize_mechs.py -- --vox 3.0
```

`--only halcyon,cirrus` limits it to some machines. `--vox` is logical px per
voxel. `npm test` checks every rig part has voxels and sits on its Blender pivot.

### How the voxel layer fits together

Phaser still draws every screen's interface, on a **transparent** canvas.
`src/voxel/VoxelStage.ts` owns a Three.js canvas laid exactly underneath it and
draws whatever 3D view is active: the fight (`BattleView3D`), the select
screen's machine preview (`VoxelMechDemo`), or the drifting yard behind the menu
and results screens (`YardBackdrop`). Anything a Phaser scene fills opaque over
the whole screen hides the 3D layer — use a scrim, or leave a window (the select
screen cuts one in its background for the preview).

The simulation does not know any of this exists. `src/voxel/World.ts` is the one
mapping from the fight's plane into the yard.

### Capturing what the game actually drew

The dev server exposes a screenshot sink. From the browser console:

```js
fetch('/__shot', { method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ name: 'my_shot',
    data: document.querySelector('#game-root canvas').toDataURL('image/png') }) });
```

The PNG lands in `renders/debug/my_shot.png`. `window.__BSR__` is the live Phaser
game instance, handy for poking at `getScene('Battle').sim`.

---

## Known limitations

* The title screen keeps its painted wordmark and backdrop; every other screen
  with a world in it is voxel.
* The voxel layer needs WebGL twice over (Phaser and Three.js each hold a
  context, plus a small one for the pilot busts). Without it the busts fall
  back to the painted portraits; the fight itself requires WebGL.
* One arena, by design.
* Sound is synthesised and functional rather than characterful.
* FREE ORBIT is player-vs-CPU only, and the side-on game's machines do not
  transform (that would change its tuned balance).
* Mission, arcade and local-versus modes are designed but not yet built; see
  [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md).

---

## Credits and rights

Original game. Design, code, art scripts and audio created for this project.

Developed alongside a research archive of the original *Babel Sword* MUGEN games
and an earlier fan prototype. Those folders were read for **mechanical
understanding only** — see [`docs/REFERENCE_AUDIT.md`](docs/REFERENCE_AUDIT.md)
for exactly what was learned and from where. No reference sprite, sound, font,
palette or archive is included in or required by this project, and no reference
executable was ever run.
