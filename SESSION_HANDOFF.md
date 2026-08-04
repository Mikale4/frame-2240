# Session Handoff — Babel Sword: Reignition

> Rewritten at the end of a long session (15 commits, D118–D126).
> Supersedes the previous handoff. Everything marked **verified** was confirmed
> by running it.
> Read this, then `CLAUDE.md`, then **`docs/TESTING_PROTOCOL.md`**, then §9.

---

## 1. Do these before working

1. **Read `docs/TESTING_PROTOCOL.md`.** It is the durable home for the rules in
   §9 — this file is rewritten every session and that one is not. Its first
   rule: **test by playing at EXTREME**, never the default NORMAL, because five
   AI traits execute at no other tier.
2. **Report EXTREME first.** HARD is a corroborating second sample. It has
   overturned an EXTREME-only conclusion at least once (D120).
3. **Report win rate, not just lead.** They are different numbers and disagree
   whenever an ability converts losses into narrow survivals.
4. **"Last" is not "outlier".** `balance.ts` now prints a `z` column and a
   dispersion line on every full sweep. Use them. See §5 and D122.
5. **Start the dev server**: `npm run dev` from Bash. It takes the first free
   port; the D127 session used **5173**.
6. **Write commit messages and long doc blocks to a file, then `git commit -F`.**
   Backticks and quotes inside a shell heredoc break the command.

---

## 2. What this is

An original 2D free-flight mecha combat game — TypeScript, Phaser 3, Vite,
Vitest. Inspired by the combat design of the read-only references at the
workspace root, entirely original in code, art, audio, characters and story.
`CLAUDE.md` at the workspace root is authoritative.

**State: well past the vertical slice.** Title → menu → mech select → battle →
results, 8 mechs, full SFX, a 17-track score, real art, pilot dialogue, four AI
tiers, eight playstyles, eight drone roles, three chassis passives, an Archive of
21 lore entries, and **a hand-authored six-layer parallax stage**.

---

## 3. Current status — verified

* **592 tests pass** (28 files), typecheck clean, production build clean.
* On `master`, no other branches. `docs/DECISIONS.md` runs to **D127**.
* **`assets/blender/mechs.blend` is modified in the tree and was not touched by
  code work** — it arrived that way at the start of the D127 session (1128348 →
  1137966 bytes), presumably a Blender autosave. Left alone deliberately. Decide
  whether to commit or discard it.
* **Three probes** in `tools/probe/`. Run `--selftest` before believing any A/B:

  ```
  npx vite-node tools/probe/balance.ts   -- --tier extreme --seeds 12 --matrix
  npx vite-node tools/probe/telemetry.ts -- --tier extreme --seeds 12 --only pyre
  npx vite-node tools/probe/outcomes.ts  -- --tier extreme --seeds 12
  npx vite-node tools/probe/balance.ts   -- --selftest
  ```

  * **`balance.ts`** — who is winning. Now prints `z` scores, noise-corrected
    dispersion and an explicit outlier verdict.
  * **`telemetry.ts`** — *how* a machine spent its match: what it threw, how much
    arrived, where the rest went, how it spent its ticks.
  * **`outcomes.ts`** — *how fights ended*. Kills, clock, draws, and how often a
    machine left an opponent alive at one hull.

---

## 4. NOCTURNE — done (D127). Next task is §7 or TERRAMOTH

**Landed: `projSpeed` main 12 → 15, heavy 10.2 → 12.75.** Nothing else changed.
NOCTURNE went **33 % → 45 %** at EXTREME (lead −0.102 → −0.032), 41 % → 48 % at
HARD, and the roster spread fell **0.230 → 0.198**, its best since the deck
became solid.

Both cautions in the old handoff paid for themselves. The baseline re-measured
identically, but **12 → 14 no longer measures flat** — it is worth eight points
now, so the previous sweep's non-linearity did not survive D125. Assuming 16
would have overshot: it puts NOCTURNE third of eight and gives the spread back.

| main / heavy | NOCTURNE | spread |
| --- | --- | --- |
| 12 / 10.2 | 33 % / −0.102 | 0.230 |
| 14 / 12 | 41 % / −0.065 | 0.211 |
| **15 / 12.75** | **45 % / −0.032** | **0.198** |
| 16 / 13.5 | 52 % / +0.034 | 0.224 |

