# Session Handoff — Babel Sword: Reignition

> Rewritten at the end of a very long session (18 commits, D83–D96).
> Supersedes the previous handoff. Everything marked **verified** was confirmed
> by running it.
> Read this, then `CLAUDE.md`, then **`docs/TESTING_PROTOCOL.md`**, then §9.

---

## 1. Do these before working

1. **Read `docs/TESTING_PROTOCOL.md`.** It is the durable home for the rules in
   §9 — this file is rewritten every session and that one is not. Its first rule:
   **test by playing at EXTREME**, never the default NORMAL, because `resourceIq`
   and `droneIq` execute at no other tier.
2. **Report EXTREME first.** HARD is a corroborating second sample.
3. **Keep the app window foregrounded.** When it loses focus the browser stops
   compositing: rAF drops under 1 fps and the Phaser loop freezes.
   **`document.hidden` still reports `false`** — measure rAF instead.
4. **Start the dev server**: `npm run dev` from Bash. Ports 5173–5180 are held by
   stale servers; last session used **5181**.
5. **Write commit messages with the Write tool, then `git commit -F`.** Backticks
   inside a shell heredoc trigger command substitution and the commit fails.

---

## 2. What this is

An original 2D free-flight mecha combat game — TypeScript, Phaser 3, Vite,
Vitest. Inspired by the combat design of the read-only references at the
workspace root, entirely original in code, art, audio, characters and story.
`CLAUDE.md` at the workspace root is authoritative.

**State: well past the vertical slice.** Title → menu → mech select → battle →
results, 8 mechs, full SFX, a 17-track score, real art, pilot dialogue, four AI
tiers, eight playstyles, eight drone roles, and an Archive of 21 lore entries.

---

## 3. Current status — verified

* **505 tests pass** (24 files), typecheck clean, production build clean.
* **Working tree clean** on `master`. No other branches.
* `docs/DECISIONS.md` runs to **D100**.
* **Suite runtime ~35s.** Deliberate — see §8a.
* **`tools/probe/balance.ts` is the roster instrument** (D97). A full eight-mech
  sweep is ~20s:

  ```
  npx vite-node tools/probe/balance.ts -- --tier extreme --matrix
  npx vite-node tools/probe/balance.ts -- --selftest
  ```

  Run `--selftest` before believing any A/B measured through it.

---

## 4. What landed

**This session — D97–D100, the roster tuning pass.** A committed balance
instrument with a self-test (`tools/probe/balance.ts`); TERRAMOTH's three stacked
defensive multipliers trimmed to two, +0.256 → +0.132; a broken AEGIS dome now
falls back on its gun rather than going inert for a third of the fight; and one
measured negative result — a held guard banking saturation is a real fix for a
real identity defect and it flattens the difficulty ladder, so it is reverted and
written up. **Spread 0.459 → 0.322 at EXTREME, 0.351 → 0.275 at HARD.**

**The session before — D83–D96.** The short version:

* **All four invisible drone roles are drawn** (D83/D84) — AEGIS's dome, WARDEN's
  Verlet-rope tether, ARBITER's paint reticle, plus WISP's stale-flag fix. §8a of
  the old handoff is closed.
* **The `AiPlan` layer** (D85–D87) — committed multi-tick intents gated on a new
  `planIq`, EXTREME's alone. `Execute`, `Starve`, `Vigil` ship; `Breach`,
  `GuardBreak`, `DroneHunt`, `Counterpunch` were built, measured and removed.
  **`EXTREME vs HARD` +0.012 → +0.147.**
* **`difficulty.test.ts` rebuilt** (D92) so it can resolve what it asserts.
* **Pilots fight the way they are written** (D94) — `styleMul` was computed and
  never used in the `rangeIq` path, so at EXTREME the pilot's range preference
  was dead code.
* **Kit changes**: WARDEN heals hull, ARBITER's paint guides rounds, SIGHTLINE
  gained the **breaker pulse**, AEGIS's dome became **consumable**, NULLTIDE's
  projection trades volume for threat.

---

## 5. NEXT TASK

> **Roadmap:** the campaign comes **after the roster doubles to sixteen mechs and
> sixteen pilots**. Do not start CAMPAIGN before that.

### 5.1 The roster tuning pass — TERRAMOTH done, OBELISK still open

