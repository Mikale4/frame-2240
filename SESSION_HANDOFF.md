# Session Handoff — Babel Sword: Reignition

> Rewritten 2026-08-01 at the end of a long session (19 commits).
> Supersedes the previous handoff. Everything marked **verified** was confirmed
> by running it.
> Read this, then `CLAUDE.md`, then **`docs/TESTING_PROTOCOL.md`**, then §11.

---

## 1. Do these before working

1. **Read `docs/TESTING_PROTOCOL.md`.** It is the durable home for the rules in
   §9 — this file is rewritten every session and that one is not. Its first rule:
   **test by playing at EXTREME**, never the default NORMAL, because `resourceIq`
   and `droneIq` execute at no other tier.
2. **Report EXTREME first.** HARD is a corroborating second sample, not a second
   opinion. Six seeds is close to the noise floor, so a change that moves both
   tiers the same way is far more trustworthy than one that moves one.
3. **Keep the app window foregrounded.** When it loses focus the browser stops
   compositing: rAF drops under 1 fps and the Phaser loop freezes.
   **`document.hidden` still reports `false`** — measure rAF instead.
4. **Start the dev server**: `npm run dev` from Bash, not `preview_start`. Ports
   5173–5178 are usually taken by stale servers; read the port it chose. Last
   session used **5179**.
5. **Do not call `preview_start` repeatedly** — each call opens a new tab and
   every new tab is a full reload. Reuse the open tab and `navigate`.

---

## 2. What this is

An original 2D free-flight mecha combat game — TypeScript, Phaser 3, Vite,
Vitest. Inspired by the combat design of the read-only references at the
workspace root, entirely original in code, art, audio, characters and story.
`CLAUDE.md` at the workspace root is authoritative.

**State: well past the vertical slice.** Title → menu → mech select → battle →
results, 8 mechs, full SFX, a complete 17-track score, real art, pilot dialogue,
four AI tiers, eight playstyles, eight drone roles, desperation saturation, and
an Archive of 21 lore entries written as institutional documents.

---

## 3. Current status — verified

* **505 tests pass** (24 files), typecheck clean, production build clean.
* **Working tree clean.** Nothing untracked.
* No remote; `master` only. **19 commits last session**, `3fe491b`..`8c3f0d9`.
* `docs/DECISIONS.md` runs to **D82**.

Git identity is unset globally; pass it per command:

```bash
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit --author="Claude <noreply@anthropic.com>" -F <msgfile>
```

Write commit messages to a file and use `-F`. **`cat > file <<'EOF'` heredocs
sometimes break in the Bash tool** — prefer the Write tool then a Python append.
**Do not `git add -A` blindly.**

---

## 4. What landed last session

Detail in `docs/DECISIONS.md` **D71–D82**.

* **D71–D73** — the soundtrack is finished (17 cues) and tracked in git; MECH
  SELECT added to the pause and results menus; `docs/TESTING_PROTOCOL.md`
  created.
* **D74** — STATIC ran at 110 hit points where every other drone was scaled ×3.5.
  Nobody forgot it: the shared `DRONE` base was scaled 110 → 385 and STATIC
  carried an explicit `maxLife: 110` *identical to the base it was overriding*.
* **D75–D79** — the Archive was completed, then rewritten by an outside editor
  across six rounds and integrated with a byte-for-byte round-trip check.
* **D80** — the desperation Speed close is a shielded dash. It used to lunge at
  12–19 px a tick and time out after 22 ticks, so every long-range desperation
  melee swung at empty air the whole way in.
* **D81** — combos hold. Non-final hitstun was a flat 14 while the interval
  between hits is 10–26, so three machines could be melee-mashed out of their own
  chain after the first hit. Barrier-cancel is now the only escape.
* **D82** — WISP's tether is drawn, has thickness, and its doctrine is allowed to
  stay out. See §8, because it exposed a class of defect.

---

## 5. NEXT TASK — pick one

> **Roadmap decision, 2026-08-01:** the campaign comes **after the roster doubles
> to sixteen mechs and sixteen pilots**. Do not start CAMPAIGN before that.

1. **HALCYON is now clearly the weakest machine and wants a tuning pass.** See
   §6. This is the most concrete outstanding job.
2. **The drone audit, in progress.** The user is inspecting each drone in
   CPU-vs-CPU. **STATIC and WISP are done.** Six remain. Expect more of what §8
   describes.
3. **Make AEGIS, WARDEN and ARBITER visible** (§8). Pure rendering, no simulation
   change, no re-measurement — and it makes the rest of the audit possible.
4. **Eight more mechs and pilots**, the gate on the campaign.
5. **A second arena.** `session.arena` and the music stage slot already route
   through data; `render/Backdrop.ts` is the hard-coded part.

---

## 6. Roster balance — measured

Six seeds per matchup, both slots, at the end of the session.

