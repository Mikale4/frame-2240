# Session Handoff — Babel Sword: Reignition

> Rewritten at the end of a long session (11 commits, D97–D117).
> Supersedes the previous handoff. Everything marked **verified** was confirmed by
> running it.
> Read this, then `CLAUDE.md`, then **`docs/TESTING_PROTOCOL.md`**, then §9.

---

## 1. Do these before working

1. **Read `docs/TESTING_PROTOCOL.md`.** It is the durable home for the rules in
   §9 — this file is rewritten every session and that one is not. Its first rule:
   **test by playing at EXTREME**, never the default NORMAL, because `resourceIq`
   and `droneIq` execute at no other tier.
2. **Report EXTREME first.** HARD is a corroborating second sample.
3. **Report win rate, not just lead.** They are different numbers and were
   confused once this session. See §5.
4. **Keep the app window foregrounded.** When the Browser pane loses focus the
   browser stops compositing: rAF drops under 1 fps and the Phaser loop freezes.
   **`document.hidden` still reports `false`** — measure rAF, or just use
   `setTimeout` waits, which keep working when throttled.
5. **Start the dev server**: `npm run dev` from Bash. It takes the first free
   port; this session used **5180**.
6. **Write commit messages and long doc blocks to a file, then `git commit -F`.**
   Backticks and quotes inside a shell heredoc break the command. This cost time
   three times this session.

---

## 2. What this is

An original 2D free-flight mecha combat game — TypeScript, Phaser 3, Vite,
Vitest. Inspired by the combat design of the read-only references at the
workspace root, entirely original in code, art, audio, characters and story.
`CLAUDE.md` at the workspace root is authoritative.

**State: well past the vertical slice.** Title → menu → mech select → battle →
results, 8 mechs, full SFX, a 17-track score, real art, pilot dialogue, four AI
tiers, eight playstyles, eight drone roles, two chassis passives, and an Archive
of 21 lore entries.

---

## 3. Current status — verified

* **585 tests pass** (28 files), typecheck clean, production build clean.
* **Working tree clean** on `master`. No other branches.
* `docs/DECISIONS.md` runs to **D117**.
* **`tools/probe/balance.ts` is the roster instrument** (D97). A full eight-mech
  sweep at 12 seeds is ~50s:

  ```
  npx vite-node tools/probe/balance.ts -- --tier extreme --seeds 12 --matrix
  npx vite-node tools/probe/balance.ts -- --only cirrus --seeds 12
  npx vite-node tools/probe/balance.ts -- --selftest
  ```

  **Run `--selftest` before believing any A/B measured through it.** It requires
  two identical runs to produce bit-identical samples.

---

## 4. NEXT TASK — buff OBELISK, then VESPER

Decided at the end of this session. They are the two machines outside the pack,
and **OBELISK is now what binds the roster spread at both ends** — every further
nerf at the top moves the spread by nothing until the floor comes up.

### 4.1 OBELISK — 36 % wins, −0.100 at EXTREME; 32 %, −0.114 at HARD

Last at or near the bottom of **every** measurement taken this session, at both
tiers. It has had three passes already and none of them was the answer:

* **Dome durability is not the lever.** `DOME_MAX` 620→900 and `DOME_RECOVER`
  600→420 moved EXTREME by **0.001**.
* **Reach is not the lever.** Its main gun reaches 528px and it fights at 563px,
  which looks damning; giving it 864px measured **−0.033, i.e. nothing** (D100).
* **The dome going inert *was* part of it, and is fixed.** The shell is down
  36.9 % of every fight and `dome` has no gun, so AEGIS contributed nothing for a
  third of the match. A broken emitter now falls back on the charge rack (D99),
  worth +0.034.
* **Damage helped** (D103): BREACH GUN 58→66, RAM CHARGE 146→170, AEGIS BEAM
  186→214, SCATTERGUN 32→37, worth ~+0.10.

What still points somewhere: its output is **second-lowest on the roster** while
its durability is second-highest, and it loses ~4.5 dps of escort gun that six
other machines get.