**TERRAMOTH is fixed** (D98): it stacked three multipliers on one axis — biggest
hull, best `defence.mul`, and the roster's only *defensive* drone passive — for
3712 effective HP, 1.54× the next machine. Its damage was below average the whole
time; it won by not dying. Trimming the two invisible multipliers took it from
**+0.256 to +0.132** at EXTREME. Spread **0.459 → 0.322**.

**OBELISK is the outstanding problem: −0.137 EXTREME, −0.173 HARD.** It is the
only machine outside the pack at either tier. Four measurements to start from
rather than repeat:

* **Dome durability is not the lever.** `DOME_MAX` 620→900 and `DOME_RECOVER`
  600→420 moved EXTREME by **0.001**.
* **Dome *downtime* was part of it, and is now fixed** (D99). The shell is down
  36.9 % of every fight and `dome` has no gun, so AEGIS was idle for a third of
  the match. A broken emitter now falls back on the charge rack: **−0.187 →
  −0.153**.
* **Reach is not the answer.** Its main gun reaches 528px and it fights at 563px,
  which looks damning. Giving it 864px measured **−0.033 — nothing.**
* **A general saturation rule is not the answer either.** Making a held guard
  bank meter fixed a genuine identity defect and flattened the difficulty ladder;
  see D100 before trying it again.

What is left pointing somewhere: OBELISK's output is **20.9 dps, second-lowest**,
while its durability is second-highest, and it loses ~4.5 dps of escort gun that
seven other machines get. It needs offence, and not by widening a number that
already misses.

**NULLTIDE is now the floor at EXTREME (−0.190)** and PYRE the ceiling-adjacent
(+0.103). Neither was in scope this pass. NULLTIDE reads fine at HARD (+0.011),
so whatever it is, it is EXTREME-specific.

### 5.2 The rest

1. **Eight more mechs and pilots**, the gate on the campaign.
2. **A second arena.** `session.arena` and the music stage slot already route
   through data; `render/Backdrop.ts` is the hard-coded part.
3. **Deliberate command motions for the AI** — see §8c. Real, scoped, and it
   closes a genuine player/CPU gap.

---

## 6. Roster balance — measured

`npx vite-node tools/probe/balance.ts -- --tier extreme`. Six seeds per matchup,
both slot orders on the same seed, real 180s round cap. Standard error ~0.045.

| | EXTREME | | HARD |
| --- | --- | --- | --- |
| 1 | TERRAMOTH +0.132 | | PYRE +0.103 |
| 2 | PYRE +0.103 | | CIRRUS +0.052 |
| 3 | NOCTURNE +0.086 | | NOCTURNE +0.046 |
| 4 | VESPER +0.051 | | NULLTIDE +0.011 |
| 5 | HALCYON +0.002 | | HALCYON +0.001 |
| 6 | CIRRUS −0.048 | | VESPER −0.014 |
| 7 | OBELISK −0.137 | | TERRAMOTH −0.025 |
| 8 | **NULLTIDE −0.190** | | **OBELISK −0.173** |

spread: **EXTREME 0.322, HARD 0.275**, from 0.459 / 0.351 at the start of the
pass. Both inside the healthy 0.30–0.40 band.

**Mean fight is 46s of a 180s round**, so nearly every match is a kill rather
than a timeout and the lead is dominated by who dies. The probe reports net kills
per fight (`ko`) alongside the lead for that reason.

**Six seeds minimum.** A three-seed run once read as a 0.068 collapse that six
seeds turned into 0.025.

---

## 7. Open questions the user still owes an answer on

1. **A forced SHIELD burst is a losing trade until 75 % meter.**
2. **Music level.** Ships at 70 % against SFX 80 %, picked by reasoning not ear.
3. **Audio duration targets** in `docs/AUDIO_CUE_SHEET.md` are far shorter than
   what was generated.
4. **The Archive says EMBER is "the frailest among current escort units."** True
   by raw hull, false by damage absorbed.

---

## 8. Known-open defects

### 8a. The ladder test is slow, and that is the price of it working

40 seed pairs on the narrow top rung, 16 on the rest, floors ~2.5σ below measured
values. It previously asserted at ~1σ on six pairs and passed or failed on luck.
**It measures the tiers with HALCYON mirror matches**, so any change to HALCYON's
kit can move it — that coupling is still there.

