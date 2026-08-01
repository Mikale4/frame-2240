# Session Handoff — Babel Sword: Reignition

> Rewritten 2026-08-01. Supersedes the previous handoff.
> Everything marked **verified** was confirmed by running it.
> Read this, then `CLAUDE.md`, then **`docs/TESTING_PROTOCOL.md`**, then §11.

---

## 1. Do these before working

1. **Read `docs/TESTING_PROTOCOL.md`.** It is the durable home for the rules that
   used to live in this file's §9 — and this file gets rewritten every session,
   which is why they moved. Its first rule: **test by playing at EXTREME**, never
   the default NORMAL, because `resourceIq` and `droneIq` execute at no other
   tier and a fault living in either survives any amount of testing at NORMAL.
2. **Keep the app window foregrounded and the Browser pane visible.** When it
   loses foreground the browser stops compositing: `requestAnimationFrame` drops
   below 1 fps, the Phaser loop freezes, screenshots time out. **`document.hidden`
   still reports `false`** — do not trust it. Measure rAF instead.
3. **Start the dev server**: `npm run dev` from Bash, not `preview_start`. Ports
   5173–5178 are usually taken by stale servers; read the port it chose. Last
   session used **5179**.
4. **Do not call `preview_start` repeatedly** — each call opens a new tab and
   every new tab is a full reload. Reuse the open tab and `navigate`.
5. **Blender must be running with the MCP addon enabled** for art work. After a
   crash-restart it comes back *disabled* — re-enable via Edit → Preferences →
   Add-ons → search "MCP", then N in viewport → BlenderMCP → Connect.

---

## 2. What this is

An original 2D free-flight mecha combat game — TypeScript, Phaser 3, Vite,
Vitest. Inspired by the combat design of the read-only references at the
workspace root, entirely original in code, art, audio, characters and story.
`CLAUDE.md` at the workspace root is authoritative.

**State: well past the vertical slice.** Title → menu → mech select → battle →
results, 8 mechs, full SFX, a complete 17-track score, real art, pilot dialogue,
four AI difficulty tiers, eight per-pilot playstyles, eight distinct drone roles,
desperation saturation, and an Archive of 21 lore entries written as institutional
documents.

---

## 3. Current status — verified

* **497 tests pass** (24 files), typecheck clean, production build clean.
* **Working tree clean.** Nothing untracked. `assets/music/` is now tracked (D71).
* No remote; `master` only. **15 commits last session**, `3fe491b`..`HEAD`.
* Repo is 112 MB, of which 63 MB is the seventeen music tracks.

Git identity is unset globally; pass it per command:

```bash
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit --author="Claude <noreply@anthropic.com>" -F <msgfile>
```

Write commit messages to a file and use `-F`. **`cat > file <<'EOF'` heredocs
sometimes break in the Bash tool** — prefer the Write tool then a Python append.
**Do not `git add -A` blindly.**

---

## 4. What landed last session

Full detail in `docs/DECISIONS.md` **D71–D79**. Summary:

### 4a. The soundtrack is finished and tracked — D71, D76

All **seventeen cues exist and play**. Only `battle` is `present: false`, and it
is the fallback that exists for the case where no candidate is present — now
unreachable by construction, which is what it was always meant to become.

`assets/music/` is now in git. The takes are not reproducible, so an accident
there was a loss, not a rebuild. That argument was tested within the hour when
`theme_cirrus` was re-downloaded and came back a **different song**.

The Archive got its own theme at 72 BPM, and it is the one documented cue that
**leaves the soundtrack's J-rock house style** — see `docs/MUSIC_CUE_SHEET.md`.

### 4b. The Archive was rewritten by an outside editor — D75, D77, D78, D79

The lore read as machine-written, because it was. Six rounds: brief → diagnosis
and plan → review → calibration sample → verdict → full rewrite → verdict →
final. Every entry is now a document written by an institution rather than by an
omniscient narrator.

Measured over the delivered 4,709 words: em dashes 30 → 0, negation frames 15.5
per thousand words → 1.7, "never" 23 → 0, sentence openers using The/He/She/It
46 % → 24 %.

**The lore is now complete and gapless on purpose.** Stillwake (31 CE) resolves
the EW-14's provenance, Io Senna's history and Rook's inquiry into one incident.
Three new world entries carry the setting's causes. This is the prerequisite for
the campaign's planned unlock feature — see §5.

