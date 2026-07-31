# Session Handoff — Babel Sword: Reignition

> Rewritten 2026-07-31 at the end of a long session. Supersedes the previous
> handoff. Everything marked **verified** was confirmed by running it.
> Read this, then `CLAUDE.md`, then the docs in §9.

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
2. **Blender must be running with the MCP addon enabled** for art work. After a
   crash-restart it comes back *disabled* — re-enable via Edit → Preferences →
   Add-ons → search "MCP", then N in the viewport → BlenderMCP → Connect.
3. **Dev server**: `npm run dev` from Bash, not `preview_start` (the launcher
   fails to quote `C:\Program Files\…`).
4. **Do not call `preview_start` repeatedly** — each call opens a new tab and
   every new tab is a full reload. Reuse the open tab and `navigate`.

---

## 2. What this is

An original 2D free-flight mecha combat game — TypeScript, Phaser 3, Vite,
Vitest. Inspired by the combat design of the read-only references at the
workspace root, entirely original in code, art, audio, characters and story.
`CLAUDE.md` at the workspace root is authoritative.

**State: well past the vertical slice.** Title → menu → mech select → battle →
results, 8 mechs, full audio, real art, pilot dialogue.

---

## 3. Current status — verified

* **383 tests pass** (18 files), typecheck clean, production build clean.
* Verified in-game at 61 fps: title → menu → select → battle → results →
  rematch → quit to title, with no console errors. Projectiles, muzzle flashes,
  impacts, explosions, barriers, saturation cutscenes and banter all render.
* Working tree clean. Nothing pushed — the repo has no remote.
* All 71 audio files decode through the game's own `loadSoundBank`: 40 cues,
  zero failures.

### Landed this session

| Area | Outcome |
| --- | --- |
| **Drones** | 8 unique Blender models; a passive each; HP + permanent destruction; the assist button became a deploy/recall toggle; auto-fire gated on charges. |
| **Saturation** | Each mode makes one resource free (Shield→barrier, Shoot→energy, Speed→boost). Burnout stun. Per-mode activation VFX. |
| **SAT activation** | Moved to a dedicated button (`E`, on the dead `Btn.Lock` slot). Can be forced early at reduced power, ending in a damaging overheat. |
| **Cutscene** | Spending SAT freezes the match ~1.3 s: letterbox, portrait push-in, mode name, pilot line. |
| **Banter** | 36 matchup pairings × 5 conversations; reactive lines on 11 triggers; queued and paced. |
| **Guard** | Guard cuts 80 % of normal damage, 50 % of melee. Barrier burst repels a melee *opener*. |
| **Audio** | All 71 files trimmed and RMS-normalised. Mean spread 28.6 dB → 10.4 dB. |
| **Bug fixes** | Wrecks now clamped to the arena; select-screen text clipping; 25 double-encoded em-dashes. |

### Commits (oldest first)

```
2cdc6e0  Make the supporter drone something you can lose
ea67b3f  Give each of the eight drones its own design
cd744e9  Document the drone overhaul, and stop the select screen clipping it
d4fea44  Give each saturation mode a resource it spends for free
d00437d  Make saturation possible to activate by hand
7c55602  Give the pilots something to say
a649f46  Give saturation its own button, and let it be forced early
e1059bb  Make a burnt-out mech look burnt out, and finish the cutscene panel
214b1fc  Trim and level-match the sound set
0c1d869  Make a guard worth holding, and let a burst throw a sword back
922b4de  Study how the 2005 reference draws its projectiles, and hand the session over
24057cf  Give every mech its own bullet, beam and fire
```

Nothing is pushed. Git identity is unset globally; pass it per command to match
history rather than editing the user's global config:

```bash
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit --author="Claude <noreply@anthropic.com>" -F <msgfile>
```

Write commit messages to a file and use `-F`. **Do not use PowerShell here-string
syntax (`@'…'@`) in the Bash tool** — it is not shell syntax and shreds the
command.

---

## 4. Per-mech projectile art and VFX — DONE

Delivered. The user chose **procedural canvas** art (their answer named the look
— "how it looks in Babel Sword 2005 … also in various Touhou games" — and that
look is flat additive 2D sprite art, which settles the pipeline), and the full
scope: visuals + motion + firing patterns.

* **16 families** in `src/projectiles/families.ts`, drawn in
  `src/render/ProjTextures.ts` and packed into one runtime canvas texture.
* **Three additive layers per shot** — tinted halo, tinted shell, white core —
  because Phaser's tint is a multiply and cannot leave a white centre inside a
  coloured shell any other way. `src/render/ProjectileLayer.ts`.
