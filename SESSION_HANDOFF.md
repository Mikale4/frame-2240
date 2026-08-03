# Session Handoff — Babel Sword: Reignition

> Updated after the roster tuning pass (D97–D104). Everything marked
> **verified** was confirmed by running it.
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
4. **Start the dev server**: `npm run dev` from Bash. It picks the first free
   port; last session used **5180**.
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

* **551 tests pass** (26 files), typecheck clean, production build clean.
* **Working tree clean** on `master`. No other branches.
* `docs/DECISIONS.md` runs to **D112**.
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

**This session — D97–D108.** Two blocks.

*The roster tuning pass (D97–D104)* — a committed balance instrument with a
self-test (`tools/probe/balance.ts`), TERRAMOTH's stacked armour trimmed, AEGIS's
broken dome given its gun back, OBELISK given damage only, NULLTIDE's projection
rebuilt, and `hitAndRun` fixed after a player reported the skirmishers dashing
*into* the opponent. Took spread **0.459 → 0.169** with no outliers. Two latent
faults found: `decoyShot` was dropped on the way into the projectile pool so the
flag had never taken effect (D102), and `hitAndRun` had no steering (D104).

*Requested buffs (D105–D108)* — the projection's rounds now auto-aim and the
30 %/60-tick stun is restored (D105); paint became an ability rather than a role
so SIGHTLINE both intercepts and marks (D106); **Sniper Mode** turns VESPER's
heavy into a stance with its own clock, slow, weapon and HUD/world indicators
(D107); and a marksman now *holds* the gap open instead of merely preferring it
(D108). These are deliberate power increases — see the note under §6.

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

### 5.1 The roster tuning pass — done

All three named problems are closed, and a fourth was found by playing.

* **TERRAMOTH** (D98) stacked three multipliers on one axis for 3712 effective
  HP, 1.54x the next machine, while its damage was *below* average. Trimmed the
  two invisible multipliers, left the hull pool alone: **+0.256 → +0.086**.
* **OBELISK** (D99, D103) lost its escort's whole contribution for the 36.9 % of
  each fight its dome spends rebuilding — a role with no gun and no shell. The
  broken emitter now falls back on the charge rack. Then damage, and only damage,
  per the design call: **−0.187 → −0.083**.
* **NULLTIDE** (D101, D102) had a projection that drifted at half her speed,
  vanished for two thirds of a second every cycle, and fired a stun lottery.
  **−0.203 → −0.049.**
* **`hitAndRun` never worked** (D104) — see below.

**Do not chase the remaining ±0.08.** Every value is within about two standard
errors of the field and the ordering is not stable between tiers. There is
nothing left here that a measurement can distinguish from noise.

### 5.1a What is worth knowing from the pass

* **Reach was not OBELISK's problem.** Its main gun falls 35px short of the range
  it fights at, which looks damning; giving it 64 % more measured **−0.033, i.e.
  nothing**. Do not re-derive this.
* **A general rule aimed at one machine is charged to all eight.** Making a held
  guard bank saturation fixed a real identity defect and flattened
  `EXTREME vs HARD` from +0.147 to −0.004. See D100 before trying it again.
* **`difficulty.test.ts` is the only thing that catches that class of fault.**
  The roster sweep called the same change an improvement.

## 6. Roster balance — measured

`npx vite-node tools/probe/balance.ts -- --tier extreme`. Six seeds per matchup,
both slot orders on the same seed, real 180s round cap. Standard error ~0.045.

| | EXTREME | |
| --- | --- | --- |
| 1 | TERRAMOTH +0.089 | |
| 2 | PYRE +0.050 | |
| 3 | NOCTURNE +0.044 | |
| 4 | CIRRUS −0.010 | |
| 5 | NULLTIDE −0.026 | |
| 6 | OBELISK −0.033 | |
| 7 | HALCYON −0.035 | |
| 8 | VESPER −0.079 | |