The diagnosis held exactly: it now throws *slightly less* (nominal 397.7 → 380.6)
and lands more (arrive 5.6 % → 7.0 %, net exchange −16.5 → −9.4, kills/deaths
53/111 → 74/92). Only the two changed weapons moved their connect rate; spread and
lance did not drift. Full detail in **D127**.

**What it cost, and the one thing left open.** At EXTREME the gain came out of
OBELISK (−0.33 → −0.09) and VESPER (−0.21 → +0.02) and TERRAMOTH was untouched.
**At HARD it came out of TERRAMOTH**, which crossed the outlier flag for the first
time: −1.89σ → −2.14σ, 32 % → 29 %. That is one matchup (0.00 → +0.22) and all
three swept values cause it equally, so it is not an argument for a smaller step.
**Nothing was bundled to compensate** — see `TIER_LIST.md` §4 and §5. §5 now also
records that **the reasoning D120 rests on has decayed**: TERRAMOTH's exchange
rate is no longer even (76.0 out / 82.6 in) and its matchup row excluding VESPER
is +0.003 rather than +0.063. That decay is *not* from D127.

**Still true and still unused**: HALCYON with LAST STAND stripped measures 36 %
(D122), so the AV frame both machines share is the weakest chassis in the game.
NOCTURNE now performs without a signature; giving it one remains a design
decision rather than a tuning one.

---

## 5. Roster balance — measured

12 seeds per matchup, both slot orders on the same seed, real 180s round cap.
84 samples per mech.

### EXTREME — spread 0.198, no outliers

| Mech | Win | Lead | z(lead/win) |
| --- | --- | --- | --- |
| CIRRUS | **65 %** | +0.118 | +1.69 / +1.94 |
| VESPER | 56 % | +0.094 | +1.34 / +0.80 |
| OBELISK | 51 % | +0.004 | +0.06 / +0.08 |
| HALCYON | 50 % | −0.019 | −0.28 / +0.04 |
| NOCTURNE | 45 % | −0.032 | −0.46 / −0.69 |
| PYRE | 44 % | −0.039 | −0.56 / −0.76 |
| NULLTIDE | 49 % | −0.046 | −0.66 / −0.19 |
| **TERRAMOTH** | **40 %** | **−0.080** | −1.14 / −1.22 |

### HARD — spread 0.284, TERRAMOTH flagged

| Mech | Win | Lead | z(lead/win) |
| --- | --- | --- | --- |
| CIRRUS | 65 % | +0.109 | +1.33 / +1.31 |
| VESPER | 50 % | +0.034 | +0.41 / −0.03 |
| NULLTIDE | 55 % | +0.031 | +0.38 / +0.41 |
| OBELISK | 55 % | +0.028 | +0.34 / +0.44 |
| HALCYON | 60 % | +0.018 | +0.23 / +0.82 |
| NOCTURNE | 48 % | −0.013 | −0.16 / −0.21 |
| PYRE | 39 % | −0.033 | −0.40 / −0.93 |
| **TERRAMOTH** | **29 %** | **−0.175** | **−2.14 / −1.83 ← outlier** |

### Read the dispersion line, not the sort order

**Nothing is beyond ±2σ at EXTREME.** A sorted table always has a bottom row;
that is not the same as having a problem, and calling NOCTURNE "the outlier" off
a sorted list cost a wasted investigation (D122). Roughly 5–12 % of the visible
spread is measurement error at 12 seeds, so a 0.01 gap between neighbours is
noise by construction.

**TERRAMOTH at HARD is the first machine ever flagged**, and the flag is still
not a verdict — it decomposes into a single matchup and fires identically for
every value swept in D127. `TESTING_PROTOCOL.md` §4b now carries the worked
example of how to take one apart.

**The spread went 0.143 → 0.230 → 0.198.** The rise was the honest cost of the
deck becoming solid (D125) plus D126's requested OVERDRIVE extension. The fall
is D127, achieved by lifting the bottom rather than trimming the top.

**At this spread, record is a very sensitive function of margin.** VESPER gained
4.5 % output against 2.3 % intake from the deck and that moved him eight points
of win rate. Expect any mechanical change to read as a balance event.

---

## 6. The three chassis passives

