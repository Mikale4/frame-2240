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
* **Working tree clean** on `master`, at **`f28759f`**. No other branches.
* `docs/DECISIONS.md` runs to **D96**.
* **Suite runtime ~24s**, up from ~10s. Deliberate — see §8a.

---

## 4. What landed last session

D83–D96. The short version:

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

### 5.1 The roster wants a tuning pass — this is the concrete job

See §6. **TERRAMOTH +0.266 and OBELISK −0.154** are the outstanding problems.
Spread is 0.421 at EXTREME against a healthy 0.30–0.40.

Two measurements to start from rather than repeat:

* **OBELISK's dome durability is not the lever.** `DOME_MAX` 620→900 and
  `DOME_RECOVER` 600→420 moved EXTREME by **0.001** (−0.219 → −0.218). It is
  worth 0.084 at HARD. Whatever costs OBELISK at the top tier, it is not how long
  the bubble lasts, so do not start there.
* **OBELISK was neutral (−0.002) before the dome was made consumable** (D95). The
  nerf was right for counterplay and cost it ~0.19. It is owed compensation
  somewhere other than the shell.

TERRAMOTH has not been investigated at all. It is the slowest machine, so it
takes the "out-ranged, close in" branch against nearly everyone; a 2490 HP frame
taking ×0.86 damage, fighting close, is exactly as strong as that sounds.

### 5.2 The rest

1. **Eight more mechs and pilots**, the gate on the campaign.
2. **A second arena.** `session.arena` and the music stage slot already route
   through data; `render/Backdrop.ts` is the hard-coded part.
3. **Deliberate command motions for the AI** — see §8c. Real, scoped, and it
   closes a genuine player/CPU gap.

---

## 6. Roster balance — measured

Six seeds per matchup, both slots, at `f28759f`.

| | EXTREME | | HARD |
| --- | --- | --- | --- |
| 1 | **TERRAMOTH +0.266** | | **TERRAMOTH +0.149** |
| 2 | NOCTURNE +0.096 | | PYRE +0.095 |
| 3 | PYRE +0.042 | | HALCYON +0.051 |
| 4 | VESPER +0.020 | | NOCTURNE +0.041 |
| 5 | HALCYON −0.042 | | VESPER +0.039 |
| 6 | CIRRUS −0.074 | | CIRRUS −0.022 |
| 7 | OBELISK −0.154 | | NULLTIDE −0.122 |
| 8 | NULLTIDE −0.155 | | **OBELISK −0.232** |

spread: **EXTREME 0.421, HARD 0.381**.

**HALCYON and VESPER are both fixed.** HALCYON was −0.229 and VESPER −0.178
(worst on the roster); they are now −0.042 and +0.020. ARBITER's guidance and
SIGHTLINE's breaker pulse did that.

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
| TERRAMOTH `HV-03` | Brunn Okonkwo | 2490 | BULWARK | 595 | miner | damage taken ×0.86 |
| CIRRUS `LT-21` | Mira Holloway | 1440 | WISP | 335 | arcTether | boost regen ×2 |
| OBELISK `GD-09` | Saar Tengku | 2070 | AEGIS | 510 | dome | guard drain ×0.55 |
| PYRE `IN-05` | Rasa Volkov | 1860 | EMBER | 300 | hazard | saturation gain ×1.8 |
| NULLTIDE `EW-14` | Io Senna | 1610 | STATIC | 385 | decoy | *opponent's* energy regen ×0.5 |

**Drone roles now, after last session:**

* **`dome`** — consumable. 900 damage of shell, 420-tick recovery. Thins and
  stutters visibly as it fails.
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
| `docs/DECISIONS.md` | **D1–D96.** D83–D96 are last session's |
| `src/data/archive.ts` | The story bible: 21 entries |
| `src/data/droneRoles.ts` | What each escort does, in one sentence, on the select screen |
| `docs/PILOT_PORTRAIT_SPEC.md` | **Authoritative** on pilot gender, age, appearance |
| `docs/MUSIC_CUE_SHEET.md` | 17 tracks, every Suno prompt |
| `docs/AUDIO_CUE_SHEET.md` | 40 SFX cues / 71 files |
| `docs/IMPLEMENTATION_PLAN.md` | Architecture and milestones |