| | EXTREME | | HARD |
| --- | --- | --- | --- |
| 1 | CIRRUS +0.157 | | TERRAMOTH +0.169 |
| 2 | PYRE +0.117 | | PYRE +0.158 |
| 3 | TERRAMOTH +0.030 | | CIRRUS +0.057 |
| 4 | OBELISK +0.027 | | OBELISK +0.056 |
| 5 | NOCTURNE +0.023 | | NOCTURNE −0.030 |
| 6 | NULLTIDE −0.004 | | NULLTIDE −0.057 |
| 7 | VESPER −0.121 | | VESPER −0.136 |
| 8 | **HALCYON −0.229** | | **HALCYON −0.218** |

spread: **EXTREME 0.386, HARD 0.387**.

**HALCYON is the outstanding balance problem.** It has fallen **−0.126 → −0.199 →
−0.229** across three consecutive *correct* fixes, none of which were aimed at
it: it gained nothing from D81 because its chain was already airtight, and
nothing from D82 because its doctrine is `escort`. Spread has widened from 0.321
to 0.386 over the same three changes and it is almost entirely this one machine.

**None of that argues for reverting anything.** The old numbers were partly
measuring accidents. What is owed is a tuning pass, and HALCYON is where it
starts.

**Three seeds is not enough.** A three-seed run of the STATIC change read as a
0.068 collapse at EXTREME; six seeds turned it into 0.025.

**Still unexplained:** the harness calls VESPER vs TERRAMOTH roughly even while
the user reports VESPER winning confidently at EXTREME.

---

## 7. Open questions the user still owes an answer on

1. **A forced SHIELD burst is a losing trade until 75 % meter.** Load-bearing on
   two systems.
2. **Music level.** Ships at 70 % against SFX 80 %, picked by reasoning not ear.
3. **Audio duration targets.** `docs/AUDIO_CUE_SHEET.md` lists targets far
   shorter than what was generated.
