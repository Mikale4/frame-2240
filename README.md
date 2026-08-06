# F.R.A.M.E. 2240

**Field-Rated Aerial Manoeuvre Element.** Nobody says the five words any more.
Developed under the working title *Babel Sword: Reignition*.

An original 2D free-flight mecha combat game — momentum flight, soft-lock
gunnery, a hit-confirmed sword chain, a barrier that banks damage into your
super meter, and a three-mode **Saturation** overdrive.

Built with TypeScript · Phaser 3 · Vite · Vitest. All art is generated in
Blender from the scripts in `tools/blender/`; all sound is synthesised at
runtime. Nothing from the reference material is redistributed.

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

**Every control is remappable.** Pick `CONTROLS` on the title screen: arrows to
choose an action, `ENTER` then press the key or pad button you want, `BACKSPACE`
to unbind, `R` to restore defaults, `ESC` to close. Bindings save automatically
and persist between sessions.

Keys are stored by *physical position*, so a binding made on QWERTY stays on the
same physical key on AZERTY/QWERTZ. Assigning a key that already belongs to
another action moves it, so nothing is ever double-bound. Each action holds up to
two keys and two pad buttons — which is how the defaults give you both WASD and
the arrow keys.

The defaults below are what you start with; any gamepad works and can be plugged
or unplugged mid-match.

### Flight

| Action | Keyboard | Gamepad |
| --- | --- | --- |
| Move (8-direction free flight) | `W A S D` or arrows | Left stick / D-pad |
| **Boost** — hold *with* a direction | `Shift` or `Space` | `RB` / `RT` |
| **Dash** — tap *with* a direction | `Shift` or `Space` | `RB` / `RT` |
| **Air brake** — hold with *no* direction | `Shift` or `Space` | `RB` / `RT` |

> One button, three jobs. Dashing spends a chunk of boost, moves you fast, and
> **cannot guard** — it is a commitment.

### Weapons

| Action | Keyboard | Gamepad |
| --- | --- | --- |
| Main gun | `J` | `A` |
| **Sword / melee** | `U` | `Y` |
| Heavy shot | `K` | `X` |
| **Drone — deploy / recall** | `L` | `B` |
| Flight mode on/off | `C` | R-stick click |
| Scatter shot | `↓`, `→` + `J` | same motion |
| Lance beam | `↓`, `←` + `K` | same motion |
| Drone salvo | `↓`, `→` + `L` | same motion |

Hold the main gun button to auto-fire. **Melee has its own button** — a swing is
always a deliberate commitment, and it lunges forward, so it stays useful from
outside contact range rather than only firing when you happen to be close.

**Flight mode.** You start airborne. Toggling flight off drops you to the deck,
where you walk instead of fly, brace better against damage, and refuel boost
faster — but you give up free movement. Taking off kicks you upward, and a heavy
shot takes off automatically.

**Your supporter drone.** You do not carry the sub-weapon — a small drone flying
in formation does, and every machine has its own. HALCYON is escorted by
**ARBITER**, NOCTURNE by **WARDEN**; all eight are different designs with
different hit points, different reach and their own passive.

The drone button is a **toggle**, not a fire command. You start with the drone
deployed. While it is on station it does two things for you: it picks its own
moments to fire its volley at whatever you are fighting, and its passive is live
— ARBITER speeds your energy regeneration, WARDEN refills your barrier twice as
fast, SIGHTLINE makes everything you fire hit harder, and so on. The select
screen lists each one.

The catch is that a deployed drone can be **shot down, permanently**. It has its
own small hit-point bar, it takes far fewer hits than a mech, and once it is
destroyed it is gone for the rest of the match — no passive, no volleys, and the
button answers with a refusal tone. Recalling it folds it back into your chassis,
where it is untouchable and slowly repairs, but you give up the passive and the
free damage while it is away. Both bars are drawn on the drone itself: hit points
on top, volley readiness below.

The quarter-circle salvo motion still works while the drone is on station, for
when you want the heavy volley *now* rather than when the drone decides.

### Defence and meter

| Action | Keyboard | Gamepad |
| --- | --- | --- |
| Barrier burst / hold to guard | `F` | `LB` / `LT` |
| **Activate Saturation** | `E` | R-stick click |
| Cycle Saturation mode | `Q` or `Tab` | `Select` |
| Manual aim | — | Right stick |

### System

| Action | Keyboard | Gamepad |
| --- | --- | --- |
| Pause | `Esc` or `P` | `Start` |
| Menus | Arrows / `W` `S`, `Enter` or `J` | D-pad, `A` |
| Remap controls | Title → `CONTROLS` | — |
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

* **Versus CPU** — you against the rival frame.
* **CPU vs CPU** — both sides driven by the AI; useful for watching balance.
* **Training** — the rival stays passive until you land the first hit, and the
  clock is effectively disabled.

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
  input/        keyboard + gamepad → InputFrame
  render/       mech rig renderer, effects, parallax backdrop, textures
  ui/           HUD and menus
  audio/        procedural Web Audio SFX
  debug/        F1 text readout, F2 hitbox view
  scenes/       Boot → Title → Battle → Results
  tests/        Vitest suites (70 tests)
assets/
  sprites/mechs/   20 part PNGs, pivot-centred
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
npm test           # 70 deterministic combat tests
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

* At extreme separation the camera hits its zoom-out clamp (0.74) and a pilot can
  leave the frame; off-screen indicators are planned.
* Two mechs and one arena — this is the vertical slice, not the full roster.
* Sound is synthesised and functional rather than characterful.
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
