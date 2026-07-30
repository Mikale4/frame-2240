# Audio Session Context — ElevenLabs SFX Generation

> Written 2026-07-30 at the end of the previous session, for the session that
> generates the game's sound effects. Everything below was **verified by running
> it**, not assumed. Re-verify anything that looks stale.

---

## 1. What this session is for

Generate the sound effects for **Babel Sword: Reignition** using the ElevenLabs
MCP, in two stages:

1. **Generate the priority 15 first.** Stop. Show the user, let them judge
   whether the prompts are landing.
2. **Only then generate the remaining 48**, adjusting prompts based on what the
   user says about the first batch.

Do **not** generate all 63 in one go. The whole point of the split is that
re-doing 63 files because the sword sounds wrong is the expensive mistake.

The full cue list, prompts, durations and variation counts live in
**`docs/AUDIO_CUE_SHEET.md`**. That is the source of truth for *what* to make.
This document covers *how*.

---

## 2. ElevenLabs setup — already done and verified

### Config

`C:\Games\Babel Sword Claude\.mcp.json` (workspace root, **not** the project
folder — that is where Claude Code looks for it):

```json
{
  "mcpServers": {
    "ElevenLabs": {
      "command": "uvx",
      "args": ["elevenlabs-mcp"],
      "env": {
        "ELEVENLABS_API_KEY": "<the user's real key, already in place>",
        "ELEVENLABS_MCP_BASE_PATH": "C:\\Games\\Babel Sword Claude\\Babel Sword Reignition\\assets\\audio",
        "ELEVENLABS_MCP_OUTPUT_MODE": "files"
      }
    }
  }
}
```

The workspace root is **not** a git repository, so the key cannot reach project
history. `Babel Sword Reignition/` is the repo.

### Verified facts

| Check | Result |
| --- | --- |
| `uvx` installed | yes, `C:\Users\mahoe\.local\bin\uvx.exe` |
| `uvx elevenlabs-mcp` resolves | yes — 50 packages, exit 0, cache warm |
| API key authenticates | **yes** — tested against `/v1/user/subscription` |
| Account tier | **creator** |
| Credit quota | **130,800**, resets 2026-08-30 |
| `text_to_sound_effects` tool exists | yes, in `elevenlabs_mcp/server.py` |
| One real generation succeeded | yes — see §4 |

### If the MCP tools are not present

The server is configured but its connection was never observed, because MCP
servers load at session start and the previous session could not attach one
mid-flight. If `mcp__ElevenLabs__*` tools do not appear:

* Confirm the app was **fully quit and relaunched**, not just given a new session.
* Expect an approval prompt for the `ElevenLabs` server on first use —
  `.mcp.json` servers are not pre-trusted, and this project's
  `enabledMcpjsonServers` list was empty.
* Fallback: add it through the desktop app's connector/extension UI, which is
  where this machine's other servers (Blender, Desktop Commander, Windows-MCP)
  come from — none of them are in a JSON file.
* Last resort that definitely works: call the REST API directly with
  `Invoke-WebRequest`, exactly as §4 did. It needs no MCP at all.

---

## 3. Tool constraints that shape the work

From the installed package's own source, not from the README:

1. **Duration must be 0.5–5 seconds.** Over half the cue sheet is shorter than
   0.5 s (`ui_move` targets 0.06 s). Generate those at **0.5 s** and trim. The
   Duration column in the cue sheet is the *target after trimming*.
2. **`loop: true` is supported.** Use it for `thruster_loop` and `drone_hover`
   only — those are the two seamless beds.
3. **Output filenames are auto-derived from the prompt text**, not settable.
   Files arrive named after their description. **They must be renamed** to the
   cue sheet's Name column, because the game will load them by name.
4. **`mp3_44100_192`** is the right format. 192 kbps requires Creator tier,
   which this account has. `pcm_44100` would need Pro and is unnecessary for
   short, heavily-layered combat cues.

---

## 4. Real cost data

One cue (`fire_vulcan`, 0.5 s, `mp3_44100_192`) was generated via the REST API
to measure cost before committing to a run:

```text
POST https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_192
body: { "text": "<prompt>", "duration_seconds": 0.5, "prompt_influence": 0.4 }
header: xi-api-key: <key>
```

* Produced a valid 13,209-byte MP3 (ID3 header confirmed) — correct for
  192 kbps × 0.5 s.
