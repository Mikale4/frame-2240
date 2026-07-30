# Implementation Plan

**Babel Sword: Reignition** — an original 2D free-flight mecha fighter.
Companion documents: [`REFERENCE_AUDIT.md`](REFERENCE_AUDIT.md) for the evidence
behind the combat model, [`DECISIONS.md`](DECISIONS.md) for the running decision log.

---

## 1. Architecture

The single most important structural rule: **the simulation does not import
Phaser.** Combat is a pure, deterministic, fixed-step module; Phaser is only a
presentation and input host bolted onto it.

```
                 ┌──────────────────────────────────────────┐
   input/        │  InputManager  (keyboard + gamepad)      │
                 │      ↓ InputFrame { dx,dy,held,pressed } │
                 └──────────────────────────────────────────┘
                                    ↓
   ai/           RivalAI ── emits the *same* InputFrame ─────┐
                                    ↓                        │
                 ┌──────────────────────────────────────────┐ │
   combat/       │  MatchSim  (fixed 60 Hz, seeded RNG)     │◀┘
   projectiles/  │    Combatant ×2   ProjectilePool         │
   mechs/        │    FlightModel  AttackData  CommandBuffer│
   data/         │    ── emits SimEvent[] per tick ──       │
                 └──────────────────────────────────────────┘
                                    ↓ read-only
                 ┌──────────────────────────────────────────┐
   render/       │  MechRenderer  Effects  Backdrop         │
   ui/  audio/   │  Hud  Menu  Sfx                          │
   debug/        │  DebugOverlay                            │
   scenes/       │  Boot → Title → Battle → Results         │
                 └──────────────────────────────────────────┘
```

### Layer rules

| Layer | May import | Must not import |
| --- | --- | --- |
| `core/`, `combat/`, `projectiles/`, `mechs/`, `data/`, `ai/` | each other | `phaser`, anything in `render/ ui/ scenes/ audio/ debug/` |
| `render/`, `ui/`, `audio/`, `debug/`, `scenes/`, `input/` | anything | — |

This is what makes the combat logic testable under Vitest in a plain Node
environment, and it is why `npm test` needs no DOM.

### Key modules

* **`core/`** — `GameConfig` (title, resolution, tick rate, arena size),
  `MathUtil` (angle slew, clamping), `Rng` (seeded mulberry32, save/restore),
  `Session` (cross-scene mode/difficulty state).
* **`combat/types.ts`** — the shared vocabulary: `Btn`, `InputFrame`, `SatMode`,
  `ActState`, `Phase`, `ProjKind`, `BarrierResponse`, `SimEvent`, `MatchPhase`.
* **`combat/FlightModel.ts`** — a pure `stepFlight(state, def, intent)`.
* **`combat/AttackData.ts`** — `AttackDef`: startup/active/recovery plus damage,
  hitstop, hitstun, knockback, recoil, projectile shape and melee chain metadata.
* **`combat/CommandBuffer.ts`** — a ring buffer of directional/button symbols in
  numpad notation, matched against `Motion` tables. Mirrors MUGEN's `~D, F, y`
  grammar and its `command.time` budget.
* **`combat/Combatant.ts`** — one mech: gauges, action state machine, barrier,
  saturation, melee chain, aim slew, bank, recoil, hit reception.
* **`combat/MatchSim.ts`** — owns both combatants and the projectile pool; steps
  them, resolves collisions, enforces separation, decides the outcome, and
  publishes `SimEvent[]`.
* **`mechs/MechDef.ts` + `data/mechs.ts`** — mechs are *data*, following the
  reference's one-engine-many-mechs design.
* **`ai/RivalAI.ts`** — a tactic state machine that outputs `InputFrame`.

---

## 2. Determinism

Requirements, all enforced by tests:

1. Fixed 60 Hz tick; the renderer never advances simulation state.
2. All randomness flows through one seeded `Rng` per match.
3. No `Math.random()`, `Date.now()` or `performance.now()` in `combat/`.
4. Visual-only quantities that feed back into nothing (bank, bob, spin) are
   still simulated, so a replay is bit-identical.
5. `Session.seed()` derives from `matchIndex` and difficulty, so a rematch is
   reproducible rather than accidentally identical.

Verified by `match.test.ts › is bit-identical for the same seed and inputs`,
which runs 900 ticks of scripted input through two independent sims and compares
17 state fields.

---

## 3. Milestones

