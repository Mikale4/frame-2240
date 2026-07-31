# Session Handoff — Babel Sword: Reignition

> Written 2026-07-31 at the end of a long session, for whoever picks this up
> next. Everything marked **verified** was confirmed by running it, not assumed.
> Read this first, then `CLAUDE.md`, then the docs listed in §8.

---

## 1. Start here — do these before working

1. **Keep the Browser pane VISIBLE.** This is not cosmetic. A hidden pane makes
   Chrome suspend compositing and throttle timers and network, which turned a
   12-second boot into **five minutes** and made `computer{screenshot}` fail
   outright. Most of one session was lost to this. Visible pane = fast boot and
   working screenshots.
2. **Blender must be running with the MCP addon enabled** for any art work.
   After a crash-restart the addon comes back *disabled* — re-enable via
   Edit → Preferences → Add-ons → search "MCP", then press N in the viewport and
   click Connect in the BlenderMCP tab. Port 9876 must be open.
3. **Dev server**: `npm run dev` in `Babel Sword Reignition/`. Start it with
   Bash, not `preview_start` — the launcher fails to quote npm's path
   (`C:\Program Files\…`) and errors with `'C:\Program' is not recognized`.
4. **Do not re-open the preview repeatedly.** Each `preview_start` opens a *new*
   tab, and every new tab is a full page reload. Reuse the open tab.

---

## 2. What this project is

An original 2D free-flight mecha combat game — TypeScript, Phaser 3, Vite,
Vitest. Inspired by the combat design of the supplied Babel Sword references
(read-only research material at the workspace root), but **entirely original**
in code, art, audio, characters and story. `CLAUDE.md` at the workspace root is
authoritative on rules and structure.

The 2005 reference is a **M.U.G.E.N** game: `.def`, `.cns`, `.air`, `.sff`
(sprites), `.snd` (audio), plus 16 `.mp3` BGM tracks. Readable formats are fair
game for studying structure and presentation; assets are not to be reused.

**State: well past the vertical slice.** Playable end to end — title → menu →
mech select → battle → results, with 8 mechs, full audio, and real art.

---

## 3. Current status — verified

* **254 tests pass**, typecheck clean, production build clean, `dist` 7.9 MB.
* Boot loads 8 mech atlases + 16 portraits + 71 audio files with **0 failures**.
* Full flow verified by driving real key events: Title → Menu → MechSelect
  (mech → rival → skill) → Battle.

### Done this session

| Area | Outcome |
| --- | --- |
| **Audio** | 71 SFX generated via ElevenLabs, named per cue sheet, wired into `Sfx` with procedural fallback. Cost 632 credits (~0.5 % of quota). |
| **Voice** | `match_ready` / `match_fight` are synthetic TTS ("GET READY!" / "ENGAGE!"). |
| **Roster** | Expanded 2 → **8 mechs**, each with unique stats, 6 weapons, melee chain, drone, palette, pilot. |
| **Mech art** | All 8 modelled in Blender, 112 part sprites, packed into 8 atlases. |
| **Portraits** | 8 pilot portraits delivered by the user (ChatGPT), chroma-keyed and thumbnailed. |
| **UI** | Title is now Press Start only; new `MenuScene` (mode select); new `MechSelectScene` (fighting-game flow). |
| **Melee** | 8 distinct weapons with 4 motion types (swing / thrust / bash / piston). |
| **Sizes** | Per-chassis visual scale, 0.82 – 1.29. |
| **Controls** | Lock-on removed (always on); dash now overlaps firing and melee. |
| **Perf** | Texture atlases: 112 requests → 8. Boot 5 min → 12 s. |

---

## 4. THE 174 UNCOMMITTED FILES — read this

Nothing has been committed all session. `HEAD` is still **`87e89be`**
("Add the audio session context doc…"). This is the biggest risk in the project
right now.

**53 modified, 121 untracked.** Breakdown:

* `assets/sprites/mechs/` — **129 files**. 112 regenerated part PNGs, 8 atlas
  PNGs, 8 atlas JSONs, `manifest.json`.