**Two canon errors were found in the process** and both were mine: HALCYON's
saber was described as the shortest chain (it is the second-longest) and
NULLTIDE's glaive as the longest-reaching (it is third-shortest). Both had been
copied into the rewrite brief *as canon locks*.

### 4c. STATIC's hit points, and the override that hid the bug — D74

STATIC ran at **110** where every other drone had been scaled ×3.5. Nobody forgot
it: D63 scaled the shared `DRONE` base 110 → 385, and STATIC carried an explicit
`maxLife: 110` that was **identical to the base it was overriding** — invisible,
apparently redundant, and the one thing that did not move when the base did.

Now 385. Decoy stun 5 % → 15 %. Measured at six seeds, both slots.

### 4d. MECH SELECT, and the testing protocol — D72, D73

`MECH SELECT` added to the pause menu and the results screen, in all three modes.
`docs/TESTING_PROTOCOL.md` created.

---

## 5. NEXT TASK — pick one

1. **CAMPAIGN.** The menu row exists and is disabled. This is the obvious next
   big feature and the reason the lore was written.

   **The user has specified the Archive's role in it.** Entries start *redacted*
   and unlock as the player progresses — through dialogue, exposition, special
   events, side quests, plot investigation or story progression. The lore was
   deliberately completed (D75) so it could be withheld. A bounded first piece
   would be the redaction/unlock state model plus persistence, which is testable
   before any mission exists.

2. **A second arena.** CATHEDRAL YARD is hard-coded in `render/Backdrop.ts`.
   `session.arena` and the music's stage slot already route through data, so this
   is mostly making `Backdrop` arena-driven plus new parallax art.

3. **Audit the AI-vs-AI harness.** See §6. Every balance number rests on it.

4. **VESPER is the weakest machine** at both tiers. See §6.

---

## 6. Roster balance — measured

Six seeds per matchup, both slots played, after the D74 changes.

| | HARD | | EXTREME |
| --- | --- | --- | --- |
| 1 | TERRAMOTH +0.179 | | PYRE +0.182 |
| 2 | PYRE +0.165 | | CIRRUS +0.113 |
| 3 | NULLTIDE +0.021 | | TERRAMOTH +0.024 |
| 4 | NOCTURNE +0.003 | | OBELISK −0.004 |
| 5 | OBELISK −0.029 | | NOCTURNE −0.023 |
| 6 | CIRRUS −0.061 | | NULLTIDE −0.030 |
| 7 | HALCYON −0.083 | | HALCYON −0.121 |
| 8 | VESPER −0.195 | | VESPER −0.140 |

spread: **HARD 0.374, EXTREME 0.322**.

**There is no single tier list.** TERRAMOTH is best against a mediocre pilot;
CIRRUS climbs sharply against a good one, because she is the most
execution-dependent machine in the game. Any "best mech" answer must name a tier.

**Three seeds is not enough.** A three-seed run of the STATIC change read as a
0.068 collapse at EXTREME; six seeds turned it into 0.025. Do not report a
balance delta from three seeds.

**Still unexplained:** the harness calls VESPER vs TERRAMOTH roughly even while
the user reports VESPER winning confidently at EXTREME. If the harness is missing
something, every number above is suspect — including the STATIC measurements.

---

## 7. Open questions the user still owes an answer on

1. **A forced SHIELD burst is a losing trade until 75 % meter.** Load-bearing on
   two systems — it is why per-pilot saturation preferences had to be defanged
   above the desperation line.
2. **Music level.** Ships at 70 % against SFX 80 %, picked by reasoning not by
   ear. The sliders exist; if the user lands somewhere consistently, change the
   default.
3. **Audio duration targets.** `docs/AUDIO_CUE_SHEET.md` lists targets far
   shorter than what was generated. Cutting real content needs ears.

*Resolved since the last handoff:* whether to commit `assets/music/` (**yes**,
D71) and whether the Archive should be definitive (**yes**, D75).

---

## 8. Known-open defects

* **The hazard-evasion fix (`fc9bb25`) is unverified by eye.** Two bugs were found
  and fixed with sound reasoning, but *both metrics built to demonstrate the rival
  escaping turned out to be artifacts*. Needs watching.
* **`droneDeploy` / `droneRecall` events are unreachable** — the toggle that
  raised them is gone. Their sounds and handlers are still wired.
* **`Supporter.Stowed` / `Recalling` are nearly dead states.** Only a downed owner
  reaches `Stowed`.
