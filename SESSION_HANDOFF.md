# Session Handoff — F.R.A.M.E. 2240

> Rewritten at the end of the D155–D168 session.
> Read this, then `CLAUDE.md`, then **`docs/TESTING_PROTOCOL.md`**, then §4.

---

## 1. Do these before working

1. **Read `docs/TESTING_PROTOCOL.md`.** Durable home for these rules; this file
   is rewritten every session and that one is not. First rule: **test by playing
   at EXTREME**, never NORMAL — five AI traits execute at no other tier.
2. **Report EXTREME first.** HARD has twice disagreed with EXTREME in *direction*
   (D120, D154).
3. **Report win rate, not just lead.** D145 and D154 both turned on it.
4. **"Last" is not "outlier".** `balance.ts` prints `z` and a dispersion line.
5. **Never bundle an incidental change with a fix** (D125).
6. **Show the user images, don't describe them.** Use `SendUserFile`. **Do not
   use browser downloads** — it opens a save dialog on his machine. Use the frame
   sink in §6.
7. **Start the dev server**: `npm run dev` from Bash. Read the port it prints —
   it has landed on 5173, 5175 and 5176 in the last day depending on what else
   was still holding ports.
8. Write commit messages to a file and `git commit -F`. **Backticks break
   heredocs**, and a heredoc once ate a `\'` escape and silently broke a test.
9. **Git has no configured identity.** Commit with
   `GIT_AUTHOR_NAME=Claude GIT_AUTHOR_EMAIL=noreply@anthropic.com` (and the
   `GIT_COMMITTER_*` pair) or it fails.

---

## 2. State — verified

* **713 tests** (33 files), typecheck clean, production build clean.
* `docs/DECISIONS.md` runs to **D168**.
* **The game is now `F.R.A.M.E. 2240`** — see §7.
* `docs/TIER_LIST.md` is **still stale** (§4a). Nothing this session touched
  balance; the roster is exactly as D154 measured it.
* Blender is 5.1.2 / EEVEE Next.

---

## 3. What happened this session

Almost entirely **title screen, identity and stage art**. No combat or AI change.

* **Renamed** to F.R.A.M.E. 2240 (D156), and **TAG/ASSIST switched off** (D155)
  while staying visible in the menu the way CAMPAIGN does.
* **CATHEDRAL YARD's lore approved** (D157) and published as a fourth Archive
  section, **BATTLEFIELDS** (D158).
* **The title is drawn from an original alphabet** (D162) and a chosen lockup,
  `INSTRUMENT` (D163) — hairline, ruled, both lines justified to one width.
* **An attract demo** (D164): 10 s idle → a real EXTREME `aiVsAi` match, 20 s,
  no HUD, fading both ways.
* **A turning gear train and a Stillwake medallion** behind the title, the yard
  drifting as though it cannot hold altitude (D165, D166).
* **Three art faults that were all processing, not drawing** (D167).
* **`arena_under`**, a new stage layer, and the under-deck darkness rebuilt as a
  light falloff (D168).

---

## 4. OPEN WORK — ask the user which, do not pick

**Nothing here is assigned.** Open the session by putting the options to the user.

### 4a. `TIER_LIST.md` is stale and should be regenerated

Its numbers came from D145 and are **no longer reproducible from current code**.
D154's tables are current. Regenerating needs the `--matrix` chart too, and the
file's own rule is that the chart and the row table come from **one run**.
Assists are now off, so the assists-*off* baseline is the only one that matters:
spread 0.210, CIRRUS flagged +2.07σ.

### 4b. The title screen's backdrop is a placeholder

`TitleScene` draws a **twilight gradient**. The painted yard-deck layers are in
`assets/ui/` and briefed in `docs/TITLE_STAGE_ART_BRIEF.md`, but
`TITLE_STAGE_ART` in `BootScene` is `false` — a lit sky makes a hairline wordmark
impossible to judge. The owner has said he will probably want **a space
background**. Restoring is that flag plus the layer loop, both in git.

**The distant-yards layer was never delivered** — it came back empty (max alpha 5
of 255). A one-layer prompt for it is in the session log; `TITLE_LAYERS` and
`BootScene` both note where it slots in.

### 4c. Three dead wordmark candidates

`PLATE`, `COLUMN` and `BLOCK` in `TitleDesigns.ts` are unused. Their own doc
comment says they exist to be thrown away. Kept because the decision was fresh.

### 4d. `STAGE_ART_BRIEF.md` overlaps the new context pack

It was written for the original parallax commission and describes a **three-layer
stack; there are now seven**. `docs/CATHEDRAL_YARD_CONTEXT.md` supersedes most of
it. Two documents describing one stage is how they start disagreeing.

### Also open

* **PYRE, 40 % → 32 % with assists on.** Now moot for shipped play since assists
  are off, but it gates turning them back on. **Reach for `telemetry.ts` before
  hypothesising.**
* **Cutscene freeze on a tag call** — deferred with the feature.
* **`arrive × nominal` is the real damage currency and the roster is authored on
  `nominal`.** Largest unexamined thing on the project. Needs a ruling.
* **CATHEDRAL YARD has no Archive entry for the stage's own art brief** — the
  lore is canon and published, but `"orbital drydock"` in `README.md` and
  `build_arena.py` still contradicts the atmospheric setting.
* **README says "no reference executable was ever run"** — D152 records running
  the 2005 game. It is a rights statement and it is false.
* `add_swept_blade` in `build_mechs.py` is dead code.
* **`Element.Corrosive` is carried by nobody.**

---

## 5. Traps this project has paid for