* **60 Hz flicker** off the projectile's age in ticks, not the render frame.
* **Drawn size decoupled from the hitbox** via `AttackDef.visualScale`.
* **Per-family motion** — `velMul` / `accel` / `swerve`, gentler than the
  reference's 0.945 so no weapon loses its range; tested at ≥70 % of nominal.
* **Five volley patterns** — `line`, `stack`, `bundle`, `ripple`, `arc`.
* **Family-keyed muzzle and impact bursts** in five characters (`spark`,
  `ember`, `shatter`, `pulse`, `arc`), with the reference's randomised flips.
* **Per-mech kits** in `src/data/projectileArt.ts` — one file, whole roster
  side by side, because the design question is comparative.
* Six weapons fire denser volleys at unchanged full-connect damage (D55).
* All eight lances now ignore a held guard (D56).

See `docs/DECISIONS.md` D52–D56. `docs/PROJECTILE_STUDY_2005.md` remains the
research; its gap list is now closed except for pre-drawn per-angle sprites,
which was deliberately not done — we rotate a bank of distinct silhouettes
instead, which the study itself names as the acceptable middle path.

### What is NOT done here

* **Per-angle sprite banks.** We rotate. Fine, and documented.
* **Ramping emission schedules.** The reference accelerates its secondary
  effects as a state runs (`time%6` → `%4` → `%2` → every frame). Our muzzle and
  impact bursts are one-shot. Only worth doing for sustained beams.
* **Only two mech pairs were verified in-game** (VESPER/PYRE, TERRAMOTH/NULLTIDE).
  All 48 weapons were verified as art via a contact sheet, and every family goes
  through one code path, but the other pairs have not been watched in motion.

---

## 4b. The barrier and Shield saturation — DONE

Came out of reading the barrier system end to end for the user. Four changes,
`docs/DECISIONS.md` D57–D58a:

* **Shield saturation now cuts damage by category** (`SHIELD_TAKEN`): gunfire
  and status chip 95 % off, a piercing lance 80 %, melee **70 %**. Melee is the
  porous one deliberately — closing to sword range is the way through a Shield.
  It *replaces* the guard's scaling rather than stacking, so the figures read as
  written; a test pins them against the plain guard so a burst can never be
  worse than simply holding.
* **A held guard halves a lance** (`pierceGuardScale`). Since D56 gave every
  lance `Pierce`, and the guard branch excludes `Pierce`, holding guard against
  any lance in the game was worth exactly nothing. Damage only — a guarded lance
  still returns `'hit'`, staggers and knocks the guard down.
* **Shield saturation locks the barrier button out.** Not cosmetic: the burst
  has **no cooldown anywhere in the game** (`barrierActiveTicks` only locks
  movement), so the 30-point cost *is* the rate limiter — and `barrierFree`
  deletes it. Four free taps covered the entire 3.5 s mode in invulnerability.
  **This is balance, not a bug. Do not "fix" it.**
* **The rival respects the lock-out.** `shouldBarrier` also gates the AI's
  attack, so every tick it reached for a barrier it could not have, it skipped
  its own offence for a shot it never fired.
* **The refusal is audible.** A press during the lock-out emits `assistDenied`
  (grey hex flash plus a negative buzz), debounced to one every 0.4 s so mashing
  does not machine-gun it. A silently refused press is how a balance decision
  gets reported as a bug. The event name has drifted into meaning "unavailable"
  and now covers three unrelated refusals; renaming it would mean renaming the
  audio cue key and the file behind it.

---

## 5. Open questions the user still owes an answer on

1. **A forced SHIELD burst is a losing trade until 75 % meter.** Re-derived by
   measurement rather than estimate, after D57/D58 changed what a second of
   Shield is worth. Ticks of burst against the ticks of helplessness that follow,
   plus the 5 % max-life overheat cost:

   | Meter | SHIELD burst | SHOOT / SPEED burst | Stun | Life | SHIELD net |
   | --- | --- | --- | --- | --- | --- |
   | 25 % | 53 (0.88 s) | 105 (1.75 s) | 119 | 50 | **-66** |
   | 35 % | 74 (1.23 s) | 147 (2.45 s) | 119 | 50 | **-45** |
   | 50 % | 105 (1.75 s) | 210 (3.50 s) | 119 | 50 | **-14** |
   | 75 % | 158 (2.63 s) | 315 (5.25 s) | 119 | 50 | +39 |
   | 100 % | 210 (3.50 s) | 420 (7.00 s) | 59 | 0 | +151 |

   Shoot and Speed break even at 25 % and are positive from 35 %. Shield stays
   negative until 75 %: you are helpless for longer than you were protected, and
   pay 50 life on top. D57 raised the *value per second* a great deal but changed
   no duration, so the shape is unchanged - and higher value cannot rescue it,
   because the stun window is both longer than the protected one and strictly
   worse than neutral.

   Three ways to go. **(a)** Leave it: after D57 a *full* Shield burst is the
   strongest defensive tool in the game, and this asymmetry is what forces
   patience with it. **(b)** Stop the double drain stacking with the partial
   scaling, capped at the full-burst duration so forcing at 99 % cannot beat
   waiting. **(c)** Scale the overheat by the burst actually granted, so a short
   burst earns a short stun - mode-independent, self-balancing, and the tidiest
   of the three. **No answer yet.**