* `assets/sprites/pilots/` — 16 processed portraits + 8 raw sources in `_raw/`.
* `assets/audio/` — 71 MP3s + `_audition.html`.
* `assets/blender/mechs.blend` — now 1 MB (8 mechs, was 386 KB).
* **New source**: `SoundBank.ts`, `rosterExtra.ts`, `PartTexture.ts`,
  `MechSelectScene.ts`, `MenuScene.ts`, `roster.test.ts`, `soundbank.test.ts`,
  `node-env.d.ts`, `tools/pack_atlases.py`, `tools/blender/build_portraits.py`.
* **Modified source**: `Sfx.ts`, `Combatant.ts`, `MatchSim.ts`, `mechs.ts`,
  `DebugOverlay.ts`, `InputManager.ts`, `main.ts`, `MechDef.ts`,
  `MechRenderer.ts`, `RigRotation.ts`, `BattleScene.ts`, `BootScene.ts`,
  `TitleScene.ts`, `Hud.ts`, `Menu.ts`, `build_mechs.py`, `vite.config.ts`,
  plus `motion.test.ts` / `rig.test.ts`.

**Suggested commit split** (the work is genuinely separable):

1. Audio: 71 SFX + `SoundBank.ts` + `Sfx.ts` + `soundbank.test.ts` + cue sheet.
2. Roster data: `rosterExtra.ts` + `mechs.ts` + `MechDef.ts` + `roster.test.ts`.
3. Mech art: Blender script + 112 sprites + `.blend` + atlases + `pack_atlases.py`.
4. UI: `MenuScene`, `MechSelectScene`, `TitleScene`, `Menu.ts`, `InputManager.ts`.
5. Melee motion: `Combatant.ts`, `RigRotation.ts`, `MechRenderer.ts`, `MechDef.ts`.
6. Portraits: 16 PNGs + spec doc + `build_portraits.py`.
7. Perf/controls: atlas wiring, `PartTexture.ts`, lock removal, dash overlap.

`build_portraits.py` produces helmeted 3D busts and is **superseded** — the real
portraits are hand-authored. Keep it or delete it, but do not treat it as the
portrait pipeline.

---

## 5. IN PROGRESS — the drone overhaul

This was the next task and is **not started**. It is one coherent chunk:

1. **8 unique drone models.** All eight drones are currently the same mesh in
   different colours. Each needs its own design, built in
   `tools/blender/build_mechs.py` (`build_drone`, ~line 877).
2. **A unique passive per drone**, benefiting its pilot. Nothing exists for this
   — needs a field on `SupporterDef` plus sim support.
3. **Drone HP and destruction.** Drones get their own HP bar, much lower than a
   mech's, and are destroyed for the rest of the match if it empties.
4. **Assist button becomes a deploy/recall toggle** rather than a fire command.
5. **Auto-fire while deployed**, gated on charges.

Relevant code: `SupporterDef` in `src/mechs/MechDef.ts`, supporter logic in
`src/combat/` (see `supporter.test.ts` for the existing 23 tests), drone sprite
in `BattleScene.ts` (~line 156, uses `partTexture(this, def.id, 'drone')`).

---

## 6. Other unfinished work

* **In-battle pilot banter** — text popups plus portrait thumbnails during
  combat, as the 2005 reference does. Thumbnails exist at
  `pilot_<id>_thumb` (96 px). Nothing built yet.
* **Audio trim + normalise.** All 71 files are raw: 0.5 s minimum regardless of
  target, unnormalised. Nine sit below −6 dB. `ffmpeg` is available (2013 build,
  no `-hide_banner`). See `docs/AUDIO_CUE_SHEET.md`.
* **Cues with no trigger**: `footstep`, `ui_back`, `melee_ignite`, `assist_fire`,
  and the two loop beds (`thruster_loop`, `drone_hover`) are loaded and playable
  but nothing calls them.
* **`melee_claw` is doing triple duty** for claw, ram shield and pile driver.
  Dedicated `melee_shield` / `melee_pile` cues would be ~6 credits each.
* **Music.** Not started, and never in the cue sheet — that was SFX only. The
  2005 reference has 16 BGM tracks worth studying for style. ElevenLabs
  `compose_music` is available.
* **Rotate the ElevenLabs API key.** Generation is finished, and the key was
  pasted into a chat transcript. See `AUDIO_SESSION_CONTEXT.md` §8.