* **`assistDenied` covers four unrelated refusals** — drone assist, low
  saturation, barrier lock-out, and a disabled menu row.
* **An explicit override equal to its default is a landmine** (D74). Worth a sweep
  for others; STATIC's own line is now 385, which is again exactly the base value.
* Cues with no trigger: `footstep`, `melee_ignite`, `thruster_loop`, `drone_hover`.
* Remaining gaps from `docs/REFERENCE_AUDIT.md` §4d.4: armour/shots-absorbed
  stat, score and hit counters, mission win conditions, boss AI roles, stock
  icons, off-screen indicators.

*Resolved since the last handoff:* STATIC being hard to find while the decoy is up
— the simulation was verified healthy, the drone is 100 % on camera with or
without a decoy, it sits **further forward** when one is up, and it is no longer
made of paper (D74).

---

## 9. Traps — see `docs/TESTING_PROTOCOL.md`

That file is now authoritative and is not rewritten each session. The two rules
that cost the most, repeated here because they are worth reading twice:

* **Measure AI changes; never reason about them.** Five occasions now.
* **A passing measurement says nothing about whether a thing reads.** Four
  separate times last session alone: the Archive body drawing through the hint
  line, CIRRUS's blank form field reading as truncated text, and twice more. Tests
  green, typecheck clean, page illegible. **Look at the screen.**

One correction to older advice, now fixed in the protocol: **do not freeze the
game by hijacking `requestAnimationFrame`.** Phaser's `TimeStep` schedules
recursively and never restarts. Use `game.loop.sleep()` / `wake()`.

---

## 10. Roster reference

| Mech | Pilot | Gender/age | HP | Drone | Drone HP | Role | Passive |
| --- | --- | --- | --- | --- | --- | --- | --- |
| HALCYON `AV-07` | Naia Vesk | W, early 30s | 1750 | ARBITER | 420 | designator | energy regen ×1.45 |
| NOCTURNE `AV-13` | Halden Rook | M, late 40s | 1750 | WARDEN | 440 | tether | barrier regen ×2 |
| VESPER `AV-12` | Kestrel Doyne | M, late 20s | 1490 | SIGHTLINE | 350 | interceptor | damage dealt ×1.14 |
| TERRAMOTH `HV-03` | Brunn Okonkwo | M, 50s | 2490 | BULWARK | 595 | miner | damage taken ×0.86 |
| CIRRUS `LT-21` | Mira Holloway | W, early 20s | 1440 | WISP | 335 | arcTether | boost regen ×2 |
| OBELISK `GD-09` | Saar Tengku | M, 40s | 2070 | AEGIS | 510 | dome | guard drain ×0.55 |
| PYRE `IN-05` | Rasa Volkov | W, mid 20s | 1860 | EMBER | **300** | hazard | saturation gain ×1.8 |
| NULLTIDE `EW-14` | Io Senna | W, 30s | 1610 | STATIC | **385** | decoy | *opponent's* energy regen ×0.5 |

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

**The present is 43 CE.** The Archive's timeline is load-bearing; the header of
`src/data/archive.ts` carries it in full.

---

## 11. Documents worth reading

| File | What it holds |
| --- | --- |
| `CLAUDE.md` (workspace root) | Project rules, structure, definition of done |
| **`docs/TESTING_PROTOCOL.md`** | **How to verify. Test at EXTREME; the traps, in a file that outlives this one** |
| `docs/DECISIONS.md` | **D1–D79.** D71–D79 are last session's |
| `src/data/archive.ts` | The story bible: world, factions, 8 machines, 8 pilots — 21 entries |
| `docs/ARCHIVE_REWRITE_BRIEF.md` | The canon lock, and the authoritative melee table |
| `docs/ARCHIVE_FULL_REWRITE_FINAL.md` | The approved prose. **Keep in sync with `archive.ts`** |
| `docs/PILOT_PORTRAIT_SPEC.md` | **Authoritative** on pilot gender, age, appearance |
| `docs/MUSIC_CUE_SHEET.md` | 17 tracks, every Suno prompt, the battle roll |
| `docs/AUDIO_CUE_SHEET.md` | 40 SFX cues / 71 files |
| `docs/REFERENCE_AUDIT.md` | Reference inventory; §4d has the 2005 variable legend |
| `docs/IMPLEMENTATION_PLAN.md` | Architecture and milestones |