| # | Milestone | Status |
| --- | --- | --- |
| **M0** | Reference audit; project scaffold; docs | **done** |
| **M1** | Deterministic combat core + Vitest suite | **done** |
| **M2** | Blender part pipeline; two mechs; one arena | **done** |
| **M3** | Vertical slice: Title → Battle → Results, HUD, effects, pause, debug, gamepad, production build | **done** |
| **M4** | Content pass: 4–6 mechs, 3 arenas, per-chassis flight feel, walker frames | next |
| **M5** | Mission/arcade layer: objective types, escort/boss roles (`var(51)`-style), simple storyboard | planned |
| **M6** | Training depth: frame-data display, hitbox viewer, input history, save states | planned |
| **M7** | Local versus (2 pads), AI-vs-AI spectate tuning, replay record/playback | planned |
| **M8** | Audio pass: layered music, positional SFX mixing | planned |
| **M9** | Optional Electron packaging | planned |

### M4 detail

* Add walker-class chassis (paired leg parts, ground/flight duality) —
  the reference's `var(1) = [20,59]` family.
* Per-mech flight identity: lighter frames with faster dash recovery, heavier
  frames with more recoil resistance.
* Second and third arena (open nebula, tight interior) to prove the backdrop
  pipeline generalises.
* Extract shared `AttackDef` fragments so a new mech is ~40 lines of data.

---

## 4. Vertical-slice scope (delivered)

Everything CLAUDE.md lists, and where it lives:

| Requirement | Implementation |
| --- | --- |
| Title screen | `scenes/TitleScene.ts` — mode, rival skill, controls, audio |
| Player + CPU mech | `data/mechs.ts` — AV-07 HALCYON, AV-13 NOCTURNE |
| Original arena | `assets/arenas/*` + `render/Backdrop.ts` — CATHEDRAL YARD |
| 8-direction free flight | `combat/FlightModel.ts` |
| Accel, drag, air brake, boost, dash | same; Boost button is overloaded three ways |
| Target lock + facing mounts | `Combatant.updateFacingAndAim`, `inLockCone` |
| Main gun | `HALCYON.main` (VULCAN) |
| Missile sub-weapon | `HALCYON.sub` / `salvo` (SEEKER / SALVO), own charge economy |
| Multi-stage melee | `HALCYON.melee[0..2]`, hit-confirmed chain |
| Barrier / guard | `Combatant.startBarrier`, held-guard + guard break |
| 5-gauge HUD | `ui/Hud.ts` — life, boost, barrier, energy, saturation |
| Hitstop, hitstun, knockback, recoil, sparks, trails, explosions | `Combatant`, `render/Effects.ts` |
| Fair CPU | `ai/RivalAI.ts` — emits `InputFrame`, respects gauges |
| Start / win / loss / results / rematch | `MatchSim.checkEnd`, `scenes/ResultsScene.ts` |
| Pause menu | `BattleScene.openPause` + `ui/Menu.ts` |
| Keyboard + gamepad | `input/InputManager.ts` |
| Debug overlay + hitbox toggle | `debug/DebugOverlay.ts` (F1 / F2) |
| Automated tests | `src/tests/*.test.ts` — 70 tests |
| Production build | `npm run build` → `dist/` |
| Launchers | `run-game.bat`, `build-game.bat` |

---

## 5. Test strategy

Four suites, all engine-free, run by `npm test`:

* **`flight.test.ts` (10)** — speed cap, diagonal normalisation, momentum vs.
  braking, dash cost/cooldown/refusal, boost regen delay, firing anchor, arena
  clamp, determinism.
* **`combat.test.ts` (26)** — attack phase progression and single-fire guarantee,
  energy gating, recoil direction, hitstop freeze, spread angles, sub-charge
  economy; melee proximity switching, whiff-cannot-chain, hit-confirmed chain,
  Speed-mode hit cap, barrier piercing; barrier invulnerability and
  absorb-to-meter, melee through barrier, cancel-cost penalty, guard scaling,
  guard break, no-guard-while-dashing; saturation cycling, full-meter gating,
  per-mode multipliers, Shield double drain, Speed boost refund, Shoot damage
  scaling; death clamping and attack interruption.
* **`commands.test.ts` (18)** — all nine numpad symbols, facing mirroring,
  motion recognition, wrong-button rejection, window expiry, press-recency,
  double-tap consume; angle wrap/slew helpers; RNG reproducibility.
* **`match.test.ts` (16)** — intro→fight transition, bit-identical determinism,
  seed divergence, KO and winner reporting, timeout by life fraction, damage
  over a scripted exchange, arena containment over 1500 ticks, chassis
  separation, NaN-free over 2000 ticks of random play; AI fairness (input frames
  only, `pressed ⊆ held`), AI can damage and be damaged, AI never overspends.