* Remaining gaps from `docs/REFERENCE_AUDIT.md` §4d.4: armour/shots-absorbed
  stat, score and hit counters, mission win conditions, boss AI roles, stock
  icons, off-screen indicators.

---

## 7. Traps found the hard way — do not relearn these

* **`bpy` is not thread-safe.** Running the Blender build on a background thread
  to dodge an MCP timeout **crashed Blender**. The timeout is only the request
  window closing; the work continues on the main thread regardless. Run
  synchronously and poll a status file.
* **Vite answers unknown paths with `index.html` and a 200.** Phaser then gets
  HTML where it expected a PNG, fails to *process* rather than *load*, and
  **never fires `complete`** — boot hangs forever. Never request art that does
  not exist. `BootScene` has `MODELLED` and `PORTRAITS` sets for exactly this.
* **Atlases must not be trimmed.** Every part PNG is square with its pivot dead
  centre and the rig draws at origin 0.5,0.5 on that assumption. Trimming
  silently misplaces every limb.
* **Re-running the Blender build regenerates loose part PNGs** — you must then
  run `python tools/pack_atlases.py` or the game keeps drawing the old atlases.
* **Chroma-keying: sample the border's modal colour, not the corners.** A
  subject touching an edge (NOCTURNE's shoulders) poisons a corner average and
  dissolves the character.
* **ElevenLabs filenames derive from the prompt's first 5 characters.** Two
  parallel calls sharing a prefix in the same second silently overwrite each
  other. Vary the opening word per variation.
* **Prompt phrases that break SFX**: "futuristic"/"sci-fi" on physical objects,
  "metallic ping" (→ hammer and nail), "sharp pop", "pressurised air release"
  (→ pneumatic hiss), and light-contact verbs like "skipping"/"glance", which
  produce output 20–40 dB below everything else.
* **The user's keybindings are remapped** in `localStorage`: flight `KeyA`,
  heavy `KeyC`, boost `Space`/`KeyS`, barrier `KeyD`. Defaults do not apply.
* **PowerShell**: a safety guard rejects the whole command if `Remove-Item`
  appears alongside regexes containing backslashes. Split them.

---

## 8. Documents worth reading

| File | What it holds |
| --- | --- |
| `CLAUDE.md` (workspace root) | Project rules, structure, definition of done |
| `docs/REFERENCE_AUDIT.md` | Reference inventory; §4d has the 2005 variable legend |
| `docs/IMPLEMENTATION_PLAN.md` | Architecture and milestones |
| `docs/DECISIONS.md` | D1–D43, design/technical decisions and reasons |
| `docs/AUDIO_CUE_SHEET.md` | 40 cues / 71 files, approved prompts, cost model, prompt-writing rules |
| `AUDIO_SESSION_CONTEXT.md` | ElevenLabs setup, credit facts, key rotation note |
| `docs/PILOT_PORTRAIT_SPEC.md` | Portrait spec + all 8 pilot descriptions |
| `BABEL_SWORD_NEW_SESSION_HANDOFF.md` | Earlier handoff, wider project history |

---

## 9. Roster reference

| Mech | Pilot | Scale | Melee | Motion | Hits |
| --- | --- | --- | --- | --- | --- |
| HALCYON `AV-07` | Naia Vesk | 1.00 | beam saber | swing | 6 |
| NOCTURNE `AV-13` | Halden Rook | 1.11 | hydraulic claw | swing | 3 |
| VESPER `AV-12` | Kestrel Doyne | 0.93 | beam bayonet | thrust | 2 |
| TERRAMOTH `HV-03` | Brunn Okonkwo | 1.29 | pile driver | piston | 2 |
| CIRRUS `LT-21` | Mira Holloway | 0.82 | twin beam daggers | swing | 8 |
| OBELISK `GD-09` | Saar Tengku | 1.18 | ram shield | bash | 2 |
| PYRE `IN-05` | Rasa Volkov | 1.04 | thermal cleaver | swing | 3 |
| NULLTIDE `EW-14` | Io Senna | 0.89 | arc glaive | swing | 5 |

Design rule: **heavier weapon → fewer, harder hits.** Enforced by a test.
Chassis `scale` must stay proportional to `hurtRadius` — also enforced by a test.
