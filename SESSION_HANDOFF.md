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

* **352 tests pass** (17 files), typecheck clean, production build clean.
* Working tree clean at `0c1d869`.
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

## 4. NEXT TASK — per-mech projectile art and VFX

**This is where the session stopped. No code has been written for it.**

The user's ask, verbatim in intent: every mech should have its own unique
bullet/beam/fire projectile, with different patterns, shapes and sizes, and they
should glow and emit VFX the way Babel Sword 2005 does.

**Read `docs/PROJECTILE_STUDY_2005.md` first.** It is the study of how the 2005
game does it, taken from its animation table and state files, and it ends with a
prioritised gap list. The headline findings:

* Sixteen projectile *families*, each a base animation number; the offsets within
  a family are **pre-drawn angle steps**, not variants.
* Every projectile frame is **additive**, alternating between two additive
  strengths each frame — a 60 Hz intensity flicker.
* The **hitbox is 6×6 px** while the drawn shot is many times larger. Drawn size
  is deliberately decoupled from the hitbox; ours is not.
* Trails are **AfterImage, only 2 frames**. The long streaks are short trails on
  fast shots, plus several fired in a fan.
* Motion is not linear — `velmul` 0.945 and `accel = vel/8` … `vel/30` per
  family, so shots decelerate or accelerate distinctly.
* Secondary effects are Explods with randomised H/V flips, depth-scaled by the
  same pseudo-3D factor we already use, on a **ramping** emission schedule.

Current state to change: `src/render/Effects.ts` and `PROJ_STYLE` in
`BattleScene.ts` map five `ProjKind`s onto two textures (`fx_streak`, `fx_glow`)
tinted per mech, sized from `projRadius`, moving in a straight line.

Open decision the user has not made: **where the projectile art comes from.**
Blender can render sprite banks exactly as it renders mech parts (orthographic,
transparent PNG, atlas-packed) which matches the existing pipeline; or extend the
procedural canvas textures in `src/render/Textures.ts`. Ask before committing to
one.

---

## 5. Open questions the user still owes an answer on

1. **HALCYON's and NOCTURNE's lances do not pierce barriers; all six expansion
   lances do.** Traced to history, not design: `002ed42` used `Pierce` for melee
   only; `a36ce70` introduced it on the six new lances and never revisited the
   two originals. But the two are structurally different weapons — 96 dmg ×3
   stacked segments versus a single 142–240 spear — so simply adding the flag
   would make them the strongest anti-guard tool in the game. Three options were
   put to the user (unify as single heavy spears / add the flag as-is / leave and
   document). **No answer yet.**
2. **A forced SHIELD burst is very short.** Shield already drains the meter at
   double rate, so forcing at ~35 % gives ~1 s of burst against a 2 s overheat —
   a net loss almost always, where Shoot and Speed get ~2.4 s. May be the correct
   punishment for gambling with the defensive mode, or the double drain may want
   to not stack with the partial scaling.
3. **Audio duration targets.** `docs/AUDIO_CUE_SHEET.md` lists targets far
   shorter than what was generated (`fire_vulcan` wants 0.10 s, the file has
   audio across its full 0.52 s). The normalise pass removed **only silence** on
   purpose — cutting real content needs ears. Frequent cues may be overlapping
   into mush; worth a listening pass.

---

## 6. Other unfinished work

* **Music.** Not started, never in the cue sheet. ElevenLabs `compose_music` is
  available. The 2005 reference has 16 BGM tracks worth studying for style.
* **Rotate the ElevenLabs API key.** Generation is finished and the key was
  pasted into a chat transcript. See `AUDIO_SESSION_CONTEXT.md` §8.
* **Back up `assets/sprites/pilots/_raw/`** (14 MB, untracked and gitignored).
  Delivered portrait sources; cannot be regenerated.
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
