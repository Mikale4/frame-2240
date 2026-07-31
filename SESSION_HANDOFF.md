# Session Handoff — Babel Sword: Reignition

> Rewritten 2026-07-31 at the end of a long session. Supersedes the previous
> handoff. Everything marked **verified** was confirmed by running it.
> Read this, then `CLAUDE.md`, then the docs in §10.

---

## 1. Do these before working

1. **Keep the app window foregrounded and the Browser pane visible.** When it
   loses foreground the browser stops compositing: `requestAnimationFrame` drops
   below 1 fps, the Phaser loop effectively freezes, screenshots time out, and
   key presses do nothing. **`document.hidden` still reports `false` while this
   is happening** — do not trust it. Measure rAF instead:
   ```js
   let n=0; const t=performance.now();
   const tick=()=>{n++; if(performance.now()-t<800) requestAnimationFrame(tick); else console.log(n);};
   requestAnimationFrame(tick);   // ~50-61 healthy, ~1 throttled
   ```
   This was fine for the whole of the last session — ask the user to keep the
   window up and it stays fine.
2. **Blender must be running with the MCP addon enabled** for art work. After a
   crash-restart it comes back *disabled* — re-enable via Edit → Preferences →
   Add-ons → search "MCP", then N in the viewport → BlenderMCP → Connect.
3. **Dev server**: `npm run dev` from Bash, not `preview_start` (the launcher
   fails to quote `C:\Program Files\…`). Ports 5173–5176 are usually already
   taken by stale servers; read the port it actually chose. Last session got
   5177.
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
per-mech projectile art, four AI difficulty tiers **and eight per-pilot
playstyles**.

---

## 3. Current status — verified

* **465 tests pass** (22 files), typecheck clean, production build clean.
* Working tree: `assets/music/` is still untracked — **see §7.1, the user has not
  decided whether to commit it.**
* Nothing pushed — the repo has **no remote**, `master` only.

Git identity is unset globally; pass it per command to match history rather than
editing the user's global config:

```bash
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit --author="Claude <noreply@anthropic.com>" -F <msgfile>
```

Write commit messages to a file and use `-F`. **Do not use PowerShell here-string
syntax (`@'…'@`) in the Bash tool** — it is not shell syntax and shreds the
command. **`cat > file <<'EOF'` heredocs also break in this Bash tool** — write
the file with the Write tool and append it with a small Python one-liner instead.
**Do not `git add -A` blindly** — it swept the user's in-progress music download
into an unrelated commit two sessions ago.

---

## 4. What landed last session

### 4a. The music system — DONE (D59–D61)

`src/audio/MusicBank.ts` (manifest + the battle roll, pure and testable) and
`src/audio/Music.ts` (the player). Wired into every scene.

* **Streamed, not decoded.** Sixteen decoded tracks would be ~1 GB of RAM.
  `HTMLAudioElement` → `MediaElementAudioSourceNode`, into the same
  `AudioContext` as the effects via the new `Sfx.context()`.
  **Verified**: dev server answers `206 Partial Content`, not full downloads.
* **Bus**: `voice.gain → duck → master → destination`, all `AudioParam` ramps, so
  no per-frame update and fades survive scene transitions.
* **Loop seam cross-fade.** **Verified** at the seam: old voice 1.00 → 0.02 as
  the new copy climbs 0.07 → 0.98 over 2.5 s, old voice dropped, one voice
  before and after. No gap, no leak.
* **Ducking. Verified**: pause 1 → 0.3 → 1; the saturation cutscene holds 0.3
  across the whole freeze then ramps back over 0.4 s. That ~1.3 s used to land in
  silence.
* **Idempotent `play()`. Verified**: three calls with the same cue kept one voice
  and `currentTime` ran on. A rematch that re-rolls the same track does not
  restart it.
* **Battle roll. Verified** live: rolled `theme_nocturne` in one match and
  `theme_halcyon` in the next; `battle_danger` took over correctly; training
  always got `training`.
* **Missing-file guard. Verified**: the network log contains only tracks that
  exist. `music.play('theme_pyre')` (not yet generated) produced silence and no
  request.
* Debug overlay's last line now shows the live cue.

**Nine of sixteen tracks exist.** Missing: `stage_cathedral_yard`, `theme_vesper`,
`theme_terramoth`, `theme_cirrus`, `theme_obelisk`, `theme_pyre`,
`theme_nulltide`, and the optional `battle`. **Adding one is two steps** — drop
the mp3 in, then flip its `present` flag in `MUSIC_CUES`. `music.test.ts` checks
flags against the directory in both directions, so forgetting fails the suite.

