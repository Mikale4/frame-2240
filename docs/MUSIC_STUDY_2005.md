# How Babel Sword 2005 handles music

Findings from `Babel Sword 2005/data/system.def` and the sixteen tracks in
`data/res/`, read with `ffprobe`. Nothing here is copied; it is a description of
*structure and scale* so ours can be built from scratch to the same shape.

Read this before writing any music code or spending a single credit on
generation.

---

## 1. They are loops, not songs

This is the finding that changes the whole job.

| | Seconds |
| --- | --- |
| Shortest (`bgm-07`) | **11.8** |
| Median | **~25** |
| Longest (`bgm-02`) | **48.3** |
| Typical band | 22–32 |

Every track is a short seamless loop, uniformly encoded at ~96 kbps. Not one is
a two- or three-minute composition. A match lasts longer than any of them, so
the player hears the same 25 seconds several times per fight — which means the
loop point has to be genuinely seamless and the material has to survive
repetition rather than develop.

Practically: generating sixteen full songs would be the wrong target on every
axis — cost, payload, and how the result actually plays. Generate ~30 s loops.

## 2. Four contexts, and one of them is silent

```
[Music]
    title.bgm = data/res/bgm-00.bgm
    title.bgm.loop = 1
    select.bgm = data/res/bgm-41.bgm
    select.bgm.loop = 1
    vs.bgm =
    vs.bgm.loop =
```

Plus `fight.playbgm = 1` in the fight config.

So: **title**, **select**, and **fight** have music; the versus/pre-match screen
deliberately has none. Everything that plays, loops — there is no one-shot
music anywhere in the game.

## 3. Battle music is per-arena, and shared

Each stage `.def` names its own track:

```
data/res/001.def:13    bgm = bgm-10.bgm
data/res/002.def:35    bgm = bgm-11.bgm
data/res/003.def:13    bgm = bgm-07.bgm
data/res/005.def:34    bgm = bgm-11.bgm     <- 002 again
```

Sixteen tracks across more stages than that, so tracks are reused. The axis is
the **arena**, not the character and not the matchup.

## 4. The reference ships with broken music references

`select.bgm` points at `bgm-41.bgm` and `004a.def` at `bgm-22.bgm`. Neither file
exists — `data/res/` contains `bgm-00`…`bgm-16` (with 03 and 06 missing) and
`bgm-50`, sixteen files in total. Those contexts are simply silent in the build
that shipped.

Worth noting because it is the same class of failure our `BootScene`
`MODELLED`/`PORTRAITS` sets already guard against for art: a named asset that
does not exist. Music loading needs the same treatment, and for us it is worse
than silence — Vite answers an unknown path with `index.html` and a 200, so a
missing track hands the audio decoder HTML.

---

## What this means for Reignition

**Loops of ~30 s, not songs.** Confirmed by the reference and cheap to generate.

**The per-arena axis does not exist for us.** We have exactly one arena
(`CATHEDRAL YARD` — `arena_far/mid/near.png`). Battle music has to hang off
something else: one battle theme for everything, a theme per mech, or a theme
per pilot. This is the one real design decision in the task and it is the user's
to make.

**Our scene list gives five contexts,** against the reference's three:

| Scene | Reference equivalent | Notes |
| --- | --- | --- |
| `TitleScene` | `title.bgm` | Looped |
| `MenuScene` | — | Reference has no menu screen |
| `MechSelectScene` | `select.bgm` | Looped; silent in the shipped build |
| `BattleScene` | stage `bgm` | Looped |
| `ResultsScene` | — | Reference has no results screen |

**Existing infrastructure to reuse.** `SoundBank` already carries a `loop` flag
for the two sustained beds (`thruster_loop`, `drone_hover`) and `Sfx` already
falls back to procedural synthesis when a file is missing, so a partial
`assets/audio/` never leaves the game silent. Music can follow the same
"declare it, load it, degrade quietly" shape — but there is no sensible
procedural fallback for a soundtrack, so absent music must mean silence rather
than a synthesised stand-in.

**What music has to do that sound effects do not:**

* **Cross-fade between scenes.** Title → menu → select → battle is four
  transitions; cutting hard between loops would be jarring where the sound
  effects never had this problem.
* **Duck under the saturation cutscene.** Spending SAT freezes the match for
  ~1.3 s behind a letterbox with a pilot line. Right now that lands in silence;
  it is the one moment in the game most obviously missing a music response.
* **Survive a pause.** The pause menu should lower the music, not stop it.
* **Not restart on a rematch.** Results → rematch returns to the same battle
  theme; restarting it from zero would draw attention to the seam.