Declared as `MechDef` fields and absent on the other five. All once per match.

* **HALCYON — LAST STAND**. A killing blow leaves it at 1 hull with a five-second
  clock in which nothing can kill it. Stops the death and *nothing else*.
* **CIRRUS — OVERDRIVE**. At a quarter hull, all three saturation modes at once
  for **5.5 seconds** (D126, up from 4), then thrusters and both guns destroyed
  and the sword at ×1.5.
* **OBELISK — full-length SHIELD** (D119). `gauges.satShieldDrain` is a chassis
  dial defaulting to 2; OBELISK alone has 1. **It measures as inert in AI play**
  because the rival never picks SHIELD on that chassis any more — a human-facing
  buff the harness structurally cannot value.

**A test that drives a mech to low life must strip the passive it is not
testing.** **Never pin a balance dial with an equality assertion** — bound it, or
derive it from the def. Three test files learned this the hard way.

---

## 7. Open questions the user still owes an answer on

1. **A forced SHIELD burst is a losing trade until 75 % meter** — *partly
   answered* by D118/D119. It is mechanically half-length and offenceless; the
   drain is now a per-chassis dial rather than a global constant.
2. **Music level.** Ships at 70 % against SFX 80 %, picked by reasoning not ear.
3. **Audio duration targets** in `docs/AUDIO_CUE_SHEET.md` are far shorter than
   what was generated.
4. **The Archive says EMBER is "the frailest among current escort units."** True
   by raw hull, false by damage absorbed.
5. **OVERDRIVE's opening fires three full saturation bursts at once.**
6. **CATHEDRAL YARD has no Archive entry.** `docs/STAGE_ART_BRIEF.md` §2.3
   contains a *proposed* backstory — abandoned post-war drydock, lift network cut
   in the settlement, held by nobody, which is *why* disputes are settled there.
   **It is not canon and must be approved before it is treated as such.**
7. **The codebase calls the arena an "abandoned orbital drydock"** in `README.md`
   and `tools/blender/build_arena.py`. "Orbital" contradicts a setting explicitly
   above a cloud deck at 2,000 m on spars and gantries.
8. **The 110 procedural stars** are kept alongside the painted starfield so the
   two can be compared in play. They add a slow twinkle the painted layer cannot;
   they are otherwise indistinguishable. Drop or keep.

---

## 8. Known-open defects

### 8a. The ladder test is slow, and coupled to HALCYON
Uses `LADDER_MECH`, HALCYON with the passive stripped. Insulated against shared
passives only; a weapon change would still move it. The real fix is a yardstick
that is not a roster mech.

### 8b. `Combatant.fire` builds its projectile spawn field by field
A new `AttackDef` property not copied there never reaches the projectile. Three
times in one session. **Assert on the pooled projectile, never on the attack.**
D123 is the same fault in a different place — see 8i.

### 8c. Any new world-space `Graphics` must join `BattleScene.worldObjects`
Or the UI camera draws a second copy at zoom 1 elsewhere on screen.

### 8d. The AI never *chooses* a command motion
Fires lances and spreads 6–13 per minute by accident. **The lance connects 1–2 %
of the time for every machine on the roster** and is close to worthless in AI
hands.

### 8e. The ground game does not exist in AI play
`grounded` is **0.0 %** for all eight machines. This is what hid the leg fault
(D123) and the floor fault (D125) for so long.

### 8f. The AI never chooses a sub-weapon
A sub-weapon's whole contribution in AI-vs-AI is its escort's doing.

### 8g. The roster is spatially homogeneous — partly addressed
`solveEvade` is load-bearing beyond anything else in the class.

### 8h. Acid is carried by nobody
`Element.Corrosive` is implemented, tuned at 0.42/tick over 210 ticks, and
applied by **no weapon on the roster** — it appears only in test files. Now that
every other element damages, it is the one dead element left.

### 8i. Hand-built stand-ins for growing objects
`BattleScene.decoyState` fabricates a `Combatant` for NULLTIDE's projections and
used `as unknown as Combatant`, which silenced the compiler on exactly the thing
that needed checking. Adding a field to the renderer's pose crashed the live game
while 592 tests stayed green (D123). It now uses `MechPoseSource`. **Look for the
next one of these.**