### 4b. Audio settings — DONE (D61)

`AUDIO: ON/MUTED` is gone. `MUSIC` and `SFX` are independent 0–10 sliders on one
shared scale, adjusted with left/right, persisted under `bsr.audio.v1`. Either at
zero is that bus's mute. Defaults 70/80 reproduce the old mix exactly.
**Verified**: survives a page reload, writes on every change, and the bus gain
follows.

### 4c. Match length — DONE (D62)

**All mech life pools ×1.75, round clock 99 s → 180 s.** Measured first: matches
were ending in 10–15 s at the lower tiers, and EASY and NORMAL were the *same*
length. New medians: EASY 24 s, NORMAL 30 s, HARD 52 s, EXTREME 73 s, with no
tier drawing more than 4 % on the clock.

### 4d. The drone rework — DONE (D63)

**No launch/recall button.** Drones are permanently deployed. `Btn.Sub` now
orders a volley instead. Drone HP ×3.5. A first kill retires it into a 900-tick
rebuild after which it relaunches itself; the second kill is permanent. It flies
itself — formation, a lean toward its firing line, and perpendicular evasion of
closing shots, leashed to its owner.

### 4e. Per-pilot playstyles — DONE (D64)

`src/ai/Playstyles.ts`. Eight personalities layered on the four tiers as
multipliers, never overrides, so the difficulty ladder is untouched. Each also
carries a **drone doctrine** (`escort` / `screen` / `flank` / `shadow`).

**Read D64 before touching this.** The first cut widened roster spread from 0.555
to 0.854 and made CIRRUS the worst machine in the game. Ablation found
`satPreference` was responsible for essentially all of it, because SHOOT is
currently the strongest burst and any pilot told to prefer otherwise was told to
lose. Now it widens the window its mode already wins in rather than overriding
the situation, and everything-on measures **0.511 — better than the baseline**.

### 4f. Menu restructure and the P2 HUD — DONE

* Main menu is now `CAMPAIGN` (disabled, "COMING SOON"), `VERSUS CPU`,
  `CPU VS CPU`, `TRAINING`, `SETTINGS`, `BACK TO TITLE`. Settings is a page, not
  a popup, holding `CONTROLS` / `MUSIC` / `SFX` / `BACK`. **Verified** by
  clicking through, including that CAMPAIGN refuses audibly.
* **The rival's SAT mode and flight state now show.** They were player-only,
  which was plainly broken in CPU-vs-CPU. **Verified** by screenshot: left reads
  `SAT MODE: SHIELD [Q] / FLIGHT: ON`, right reads `SAT MODE: SPEED /
  FLIGHT: OFF`, with no key hint on the CPU side.

---

## 5. NEXT TASK — pick one

Nothing is half-finished. In rough order of value:

1. **Generate the seven missing tracks** (§4a). The prompts are all written in
   `docs/MUSIC_CUE_SHEET.md`. Until the stage theme and the six missing pilot
   themes exist, the battle roll has only two candidates for most matchups.
2. **Answer §7.** Three of the four questions there block real work.
3. **A second arena.** CATHEDRAL YARD is still hard-coded in
   `render/Backdrop.ts`. `session.arena` now exists and the music's stage slot
   already reads from it, so the music side is ready; the backdrop is not.
4. **CAMPAIGN.** The menu row exists and is disabled. There is no campaign.

---

## 6. Unverified — needs eyes, not code

Much shorter than last session's list; the pane behaved.

* **Every change in §4c–4e has been measured but not *played*.** The numbers say
  matches are 2× longer, drones survive, and pilots fight differently. Whether
  that *feels* right is a human judgement and nobody has made it.
* **CIRRUS is the weakest machine** at −0.23 mean lead (was −0.11 before
  playstyles, −0.44 in the bad first cut). Within the band, but she is the one to
  watch in play.
* The drone rebuild has been unit-tested end to end but never watched on screen —
  in particular whether a visible-but-unhittable drone limping home reads
  clearly, or just looks like a bug.

---

## 7. Open questions the user still owes an answer on

1. **Commit `assets/music/`?** Nine tracks are 32 MB; sixteen will be ~55 MB,
   against ~1.5 MB for the entire tracked SFX set. Asked last session; the user
   asked back whether to finish generating first. **Answer given: no need to
   wait** — adding the rest later is just another commit, and each new track
   needs a `present` flag flipped anyway. Still undecided, so it remains
   untracked.
