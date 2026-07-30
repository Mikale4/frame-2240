# Babel Sword: Reignition

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
| Main gun — **melee at close range** | `J` | `A` |
| Heavy shot | `K` | `X` or `Y` |
| Sub weapon (homing missiles) | `L` | `B` |
| Scatter shot | `↓`, `→` + `J` | same motion |
| Lance beam | `↓`, `←` + `K` | same motion |
| Missile salvo | `↓`, `→` + `L` | same motion |

Hold the main gun or heavy button to auto-fire. The main gun becomes a **sword
attack** automatically when you are close enough.

### Defence and meter

| Action | Keyboard | Gamepad |
| --- | --- | --- |
| Barrier burst / hold to guard | `F` | `LB` / `LT` |
| Activate Saturation (needs a full meter) | `J` + `K` | `A` + `X` |
| Cycle Saturation mode | `Q` or `Tab` | `Select` |
| Toggle soft-lock / free aim | `E` | Right-stick click |
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
burst out of blockstun or hitstun — at double the cost. Holding the button
instead is a cheaper guard that scales damage down but drains the barrier gauge;
empty it and you are **guard broken** and helpless for nearly a second.

**Melee ignores barriers.** The sword chain is the answer to a turtle. Stage 1
into stage 2 into a launching finisher — but a chain only continues if the
previous swing actually **connected**, so whiffing leaves you in recovery.

**Saturation — three modes, pick before you spend.**

| Mode | What it does |
| --- | --- |
| **SHIELD** | Longer invulnerability, and a bubble that erases incoming shots. Burns the meter twice as fast. |
| **SHOOT** | Damage ×1.5, projectile speed ×1.6, sharper homing, energy regen ×2.2 and an instant half-refill. |
| **SPEED** | Movement ×1.75, boost tank refilled, and the sword chain extends from 3 hits to **6**. |

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

Mechs render as ten separate pivot-centred parts each — core, head, left/right
arm, main/sub weapon, lower body, backpack, left/right thruster. The scale
contract is 120 render px per Blender unit displayed at 0.5, i.e. **1 Blender
unit = 60 logical game pixels**, which is the unit the rig offsets in
`src/data/mechs.ts` use.

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