### 8j. The rest
* **An explicit override equal to its default is a landmine** (D74). A sweep of
  all eight supporter defs is still owed.
* **NOCTURNE is `{ ...HALCYON }`** — the only mech derived from another. It
  inherits `lance`, `spread`, `melee`, `subCharges`, `subRechargeTicks`,
  `lockCone`, `lockRange`. Any new `MechDef` field added to HALCYON needs a line
  on NOCTURNE saying whether Halden Rook gets it too.
* `droneDeploy` / `droneRecall` events are unreachable.
* Cues with no trigger: `footstep`, `melee_ignite`, `thruster_loop`, `drone_hover`.

---

## 9. Traps — see `docs/TESTING_PROTOCOL.md`

That file is authoritative and is not rewritten each session. What D127 added:

* **A caution to re-measure is worth obeying even when it looks like ceremony.**
  The handoff said the dial might not be linear and the baseline was stale. Both
  were live: the baseline reproduced to three decimals, but the step recorded as
  *flat* had become worth eight points of win rate, and the value the previous
  sweep pointed at overshoots on the current roster.
* **When the outlier flag finally fires, take it apart before acting.** It
  decomposed into one matchup and fired identically for every arm swept.
* **A stale table beside a fresh one is worse than no table.** `TIER_LIST.md`
  §1 reproduced exactly while §3 below it was wrong by up to 0.13 in a cell,
  which hid a bad pairing and corrupted the §2 fairness counts derived from it.
* **A kept decision's supporting numbers rot quietly.** D120's rationale for the
  VESPER/TERRAMOTH matchup was four measurements; all four have since moved
  against it and nothing prompted a re-read. Now recorded in `TIER_LIST.md` §5.

What earlier sessions added:

* **Never bundle an incidental change with a fix.** D125 raised the deck floor
  *and* changed the arena's bottom edge from bouncing to absorbing, on reasoning
  that was never measured. Ablated, the incidental change was worth **more than
  the fix it rode in beside** — VESPER 49 % → 61 %, spread 0.143 → 0.229.
* **A play report outranks the harness, and outranks the metric too.** Six for
  six this session. The PYRE case added a wrinkle: his report was right *and* the
  number he was disputing was itself wrong — chasing it exposed a draw-scoring
  bug in `balance.ts` latent since D97.
* **A metric that is fine today can be made wrong by a gameplay change.** Letting
  a status land the killing blow made double KOs common, and the tie branch that
  had been correct-by-irrelevance started crediting draws to whichever machine
  sat later in `ROSTER`.
* **Ask what a number means before acting on it.** `telemetry.ts` counts a round
  stopped by the deck as *contact*, so VESPER's main-gun connect rate appeared to
  jump 17 % → 39 % across D125 with no accuracy change whatsoever.
* **Sweep a dial, never guess it**, and **a dial that disagrees with itself has
  run out of resolution**.
* **A mechanic can be 75 % implemented, measure as present, and be worth
  nothing.**

**Driving the game from the Browser pane**: `window.__BSR__` is the Phaser game.
**Keyboard input frequently does not reach the page at all**, and
`computer{action:'key'}` never reaches Phaser. Clicking the canvas sometimes
restores focus and sometimes does not. **The reliable route is to skip the menus
entirely**:

```js
const mod = await import('/src/core/Session.ts');
Object.assign(mod.session, { mode:'aiVsAi', playerMech:'terramoth',
  enemyMech:'vesper', playerDifficulty:3, enemyDifficulty:3 });
// Stop the menu scenes first — `game.scene.start` does NOT stop its caller, and
// Title left running renders *under* the match and *through* the results screen.
window.__BSR__.scene.stop('Title'); window.__BSR__.scene.stop('Results');
window.__BSR__.scene.start('Battle');
```

`playerDifficulty:3` really is EXTREME — the results screen prints the tier next
to each name, so screenshot it if you want the run's tier on the record.
`getScenes(true)` should name exactly one scene.

A sim frozen at a fixed tick is usually the **pause menu**: call
`scene.closePause()`. Use `game.loop.sleep()`/`wake()`, never a rAF hijack.
**Leave the game unpaused and restore any setting you touch.**

---

## 10. The stage — CATHEDRAL YARD

