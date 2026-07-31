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
   requestAnimationFrame(tick);   // ~61 healthy, ~1 throttled
   ```
   This blocked in-game verification for most of the last session. Several
   things below are marked unverified purely because of it.
2. **Blender must be running with the MCP addon enabled** for art work. After a
   crash-restart it comes back *disabled* — re-enable via Edit → Preferences →
   Add-ons → search "MCP", then N in the viewport → BlenderMCP → Connect.
3. **Dev server**: `npm run dev` from Bash, not `preview_start` (the launcher
   fails to quote `C:\Program Files\…`). Ports 5173–5177 are usually already
   taken by stale servers; read the port it actually chose.
4. **Do not call `preview_start` repeatedly** — each call opens a new tab and
   every new tab is a full reload. Reuse the open tab and `navigate`.

---

## 2. What this is

An original 2D free-flight mecha combat game — TypeScript, Phaser 3, Vite,
Vitest. Inspired by the combat design of the read-only references at the
workspace root, entirely original in code, art, audio, characters and story.
`CLAUDE.md` at the workspace root is authoritative.

**State: well past the vertical slice.** Title → menu → mech select → battle →
results, 8 mechs, full SFX, real art, pilot dialogue, per-mech projectile art,
four AI difficulty tiers. Music is mid-delivery.

---

## 3. Current status — verified

* **397 tests pass** (19 files), typecheck clean, production build clean.
* Working tree clean except `assets/music/` (untracked, see §5).
* Nothing pushed — the repo has **no remote**, `master` only.

### Commits, oldest first

```
… (10 earlier commits from the previous session)
922b4de  Study how the 2005 reference draws its projectiles, and hand the session over
24057cf  Give every mech its own bullet, beam and fire
4593be1  Make the defensive mode actually defend, and shut its exploit
1fd25d1  Say no out loud when the barrier button is locked out
01d0591  Work out what the soundtrack is before writing a note of it
354ef39  Give each CPU its own difficulty, and make the tiers mean something
93161fa  Teach the rival to manage its boost, and to know when it cannot dodge
93b423f  Give a saturation burst unlimited reach, and the rival a sense of distance
```

Git identity is unset globally; pass it per command to match history rather than
editing the user's global config:

```bash
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit --author="Claude <noreply@anthropic.com>" -F <msgfile>
```

Write commit messages to a file and use `-F`. **Do not use PowerShell here-string
syntax (`@'…'@`) in the Bash tool** — it is not shell syntax and shreds the
command. **Do not `git add -A` blindly** — it swept the user's in-progress music
download into an unrelated commit last session.

---

## 4. What landed last session

### 4a. Per-mech projectile art — DONE (`24057cf`, D52–D56)

Forty-eight weapons used to share two textures. Now sixteen **families**
(`src/projectiles/families.ts`) drawn procedurally into one packed canvas texture
(`src/render/ProjTextures.ts`).

* **Three additive layers per shot** — tinted halo, tinted shell, **white core**.
  This is why `ProjectileLayer` exists: Phaser's tint is a multiply, so a white
  centre inside a coloured shell cannot come from one sprite.
* 60 Hz flicker off the projectile's age in *ticks*, not the render frame.
* Drawn size decoupled from the hitbox (`AttackDef.visualScale`).
* Per-family `velMul` / `accel` / `swerve`, gentler than the reference's 0.945;
  a test asserts every weapon still covers ≥70 % of its old distance.
* Five volley patterns: `line`, `stack`, `bundle`, `ripple`, `arc`.
* Per-mech kits in `src/data/projectileArt.ts` — one file, whole roster side by
  side, because the design question is comparative.
* Six weapons fire denser volleys at unchanged full-connect damage.
* All eight lances pierce (D56). Measured, not assumed: the recorded worry that
  this would make them the strongest anti-guard tool was **wrong** — only the
  first segment cashes in, because landing it raises `hitInvuln`.

### 4b. Barrier and Shield saturation — DONE (`4593be1`, `1fd25d1`, D57–D58a)

| Incoming | Plain guard | Shield burst |
| --- | --- | --- |
| Gunfire | 80 % off | **95 % off** |
| Melee | 50 % off | **70 % off** |
| Piercing lance | **50 % off** (new) | **80 % off** |
| Status chip | nothing | **95 % off** |

* `SHIELD_TAKEN` **replaces** the guard's scaling rather than stacking, so the
  figures read as written. A test pins them against the plain guard.
* Melee is the porous one deliberately — closing to sword range is the way
  through a Shield.
* **Shield saturation locks the barrier button out. This is balance, not a bug.**
  The burst has *no cooldown anywhere in the game* — `barrierActiveTicks` only
  locks movement — so the 30-point cost **is** the rate limiter, and `barrierFree`
  deletes it. Four free taps covered the entire 3.5 s mode in invulnerability.
* The refusal is audible (`assistDenied`, debounced to one per 0.4 s).

### 4c. Difficulty and AI — DONE (`354ef39`, `93161fa`, `93b423f`)

**Four tiers, chosen per side.** `session.playerDifficulty` / `enemyDifficulty`.
Select flow: `vsCpu` player→enemy→enemySkill; `aiVsAi`
player→playerSkill→enemy→enemySkill; `training` skips both skill stages.

`AI_PROFILES` replaced the old 1–8 dial. Numeric fields are the dial; **boolean
fields unlock behaviours the lower tiers do not have at all**:

| Trait | Tiers |
| --- | --- |
| `threatSolver` — evade the heading that clears *every* shot | HARD, EXTREME |
| `punishRecovery` — open up on real helplessness only | HARD, EXTREME |
| `weaponIq` — weapon by range and guard state | HARD, EXTREME |
| `energyDiscipline` — bank rather than trickle | EXTREME |
| `closeOnGuard` — charge a turtle, off the damage table | EXTREME |
| `rangeIq` — stand where reach and speed say to | EXTREME |
| `tempoIq` — play the score | EXTREME |

Plus boost management for every tier (`boostReserveDashes`, `evadeDashChance`)
and a defensive ladder: **dodge → burst → guard**.

**Saturation now lifts the range cap on every shot** for the duration of any
burst (`SAT_UNLIMITED_LIFE`, 900 ticks). PYRE's CINDER JET normally dies at
300 px and can suddenly cross the yard.

#### Measured, and this is the important part

The first cut of the AI ran **backwards** — EXTREME lost to HARD, NORMAL lost to
EASY. Ablation found faults invisible by reading:

* `reactionTicks` was doing **three jobs** — input latency, the evade lookahead,
  and how often a heading is re-chosen. A faster rival got a *shorter* warning
  and re-solved every 3 ticks, chasing a moving optimum and travelling nowhere.
* `Strafe` re-rolled its vertical every decision — harmless at 14 ticks,
  catastrophic at 3. The rival vibrated in place.
* `weaponIq` gated on `lance.energyCost` (265) while firing `Btn.Heavy` (120).
  Lance and spread are command *motions*; the AI cannot produce them.
* **Over-attacking loses.** Firing anchors movement, so EXTREME's aggression is
  0.72 — deliberately not the highest on the roster.

Three traits were **removed for measuring badly**: `perfectBarrier` (a burst
grants 36 ticks of cover against a 9-tick window, so timing inside it cannot
matter), `offAxisApproach` (every approach becomes diagonal, closing more
slowly). `rangeIq` moved to EXTREME only — shared, the top two tiers came out
dead level.

Final ladder, both slots played so side bias cancels:

```
NORMAL  vs EASY    +0.170     HARD    vs NORMAL  +0.552
HARD    vs EASY    +0.567     EXTREME vs NORMAL  +0.441
EXTREME vs EASY    +0.666     EXTREME vs HARD    +0.242
```

`src/tests/difficulty.test.ts` carries the measurement. It is deterministic —
seeded RNG, seeded sim — so a regression moves the numbers rather than flaking.

---

## 5. NEXT TASK — the music system

**The user is generating the soundtrack in Suno on their own Pro plan.** Nine of
sixteen tracks are already in `assets/music/`, correctly named:

```
have:    title  menu  select  battle_danger  results_win  results_lose
         training  theme_halcyon  theme_nocturne
