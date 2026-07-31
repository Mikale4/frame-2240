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

## 4. Git state — all committed

**Working tree is clean.** The session's work landed as eight commits on
`master`, oldest first:

| Commit | |
| --- | --- |
| `abc0066` | Generate the sound effect set and play it from the game |
| `a36ce70` | Expand the roster from two mechs to eight |
| `6625841` | Model the six new chassis, their weapons and their melee hardware |
| `b3b6283` | Pack mech sprites into one texture atlas per chassis |
| `6692a61` | Give each melee weapon its own motion, and each chassis its own size |
| `3ffd851` | Add the eight pilot portraits |
| `6901e51` | Restructure the front end as a fighting game |
| `abc9f9c` | Wire the new assets into the battle, and drop the lock-on toggle |

Nothing is pushed — all local. Git identity is unset globally, so commits passed
`Claude <noreply@anthropic.com>` per command to match the existing history;
do the same rather than editing the user's global config.

**Caveat:** only the final tree was verified to build. Several files carry
changes for more than one concern (`MechDef.ts` holds motion, cue and scale
types; `BootScene.ts` holds audio, atlas and portrait loading), so an individual
commit may not build standalone. Fine for review, worth knowing before bisecting.

### Two things that need a decision

* **`assets/sprites/pilots/_raw/` (14 MB) is untracked** and gitignored. Those
  are the delivered portrait sources and **cannot be regenerated** — ChatGPT will
  not reproduce them. They need backing up, or committing if the user decides
  that much binary belongs in history. Adding later is trivial; removing later
  needs a history rewrite, which is why it was left out.
* **`tools/blender/build_portraits.py` is superseded.** It builds helmeted 3D
  busts, which was the wrong approach — the real portraits are hand-authored
  pixel art. It is committed as a record of the wrong turn. Do not treat it as
  the portrait pipeline; delete it if it is only causing confusion.

---

## 5. DONE — the drone overhaul

All five parts landed. See `docs/DECISIONS.md` D44 and D45 for the reasoning.

1. **8 unique drone models** — `DRONE_BUILDERS` in `tools/blender/build_mechs.py`,
   one builder function per chassis. Silhouettes are deliberately unlike each
   other; see the lineup at `renders/debug/drones_lineup.png`.
2. **A unique passive per drone** — `DronePassiveDef` on `SupporterDef`. One
   numeric lever each, enforced by a test. Applied through
   `Combatant.dronePassive`, live only while the drone is on station.
3. **Drone HP and permanent destruction** — `Supporter.life` / `takeHit`,
   collided in `MatchSim.resolveDroneCollisions`. 95–170 HP against 820–1420 for
   a chassis. Hit points and volley readiness are both drawn on the drone.
4. **The assist button is a deploy/recall toggle** — `Combatant.toggleDrone`.
   Stowed drones are invulnerable, invisible and slowly repair.
5. **Auto-fire while deployed** — the drone asks its owner for a volley
   (`requestVolley`) and pays from the same sub-charge rack. Gated on
   `fireRange`, so a match genuinely opens with the drones holding fire until
   someone closes.

The quarter-circle salvo motion survives as a manual "fire now" order.

**Rebuilding the drone art:** run `tools/blender/rebuild_drones.py` (via the MCP
`execute_blender_code`, synchronously — poll
`renders/debug/_drone_build_status.json`), then `python tools/pack_atlases.py`.
It re-renders only the eight drone sprites and patches their manifest rows.

---

## 6. Other unfinished work

* **In-battle pilot banter** — text popups plus portrait thumbnails during
  combat, as the 2005 reference does. Thumbnails exist at
  `pilot_<id>_thumb` (96 px). Nothing built yet.
* **Audio trim + normalise.** All 71 files are raw: 0.5 s minimum regardless of
  target, unnormalised. Nine sit below −6 dB. `ffmpeg` is available (2013 build,
  no `-hide_banner`). See `docs/AUDIO_CUE_SHEET.md`.
* **Cues with no trigger**: `footstep`, `melee_ignite` and the two loop beds
  (`thruster_loop`, `drone_hover`) are loaded and playable but nothing calls
  them. `assist_fire` and `ui_back` are now wired — to the drone firing on its
  own initiative, and to the recall.
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

### Drones

| Mech | Drone | HP | Shape | Passive |
| --- | --- | --- | --- | --- |
| HALCYON | ARBITER | 120 | swept dart | REACTOR LINK — energy regen x1.45 |
| NOCTURNE | WARDEN | 125 | armoured brick, twin guns | BARRIER FEED — barrier regen x2 |
| VESPER | SIGHTLINE | 100 | a rifle with an engine | TARGETING UPLINK — damage dealt x1.14 |
| TERRAMOTH | BULWARK | 170 | shield on thrusters | ARMOUR BRACE — damage taken x0.86 |
| CIRRUS | WISP | 95 | open hoop and a node | THERMAL SIPHON — boost regen x2 |
| OBELISK | AEGIS | 145 | upright monolith | GUARD RELAY — guard drain x0.55 |
| PYRE | EMBER | 130 | tanks and flared vents | OVERDRIVE TAP — saturation gain x1.8 |
| NULLTIDE | STATIC | 110 | lattice antenna mast | JAMMING FIELD — *opponent's* energy regen x0.5 |

Design rule: **one numeric lever per passive**, enforced by a test.

Design rule: **heavier weapon → fewer, harder hits.** Enforced by a test.
Chassis `scale` must stay proportional to `hurtRadius` — also enforced by a test.