Six hand-authored parallax layers (D124). **Read
`assets/arenas/source/README.md` before touching any of it** — several shipped
files are *derived* and cannot be regenerated without their masters.

| layer | size | scroll | note |
| --- | --- | --- | --- |
| `sky` | 3072×1024 | 0.02 | levels lifted; over the gradient |
| `far` | 3072×1024 | 0.06 | dark silhouette |
| `haze` | 3072×1024 | 0.11 | alpha 0.64, to sit above `mid` |
| `mid` | 1536×1024 | 0.18 | |
| `near` | 1536×1024 | world | the deck; **`NEAR_LIP_ROW` 748** |
| `fore` | 1536×1024 | **1.35** | alpha 0.62 |

Plus a procedural sky gradient beneath, 110 procedural stars, and a 44-mote dust
field.

**Rules that came out of building it**, all in D124 and the source README:
structural layers must be **darker than the sky** or they read as weather; the
deck's contact row must be **measured, never estimated**; **tint cannot lift
anything**; expect delivered art **not to tile** and mirror it; a foreground must
not terminate inside the frame, and must be semi-transparent over the fight.

`docs/STAGE_ART_BRIEF.md` is the spec new art is produced against and contains
the prompt that works.

---

## 11. Roster reference

| Mech | Pilot | HP | Drone | Role | Passive |
| --- | --- | --- | --- | --- | --- |
| HALCYON `AV-07` | Naia Vesk | 1750 | ARBITER | designator + paint | energy regen ×1.45 · **LAST STAND** |
| NOCTURNE `AV-13` | Halden Rook | 1750 | WARDEN | tether | barrier regen ×2 |
| VESPER `AV-12` | Kestrel Doyne | 1490 | SIGHTLINE | interceptor + paint | damage dealt ×1.14 · **SNIPER MODE (3s)** |
| TERRAMOTH `HV-03` | Brunn Okonkwo | 2490 | BULWARK | miner | damage taken ×0.92 |
| CIRRUS `LT-21` | Mira Holloway | 1440 | WISP | arcTether | boost regen ×2 · **OVERDRIVE (5.5s)** |
| OBELISK `GD-09` | Saar Tengku | 2070 | AEGIS | dome **+ gun** | guard drain ×0.55 · **full-length SHIELD** |
| PYRE `IN-05` | Rasa Volkov | 1860 | EMBER | hazard | saturation gain ×1.8 |
| NULLTIDE `EW-14` | Io Senna | 1610 | STATIC | decoy ×2 | *opponent's* energy regen ×0.5 |

**Mines**: OBELISK carries `SHOCK MINE` and `MINEFIELD` as chassis weapons;
TERRAMOTH's BULWARK runs the `miner` role. PYRE's EMBER is `hazard`, not mines.

**Elements**: Incendiary 0.95/tick (PYRE ×7, NOCTURNE ×2), Shock 0.05 (OBELISK,
NULLTIDE, HALCYON), Cryo 0.10 (NULLTIDE ×3), Corrosive 0.42 (**nobody**).
**Every element can now land the killing blow** (D121).

**Pilot genders are fixed by `docs/PILOT_PORTRAIT_SPEC.md`** — four women, four
men. **Mechs are "it"; pilots get their own pronouns. The present is 43 CE.**

---

## 12. Documents worth reading

| File | What it holds |
| --- | --- |
| `CLAUDE.md` (workspace root) | Project rules, structure, definition of done |
| **`docs/TESTING_PROTOCOL.md`** | **How to verify. Test at EXTREME; the traps** |
| **`docs/TIER_LIST.md`** | Measured tiers, the matchup chart, dispersion |
| `docs/DECISIONS.md` | **D1–D126.** D118–D126 are this session's |
| **`docs/STAGE_ART_BRIEF.md`** | **The stage spec, and the prompt that works** |
| **`assets/arenas/source/README.md`** | **Which art is derived, and how. Read before editing art** |
| `tools/probe/balance.ts` | Who is winning. Run `--selftest` first |
| `tools/probe/telemetry.ts` | How a machine spent its match |
| `tools/probe/outcomes.ts` | How fights ended |
| `src/data/archive.ts` | The story bible: 21 entries |
| `docs/PILOT_PORTRAIT_SPEC.md` | **Authoritative** on pilot gender, age, appearance |
