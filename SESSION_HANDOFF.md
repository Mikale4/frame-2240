# Session Handoff — Babel Sword: Reignition

> Rewritten 2026-07-31 at the end of a very long session (17 commits).
> Supersedes the previous handoff. Everything marked **verified** was confirmed
> by running it. Read this, then `CLAUDE.md`, then the docs in §11.

---

## 1. Do these before working

1. **Keep the app window foregrounded and the Browser pane visible.** When it
   loses foreground the browser stops compositing: `requestAnimationFrame` drops
   below 1 fps, the Phaser loop freezes, screenshots time out, key presses do
   nothing. **`document.hidden` still reports `false`** — do not trust it.
   Measure rAF instead:
   ```js
   let n=0; const t=performance.now();
   const tick=()=>{n++; if(performance.now()-t<800) requestAnimationFrame(tick); else console.log(n);};
   requestAnimationFrame(tick);   // ~50-61 healthy, ~1 throttled
   ```
2. **Start the dev server**: `npm run dev` from Bash, not `preview_start`. Ports
   5173–5176 are usually taken by stale servers; read the port it chose. Last
   session used **5177**. The background shell was stopped at session end, so it
   needs restarting.
3. **Blender must be running with the MCP addon enabled** for art work. After a
   crash-restart it comes back *disabled* — re-enable via Edit → Preferences →
   Add-ons → search "MCP", then N in viewport → BlenderMCP → Connect.
4. **Do not call `preview_start` repeatedly** — each call opens a new tab and
   every new tab is a full reload. Reuse the open tab and `navigate`.

---

## 2. What this is

An original 2D free-flight mecha combat game — TypeScript, Phaser 3, Vite,
Vitest. Inspired by the combat design of the read-only references at the
workspace root, entirely original in code, art, audio, characters and story.
`CLAUDE.md` at the workspace root is authoritative.

**State: well past the vertical slice.** Title → menu → mech select → battle →
results, 8 mechs, full SFX, a working music system, real art, pilot dialogue,
per-mech projectile art, four AI difficulty tiers, eight per-pilot playstyles,
eight distinct drone roles, desperation saturation, and an Archive holding the
game's lore.

---

## 3. Current status — verified

* **491 tests pass** (23 files), typecheck clean, production build clean.
* Working tree clean except `assets/music/` — **still untracked, see §7.1**.
* No remote; `master` only. **17 commits last session**, `d619d3c`..`6d10a67`.

Git identity is unset globally; pass it per command:

```bash
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit --author="Claude <noreply@anthropic.com>" -F <msgfile>
```

Write commit messages to a file and use `-F`. **`cat > file <<'EOF'` heredocs
sometimes break in the Bash tool** — prefer the Write tool then a Python append.
**Do not `git add -A` blindly** — it swept the user's in-progress music download
into an unrelated commit two sessions ago.

---

## 4. What landed last session

### 4a. Music system — DONE (D59–D61)

`src/audio/MusicBank.ts` (manifest + battle roll, pure and testable) and
`src/audio/Music.ts` (the player). Wired into every scene.

* **Streamed, not decoded** — 16 decoded tracks would be ~1 GB. `HTMLAudioElement`
  → `MediaElementAudioSourceNode`, sharing `Sfx`'s `AudioContext`.
  **Verified**: dev server answers `206 Partial Content`.
* Bus is `voice.gain → duck → master → destination`, all `AudioParam` ramps.
* **Loop seam cross-fade verified**: old voice 1.00 → 0.02 as the new copy climbs
  0.07 → 0.98 over 2.5 s, old voice dropped, no gap, no leak.
* **Ducking verified**: pause 1 → 0.3 → 1; saturation cutscene holds 0.3 across
  the freeze then ramps back over 0.4 s.
* **Idempotent `play()` verified**: three calls, one voice, `currentTime` ran on.
* **Battle roll verified** live; `battle_danger` takes over under 25 % life.
* **Missing-file guard verified**: only existing tracks are ever requested.