spread: **EXTREME 0.169, HARD 0.257** (12 seeds; SE ~0.03). **No machine is outside ±0.09 of the field** — the tightest the roster has measured.

> **This is a chosen state, not a regression.** The roster was at 0.169 / 0.242
> with no outliers after the tuning pass (D97–D104). D105 and D107–D109 are
> requested buffs to NULLTIDE and VESPER, and the standing instruction on
> NULLTIDE is explicit: *"don't try and balance the roster, I want to see for
> myself just how much of an overpowered buff it really is."* **Do not quietly
> re-tune either of them.** The levers, when the call is made, are in D105 (the
> projection) and D109 (the disarm chance and cadence — *not* projectile speed,
> which is measured out).
>
> **`playstyles.test.ts`'s roster guard was raised 0.7 → 0.78** to accommodate
> this. Put it back to 0.7 when they are tuned. It still catches the 0.854 the
> first playstyle cut failed at.

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

**`Combatant.fire` builds its projectile spawn field by field.** A new
`AttackDef` property that is not explicitly copied there never reaches the
projectile — the feature is fully written, the data says it is on, and nothing
happens. This has now bitten **three times in one session**: `decoyShot` (D102),
`homingTicks`, and `disarms` (D109). Assert on the *pooled projectile*, never on
the attack. The real fix is probably to spread rather than copy.

**Any new world-space `Graphics` must be added to `BattleScene.worldObjects`**,
or the UI camera draws a second copy of it at zoom 1 somewhere else on screen.
This is §4.7 of the protocol, it was read this session, and the sniper overlay
shipped with the bug anyway — a player reported it as a stray empty target box in
the middle of the stage. It cannot be caught in node, because the scene needs
Phaser. See D107.

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
| VESPER `AV-12` | Kestrel Doyne | 1490 | SIGHTLINE | 350 | interceptor + paint | damage dealt ×1.14 |
| TERRAMOTH `HV-03` | Brunn Okonkwo | 2490 | BULWARK | 595 | miner | damage taken ×0.92 |
| CIRRUS `LT-21` | Mira Holloway | 1440 | WISP | 335 | arcTether | boost regen ×2 |
| OBELISK `GD-09` | Saar Tengku | 2070 | AEGIS | 510 | dome | guard drain ×0.55 |
| PYRE `IN-05` | Rasa Volkov | 1860 | EMBER | 300 | hazard | saturation gain ×1.8 |
| NULLTIDE `EW-14` | Io Senna | 1610 | STATIC | 385 | decoy | *opponent's* energy regen ×0.5 |

**Drone roles now, after last session:**

* **`paints`** is now an *ability*, not a role (D106): any escort may mark, and
  `dronePaints()` is the one predicate both halves of it read. ARBITER and
  **SIGHTLINE** carry it; SIGHTLINE still intercepts and still fires the breaker
  pulse.
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

**VESPER has SNIPER MODE** (D107) — `Btn.Heavy` is a *switch* on that chassis, not
a shot. Anything that presses Heavy without knowing that will strobe the stance;
there are three separate guards in `RivalAI` for exactly this, and the player-side
check sits above the command motions because `MOTIONS.lance` ends in Heavy.

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
| **`docs/TIER_LIST.md`** | **Measured tiers, the full matchup chart, and which fights are fair** |
| `docs/DECISIONS.md` | **D1–D100.** D97–D100 are the roster tuning pass |
| **`tools/probe/balance.ts`** | **The roster instrument.** Run `--selftest` first |
| `src/data/archive.ts` | The story bible: 21 entries |
| `src/data/droneRoles.ts` | What each escort does, in one sentence, on the select screen |
| `docs/PILOT_PORTRAIT_SPEC.md` | **Authoritative** on pilot gender, age, appearance |
| `docs/MUSIC_CUE_SHEET.md` | 17 tracks, every Suno prompt |
| `docs/AUDIO_CUE_SHEET.md` | 40 SFX cues / 71 files |
| `docs/IMPLEMENTATION_PLAN.md` | Architecture and milestones |
