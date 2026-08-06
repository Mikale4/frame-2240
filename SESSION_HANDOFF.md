# Session Handoff — Babel Sword: Reignition

> Rewritten at the end of the D150–D154 session.
> Read this, then `CLAUDE.md`, then **`docs/TESTING_PROTOCOL.md`**, then §4.

---

## 1. Do these before working

1. **Read `docs/TESTING_PROTOCOL.md`.** Durable home for these rules; this file
   is rewritten every session and that one is not. First rule: **test by playing
   at EXTREME**, never NORMAL — five AI traits execute at no other tier.
2. **Report EXTREME first.** HARD is a corroborating second sample and has now
   twice disagreed with EXTREME in *direction* (D120, D154).
3. **Report win rate, not just lead.** D145 and D154 both turned on it.
4. **"Last" is not "outlier".** `balance.ts` prints `z` and a dispersion line.
5. **Never bundle an incidental change with a fix** (D125).
6. **Show the user images, don't describe them.** Use `SendUserFile`. Every
   visual fault this session came from the user looking at the screen; not one
   came from a test. **Do not use browser downloads to move images** — it opens
   a save dialog on his machine. Use the frame sink in §6.
7. **Start the dev server**: `npm run dev` from Bash. It has been coming up on
   **5175** (5173/5174 taken) — read the output rather than assuming.
8. Write commit messages to a file and `git commit -F`. Backticks break
   heredocs, and a heredoc **ate a `\'` escape** and silently broke a test file.
9. **Git has no configured identity.** Commit with
   `GIT_AUTHOR_NAME=Claude GIT_AUTHOR_EMAIL=noreply@anthropic.com` (and the
   `GIT_COMMITTER_*` pair) or it fails.

---

## 2. State — verified

* **699 tests** (31 files), typecheck clean, production build clean.
* `docs/DECISIONS.md` runs to **D154**.
* **`docs/TIER_LIST.md` is now STALE** — see §4.
* Blender is **5.1.2 / EEVEE Next**.

---

## 3. What happened this session

**D150 — TAG/ASSIST.** `Btn.Sub` was honoured 1.5–4.2 % of presses behind three
gates. It now calls a second pilot in: two partners per chassis drawn from the
Archive, 16 written pairings, arrival 1–3 s (20 % late at 4–7 s), 4 s on stage,
2 calls a match, 30 s apart. Optional from the main menu.

**D151 — the rival was mashing it.** 2376 refusals against 194 honoured, one
denial cue every three seconds. Now 0. Caught by ear, not by a test.

**D152 — thruster VFX, third attempt.** Two wrong models (particle spray, ray
fan) before **running the 2005 game** settled it: a tight white-hot core with a
broad soft halo, about a third of a body length. Retuned against the capture.

**D153 — two stage layers had visible edges**, both reported by eye, both
confirmed by arithmetic.

**D154 — four 12-seed sweeps**, with and without assists, both tiers.

---

## 4. OPEN WORK — ask the user which, do not pick

**Nothing here is assigned.** Open the session by putting the options to the
user and letting them choose. Everything below is unblocked and can start
immediately; the list is roughly ordered by how much it is costing to leave
undone, not by priority. There are also longer-horizon items under *Also open* —
several are design questions only the user can settle.

### 4a. `TIER_LIST.md` is stale and should be regenerated

Its numbers came from D145 and **are no longer reproducible from current code** —
removing `wantsDroneToggle` (D150) took away an occasional drone volley, so the
assists-*off* baseline moved 0.192 → 0.210 and CIRRUS crossed the 2σ flag on its
own. The tables in D154 are current. Regenerating needs the `--matrix` chart too,
and the file's own rule is that the chart and the row table come from **one run**.

### 4b. PYRE, 40 % → 32 % with assists on

Largest single movement in the sweep and the lowest win rate in the table.
Unexplained. **Reach for `telemetry.ts` before hypothesising** — three OBELISK
passes and a VESPER diagnosis were lost to reasoned guesses.

### 4c. The gameplay GIF is unfinished

The user asked for **5 s, no UI, two random mechs, assists off, 60 fps**. Two
things to know:

* **GIF cannot do 60 fps.** Delays are stored in centiseconds; 16.67 ms is not
  representable. 50 fps (2 cs) is the ceiling — offer MP4/WebM alongside.
* **Screen capture cannot see the whole canvas.** The Browser pane composites at
  `devicePixelRatio` 1.25 and overflows its own container, so the right third of
  the render exists in no desktop grab, however wide the pane is dragged. This
  was measured with a marker div, not guessed.

The working solution is the frame sink in §6. **180 of 300 frames are already
captured** in the scratchpad under `shots/` (VESPER vs HALCYON, assists off, UI
hidden) — but the session ended mid-capture, so finish or restart cleanly.

### Also open

* **Cutscene freeze on a tag call.** Reuses `SatCutscene`, which stops the sim
  ~1.25 s. Four calls a match ≈ 5 s of a 46 s fight frozen. **Awaiting a ruling.**
* **Your assist can be the machine you are fighting.** Allowed, not decided.
* **`arrive × nominal` is the real damage currency and the roster is authored on
  `nominal`.** Largest unexamined thing on the project.
* **Title rename** to **S.P.A.R.** (Self-Propelled Armoured Rig). Not applied.
* **CATHEDRAL YARD's lore** is a proposal awaiting approval (`STAGE_ART_BRIEF.md`
  §2.3).
