# Session Handoff — Babel Sword: Reignition

> Rewritten 2026-08-01 at the end of a long session (11 commits on `master`,
> plus one parked on a branch awaiting a decision).
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
   opinion.
3. **Keep the app window foregrounded.** When it loses focus the browser stops
   compositing: rAF drops under 1 fps and the Phaser loop freezes.
   **`document.hidden` still reports `false`** — measure rAF instead.
4. **Start the dev server**: `npm run dev` from Bash, not `preview_start`. Ports
   5173–5180 are all held by stale servers; last session used **5181**.
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
an Archive of 21 lore entries.

---

## 3. Current status — verified

* **505 tests pass** (24 files), typecheck clean, production build clean.
* **Working tree clean** on `master`, at **`22e5bde`**.
* `docs/DECISIONS.md` runs to **D93**.
* **Suite runtime is now ~24s**, up from ~10s. That is deliberate — see §5.1.
* No remote. **Two branches**: `master`, and `reach-usable-fix` (§5.1).

Git identity is unset globally; pass it per command:

```bash
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit --author="Claude <noreply@anthropic.com>" -F <msgfile>
```

Write commit messages **with the Write tool**, then `-F`. Do not build them with
shell heredocs: backticks inside a message trigger command substitution and the
commit fails. **Do not `git add -A` blindly.**

---

## 4. What landed last session

Detail in `docs/DECISIONS.md` **D83–D93**.

* **D83** — the last three invisible drone roles are drawn: AEGIS's dome (an
  additive fresnel shell), WARDEN's tether (an 18-point Verlet rope) and
  ARBITER's paint. §8a is closed. Found two defects doing it: `tetherLive` went
  stale through a rebuild and drew WISP's D82 wire out of a wreck, and three
  render gates used `s.visible` where `MatchSim` gates on `s.onStation`.
* **D84** — the paint reticle was sized to `rig.hurtRadius` and drawn *under* the
  chassis. Now `barrier.radius * 1.8`.
* **D85** — WARDEN's tether returns hull (`TETHER_LIFE_RATE`), ARBITER's paint
  adds projectile guidance (`DESIGNATOR_HOMING`), and **`AiPlan`** — committed
  multi-tick intents gated on a new `planIq`, EXTREME's alone.
* **D86** — `Starve` ships, `DroneHunt` does not, and plan ablation was
  confounded by shared flags until `setPlanMask` existed.
* **D87** — `Vigil` plus `Execute` preemption. **`EXTREME vs HARD` +0.012 →
  +0.147.** The plan cooldown stays **global**; making it per-plan cost 0.081.
* **D88** — select screen: drone *ability* text (`ROLE_BRIEF`), two-column
  layout, cursor sized to the plate. Plus the VESPER audit.
* **D89** — the portrait column is positioned relative to the grid, not by an
  unrelated fraction.
* **D90** — `weaponIq` is **not** a defect; its −0.129 predates the plan layer.
  Found a probe that could not measure zero.
* **D91/D93** — spatial identity: diagnosed, attempted six ways, **reverted**.
* **D92** — `difficulty.test.ts` rebuilt so it can resolve what it asserts.

---

## 5. NEXT TASK

> **Roadmap decision, 2026-08-01:** the campaign comes **after the roster doubles
> to sixteen mechs and sixteen pilots**. Do not start CAMPAIGN before that.

### 5.1 A decision is owed first — branch `reach-usable-fix` (`a7b96ca`)

**This is where the session stopped, mid-conversation.** The user was asked to
choose and had to leave.

`reachOf` computed `max` from `main`, `heavy` **and `lance`** — and the lance is a
command motion the rival never produces. Every range decision in `RivalAI` was
derived from a weapon the AI cannot fire:

```
  PYRE     1860 -> 858      OBELISK  1568 -> 672
  NULLTIDE 2508 -> 1184     CIRRUS   1920 -> 1080
```

Reported by eye: PYRE is written as a brawler and fought at the **longest**
average distance on the roster, because `rangeIq` thought it out-ranged everyone
and parked it at 745px — where its main gun, which reaches **300**, could not
touch anything.

The branch adds `MechReach.usable` and routes every range decision through it.

| | Result |
| --- | --- |
| PYRE median separation | 751px → **580px** |
| PYRE time in melee reach | 12.1% → **18.4%** |
| Roster separation spread | 184px → **264px** |
| **EXTREME roster spread** | 0.386 → **0.597** ⚠ |
| Suite | 505 pass, build clean |

**The three options put to the user, verbatim:** ship the fix now and do the
tuning pass next (recommended — keeping a known-false reach model protects
balance that was built on a bug); ship it and tune TERRAMOTH/VESPER in the same
commit; or hold it.