4. **The Archive says EMBER is "the frailest among current escort units."** True
   by raw hull (300 vs WISP's 335), false by damage actually absorbed — WISP is
   **291 effective** against EMBER's **306**, because `defenceMul` is 1.15 against
   0.98. Defensible as written; the user's call whether to correct it.

---

## 8. Known-open defects

### 8a. Four drone roles had no visual at all — **all now fixed (D82, D83)**

Every drone role that spawns an **entity** was visible; every role that is pure
**state** was invisible. `tetherLive`, `domeActive` and `paintedTicks` had **zero**
references in `src/render/`, `src/scenes/` or `src/ui/`.

| Drone | Role | Visible? |
| --- | --- | --- |
| STATIC | `decoy` | ✅ second `MechRenderer` |
| BULWARK | `miner` | ✅ projectiles |
| EMBER | `hazard` | ✅ projectiles |
| SIGHTLINE | `interceptor` | ✅ absorb sparks |
| WISP | `arcTether` | ✅ **D82** |
| AEGIS | `dome` | ✅ **D83** — additive fresnel shell, rim at the cut radius |
| WARDEN | `tether` | ✅ **D83** — 18-point Verlet rope, 86 px sag |
| ARBITER | `designator` | ✅ **D83** — brackets on the victim + sight-line home |

All eight looked at on screen, not merely measured. **Two things D83 found on the
way, both now fixed:** `tetherLive` went stale through a rebuild and drew WISP's
D82 wire and WARDEN's feed out of a wreck, and the three render gates were on
`s.visible` where `MatchSim` gates on `s.onStation`.

**Still open, and the user's call:** the code comment and the Archive both call
WARDEN a **"repair beam"** and it repairs nothing — it refills the guard gauge at
+1.6/tick and may never touch life, by explicit design. Canon wording. Belongs
with the EMBER item in §7.

### 8b. WISP does not hold its Pincer station

Measured: 40 % of Pincer ticks the target is not between the two machines at all,
and mean perpendicular miss is 156 px against a 44 px hit threshold. The station
geometry is correct (mean `t` of 0.29 is exactly what parking 210 px beyond the
target produces) — the drone simply cannot keep up with it. A pursuit problem,
deliberately not addressed in D82.

### 8c. The rest

* **An explicit override equal to its default is a landmine** (D74). STATIC's
  line now reads 385, which is again exactly the base value, so the trap is armed
  for whoever changes the base next. Worth a sweep for others.
* **The hazard-evasion fix (`fc9bb25`) is unverified by eye.** Both metrics built
  to demonstrate it turned out to be artifacts.
* **`droneDeploy` / `droneRecall` events are unreachable** — the toggle that
  raised them is gone.
* **`Supporter.Stowed` / `Recalling` are nearly dead states.**
* **`assistDenied` covers four unrelated refusals.**
* Cues with no trigger: `footstep`, `melee_ignite`, `thruster_loop`, `drone_hover`.
* Remaining gaps from `docs/REFERENCE_AUDIT.md` §4d.4.

---

## 9. Traps — see `docs/TESTING_PROTOCOL.md`

That file is authoritative and is not rewritten each session. The two rules that
cost the most:

* **Measure AI changes; never reason about them.** Last session added three more
  instances, all in one investigation: CIRRUS fighting too close for Pincer
  (the gate passes 87.9 % of the time), `offAxis` shoving the drone off the wire
  (that branch only runs during Escort — the edit was a no-op and the probe came
  back **byte-identical**), and a three-seed run reading as a 0.068 collapse that
  six seeds turned into 0.025. **State a hypothesis as a hypothesis until it is
  measured.**
* **A passing measurement says nothing about whether a thing reads.** WISP's
  tether was correct, tested and ablated for balance value — and drawn nowhere.

**Driving the game from the Browser pane is unreliable and cost a lot of time.**
Menu keys reach the game; **battle-scene keys frequently do not**. Symptoms that
look like engine faults and are not: a sim frozen at a fixed tick is usually the
**pause menu**, not a broken loop. Do not hijack `requestAnimationFrame` — use
`game.loop.sleep()` / `wake()`. `window.__BSR__` is the Phaser game instance and
`__BSR__.scene.getScene('Battle').sim` is the live `MatchSim`; prefer reading that
over inferring from pixels. **Leave the game unpaused and restore any setting you
touched** — stray arrow presses set MUSIC to 0 last session and it persists to
`localStorage` under `bsr.audio.v1`.

---

## 10. Roster reference

| Mech | Pilot | Gender/age | HP | Drone | Drone HP | eff. HP | Role | Passive |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| HALCYON `AV-07` | Naia Vesk | W, early 30s | 1750 | ARBITER | 420 | 420 | designator | energy regen ×1.45 |
| NOCTURNE `AV-13` | Halden Rook | M, late 40s | 1750 | WARDEN | 440 | 489 | tether | barrier regen ×2 |
| VESPER `AV-12` | Kestrel Doyne | M, late 20s | 1490 | SIGHTLINE | 350 | 312 | interceptor | damage dealt ×1.14 |
| TERRAMOTH `HV-03` | Brunn Okonkwo | M, 50s | 2490 | BULWARK | 595 | 726 | miner | damage taken ×0.86 |
| CIRRUS `LT-21` | Mira Holloway | W, early 20s | 1440 | WISP | 335 | **291** | arcTether | boost regen ×2 |
| OBELISK `GD-09` | Saar Tengku | M, 40s | 2070 | AEGIS | 510 | 580 | dome | guard drain ×0.55 |
| PYRE `IN-05` | Rasa Volkov | W, mid 20s | 1860 | EMBER | 300 | 306 | hazard | saturation gain ×1.8 |
| NULLTIDE `EW-14` | Io Senna | W, 30s | 1610 | STATIC | 385 | 363 | decoy | *opponent's* energy regen ×0.5 |

**Effective HP is `maxLife / defenceMul`** and is the number that matters. Raw
hit points mislead — WISP is the frailest escort despite not having the lowest
pool.

Melee, authoritative — the select screen prints the hit counts, so a player can
check the Archive against them:

| Mech | hits | reach | | Mech | hits | reach |
| --- | --- | --- | --- | --- | --- | --- |
| HALCYON | 6 | 200 | | CIRRUS | 8 | 195 |
| NOCTURNE | 3 | 210 | | OBELISK | 2 | 205 |
| VESPER | 2 | 180 | | PYRE | 3 | 198 |
| TERRAMOTH | 2 | 210 | | NULLTIDE | 5 | 192 |

**Pilot genders are fixed by `docs/PILOT_PORTRAIT_SPEC.md`** — four women, four
men. **Mechs are "it"; pilots get their own pronouns.**

**The present is 43 CE.** The header of `src/data/archive.ts` carries the full
timeline.

---

## 11. Documents worth reading

| File | What it holds |
| --- | --- |
| `CLAUDE.md` (workspace root) | Project rules, structure, definition of done |
| **`docs/TESTING_PROTOCOL.md`** | **How to verify. Test at EXTREME; the traps, in a file that outlives this one** |
| `docs/DECISIONS.md` | **D1–D82.** D71–D82 are last session's |
| `src/data/archive.ts` | The story bible: 21 entries, world, factions, machines, pilots |
| `docs/ARCHIVE_REWRITE_BRIEF.md` | The canon lock, and the authoritative melee table |
| `docs/ARCHIVE_FULL_REWRITE_FINAL.md` | The approved prose. **Keep in sync with `archive.ts`** |
| `docs/PILOT_PORTRAIT_SPEC.md` | **Authoritative** on pilot gender, age, appearance |
| `docs/MUSIC_CUE_SHEET.md` | 17 tracks, every Suno prompt, the battle roll |
| `docs/AUDIO_CUE_SHEET.md` | 40 SFX cues / 71 files |
| `docs/REFERENCE_AUDIT.md` | Reference inventory; §4d has the 2005 variable legend |
| `docs/IMPLEMENTATION_PLAN.md` | Architecture and milestones |