**The standing design constraint is the user's**: *"He is a heavy class mech, so
of course he's going to move slower and stand out as a big target. If you want
him to hit harder then increase dps by making his attacks stronger, but do not
do this at the cost of his defensive capabilities."*

### 4.2 VESPER — 40 % wins, −0.083 EXTREME; 41 %, −0.148 HARD

**Worse at HARD than at EXTREME, and that is the diagnosis.** His kit rests on
`kites` and the sniper stance, and holding range depends on `rangeIq`, which is
**EXTREME-only**. At HARD he cannot enforce the spacing his whole design assumes,
so CIRRUS simply walks him down. It is structural, not numeric — a stat tweak
will not fix a tier-gated dependency.

Two honest directions: give the kite a tier-independent floor, or give him
something that works while crowded.

---

## 5. Roster balance — measured

12 seeds per matchup, both slot orders on the same seed, real 180s round cap.
84 samples per mech; SE ~0.03 on lead.

| Mech | EXTREME | HARD |
| --- | --- | --- |
| CIRRUS | **60 % / +0.108** | 60 % / +0.117 |
| TERRAMOTH | 58 % / +0.059 | 38 % / −0.068 |
| NULLTIDE | 54 % / +0.022 | 58 % / +0.086 |
| HALCYON | **60 % / +0.012** | **71 % / +0.103** |
| NOCTURNE | 48 % / +0.008 | 46 % / −0.029 |
| PYRE | 45 % / −0.026 | 51 % / +0.053 |
| VESPER | 40 % / −0.083 | 41 % / −0.148 |
| OBELISK | **36 % / −0.100** | **32 % / −0.114** |

spread: **EXTREME 0.208, HARD 0.265**.

### Win rate and lead are different numbers

`lead` is the life-bar *margin* a machine finishes ahead by — the game's own
timeout tiebreaker. `win` is the *record*. They disagree whenever an ability
converts losses into narrow survivals rather than winning bigger.

**HALCYON is the standing example**: a mid-pack +0.012 lead and the joint-highest
60 % win rate at EXTREME, 71 % at HARD. Reading only the spread would say there
is nothing to look at. That mistake was made once this session; the probe now
prints both.

---

## 6. The two chassis passives

Declared as `MechDef` fields and absent on the other six. Both once per match.

* **HALCYON — LAST STAND** (D113/D114/D117). A killing blow leaves it at 1 hull
  with a **five-second** clock in which nothing can kill it. It stops the death
  and *nothing else*: hitstun, knockback, statuses and the cancelled attack all
  land normally. Worth +8 points of win rate over its stripped baseline; at ten
  seconds it was worth +29, and it is worth more at HARD than at EXTREME.
* **CIRRUS — OVERDRIVE** (D115/D116). At a quarter hull, all three saturation
  modes run at once for **four seconds** with no burst of her own available. Then
  the thrusters and both guns are **destroyed** for the rest of the match and the
  sword hits ×1.5. She does not become invulnerable — Shield's reduction applies
  but she can be killed throughout.

**A test that drives a mech to low life must strip the passive it is not
testing.** `difficulty.test.ts` uses `LADDER_MECH` and `desperation.test.ts` uses
a CIRRUS without `overdrive`, both for this reason. **Never pin a balance dial
with an equality assertion** — bound it. Two test files broke on tuning this
session for exactly that.

---

## 7. Open questions the user still owes an answer on

1. **A forced SHIELD burst is a losing trade until 75 % meter.**
2. **Music level.** Ships at 70 % against SFX 80 %, picked by reasoning not ear.
3. **Audio duration targets** in `docs/AUDIO_CUE_SHEET.md` are far shorter than
   what was generated.
4. **The Archive says EMBER is "the frailest among current escort units."** True
   by raw hull, false by damage absorbed.
5. **OVERDRIVE's opening fires three full saturation bursts at once**, which
   fills a quarter of the screen for about a second. It reads unambiguously as
   "all three" and it is transient, but it is very loud.