**Runtime checks performed against the live game** (not unit tests): scene flow
Boot→Title→Battle→Results with rematch and return-to-title; pause open/close;
and gamepad resilience against a pad that throws, a pad with null button/axis
arrays, an empty pad, and the gamepad plugin missing entirely.

### Gaps to close in M4+

* No replay-file round-trip test yet (blocked on M7 replay format).
* Effects/HUD have no snapshot tests; visual regressions are caught by the
  `/__shot` capture endpoint (see §6) rather than automatically.
* AI is tested for fairness and effectiveness, not for balance across all eight
  skill levels.

---

## 6. Asset pipeline

```
tools/blender/build_mechs.py ──▶ assets/sprites/mechs/<mech>_<part>.png  (20)
                             └─▶ assets/sprites/mechs/manifest.json
                             └─▶ renders/debug/<mech>_assembled.png
                             └─▶ assets/blender/mechs.blend

tools/blender/build_arena.py ──▶ assets/arenas/arena_{far,mid,near}.png
                             └─▶ assets/blender/arena.blend
```

Driven over the Blender MCP bridge:

```python
exec(open(r"<project>/tools/blender/build_mechs.py").read())
build_all(r"<project>")
```

### Scale contract

`PX_PER_BU = 120` render pixels per Blender unit; sprites are displayed at
`PART_SCALE = 0.5`. Therefore **1 Blender unit = 60 logical game pixels**, and
the rig offsets in `data/mechs.ts` are authored in those same logical pixels.

### Pivot contract

Each part is rendered alone, with its **origin moved to the world origin** and an
orthographic camera aimed there. The pivot is therefore at the exact centre of
every 256×256 PNG, so the game draws each part with `setOrigin(0.5, 0.5)` at its
rig offset and articulation "just works".

### Rendering conventions

* Orthographic camera, 16° azimuth / 7° elevation — a shallow three-quarter view
  so near and far arms read as separate volumes while still mirroring cleanly.
* `film_transparent = True`, RGBA PNG.
* **`view_transform = 'Standard'`** — the default filmic/AgX grade desaturates
  game art and clips every emissive detail to white.
* Emission strengths stay ≤ ~2.5 for the same reason.
* Parallax layers bake depth as exposure (`far −1.3 EV`, `mid −0.35`, `near 0`),
  then the game tints them further at runtime.

### Effects are procedural

`render/Textures.ts` generates glow, spark, ring, streak, slash, shard and hex
textures on a canvas at boot. No effect PNGs ship, and every effect recolours per
mech from `MechDef.tint`.

### Audio is procedural

`audio/Sfx.ts` synthesises all 18 sounds with Web Audio oscillators and filtered
noise. No audio files ship; the context is unlocked on first gesture.

### Visual capture

`vite.config.ts` adds a dev-only `POST /__shot` endpoint that writes a canvas
data URL to `renders/debug/<name>.png`. This is how the game's actual output is
inspected during development, including from headless contexts.

---

## 7. Risks

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Additive effects wash out the mechs | hit us already | Thruster emission is throttled to every other call and all glow scales were cut ~2×; re-check with `/__shot` after any effect change |
| Camera zoom scaling the HUD | hit us already | HUD lives on a separate unzoomed camera (`uiCam`); the backdrop is fitted to `camera.worldView` each frame instead of using `scrollFactor(0)` |
| Blender part-name collisions between mechs | hit us already | Part objects are namespaced `<mech>_<part>`; `render_parts` now raises instead of silently skipping |
| Blender operators failing over MCP | hit us already | All object ops run inside `bpy.context.temp_override(...)` |
| Phaser objects outliving their scene | hit us already | `Menu` marks itself dead on scene `SHUTDOWN`/`DESTROY` |
| Zoom clamp cannot frame extreme separation | low | Clamped to 0.74 deliberately; M4 adds off-screen target indicators |
| Phaser bundle is 1.48 MB | low | Split into its own chunk; 340 kB gzipped |
| Balance drift as mechs are added | medium | Frame data is data-only; add a balance harness in M4 |
| Determinism regressions | medium | Guarded by the bit-identical test; keep `combat/` Phaser-free |
| Gamepad API variance across pads/browsers | medium | Every pad read is individually guarded; four failure modes verified live |

---

## 8. Definition of done for the slice

All met, with the evidence in §5 and in the session report:

- [x] Launchable without editing source (`run-game.bat`)
- [x] A full match starts and finishes
- [x] Movement, boost, ranged, melee, barrier, damage and saturation all function
- [x] The CPU fights and can be defeated
- [x] Gamepad disconnection does not crash
- [x] Rematch and return-to-title work
- [x] Production build succeeds
- [x] No fatal browser-console errors
- [x] README explains launch and controls