**Five of eight pilot themes exist.** Present: `title menu select battle_danger
results_win results_lose training theme_halcyon theme_nocturne theme_vesper
theme_terramoth theme_cirrus`. **Missing: `theme_obelisk`, `theme_pyre`,
`theme_nulltide`, `stage_cathedral_yard`** (+ optional `battle`).

**Adding a track is two steps**: drop the mp3 in `assets/music/`, then flip its
`present` flag in `MUSIC_CUES` (`src/audio/MusicBank.ts`). `music.test.ts` checks
flags against the directory **in both directions** — it caught the user's
`theme_vesper`/`theme_terramoth` drop automatically.

### 4b. Audio settings — DONE (D61)

`MUSIC` and `SFX` are independent 0–10 sliders on one shared scale, adjusted with
left/right, persisted under `bsr.audio.v1`. Either at zero is that bus's mute.
Defaults 70/80 reproduce the old mix exactly.

### 4c. Match length — DONE (D62)

**All mech life pools ×1.75, round clock 99 s → 180 s.** Measured first: matches
were ending in 10–15 s at the lower tiers, and EASY and NORMAL were the *same*
length. New medians: EASY 24 s, NORMAL 30 s, HARD 52 s, EXTREME 73 s, no tier
drawing more than 4 %.

### 4d. Drone rework — DONE (D63)

**No launch/recall button.** Drones are permanently deployed; `Btn.Sub` orders a
volley. Drone HP ×3.5. A first kill retires it into a 900-tick rebuild after
which it relaunches itself; **the second kill is permanent**. It flies itself —
formation, a lean toward its firing line, perpendicular evasion of closing shots,
leashed to its owner.

### 4e. Per-pilot playstyles — DONE (D64)

`src/ai/Playstyles.ts`. Eight personalities layered on the four tiers as
multipliers, never overrides. Each carries a **drone doctrine** (`escort` /
`screen` / `flank` / `shadow`).

**Read D64 before touching this.** The first cut widened roster spread from 0.555
to 0.854 and made CIRRUS the worst machine in the game. Ablation found
`satPreference` was responsible for essentially all of it.

### 4f. Menu restructure and P2 HUD — DONE

Main menu is `CAMPAIGN` (disabled), `VERSUS CPU`, `CPU VS CPU`, `TRAINING`,
`ARCHIVE`, `SETTINGS`, `BACK TO TITLE`. The rival's SAT mode and flight state now
show on the right — they were player-only.

### 4g. Desperation saturation — DONE (D65–D66)

A burst opened at or below **1/3 life** runs in a desperation form:

| Mode | Desperation form |
| --- | --- |
| SHIELD | **Total invulnerability** until the meter empties |
| SHOOT | Projectiles ×1.85 faster, each shot has a 1-in-3 chance of doubling |
| SPEED | Melee reach ×9, dash ×1.9, **melee deals true damage** |

Latched at activation, not read live. Below the line, pilots take their **own
preferred burst** — this is what lets CIRRUS take SPEED on the brink.

### 4h. Lock-on and camera — DONE (D67–D68)

* **Weapons are locked on unconditionally.** Aim used to fall through to the
  *movement direction* when the target was outside `lockRange` or the facing
  cone, so a strafing mech shot at empty air. The enemy drone is a valid target
  when it is `DRONE_LOCK_EDGE` (90 px) closer.
* **Camera solves the framing** on both axes independently, clamps the velocity
  lead so neither pilot leaves frame, reserves the HUD band, and includes any
  live decoy. `setBounds` removed — it silently overrode everything below 0.45
  zoom.

### 4i. AI IQ packs — DONE

Five new tier-gated traits in `AiProfile`:

| Trait | HARD | EXTREME |
| --- | --- | --- |
| `statusIq` — reads status effects both ways | ✅ | ✅ |
| `frameIq` — invuln, repel window, dash cooldown, real recovery | ✅ | ✅ |
| `leadShots` — solves the intercept, aims via manual aim | ✅ | ✅ |
| `resourceIq` — reads the opponent's gauges | ❌ | ✅ |
| `droneIq` — values both escorts | ❌ | ✅ |

`frameIq` ablates at **+0.225** to EXTREME — the largest single trait in the file.

### 4j. Drone team-up plays and roles — DONE

**Plays** (`DroneTactic`): `Escort`, `Pincer` (crosses to the far side — the only
thing that ignores the leash), `Cover` (interposes for a helpless owner),
`Harass`, `Regroup`. Which plays a drone runs comes from its doctrine.

**Eight distinct roles** (`SupporterRole`):

| Drone | Role | What it does |
| --- | --- | --- |
| ARBITER | `designator` | Paints the target; HALCYON's shots do ×1.2 |
| WARDEN | `tether` | Repair beam restoring barrier |
| SIGHTLINE | `interceptor` | Shoots incoming rounds out of the air |
| BULWARK | `miner` | Clusters of 3 long-lived mines; they also eat enemy fire |
| WISP | `arcTether` | Live wire back to owner; pairs with Pincer |
| AEGIS | `dome` | Bubble that erases shots |
| EMBER | `hazard` | Burning trail, laid only while moving |
| STATIC | `decoy` | Full false chassis that steals lock-on |

**Most roles are additive** — the drone still fires. Only `dome` and
`interceptor` replace the gun. That single change took spread 0.887 → 0.623.

### 4k. Archive — DONE

`src/data/archive.ts` + `src/scenes/ArchiveScene.ts`. 18 entries: the world, the
five powers, 8 machines, 8 pilots. Three levels — section → entry → page. Pilot
pages reuse the select-screen portraits. **Verified** by clicking through.

The lore is written *against* the simulation: TERRAMOTH's armour brace is a
mining safety system with the interlocks removed; NULLTIDE's jamming field is
named as the only passive that takes something away.

---

## 5. NEXT TASK — pick one

1. **CAMPAIGN.** The menu row exists and is disabled; the Archive now supplies
   the world, factions and characters to build it from. This is the obvious next
   big feature and the reason the lore was written.
2. **Generate the four missing tracks** (§4a). Prompts are in the cue sheet.
3. **A second arena.** CATHEDRAL YARD is hard-coded in `render/Backdrop.ts`.
   `session.arena` exists and the music's stage slot already reads from it.
4. **VESPER is the weakest machine** (−0.263 at HARD). See §6.

---

## 6. Roster balance — measured

Three seeds per matchup, both slots played, at the end of the session.

| Rank | HARD | | EXTREME |
| --- | --- | --- | --- |
| 1 | TERRAMOTH +0.238 | | CIRRUS +0.235 |
| 2 | PYRE +0.072 | | PYRE +0.109 |
| 3 | NOCTURNE +0.057 | | TERRAMOTH +0.028 |
| 4 | OBELISK +0.011 | | OBELISK +0.023 |
| 5 | CIRRUS +0.000 | | NULLTIDE −0.017 |
| 6 | NULLTIDE −0.007 | | VESPER −0.050 |
| 7 | HALCYON −0.108 | | NOCTURNE −0.126 |
| 8 | VESPER −0.263 | | HALCYON −0.201 |

spread: HARD 0.501, EXTREME 0.436.

**There is no single tier list.** TERRAMOTH is best against a mediocre pilot;
CIRRUS is best against a good one — she goes 5th → 1st because she is the most
execution-dependent machine in the game. Any "best mech" answer must name a tier.

**VESPER vs TERRAMOTH is dead even** (−0.010 EXTREME, −0.000 HARD) despite the
user reporting VESPER winning confidently at EXTREME. Worth re-checking; if it is
consistently one-sided in play, the AI-vs-AI harness is missing something.