---

## 8. Known-open defects

### 8a. The ladder test is slow, and coupled to HALCYON

40 seed pairs on the narrow top rung, 16 on the rest. It measures tiers with
**HALCYON mirrors**, so HALCYON's kit moves it — adding LAST STAND collapsed
every rung to a third of its value (D113). It now uses `LADDER_MECH`, HALCYON
with the passive stripped, which restored D92's calibration exactly. **Insulated
against shared passives only**; a weapon change would still move it. The real fix
is a yardstick that is not a roster mech.

### 8b. `Combatant.fire` builds its projectile spawn field by field

A new `AttackDef` property that is not explicitly copied there never reaches the
projectile — the feature is fully written, the data says it is on, and nothing
happens. **Three times in one session**: `decoyShot` (D102), `homingTicks`, and
`disarms` (D109). Assert on the *pooled projectile*, never on the attack. The
real fix is to spread rather than copy.

### 8c. Any new world-space `Graphics` must join `BattleScene.worldObjects`

Or the UI camera draws a second copy at zoom 1 somewhere else on screen. This is
§4.7 of the protocol, it was read this session, and the sniper overlay shipped
with the bug anyway — a player reported it as a stray empty target box in the
middle of the stage (D107). Cannot be caught in node; the scene needs Phaser.

### 8d. The AI never *chooses* a command motion

It fires lances and spreads 6–13 per minute by accident. Making it deliberate is
tractable: two queued frames, and it preserves the no-private-path rule. It also
closes a real gap — a human has a weapon the CPU never intentionally uses.

### 8e. The ground game does not exist in AI play

`grounded` is **0.0 %** for all eight machines, so `groundedMul`, `walkSpeed`,
`takeoffImpulse` and `groundedBoostRegen` are dead code in anything the harness
measures. TERRAMOTH's identity claims it plays the ground game; it never does.

### 8f. The AI never chooses a sub-weapon

`Btn.Sub` deploys and recalls the drone; the *drone* fires the owner's sub. So a
sub-weapon's whole contribution in any AI-vs-AI measurement is its escort's
doing, and the two gunless roles supply none of it.

### 8g. The roster is spatially homogeneous — partly addressed

33–58 % of every fight is `Evade`. Six attempts to fix it inside `solveEvade` all
cost the top rung; `solveEvade` is load-bearing beyond anything else in the
class. Improved from the *preference* side instead (D94). Do not read "wants X,
gets Y" as a bug by default — it is a symptom on VESPER and correct play on
NULLTIDE (D96).

### 8h. The rest

* **An explicit override equal to its default is a landmine** (D74). A sweep of
  all eight supporter defs is still owed.
* **NOCTURNE is `{ ...HALCYON }`** and silently inherited LAST STAND. Any new
  `MechDef` field added to HALCYON needs a line on NOCTURNE saying whether Halden
  Rook gets it too.
* `droneDeploy` / `droneRecall` events are unreachable.
* `Supporter.Stowed` / `Recalling` are nearly dead states.
* Cues with no trigger: `footstep`, `melee_ignite`, `thruster_loop`, `drone_hover`.

---

## 9. Traps — see `docs/TESTING_PROTOCOL.md`

That file is authoritative and is not rewritten each session. What this session
added:

* **A dial that disagrees with itself has run out of resolution.** Sniper
  projectile speed rose then *fell* past 130; decoy fire period read the same at
  70 and 95. Both were stopping points, not noise to average through.
* **Sweep a dial, never guess it.** Every balance number this session came from a
  3–5 point sweep. Several "obvious" values were wrong by a factor of two.
* **A mechanic can be 75 % implemented, measure as present, and be worth
  nothing.** `hitAndRun` had a timer, a preferred range and a dedicated dash, and
  no steering — inert for its whole life. Found by a player watching the game.
* **Ask what a number means before acting on it.** "The beam only hits 23.7 % of
  the time" was the *disarm rate among hits*; the connect rate was 49.8 %.