2. **A forced SHIELD burst is a losing trade until 75 % meter.** Unchanged from
   last session, and D64 has now made it *worse* than a curiosity: it is the
   reason per-pilot saturation preferences had to be defanged. SHOOT being
   strictly strongest is now load-bearing on two systems.

   | Meter | SHIELD burst | SHOOT / SPEED | Stun | Life | SHIELD net |
   | --- | --- | --- | --- | --- | --- |
   | 25 % | 53 (0.88 s) | 105 | 119 | 50 | **−66** |
   | 50 % | 105 (1.75 s) | 210 | 119 | 50 | **−14** |
   | 75 % | 158 (2.63 s) | 315 | 119 | 50 | +39 |
   | 100 % | 210 (3.50 s) | 420 | 59 | 0 | +151 |

   **(a)** leave it; **(b)** stop the double drain stacking with partial scaling;
   **(c)** scale the overheat by the burst actually granted.
3. **Music level.** Shipped at 70 % (0.28 gain) against SFX 80 % (0.32). Picked
   by reasoning, not by ear. The sliders now exist, so this is the user's to set
   — but if they land somewhere consistently, change the default.
4. **Audio duration targets.** `docs/AUDIO_CUE_SHEET.md` lists targets far
   shorter than what was generated (`fire_vulcan` wants 0.10 s, the file carries
   audio across its full 0.52 s). The normalise pass removed **only silence** on
   purpose — cutting real content needs ears.
5. **`energyDiscipline` is unproven.** It ablates to exactly 0.000 in AI-vs-AI.
   Kept because an AI mirror is the case least likely to reward energy banking,
   but it has never been shown to help.

---

## 8. Other unfinished work

* **Only one arena** (§5.3).
* **Cues with no trigger**: `footstep`, `melee_ignite`, `thruster_loop`,
  `drone_hover` are loaded and playable but nothing calls them.
* **`droneDeploy` / `droneRecall` events are now unreachable** — the toggle that
  raised them is gone. Their sounds and handlers are still wired.
* `melee_claw` still does triple duty for claw, ram shield and pile driver.
* **`assistDenied` now covers four unrelated refusals** — drone assist, a too-low
  saturation meter, the barrier lock-out, and now a disabled menu row.
* **`Supporter.Stowed` and `Recalling` are nearly dead states.** Only a downed
  owner reaches `Stowed` now. `def.repair`, `deployTicks` and `recallTicks` are
  still read but only on the rebuild path.
* Remaining gaps from `docs/REFERENCE_AUDIT.md` §4d.4: armour/shots-absorbed
  stat, score and hit counters, mission win conditions, boss AI roles, stock
  icons, off-screen indicators.
* **Normal vs Easy is the thinnest step** on the difficulty ladder (+0.170).

---

## 9. Traps found the hard way — do not relearn these

* **The Browser pane silently stops compositing.** See §1.
* **Driving the game from the Browser pane needs four separate tricks.**
  1. `computer{action:'key'}` **does not reach Phaser.** Dispatch a real event on
     `window`, keyed by physical `code`:
     `window.dispatchEvent(new KeyboardEvent('keydown', {code:'Enter', bubbles:true}))`.
  2. **Hold keys ~220 ms.** Menus read *held* state (`input$.readUi()`), not
     key-down edges, so a down+up in the same frame is invisible.
  3. **Freeze by hijacking `requestAnimationFrame`, not by pausing.** `Escape`
     works but lays a scrim over the frame. Swap in a rAF that stores the pending
     callback; the canvas holds its last frame with no overlay. Restoring the
     real rAF and re-firing the callback resumes cleanly.
  4. **You cannot read the canvas back.** No `preserveDrawingBuffer`.
* **Synthetic key events are not user activation.** They fire listeners, so
  `sfx.unlock()` runs, but `navigator.userActivation.hasBeenActive` stays false
  and `HTMLAudioElement.play()` can be refused. Music appearing dead after a
  scripted reload is usually this, not a bug. `MusicPlayer` handles it by
  remembering the cue and starting it on the first real gesture.
* **Vite HMR hands `await import()` a *different module instance*** than the
  running game holds after an edit. A singleton read that way can look empty
  while the game's copy is fine. **Reload the page before believing a reading.**
  This cost real time last session.
* **The Browser pane has its own empty `localStorage`,** so it runs the
  **default** bindings — `Enter`/`J` confirm, `WASD`/arrows move, `Escape`
  pauses, `F` barrier, `E` saturation, `J` main, `U` melee. Check
  `localStorage.getItem('bsr.bindings.v1')`: `null` means defaults.