### 8b. The roster is spatially homogeneous — partly addressed

D91/D93 diagnosed it: machines are on station 15–30 % of the time because
**33–58 % of every fight is `Evade`**, which scores dodges on threat clearance
alone. Six attempts to fix it inside `solveEvade` all cost the top rung.
**`solveEvade` is load-bearing beyond anything else in the class** — EXTREME's
advantage is disproportionately made of evasion quality.

D94 improved it from the *preference* side instead (spread 184px → 363px). The
remaining obstacle is a property of the game, not the AI: **closing is achievable
unilaterally, withdrawing is not.** Spacing must be *enforceable* before a
preference for it can be expressed — which is exactly what SIGHTLINE's breaker
pulse does for VESPER, and the model for anyone else who needs it.

**Do not read "wants X, gets Y" as a bug by default.** It is a symptom on VESPER
and correct play on NULLTIDE, whose three simultaneous threats mean 522px is
where she wants to be. See D96.

### 8c. The AI never *chooses* a command motion

It fires lances and spreads **6–13 per minute** by accident — `Down` then
`Back`+`Heavy` falls out of drifting and shooting. It never fires one because the
shot was right. Making that deliberate is tractable: the rival already emits a
direction and buttons every tick, so it is two queued frames, and it preserves
the no-private-path rule. It would also close a real gap — right now a human has
a weapon the CPU never intentionally uses.

### 8e. The ground game does not exist in AI play

Measured across all 28 matchups at EXTREME: **`grounded` is 0.0 % for every one
of the eight machines.** `groundedMul`, `walkSpeed`, `takeoffImpulse` and
`groundedBoostRegen` are therefore dead code in anything the harness measures.

It matters most to TERRAMOTH, whose written identity is "happiest planted on the
deck" and whose 0.66 bracing bonus is the largest on the roster: 5624 grounded
effective HP that never once happens. A human player can still land; the CPU
never does. Either the AI should have a reason to plant, or the identity should
stop claiming it does. See D97.

### 8f. The AI never chooses a sub-weapon

`Btn.Sub` deploys and recalls the drone; the *drone* fires the owner's sub on its
own schedule. So a sub-weapon's entire contribution to any AI-vs-AI measurement
is its escort's doing, and the two gunless roles (`dome`, `interceptor`) supply
none of it. Anything tuned about a sub-weapon is tuned for the human player only,
and will measure flat here. Related to §8c but not the same gap.

### 8d. The rest

* **`element` in `chooseAttack` produces byte-identical results in a HALCYON
  mirror** — it never fires there. A mirror cannot show whether it is dead
  roster-wide.
* **An explicit override equal to its default is a landmine** (D74). A sweep of
  all eight supporter defs is still owed.
* **`droneDeploy` / `droneRecall` events are unreachable.**
* **`Supporter.Stowed` / `Recalling` are nearly dead states.**
* Cues with no trigger: `footstep`, `melee_ignite`, `thruster_loop`, `drone_hover`.

---

## 9. Traps — see `docs/TESTING_PROTOCOL.md`

That file is authoritative and is not rewritten each session. Last session added
four rules worth carrying:

* **Check the instrument before believing the result.** Three measurements were
  believed and overturned in one session: a plan ablation confounded by shared
  flags (D86), a probe whose two arms were different fights so an inert rule
  reported −0.079 (D90), and `difficulty.test.ts` itself (D92). **An inert change
  must measure exactly zero; that property is the probe's own self-test.**
* **A behaviour's value is a property of the AI it sits in.** `weaponIq` measured
  −0.129 before the plan layer and −0.014 after.
* **When consecutive settings of a dial disagree in a direction the mechanism
  cannot explain, the dial has run out of resolution.** Two sweeps were run past
  that point; both were noise.
* **Do not trust a code comment about behaviour — measure it.** `chooseAttack`
  claimed the rival never produces command motions. A branch was built on that
  and thrown away when a player said he had watched every mech fire one.