Difficulty ladder: **EXTREME vs HARD +0.092**, HARD vs NORMAL +0.169. The
absolute gaps are much smaller than they used to be because matches now run 2–3×
longer (D62) and every lead regresses over a longer fight. The thresholds in
`difficulty.test.ts` were recalibrated to match; the *ordering* assertions are
the contract.

---

## 7. Open questions the user still owes an answer on

1. **Commit `assets/music/`?** Twelve tracks, ~40 MB now, ~55 MB at sixteen,
   against ~1.5 MB for the entire tracked SFX set. Advice given: **no need to
   wait** for the remaining tracks — each needs a `present` flag flipped anyway.
   Still undecided, so it remains untracked.
2. **A forced SHIELD burst is a losing trade until 75 % meter.** Now
   load-bearing on two systems — it is the reason per-pilot saturation
   preferences had to be defanged above the desperation line.
3. **Music level.** Ships at 70 % (0.28) against SFX 80 % (0.32), picked by
   reasoning not by ear. The sliders exist; if the user lands somewhere
   consistently, change the default.
4. **Audio duration targets.** `docs/AUDIO_CUE_SHEET.md` lists targets far
   shorter than what was generated. Cutting real content needs ears.
5. **Should the Archive be definitive?** The lore deliberately leaves gaps (Io
   Senna has no Concord file; the EW-14's provenance is "disputed"). That is
   campaign material, but the user may prefer it closed.

---

## 8. Known-open defects

* **STATIC's drone is hard to find while the decoy is up.** The *simulation is
  verified healthy* — the drone moves 99–100 % of ticks with the decoy up and
  fires slightly more. It is a **visual** problem: the decoy is a full-size
  chassis at depth 17, the real drone a small sprite at depth 18, and the decoy
  drifts. Suggested fix: a tether or marker so the drone stays findable, push the
  decoy further back in depth, and stop it drifting onto its own drone.
* **The hazard-evasion fix (`fc9bb25`) is unverified by eye.** Two bugs were
  found and fixed with sound reasoning — placed hazards were scored like moving
  shots, and Evade was unreachable for them — but *both metrics built to
  demonstrate the rival escaping turned out to be artifacts*. Needs watching.
* **`droneDeploy` / `droneRecall` events are unreachable** — the toggle that
  raised them is gone. Their sounds and handlers are still wired.
* **`Supporter.Stowed` / `Recalling` are nearly dead states.** Only a downed owner
  reaches `Stowed`.
* **`assistDenied` covers four unrelated refusals** — drone assist, low
  saturation, barrier lock-out, and a disabled menu row.
* Cues with no trigger: `footstep`, `melee_ignite`, `thruster_loop`, `drone_hover`.
* Remaining gaps from `docs/REFERENCE_AUDIT.md` §4d.4: armour/shots-absorbed
  stat, score and hit counters, mission win conditions, boss AI roles, stock
  icons, off-screen indicators.

---

## 9. Traps found the hard way — do not relearn these

* **Measurement confirms behaviour exists; it does not confirm it is legible.**
  This was the single biggest lesson of the session. Six separate things measured
  correct and read wrong on screen: the decoy (four distinct tells), BULWARK's
  pellet-sized mines, the projectile-texture square edges, EMBER's size — twice.
  **After any visual change, look at it.**
* **`visualScale` multiplies the *family's* dimensions, it does not set an
  absolute size.** `flame` is naturally 64 px with a 2.2× halo; `pellet` is 26.
  Getting this wrong twice in a row is why EMBER shipped four times too large.
  Check `64 × scale × halo` against a pellet's `26 × 1.9` before believing a number.
* **Canvas `shadowBlur` is not clipped to the shape that cast it.** Projectile
  atlas cells need padding for it — `CELL 240` against `R 74`. At the old
  160/74 the blur bled into neighbouring cells and read as square edges.
* **The Browser pane silently stops compositing.** See §1.
* **Driving the game from the Browser pane needs four tricks.**
  1. `computer{action:'key'}` **does not reach Phaser.** Dispatch on `window`
     keyed by physical `code`.
  2. **Hold keys ~220 ms** — menus read *held* state, not key-down edges.
  3. **Freeze by hijacking `requestAnimationFrame`**, not by pausing (Escape
     lays a scrim). Restore it afterwards or the game stays frozen.
  4. **You cannot read the canvas back** — no `preserveDrawingBuffer`.
* **Synthetic key events are not user activation.** They fire listeners, so
  `sfx.unlock()` runs, but `HTMLAudioElement.play()` can still be refused. Music
  appearing dead after a scripted reload is usually this.
* **Vite HMR hands `await import()` a *different module instance*** than the
  running game holds. A singleton read that way can look empty while the game's
  copy is fine. **Reload the page before believing a reading.**
* **Measure AI changes; never reason about them.** Four separate occasions now.
  The playstyles made the roster worse; retuning the obvious scalars moved the
  number by 0.000 and only a per-lever ablation found the cause. Handing EASY the
  same situational reads as EXTREME measured as **NORMAL losing to EASY**. Giving
  the designator drone homing measured as **EXTREME losing to HARD**.
* **Homing is the wrong mechanic for this game.** Shots that steer erode
  *dodging*, and dodging is where the defensive ladder and most of EXTREME's
  advantage live.
* **A role that replaces a drone's gun must be worth more than the gun.** Four
  were not.
* **The Browser pane has its own empty `localStorage`** — default bindings:
  `Enter`/`J` confirm, `WASD`/arrows move, `Escape` pause, `F` barrier,
  `E` saturation, `J` main, `U` melee.
* **The user's own browser** has remapped bindings: boost `Space`/`KeyS`, barrier
  `KeyF`/`KeyD`, **`ShiftLeft` is the flight toggle**, melee `KeyU`/`KeyC`,
  modeCycle `Tab`/`KeyA`.
* **Vite answers unknown paths with `index.html` and a 200.** Never request an
  asset that does not exist — the loader hangs forever.
* **`bpy` is not thread-safe.** A Blender build on a background thread crashes it.
* **Never hold Python references to Blender Objects across a deletion.**
* **Atlases must not be trimmed**; re-running the Blender build regenerates loose
  part PNGs, then run `python tools/pack_atlases.py`.
* **mp3 round-trips do not preserve peaks** — `tools/normalise_audio.py` uses a
  −1.6 dBFS ceiling.

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
| NULLTIDE `EW-14` | Io Senna | W, 30s | 1610 | STATIC | 385 | decoy | *opponent's* energy regen ×0.5 |

**Pilot genders are fixed by `docs/PILOT_PORTRAIT_SPEC.md`** — four women, four
men. **Mechs are "it"; pilots get their own pronouns.** Brunn Okonkwo was
misgendered in conversation once last session by borrowing a pilot's pronoun for
a machine — do not repeat it.

---

## 11. Documents worth reading

| File | What it holds |
| --- | --- |
| `CLAUDE.md` (workspace root) | Project rules, structure, definition of done |
| `docs/DECISIONS.md` | **D1–D70.** D59–D70 are last session's, with the measurements |
| `src/data/archive.ts` | The story bible: world, factions, 8 machines, 8 pilots |
| `docs/PILOT_PORTRAIT_SPEC.md` | **Authoritative** on pilot gender, age, appearance |
| `docs/MUSIC_CUE_SHEET.md` | 16 tracks, every Suno prompt, the battle roll |
| `docs/AUDIO_CUE_SHEET.md` | 40 SFX cues / 71 files |
| `docs/REFERENCE_AUDIT.md` | Reference inventory; §4d has the 2005 variable legend |
| `docs/IMPLEMENTATION_PLAN.md` | Architecture and milestones |
| `docs/PROJECTILE_STUDY_2005.md` | How 2005 draws projectiles |
| `docs/MUSIC_STUDY_2005.md` | How the reference handles music |