* **The user's own browser** has remapped bindings: boost `Space`/`KeyS`, barrier
  `KeyF`/`KeyD`, **`ShiftLeft` is the flight toggle**, melee `KeyU`/`KeyC`,
  modeCycle `Tab`/`KeyA`.
* **Measure AI changes; do not reason about them.** This is now three separate
  occasions. Last session's playstyles made the roster *worse* in a way no amount
  of reading would have shown, and retuning the obvious scalars moved the number
  by 0.000 — only a per-lever ablation found the cause. `playstyles.test.ts` and
  `difficulty.test.ts` carry the harnesses; play both sides of every matchup, or
  the left-slot bias reads as skill.
* **`bpy` is not thread-safe.** Running a Blender build on a background thread to
  dodge an MCP timeout **crashes Blender**. Run synchronously and poll a file.
* **Never hold Python references to Blender Objects across a deletion.** Key by
  name.
* **`add_wedge` argument order.** With the 90° Y rotation these shapes use, the
  size tuple reads `(height, width, length-along-nose)`.
* **Vite answers unknown paths with `index.html` and a 200.** Phaser then gets
  HTML where it expected a PNG or an MP3 and never fires `complete` — boot hangs
  forever. Never request an asset that does not exist.
* **Atlases must not be trimmed.** Every part PNG is square with its pivot dead
  centre.
* **Re-running the Blender build regenerates loose part PNGs** — then run
  `python tools/pack_atlases.py` or the game keeps drawing the old atlases.
* **mp3 round-trips do not preserve peaks.** `tools/normalise_audio.py` uses a
  −1.6 dBFS ceiling to absorb it.
* **PowerShell**: a safety guard rejects the whole command if `Remove-Item`
  appears alongside regexes containing backslashes. Split them.
* **`cat > file <<'EOF'` heredocs fail in this Bash tool.** Use Write + Python.

---

## 10. Roster reference

Life pools are post-D62 (×1.75). Drone HP is post-D63 (×3.5).

| Mech | Pilot | Scale | Melee | Drone | HP | Drone HP | Passive |
| --- | --- | --- | --- | --- | --- | --- | --- |
| HALCYON `AV-07` | Naia Vesk | 1.00 | beam saber | ARBITER | 1750 | 420 | energy regen ×1.45 |
| NOCTURNE `AV-13` | Halden Rook | 1.11 | hydraulic claw | WARDEN | 1750 | 440 | barrier regen ×2 |
| VESPER `AV-12` | Kestrel Doyne | 0.93 | beam bayonet | SIGHTLINE | 1490 | 350 | damage dealt ×1.14 |
| TERRAMOTH `HV-03` | Brunn Okonkwo | 1.29 | pile driver | BULWARK | 2490 | 595 | damage taken ×0.86 |
| CIRRUS `LT-21` | Mira Holloway | 0.82 | twin daggers | WISP | 1440 | 335 | boost regen ×2 |
| OBELISK `GD-09` | Saar Tengku | 1.18 | ram shield | AEGIS | 2070 | 510 | guard drain ×0.55 |
| PYRE `IN-05` | Rasa Volkov | 1.04 | thermal cleaver | EMBER | 1860 | 455 | saturation gain ×1.8 |
| NULLTIDE `EW-14` | Io Senna | 0.89 | arc glaive | STATIC | 1610 | 385 | *opponent's* energy regen ×0.5 |

Pilot characterisations — the source for banter, the music prompts *and* the
playstyles — are in `docs/PILOT_PORTRAIT_SPEC.md`.

---

## 11. Documents worth reading

| File | What it holds |
| --- | --- |
| `CLAUDE.md` (workspace root) | Project rules, structure, definition of done |
| `docs/DECISIONS.md` | D1–D64. **D62–D64 are last session's and carry the measurements** |
| `docs/MUSIC_CUE_SHEET.md` | 16 tracks, every Suno prompt, the battle roll |
| `docs/MUSIC_STUDY_2005.md` | How the reference handles music |
| `docs/PROJECTILE_STUDY_2005.md` | How 2005 draws projectiles |
| `docs/REFERENCE_AUDIT.md` | Reference inventory; §4d has the 2005 variable legend |
| `docs/IMPLEMENTATION_PLAN.md` | Architecture and milestones |
| `docs/AUDIO_CUE_SHEET.md` | 40 SFX cues / 71 files, prompts, cost model |
| `docs/PILOT_PORTRAIT_SPEC.md` | Portrait spec and all 8 pilot characterisations |
| `AUDIO_SESSION_CONTEXT.md` | ElevenLabs setup and credit facts |