missing: stage_cathedral_yard  theme_vesper  theme_terramoth  theme_cirrus
         theme_obelisk  theme_pyre  theme_nulltide     (+ optional `battle`)
```

**No music code exists yet.** `assets/music/` is untracked and nothing loads or
plays it. This is the whole task.

**Read `docs/MUSIC_CUE_SHEET.md` first** — it is the spec, and it holds every
Suno prompt. `docs/MUSIC_STUDY_2005.md` is the research behind it.

What to build:

* `MusicBank` / `MusicPlayer` — load by exact cue name, loop, cross-fade between
  scenes, **duck under the saturation cutscene** (a ~1.3 s freeze that currently
  lands in silence) and under the pause menu, and **not restart on a rematch**.
* **The battle roll.** Three candidates — both pilots' themes and the stage's —
  one picked at random per match. Mirror matches dedupe. Training never rolls.
  `battle_danger` overrides when either pilot drops under 25 % life.
* **The roll must not draw from the simulation's RNG.** `MatchSim` is seeded and
  `match.test.ts` asserts bit-identical replay; taking a number from that stream
  would change the fight. Roll from a separate source in the scene layer.
* **Missing-file guard.** Vite answers an unknown path with `index.html` and a
  200, so requesting a missing `.mp3` hands the audio decoder HTML. Only load
  what the cue sheet declares and what exists. `BootScene` has `MODELLED` /
  `PORTRAITS` sets doing exactly this for art — follow that pattern.

Decide with the user whether `assets/music/` should be committed. The 71 SFX
files are tracked deliberately (not reproducible), which argues yes — but one
track is 4.6 MB against 1.5 MB for the entire SFX set, so sixteen will roughly
double the repo.

---

## 6. Unverified — needs eyes, not code

The browser pane was throttled for most of the session. None of this is known
broken; none of it has been watched.

* **The four-stage select flow.** Nobody has clicked through CPU 1 → CPU 1 SKILL
  → CPU 2 → CPU 2 SKILL. The state machine was traced by hand against all three
  modes and the session/AI halves are tested.
* **Every AI change**, including the boost economy and the defensive ladder. The
  user playtested an *earlier* build and found the boost problem; the fix has
  not been played.
* **The saturation range change.** A Shoot burst should now reach clean across
  the arena.
* **The barrier-refusal cue** — flash and buzz when the button is pressed during
  a Shield burst.
* Only two mech pairs were ever watched with the new projectile art.

---

## 7. Open questions the user still owes an answer on

1. **A forced SHIELD burst is a losing trade until 75 % meter.** Measured:

   | Meter | SHIELD burst | SHOOT / SPEED | Stun | Life | SHIELD net |
   | --- | --- | --- | --- | --- | --- |
   | 25 % | 53 (0.88 s) | 105 | 119 | 50 | **−66** |
   | 35 % | 74 (1.23 s) | 147 | 119 | 50 | **−45** |
   | 50 % | 105 (1.75 s) | 210 | 119 | 50 | **−14** |
   | 75 % | 158 (2.63 s) | 315 | 119 | 50 | +39 |
   | 100 % | 210 (3.50 s) | 420 | 59 | 0 | +151 |

   Shoot and Speed break even at 25 %. Shield is helpless for longer than it was
   protected, and pays 50 life. D57 raised the *value* per second but changed no
   duration, so higher value cannot rescue it. **(a)** leave it — a full burst is
   the strongest defensive tool in the game and this forces patience; **(b)** stop
   the double drain stacking with partial scaling, capped so forcing at 99 %
   cannot beat waiting; **(c)** scale the overheat by the burst actually granted.
2. **Audio duration targets.** `docs/AUDIO_CUE_SHEET.md` lists targets far
   shorter than what was generated (`fire_vulcan` wants 0.10 s, the file carries
   audio across its full 0.52 s). The normalise pass removed **only silence** on
   purpose — cutting real content needs ears.
3. **`energyDiscipline` is unproven.** It ablates to exactly 0.000 in AI-vs-AI.
   Kept because an AI mirror is the case least likely to reward energy banking,
   but it has never been shown to help. Worth a look against a human.

---

## 8. Other unfinished work

* **Only one arena.** CATHEDRAL YARD is hard-coded in `render/Backdrop.ts` —
  three fixed parallax layers, no arena id, no data, no selection. The music
  cue sheet's stage-theme slot is built to scale but has one row.
* **Cues with no trigger**: `footstep`, `melee_ignite`, and the two loop beds
  (`thruster_loop`, `drone_hover`) are loaded and playable but nothing calls them.
* `melee_claw` still does triple duty for claw, ram shield and pile driver.
* **`assistDenied` now covers three unrelated refusals** — drone assist, a
  too-low saturation meter, and the barrier lock-out. Renaming it would mean
  renaming the audio cue key and the file behind it.
* Remaining gaps from `docs/REFERENCE_AUDIT.md` §4d.4: armour/shots-absorbed
  stat, score and hit counters, mission win conditions, boss AI roles, stock
  icons, off-screen indicators.
* **Normal vs Easy is the thinnest step** on the difficulty ladder (+0.170). The
  three lower tiers separate on numbers alone; the big jumps come from HARD's and
  EXTREME's unlocked behaviours. If it feels too close in play, give NORMAL one
  behaviour rather than nudging numbers.

---

## 9. Traps found the hard way — do not relearn these

* **The Browser pane silently stops compositing.** See §1. This has now cost time
  across three sessions.
* **Driving the game from the Browser pane needs four separate tricks.**
  1. `computer{action:'key'}` **does not reach Phaser.** Dispatch a real event on
     `window`, keyed by physical `code`:
     `window.dispatchEvent(new KeyboardEvent('keydown', {code:'Enter', bubbles:true}))`.
  2. **Hold keys ~220 ms.** Menus read *held* state (`input$.readUi()`), not
     key-down edges, so a down+up in the same frame is invisible.
  3. **Freeze by hijacking `requestAnimationFrame`, not by pausing.** `Escape`
     works but lays a scrim over the frame. Swap in a rAF that stores the pending
     callback instead of scheduling it; the canvas holds its last frame with no
     overlay. Restoring the real rAF and re-firing the callback resumes cleanly.
  4. **You cannot read the canvas back.** No `preserveDrawingBuffer`, so
     `drawImage(canvas, …)` yields transparent black. Full-frame screenshots only.
* **The Browser pane has its own empty `localStorage`,** so it runs the
  **default** bindings, not the user's remapped profile — `Enter`/`J` confirm,
  `WASD`/arrows move, `Escape` pauses, `F` barrier, `E` saturation, `J` main,
  `U` melee. Check `localStorage.getItem('bsr.bindings.v1')`: `null` means
  defaults.
* **The user's own browser** has remapped bindings: boost `Space`/`KeyS`, barrier
  `KeyF`/`KeyD`, **`ShiftLeft` is the flight toggle**, melee `KeyU`/`KeyC`,
  modeCycle `Tab`/`KeyA`.
* **To inspect generated canvas art without the game running,** import the module
  in the page with a `?v=` cache-buster, hand it a fake scene whose
  `textures.createCanvas` returns a plain canvas, then POST the result as a blob
  to a throwaway Node server and read the PNG. Works while the pane is throttled,
  because canvas drawing needs no compositing.
* **Measure AI changes; do not reason about them.** Three separate "obvious"
  improvements made the rival *worse*, and the ladder ran backwards for two full
  rounds of tuning before ablation found why. `difficulty.test.ts` has the
  harness — play both sides of every matchup, or the left-slot bias reads as
  skill.
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

---

## 10. Roster reference

| Mech | Pilot | Scale | Melee | Drone | HP | Passive |
| --- | --- | --- | --- | --- | --- | --- |
| HALCYON `AV-07` | Naia Vesk | 1.00 | beam saber | ARBITER | 1000 | energy regen ×1.45 |
| NOCTURNE `AV-13` | Halden Rook | 1.11 | hydraulic claw | WARDEN | 1000 | barrier regen ×2 |
| VESPER `AV-12` | Kestrel Doyne | 0.93 | beam bayonet | SIGHTLINE | 850 | damage dealt ×1.14 |
| TERRAMOTH `HV-03` | Brunn Okonkwo | 1.29 | pile driver | BULWARK | 1200 | damage taken ×0.86 |
| CIRRUS `LT-21` | Mira Holloway | 0.82 | twin daggers | WISP | 820 | boost regen ×2 |
| OBELISK `GD-09` | Saar Tengku | 1.18 | ram shield | AEGIS | 1180 | guard drain ×0.55 |
| PYRE `IN-05` | Rasa Volkov | 1.04 | thermal cleaver | EMBER | 1060 | saturation gain ×1.8 |
| NULLTIDE `EW-14` | Io Senna | 0.89 | arc glaive | STATIC | 900 | *opponent's* energy regen ×0.5 |

Pilot characterisations — the source for banter *and* for the music prompts —
are in `docs/PILOT_PORTRAIT_SPEC.md`.

---

## 11. Documents worth reading

| File | What it holds |
| --- | --- |
| `CLAUDE.md` (workspace root) | Project rules, structure, definition of done |
| `docs/MUSIC_CUE_SHEET.md` | **The next task's spec.** 16 tracks, every Suno prompt, the battle roll |
| `docs/MUSIC_STUDY_2005.md` | How the reference handles music |
| `docs/PROJECTILE_STUDY_2005.md` | How 2005 draws projectiles |
| `docs/DECISIONS.md` | D1–D58a, design/technical decisions and reasons |
| `docs/REFERENCE_AUDIT.md` | Reference inventory; §4d has the 2005 variable legend |
| `docs/IMPLEMENTATION_PLAN.md` | Architecture and milestones |
| `docs/AUDIO_CUE_SHEET.md` | 40 SFX cues / 71 files, prompts, cost model |
| `docs/PILOT_PORTRAIT_SPEC.md` | Portrait spec and all 8 pilot characterisations |
| `AUDIO_SESSION_CONTEXT.md` | ElevenLabs setup and credit facts (key rotation is resolved) |