**Driving the game from the Browser pane**: `window.__BSR__` is the Phaser game;
`__BSR__.scene.getScene('Battle').sim` is the live `MatchSim`. Use
`game.loop.sleep()`/`wake()`, never a rAF hijack. **`scene.start` will not take
effect while the loop is asleep — wake it first.** A sim frozen at a fixed tick is
usually the **pause menu**: call `scene.closePause()`. When the pane is not
foregrounded it composites at ~12 fps — use `setTimeout` waits rather than rAF,
and take a screenshot first to bring it forward. **Leave the game unpaused and
restore any setting you touch.**

---

## 10. Roster reference

| Mech | Pilot | HP | Drone | Role | Passive |
| --- | --- | --- | --- | --- | --- |
| HALCYON `AV-07` | Naia Vesk | 1750 | ARBITER | designator + paint | energy regen ×1.45 · **LAST STAND** |
| NOCTURNE `AV-13` | Halden Rook | 1750 | WARDEN | tether | barrier regen ×2 |
| VESPER `AV-12` | Kestrel Doyne | 1490 | SIGHTLINE | interceptor + paint | damage dealt ×1.14 · **SNIPER MODE** |
| TERRAMOTH `HV-03` | Brunn Okonkwo | 2490 | BULWARK | miner | damage taken ×0.92 |
| CIRRUS `LT-21` | Mira Holloway | 1440 | WISP | arcTether | boost regen ×2 · **OVERDRIVE** |
| OBELISK `GD-09` | Saar Tengku | 2070 | AEGIS | dome | guard drain ×0.55 |
| PYRE `IN-05` | Rasa Volkov | 1860 | EMBER | hazard | saturation gain ×1.8 |
| NULLTIDE `EW-14` | Io Senna | 1610 | STATIC | decoy ×2 | *opponent's* energy regen ×0.5 |

**Paint is an ability, not a role** (D106): `SupporterDef.paints`, defaulting to
`role === 'designator'`. ARBITER and SIGHTLINE both carry it.

**VESPER has SNIPER MODE** (D107–D111): `Btn.Heavy` is a *switch* on that chassis,
not a shot. Six seconds at a third movement speed, one weapon, a thin fast
auto-aiming beam at one shot a second that is **not** a lance — a guard takes
80 % off it — with a 50 % chance of knocking a weapon offline for five seconds.
Anything that presses Heavy without knowing this will strobe the stance; there
are three guards in `RivalAI` for exactly that.

**NULLTIDE throws two projections** (D113), on opposite sides, staggered by half
a period. Each can be **shot down** in one clean hit (D112) — and two thirds of
them are, incidentally, because rounds aimed at her hit the silhouette instead.

**Pilot genders are fixed by `docs/PILOT_PORTRAIT_SPEC.md`** — four women, four
men. **Mechs are "it"; pilots get their own pronouns. The present is 43 CE.**

---

## 11. Documents worth reading

| File | What it holds |
| --- | --- |
| `CLAUDE.md` (workspace root) | Project rules, structure, definition of done |
| **`docs/TESTING_PROTOCOL.md`** | **How to verify. Test at EXTREME; the traps** |
| **`docs/TIER_LIST.md`** | Measured tiers, the matchup chart, which fights are fair |
| `docs/DECISIONS.md` | **D1–D117.** D97–D117 are this session's |
| **`tools/probe/balance.ts`** | **The roster instrument.** Run `--selftest` first |
| `src/data/archive.ts` | The story bible: 21 entries |
| `src/data/droneRoles.ts` | What each escort does, on the select screen |
| `docs/PILOT_PORTRAIT_SPEC.md` | **Authoritative** on pilot gender, age, appearance |
| `docs/MUSIC_CUE_SHEET.md` | 17 tracks, every Suno prompt |
| `docs/AUDIO_CUE_SHEET.md` | 40 SFX cues / 71 files |
| `docs/IMPLEMENTATION_PLAN.md` | Architecture and milestones |