2. **Audio duration targets.** `docs/AUDIO_CUE_SHEET.md` lists targets far
   shorter than what was generated (`fire_vulcan` wants 0.10 s, the file has
   audio across its full 0.52 s). The normalise pass removed **only silence** on
   purpose — cutting real content needs ears. Frequent cues may be overlapping
   into mush; worth a listening pass.

---

## 6. Other unfinished work

* **Music.** In progress. `docs/MUSIC_STUDY_2005.md` is the research and is
  done; the headline is that the reference's sixteen tracks are ~30 s seamless
  **loops** (11.8–48.3 s, median ~25), not songs. Nothing built yet.
  The ElevenLabs key rotation and the `pilots/_raw` backup are both resolved —
  the user handled them.
* **Cues with no trigger**: `footstep`, `melee_ignite`, and the two loop beds
  (`thruster_loop`, `drone_hover`) are loaded and playable but nothing calls them.
* `melee_claw` still does triple duty for claw, ram shield and pile driver.
* Remaining gaps from `docs/REFERENCE_AUDIT.md` §4d.4: armour/shots-absorbed
  stat, score and hit counters, mission win conditions, boss AI roles, stock
  icons, off-screen indicators.

---

## 7. Traps found the hard way — do not relearn these

* **The Browser pane silently stops compositing.** See §1. This cost hours across
  two sessions, twice diagnosed wrongly as "the pane is hidden".
* **Screenshot round-trip is seconds, sometimes ~30.** You cannot catch a 0.3–0.7 s
  effect by screenshotting after triggering it. **Use `Escape` to pause** — the
  update loop returns early while paused, so the frame freezes and the screenshot
  can take as long as it likes. This is how every VFX in this session was verified.
* **Driving the game from the Browser pane needs four separate tricks.** All of
  these cost time in the projectile session; none are obvious.
  1. `computer{action:'key'}` **does not reach Phaser.** Dispatch a real event
     instead, on `window`, keyed by physical `code`:
     `window.dispatchEvent(new KeyboardEvent('keydown', {code:'Enter', bubbles:true}))`.
  2. **Hold keys for ~220 ms.** Menus read *held* state (`input$.readUi()`), not
     key-down edges, so a `keydown` + `keyup` in the same frame is invisible to
     them. Down, `await sleep(220)`, up.
  3. **Freeze by hijacking `requestAnimationFrame`, not by pausing.** `Escape`
     works but lays a scrim over the frame and washes the effects out. Instead
     swap in a rAF that stores the pending callback rather than scheduling it —
     the canvas holds its last frame with no overlay, and restoring the real rAF
     and re-firing the stored callback resumes cleanly. This is how every
     projectile screenshot was taken.
  4. **You cannot read the canvas back.** The WebGL context has no
     `preserveDrawingBuffer`, so `drawImage(canvas, …)` yields transparent black
     and there is no way to crop or magnify. Full-frame screenshots only.