* **Cost: ~206 credits** for that 0.5 s generation, read from
  `/v1/usage/character-stats?breakdown_type=product_type`, which reported
  `"Sound Effects": 206` for the day.

> **Careful with the meter.** `/v1/user/subscription` → `character_count` lags
> badly and under-reports (it showed `0`, then `6`). The
> `usage/character-stats` breakdown is the number to trust.

**Budget estimate.** If cost scales roughly with duration, the full 63-file set
lands somewhere around **15,000–25,000 credits**, i.e. well under 20% of the
130,800 quota. The priority 15 should be a few thousand. This is affordable —
but re-measure after the first batch rather than trusting this extrapolation,
since it rests on a single data point at the minimum duration.

That first take was kept as **`assets/audio/fire_vulcan_1.mp3`**. Nobody has
listened to it yet — judge it with the user as part of batch one.

---

## 5. Gotchas found the hard way

* **The Vite dev server crashes when audio files appear.** `assets/` is Vite's
  `publicDir`, so its watcher picks up new files, and renaming one mid-watch
  killed the dev server with an ENOENT. **Generate audio with the dev server
  stopped**, then restart it. It died this way at the end of the last session.
* **The user's keybindings are remapped** and saved in `localStorage`. Defaults
  do *not* apply: flight toggle is `KeyA` (not `KeyC`), heavy is `KeyC`, boost is
  `Space`/`KeyS`, barrier is `KeyD`. Melee `KeyU` and sub/assist `KeyL` are
  unchanged. A live test that presses the documented defaults will silently do
  the wrong thing.
* **The browser pane is hidden**, so `computer{screenshot}` cannot composite and
  rAF is paused. The working method is to drive `window.__BSR__` by hand —
  `game.step(t, dt)` in a loop — and capture through the dev-only `/__shot`
  sink, which writes PNGs to `renders/debug/`. The previous sessions' driver
  snippets are in the transcript; rebuild one at the top of the session.

---

## 6. Work still to do after generation

The game **does not load audio files yet**. All current sound is synthesised at
runtime in `src/audio/Sfx.ts` using WebAudio. Once files exist:

1. **Preload** them in `src/scenes/BootScene.ts`, alongside the mech sprites.
   That scene already tolerates missing assets — it collects failures and
   substitutes a placeholder — so follow that pattern.
2. **Switch `Sfx`** from synthesising to playing samples, picking randomly among
   the `_1`, `_2`, … variations for cues that have them.
3. **Keep the procedural version as a fallback** for any cue whose file is
   missing, so a partial set never leaves the game silent.
4. `thruster_loop` and `drone_hover` need looped playback tied to thrust and to
   drone presence, which no current code path does.
5. Two cues in the sheet are **not triggered anywhere yet** — `footstep` (the
   walk cycle wants it) and `ui_back`. Wire them when the files land.

This layer needs no API access and could have been built in advance; it was left
alone at the user's request.

---

## 7. Project state at handoff

* Branch `master`, working tree clean, latest commit `461e3b8`.
* **199 tests pass**, typecheck clean, production build clean.
* Recent commits: `334433b` rig/saber fixes, `0e338a9` supporter drone,
  `25f1d39` swing arcs + walking + deck, `3cf79b6` status elements,
  `baed3b0` + `61282d2` + `461e3b8` the audio cue sheet.
* Read `BABEL_SWORD_NEW_SESSION_HANDOFF.md` and `docs/DECISIONS.md` (D1–D43) for
  the wider project history. `docs/REFERENCE_AUDIT.md` §4d holds the translated
  2005 variable legend and the remaining gap list.

### Remaining non-audio gaps, if audio finishes early

From `REFERENCE_AUDIT.md` §4d.4: armour / shots-absorbed stat (`fvar(19)`),
score and hit counters (`var(57)`), mission win conditions (`var(50)`), boss AI
roles (`var(51)`), pilot portraits and stock icons, off-screen indicators.

---

## 8. Security note

The API key was pasted into the chat during setup and therefore exists in that
session's transcript. It is a live Creator-tier key with no spend cap. **Advise
the user to rotate it** at <https://elevenlabs.io/app/settings/api-keys> once
generation is finished — delete the old key, create a replacement, and update
`.mcp.json`. Setting a per-key credit limit at the same time is worth
suggesting; it bounds any future runaway.