TERRAMOTH is the mechanism: slowest machine, so `!faster` is true against nearly
everyone, so with its reach corrected it takes the "out-ranged, close in" branch
and wants ~311px. A 2490 HP frame taking ×0.86 damage, fighting close, is +0.281.

**Also fixed by the same root cause:** `bankEnergy`'s stated rationale is "hold
fire to bank energy for a lance" — it was saving for a weapon the AI cannot fire,
which is why D90 measured it inert.

### 5.2 The rest

1. **The roster wants a tuning pass** regardless of 5.1. On `master` the
   outstanding problem is VESPER; on the branch it is VESPER **and** TERRAMOTH.
2. **The drone audit is 6 of 8 done and effectively closed** — see §8a.
3. **Eight more mechs and pilots**, the gate on the campaign.
4. **A second arena.** `session.arena` and the music stage slot already route
   through data; `render/Backdrop.ts` is the hard-coded part.

---

## 6. Roster balance — measured

Six seeds per matchup, both slots, on **`master`** (i.e. without the branch).

| | EXTREME | | HARD |
| --- | --- | --- | --- |
| 1 | CIRRUS +0.124 | | TERRAMOTH +0.166 |
| 2 | PYRE +0.096 | | PYRE +0.073 |
| 3 | NULLTIDE +0.027 | | HALCYON +0.024 |
| 4 | NOCTURNE +0.014 | | OBELISK +0.011 |
| 5 | OBELISK −0.002 | | NOCTURNE +0.005 |
| 6 | TERRAMOTH −0.031 | | CIRRUS −0.025 |
| 7 | HALCYON −0.051 | | NULLTIDE −0.029 |
| 8 | **VESPER −0.178** | | **VESPER −0.225** |

spread: **EXTREME 0.302, HARD 0.391.**

**HALCYON is fixed.** It was −0.229 and is now −0.051, from ARBITER's guidance
(D85). **VESPER is the new outstanding problem**, and D88 established it is *not*
the drone's fault — SIGHTLINE's current configuration is the best of five
measured. See §8b.

**Six seeds minimum.** A three-seed run once read as a 0.068 collapse that six
seeds turned into 0.025.

---

## 7. Open questions the user still owes an answer on

1. **A forced SHIELD burst is a losing trade until 75 % meter.**
2. **Music level.** Ships at 70 % against SFX 80 %, picked by reasoning not ear.
3. **Audio duration targets** in `docs/AUDIO_CUE_SHEET.md` are far shorter than
   what was generated.
4. **The Archive says EMBER is "the frailest among current escort units."** True
   by raw hull, false by damage absorbed — WISP is 291 effective against EMBER's
   306.
5. **WARDEN is called a "repair beam" in the Archive** and it now returns hull as
   well as barrier (D85), so the wording is *less* wrong than it was — but it is
   still primarily a guard feed.

---

## 8. Known-open defects

### 8a. Drone audit — 6 of 8 inspected, and the user closed the other two

| Drone | Mech | Role | Status |
| --- | --- | --- | --- |
| STATIC | NULLTIDE | `decoy` | ✅ D74 |
| WISP | CIRRUS | `arcTether` | ✅ D82 |
| AEGIS | OBELISK | `dome` | ✅ D83 |
| WARDEN | NOCTURNE | `tether` | ✅ D83, D85 |
| ARBITER | HALCYON | `designator` | ✅ D83, D84, D85 |
| SIGHTLINE | VESPER | `interceptor` | ✅ D88 |
| BULWARK | TERRAMOTH | `miner` | **user: "fine, no audit needed"** |
| EMBER | PYRE | `hazard` | **user: "fine, I understand it completely"** |

The EMBER conversation turned into the PYRE range question, which became §5.1.

**Two drones never fire**: `dome` and `interceptor` are the only roles missing
from `SPENDS_CHARGES`. AEGIS and SIGHTLINE gave up their guns for their jobs.

### 8b. The roster is spatially homogeneous — diagnosed, unfixed

D91/D93. `preferredRangeFor` is **not** broken: the eight machines want 332px to
876px. They are on station **15–30%** of the time, because **33–58% of every
fight is spent in `Evade`**, which scores dodges on threat clearance alone.

Six implementations of a fix all cost the top rung. **`solveEvade` is
load-bearing beyond anything else in the class** — EXTREME's advantage is
disproportionately made of evasion quality, so any constraint on dodge selection
taxes it hardest. That is the third finding of this shape (designator homing and
the plan layer are the others).

**The real obstacle is an asymmetry in the game, not the AI:** closing is
achievable unilaterally, withdrawing is not. Spacing must be *enforceable* before
a preference for it can be expressed. Start there, not in the evade solver.

### 8c. The rest

* **`element` in `chooseAttack` produces byte-identical results in a HALCYON
  mirror** — it never fires there. Not shown dead roster-wide; a mirror cannot.