**Driving the game from the Browser pane**: `window.__BSR__` is the Phaser game;
`__BSR__.scene.getScene('Battle').sim` is the live `MatchSim`. Use
`game.loop.sleep()`/`wake()`, never a rAF hijack. **`scene.start` will not take
effect while the loop is asleep — wake it first.** A sim frozen at a fixed tick
is usually the **pause menu**: `BattleScene.onBlur` auto-pauses and
`resize_window` triggers it; call `scene.closePause()`. Session state can be
driven with `await import('/src/core/Session.ts')`. **Leave the game unpaused and
restore any setting you touch** — audio persists under `bsr.audio.v1`; defaults
are music 7, sfx 8.

**Catching a one-tick event**: poll a cooldown that the event sets, not the event
itself. `sim.events` is cleared every tick and a 35 ms poll misses it.

---

## 10. Roster reference

| Mech | Pilot | HP | Drone | Drone HP | Role | Passive |
| --- | --- | --- | --- | --- | --- | --- |
| HALCYON `AV-07` | Naia Vesk | 1750 | ARBITER | 420 | designator | energy regen ×1.45 |
| NOCTURNE `AV-13` | Halden Rook | 1750 | WARDEN | 440 | tether | barrier regen ×2 |
| VESPER `AV-12` | Kestrel Doyne | 1490 | SIGHTLINE | 350 | interceptor | damage dealt ×1.14 |
| TERRAMOTH `HV-03` | Brunn Okonkwo | 2490 | BULWARK | 595 | miner | damage taken ×0.92 |
| CIRRUS `LT-21` | Mira Holloway | 1440 | WISP | 335 | arcTether | boost regen ×2 |
| OBELISK `GD-09` | Saar Tengku | 2070 | AEGIS | 510 | dome | guard drain ×0.55 |
| PYRE `IN-05` | Rasa Volkov | 1860 | EMBER | 300 | hazard | saturation gain ×1.8 |
| NULLTIDE `EW-14` | Io Senna | 1610 | STATIC | 385 | decoy | *opponent's* energy regen ×0.5 |

**Drone roles now, after last session:**

* **`dome`** — consumable. 900 damage of shell, 420-tick recovery. Thins and
  stutters visibly as it fails. **While the shell is rebuilding it fires the
  owner's sub-weapon instead** (D99) — the only role whose charge-rack use is
  conditional.
* **`tether`** — barrier fast, hull slow.
* **`designator`** — ×1.2 damage taken, plus 0.012 rad/tick guidance on the
  painter's rounds.
* **`interceptor`** — one round deleted per 26 ticks within 320px **of the
  pilot**, plus the **breaker pulse**: while a chain is landing, interrupt it,
  18 damage, both machines thrown apart. Doctrine is `shadow`, not `screen`.
* **`decoy`** — 30 % stun chance, 28-tick fire period.
* **`dome` and `interceptor` never fire a gun** — the only two roles missing from
  `SPENDS_CHARGES`.

**Pilot doctrine**, from `meleeAppetite`: brawler ≥ 0.15 (PYRE, CIRRUS), marksman
≤ −0.15 (VESPER, NULLTIDE); the rest use the reach calculus. `hitAndRun` (CIRRUS,
NULLTIDE) dashes clear after a chain.

**Pilot genders are fixed by `docs/PILOT_PORTRAIT_SPEC.md`** — four women, four
men. **Mechs are "it"; pilots get their own pronouns. The present is 43 CE.**

---

## 11. Documents worth reading

| File | What it holds |
| --- | --- |
| `CLAUDE.md` (workspace root) | Project rules, structure, definition of done |
| **`docs/TESTING_PROTOCOL.md`** | **How to verify. Test at EXTREME; the traps** |
| `docs/DECISIONS.md` | **D1–D100.** D97–D100 are the roster tuning pass |
| **`tools/probe/balance.ts`** | **The roster instrument.** Run `--selftest` first |
| `src/data/archive.ts` | The story bible: 21 entries |
| `src/data/droneRoles.ts` | What each escort does, in one sentence, on the select screen |
| `docs/PILOT_PORTRAIT_SPEC.md` | **Authoritative** on pilot gender, age, appearance |
| `docs/MUSIC_CUE_SHEET.md` | 17 tracks, every Suno prompt |
| `docs/AUDIO_CUE_SHEET.md` | 40 SFX cues / 71 files |
| `docs/IMPLEMENTATION_PLAN.md` | Architecture and milestones |