* `add_swept_blade` in `build_mechs.py` is dead code.
* **`Element.Corrosive` is carried by nobody.**

---

## 5. Traps this project has paid for

* **Ablate; do not reason.** The most intuitive AI lever has measured worst
  **twice** — `breaker` (D143), `groundIq` (D148).
* **Levers do not add.** Subsets beat their union, D143 and D148.
* **A comment is not evidence.** `wantsDroneToggle` still described a design
  removed two iterations earlier and went on pressing a button for it (D150).
* **`tail -n` on vitest hides a test *file* failing to collect.** Read the file
  count.
* **The manual loop pump reports near-zero `dt`.** Worse: **the Browser pane's
  own rAF keeps stepping the match between tool calls**, which ran a fight to
  completion mid-capture twice. `game.loop.raf.stop()` hands you the clock;
  restore with `raf.start(game.loop.step.bind(game.loop), false)`.
* **With rAF stopped, `renderer.snapshot` deadlocks** unless you register the
  callback *before* the `loop.step()` that renders it.
* **`javascript_tool` times out at 30 s but the async work keeps running.** Fire
  a long batch, then poll the filesystem.
* **`resize_window` only changes the emulated CSS viewport**, not the pane's
  physical box — the page renders larger and clips harder.
* **The reference PNGs are higher resolution than the 2005 game renders.**
  Detail read off them can be detail that was never there (D152).
* **Scripted `Enter` in battle opens the pause menu.** Drive menus, not fights.

---

## 6. Getting frames and images out

**Never use an `<a download>`** — it opens a save dialog on the user's desktop.

For screenshots, capture in-page and write the file yourself. For anything
frame-heavy, use the **frame sink**: a throwaway localhost server the page POSTs
PNGs to, which sidesteps both the context cost of base64 and the clipped screen.
It is at `scratchpad/framesink.js` (recreate if gone):

```bash
node framesink.js "$(pwd)/shots" 8899   # run in background
```

```js
// In the page, with rAF stopped so the capture owns the clock:
const pending = new Promise((res) => g.renderer.snapshot(res));   // register FIRST
g.loop.step(t += 16.667);                                         // this fulfils it
const img = await pending;
// draw to a canvas, toBlob, then:
await fetch('http://127.0.0.1:8899/?i=' + idx, { method: 'POST', body: blob });
```

`window.__BSR__` is the Phaser game. `BattleScene.uiCam.setVisible(false)` strips
**all** HUD, banter and banners in one call — they are drawn by the UI camera and
ignored by the world camera.

---

## 7. Roster — measured, current (D154)

**EXTREME, assists OFF: spread 0.210, CIRRUS flagged +2.07σ.**
**EXTREME, assists ON: spread 0.222, no outliers.**
**HARD, assists ON: spread 0.163 — the best ever measured here.**

Full tables in D154. `TIER_LIST.md` has not been updated — see §4a.

---

## 8. Art direction, settled

Semi-realistic machines in CATHEDRAL YARD's painted world. **Do not re-propose
cel shading, do not darken the mechs toward the stage, do not model energy as
geometry** — all tried and rejected (D128, D129, D132).

Energy is drawn, not modelled. `src/ui/HoloPanel.ts` owns the UI panel language;
`src/render/ThrusterProfiles.ts` owns exhaust **by faction** — and exhaust is now
a layered cone, not a particle spray or a ray fan (D152).

---

## 9. Known-open defects

* **9a.** Ladder test is slow and coupled to HALCYON.
* **9b.** `Combatant.fire` builds its spawn field by field. **Assert on the
  pooled projectile, never on the attack.**
* **9c.** New world-space objects must join `BattleScene.worldObjects`, or the UI
  camera draws a second copy. Partner rigs already do.
* **9d.** The AI produces command motions but does not deliberate over them.
* **9e.** `grounded` is 0.0 % in AI play by design after D148.
* **9f.** ~~The sub-weapon button~~ — **done, D150.**
* **9h.** `Element.Corrosive` is carried by nobody.
* **9i.** `MechPoseSource` is the structural contract for anything drawn through
  `MechRenderer`.
* **9j.** NOCTURNE has its own `NOCTURNE_RIG` and does *not* inherit rig changes.
* Training ends on a timeout at 99 minutes.

---

## 10. Roster reference

| Mech | Pilot | HP | Faction | Assists |
| --- | --- | --- | --- | --- |
| HALCYON `AV-07` | Naia Vesk | 1750 | Concord | VESPER, NOCTURNE |
| NOCTURNE `AV-13` | Halden Rook | 1750 | Emberline | NULLTIDE, HALCYON |
| VESPER `AV-12` | Kestrel Doyne | 1490 | Concord | HALCYON, NULLTIDE |
| TERRAMOTH `HV-03` | Brunn Okonkwo | 2490 | Ironwake | OBELISK, PYRE |
| CIRRUS `LT-21` | Mira Holloway | 1440 | Free Latitude | NULLTIDE, PYRE |
| OBELISK `GD-09` | Saar Tengku | 2070 | Ironwake | TERRAMOTH, NOCTURNE |
| PYRE `IN-05` | Rasa Volkov | 1860 | Ashfall | CIRRUS, TERRAMOTH |
| NULLTIDE `EW-14` | Io Senna | 1610 | Free Latitude | CIRRUS, NOCTURNE |

**Pilot genders are fixed by `docs/PILOT_PORTRAIT_SPEC.md`** — four women, four
men. **Mechs are "it"; pilots get their own pronouns. The present is 43 CE.**