* **An explicit override equal to its default is a landmine** (D74). STATIC's
  line reads 385, which is again exactly the base. A sweep of all eight supporter
  defs is still owed.
* **`droneDeploy` / `droneRecall` events are unreachable.**
* **`Supporter.Stowed` / `Recalling` are nearly dead states.**
* **`assistDenied` covers four unrelated refusals.**
* Cues with no trigger: `footstep`, `melee_ignite`, `thruster_loop`, `drone_hover`.

---

## 9. Traps — see `docs/TESTING_PROTOCOL.md`

That file is authoritative and is not rewritten each session. This session added
three rules worth carrying:

* **Check the instrument before believing the result.** Three separate
  measurements were believed and then overturned: the plan ablation confounded by
  shared flags (D86), a probe whose two arms were different fights so an inert
  rule still reported −0.079 (D90), and `difficulty.test.ts` itself asserting at
  ~1σ (D92). **An inert change must measure exactly zero; that property is the
  probe's own self-test.**
* **A behaviour's value is a property of the AI it sits in.** `weaponIq` measured
  −0.129 before the plan layer and −0.014 after. Re-measure old numbers before
  acting on them.
* **When consecutive configurations disagree in a direction the mechanism cannot
  explain, the dial has run out of resolution.** Two sweeps were run past that
  point this session; both were noise.

**Driving the game from the Browser pane**: `window.__BSR__` is the Phaser game;
`__BSR__.scene.getScene('Battle').sim` is the live `MatchSim`. Use
`game.loop.sleep()`/`wake()`, never a rAF hijack. **`scene.start` will not take
effect while the loop is asleep — wake it first.** A sim frozen at a fixed tick
is usually the **pause menu**: `BattleScene.onBlur` auto-pauses, and
`resize_window` triggers it. Call `scene.closePause()`. Session state can be
driven with `await import('/src/core/Session.ts')`. **Leave the game unpaused and
restore any setting you touch** — audio persists to `localStorage` under
`bsr.audio.v1`; defaults are music 7, sfx 8.

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

**Effective HP is `maxLife / defenceMul`.**

**Usable reach** — what the AI can actually shoot, `max(main, heavy)`, versus the
`max` that includes the unfireable lance. This is §5.1's subject:

| Mech | main | heavy | lance | usable | with lance |
| --- | --- | --- | --- | --- | --- |
| HALCYON | 936 | 924 | 1040 | 936 | 1040 |
| NOCTURNE | 864 | 857 | 1040 | 864 | 1040 |
| VESPER | 2420 | 3380 | 3060 | **3380** | 3380 |
| TERRAMOTH | 682 | 1080 | 1680 | 1080 | 1680 |
| CIRRUS | 780 | 1080 | 1920 | 1080 | 1920 |
| OBELISK | 528 | 672 | 1568 | 672 | 1568 |
| PYRE | **300** | 858 | 1860 | 858 | 1860 |
| NULLTIDE | 1120 | 1184 | 2508 | 1184 | 2508 |

Melee, authoritative — the select screen prints the hit counts:

| Mech | hits | reach | | Mech | hits | reach |
| --- | --- | --- | --- | --- | --- | --- |
| HALCYON | 6 | 200 | | CIRRUS | 8 | 195 |
| NOCTURNE | 3 | 210 | | OBELISK | 2 | 205 |
| VESPER | 2 | 180 | | PYRE | 3 | 198 |
| TERRAMOTH | 2 | 210 | | NULLTIDE | 5 | 192 |

**Pilot genders are fixed by `docs/PILOT_PORTRAIT_SPEC.md`** — four women, four
men. **Mechs are "it"; pilots get their own pronouns. The present is 43 CE.**

---

## 11. Documents worth reading

| File | What it holds |
| --- | --- |
| `CLAUDE.md` (workspace root) | Project rules, structure, definition of done |
| **`docs/TESTING_PROTOCOL.md`** | **How to verify. Test at EXTREME; the traps** |
| `docs/DECISIONS.md` | **D1–D93.** D83–D93 are last session's |
| `src/data/archive.ts` | The story bible: 21 entries |
| `src/data/droneRoles.ts` | **New.** What each escort does, in one sentence |
| `docs/ARCHIVE_REWRITE_BRIEF.md` | The canon lock, and the melee table |
| `docs/PILOT_PORTRAIT_SPEC.md` | **Authoritative** on pilot gender, age, appearance |
| `docs/MUSIC_CUE_SHEET.md` | 17 tracks, every Suno prompt |
| `docs/AUDIO_CUE_SHEET.md` | 40 SFX cues / 71 files |
| `docs/REFERENCE_AUDIT.md` | Reference inventory |
| `docs/IMPLEMENTATION_PLAN.md` | Architecture and milestones |