* **The Browser pane has its own empty `localStorage`,** so it runs the
  **default** bindings, not the user's remapped profile — `Enter`/`J` confirm,
  `WASD`/arrows move, `Escape` pauses. Check `localStorage.getItem('bsr.bindings.v1')`:
  `null` means defaults. (The remapped profile below is the *user's own browser*.)
* **To inspect generated canvas art without the game running,** import the module
  in the page with a `?v=` cache-buster, hand it a fake scene whose
  `textures.createCanvas` returns a plain canvas, then POST the result as a blob
  to a throwaway Node server and read the PNG. Works while the pane is throttled,
  because canvas drawing needs no compositing. This is how the 16 families and
  the 48-weapon contact sheet were reviewed.
* **The user's bindings are remapped** in `localStorage` (`bsr.bindings.v1`):
  boost `Space`/`KeyS`, barrier `KeyF`/`KeyD`, **`ShiftLeft` is the flight
  toggle**, melee `KeyU`/`KeyC`, modeCycle `Tab`/`KeyA`. The stored profile has
  no `saturation` entry, so it falls back to the default `KeyE`. Read the profile
  before driving the game — an afternoon went into "SAT is broken" that was
  actually pressing the flight toggle.
* **`bpy` is not thread-safe.** Running a Blender build on a background thread to
  dodge an MCP timeout **crashes Blender**. The timeout is only the request
  window closing; the work continues. Run synchronously and poll a status file.
* **Never hold Python references to Blender Objects across a deletion.** The
  first drone rebuild built and rendered all eight, then died in its own cleanup
  on a stale handle, losing the manifest write and the `.blend` save. Key by name.
* **`add_wedge` argument order.** With the 90° Y rotation these shapes use, the
  size tuple reads `(height, width, length-along-nose)`. Getting it backwards
  turned BULWARK's shield into a horizontal pancake 7 px tall.
* **Vite answers unknown paths with `index.html` and a 200.** Phaser then gets
  HTML where it expected a PNG and never fires `complete` — boot hangs forever.
  Never request art that does not exist. `BootScene` has `MODELLED`/`PORTRAITS`
  sets for exactly this.
* **Atlases must not be trimmed.** Every part PNG is square with its pivot dead
  centre and the rig draws at origin 0.5,0.5 on that assumption.
* **Re-running the Blender build regenerates loose part PNGs** — you must then
  run `python tools/pack_atlases.py` or the game keeps drawing the old atlases.
  For drones only, `tools/blender/rebuild_drones.py` re-renders just those eight.
* **mp3 round-trips do not preserve peaks.** Normalising to −1.0 dBFS measured
  back at −0.0. `tools/normalise_audio.py` uses a −1.6 ceiling to absorb it.
* **PowerShell**: a safety guard rejects the whole command if `Remove-Item`
  appears alongside regexes containing backslashes. Split them.

---

## 8. Roster reference

| Mech | Pilot | Scale | Melee | Drone | HP | Passive |
| --- | --- | --- | --- | --- | --- | --- |
| HALCYON `AV-07` | Naia Vesk | 1.00 | beam saber | ARBITER | 120 | energy regen ×1.45 |
| NOCTURNE `AV-13` | Halden Rook | 1.11 | hydraulic claw | WARDEN | 125 | barrier regen ×2 |
| VESPER `AV-12` | Kestrel Doyne | 0.93 | beam bayonet | SIGHTLINE | 100 | damage dealt ×1.14 |
| TERRAMOTH `HV-03` | Brunn Okonkwo | 1.29 | pile driver | BULWARK | 170 | damage taken ×0.86 |
| CIRRUS `LT-21` | Mira Holloway | 0.82 | twin daggers | WISP | 95 | boost regen ×2 |
| OBELISK `GD-09` | Saar Tengku | 1.18 | ram shield | AEGIS | 145 | guard drain ×0.55 |
| PYRE `IN-05` | Rasa Volkov | 1.04 | thermal cleaver | EMBER | 130 | saturation gain ×1.8 |
| NULLTIDE `EW-14` | Io Senna | 0.89 | arc glaive | STATIC | 110 | *opponent's* energy regen ×0.5 |

Enforced by tests: heavier weapon → fewer, harder hits; `rig.scale` proportional
to `hurtRadius`; one numeric lever per drone passive; every mech has a distinct
drone name and passive; all 36 matchups carry five conversations.

---

## 9. Documents worth reading

| File | What it holds |
| --- | --- |
| `CLAUDE.md` (workspace root) | Project rules, structure, definition of done |
| `docs/PROJECTILE_STUDY_2005.md` | **The next task's research.** How 2005 draws projectiles |
| `docs/DECISIONS.md` | D1–D51, design/technical decisions and reasons |
| `docs/REFERENCE_AUDIT.md` | Reference inventory; §4d has the 2005 variable legend |
| `docs/IMPLEMENTATION_PLAN.md` | Architecture and milestones |
| `docs/AUDIO_CUE_SHEET.md` | 40 cues / 71 files, prompts, cost model, prompt rules |
| `docs/PILOT_PORTRAIT_SPEC.md` | Portrait spec and all 8 pilot characterisations — the source for every line of banter |
| `AUDIO_SESSION_CONTEXT.md` | ElevenLabs setup, credit facts, key rotation note |