* **Ablate; do not reason.** The most intuitive AI lever has measured worst
  **twice** — `breaker` (D143), `groundIq` (D148).
* **Levers do not add.** Subsets beat their union, D143 and D148.
* **A comment is not evidence.** `wantsDroneToggle` described a design removed two
  iterations earlier and went on pressing a button for it (D150).
* **A passing test is not a legible result.** `logotype.test.ts` asserted every
  glyph encloses ink while the number rendered `zz41` — a collapsed bar encloses
  ink perfectly well (D162).
* **`tail -n` on vitest hides a test *file* failing to collect.** Read the file
  count. A node test that imports Phaser at runtime collects **zero tests** and
  looks green.
* **The Browser pane's own rAF keeps stepping the match between tool calls.**
  `game.loop.raf.stop()` hands you the clock; restore with
  `raf.start(game.loop.step.bind(game.loop), false)`.
* **`renderer.snapshot` can hang.** Register the callback *before* the
  `loop.step` that renders it, and race it against a timeout — it silently failed
  to resolve several times this session and burned a 30 s tool call each time.
* **`javascript_tool` times out at 30 s** but the async work keeps running.
* **A page reload clears `window.__t`.** `window.__t += 16.667` then yields
  `NaN`, and `loop.step(NaN)` poisons the scene clock — mechs vanish, prompts
  disappear. Guard it or re-seed after every navigate.
* **The battle camera rewrites its own zoom and scroll every frame.** A
  diagnostic that needs different framing has to pin the properties, or park the
  machines and let the camera follow.
* **`preFX` is a one-way door.** Once an object is on the FX pipeline Phaser
  keeps it there and `preFX.clear()` does not remove it.
* **Canvas `shadowBlur` ignores the transform matrix** — always device pixels.
* **The reference PNGs are higher resolution than the 2005 game renders.**
* **Scripted `Enter` in battle opens the pause menu.** Drive menus, not fights.

---

## 6. Getting frames and images out

**Never use an `<a download>`** — it opens a save dialog on the user's desktop.

Frame sink: `scratchpad/framesink.js` (recreate if gone). It was on **8903** this
session because 8899 was still held by an older one.

```bash
node framesink.js "$(pwd)/shots" 8903   # run in background
```

```js
const pending = new Promise((res) => g.renderer.snapshot(res));   // register FIRST
g.loop.step(t += 16.667);                                         // fulfils it
const img = await Promise.race([pending, timeout(8000)]);         // it can hang
await fetch('http://127.0.0.1:8903/?i=' + idx, { method: 'POST', body: blob });
```

`window.__BSR__` is the Phaser game. **To see the bottom of the arena** — the only
view where the under-deck art is visible — go to training, then park both
combatants low and far apart (`sim.combatants[i].x/y`) and let the camera frame
them; it zooms out and drops to 354 world px below the deck.

---

## 7. Identity, settled

**F.R.A.M.E. 2240** — Field-Rated Aerial Manoeuvre Element, an initialism the
world has worn down into a common noun.

**`2240` is a survivor count, not a year, and the misreading is deliberate.** It
is the number taken off Stillwake alive on the lift Halden Rook held open. A
player is *meant* to read it as a date until late. **Nothing player-facing may
gloss it** — no comma, no caption, no memorial framing. This constraint is
written into `GameConfig.ts` and into every art brief.

---

## 8. Art direction, settled

Semi-realistic machines in CATHEDRAL YARD's painted world. **Do not re-propose
cel shading, do not darken the mechs toward the stage, do not model energy as
geometry** — all tried and rejected (D128, D129, D132).

`src/ui/HoloPanel.ts` owns the UI panel language; `src/render/ThrusterProfiles.ts`
owns exhaust by faction. `docs/CATHEDRAL_YARD_CONTEXT.md` is the pack to hand to
any outside artist — attach it with whatever specific layer brief applies.

---

## 9. Known-open defects

* **9a.** Ladder test is slow and coupled to HALCYON.
* **9b.** `Combatant.fire` builds its spawn field by field. **Assert on the
  pooled projectile, never on the attack.**
* **9c.** New world-space objects must join `BattleScene.worldObjects` **and
  `Backdrop.objects`**, or the UI camera draws a second copy.
* **9d.** The AI produces command motions but does not deliberate over them.
* **9e.** `grounded` is 0.0 % in AI play by design after D148.
* **9h.** `Element.Corrosive` is carried by nobody.
* **9i.** `MechPoseSource` is the structural contract for anything drawn through
  `MechRenderer`.
* **9j.** NOCTURNE has its own `NOCTURNE_RIG` and does *not* inherit rig changes.
* Training ends on a timeout at 99 minutes.

---

## 10. Roster reference

| Mech | Pilot | HP | Faction |
| --- | --- | --- | --- |
| HALCYON `AV-07` | Naia Vesk | 1750 | Concord |
| NOCTURNE `AV-13` | Halden Rook | 1750 | Emberline |
| VESPER `AV-12` | Kestrel Doyne | 1490 | Concord |
| TERRAMOTH `HV-03` | Brunn Okonkwo | 2490 | Ironwake |
| CIRRUS `LT-21` | Mira Holloway | 1440 | Free Latitude |
| OBELISK `GD-09` | Saar Tengku | 2070 | Ironwake |
| PYRE `IN-05` | Rasa Volkov | 1860 | Ashfall |
| NULLTIDE `EW-14` | Io Senna | 1610 | Free Latitude |

**Pilot genders are fixed by `docs/PILOT_PORTRAIT_SPEC.md`** — four women, four
men. **Mechs are "it"; pilots get their own pronouns. The present is 43 CE.**
