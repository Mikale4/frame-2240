# Session Handoff — F.R.A.M.E. 2240

> Rewritten at the end of the D169–D171 session.
> Read this, then `CLAUDE.md`, then **`docs/TESTING_PROTOCOL.md`**, then §4.

---

## 1. Do these before working

1. **Read `docs/TESTING_PROTOCOL.md`.** Durable home for these rules; this file
   is rewritten every session and that one is not. First rule: **test by playing
   at EXTREME**, never NORMAL — five AI traits execute at no other tier.
2. **Report EXTREME first.** HARD has twice disagreed with EXTREME in *direction*.
3. **Report win rate, not just lead.** D145 and D154 both turned on it.
4. **"Last" is not "outlier".** `balance.ts` prints `z` and a dispersion line.
5. **Never bundle an incidental change with a fix** (D125).
6. **Show the user images, don't describe them.** Use `SendUserFile`. **Never use
   a browser download** — it opens a save dialog on his machine. Frame sink, §6.
7. **Start the dev server**: `npm run dev` from Bash. Read the port — it has
   landed on 5173–5176 depending on what else is holding ports.
8. Write commit messages to a file and `git commit -F`. **Backticks break
   heredocs.**
9. **Git has no configured identity.** Commit with
   `GIT_AUTHOR_NAME=Claude GIT_AUTHOR_EMAIL=noreply@anthropic.com` and the
   `GIT_COMMITTER_*` pair, or it fails.
10. **`git add assets/sprites/mechs` will sweep up an untracked zip** the owner
    downloaded there. Check `git diff --cached --name-only | grep -i zip`.

---

## 2. State — verified

* **713 tests** (32 files), typecheck clean, production build clean.
* `docs/DECISIONS.md` runs to **D171**.
* Blender is 5.1.2 / EEVEE Next.
* `docs/TIER_LIST.md` is **still stale** — numbers date from D145 and are not
  reproducible from current code. Untouched again this session.

---

## 3. What happened this session

Entirely **mech art**. No combat, AI or balance change.

* **The surface textures were invisible and now are not** (D169). The maps were
  fine; the contrast was not. `TEX_CONTRAST = 4.0` applied as a *shader*
  parameter, not baked into the PNGs. Bump measured as a dead lever — the third
  intuitive lever to measure worst, after `breaker` (D143) and `groundIq` (D148).
* **The mechs had no blacks, and it was one linear colour value** (D170).
  Freestyle's line colour `(0.035, 0.040, 0.055)` is linear and lands at display
  luminance **~56** — and since the line work is the darkest thing on a mech,
  that number was the floor of every sprite in the game. **0.0 %** of any machine
  was below luminance 30, against **16.2 %** in the 2005 reference. Now every
  machine bottoms out at exactly **14**, the reference's own floor. The fix added
  no geometry: the greebling was always there and had nothing to separate it.
* **Eight design sheets commissioned and landed**, in
  `assets/blender/concepts/`, with `NOTES.md` recording each sheet's deviations
  and how they are resolved. Six factions ended up with six distinct
  *handwritings* — Concord issues, Ironwake stencils and files, Emberline
  overpaints, Free Latitude scratches, Ashfall invoices, and NULLTIDE carries
  nothing at all by specification.
* **A decal system** (D171). Markings can be placed on a machine for the first
  time. `tools/make_decals.py` generates them; `add_decal()` places them.
* **The palette architecture is inverted** (D171). Light armour carries the
  mass, identity hue became panels. Roster mean 24.7 % light / 37.1 % chromatic
  → **31.4 % / 29.7 %**, against the reference's 32.8 % / 31.9 %.

### The sprite-style experiment, and it failed

A long detour tried to reproduce Babel Sword's **hand-drawn sprite** look via
commissioned asset sheets, then built a PIL mock-up of HALCYON assembled from
one. **The owner rejected it.** Do not restart this thread unless he raises it.

Two things from it are still worth knowing:

* **`CEL_SHADE` is not a route to that style.** It exists, it works, and it was
  measured: median 166 → 142, unique tones 242 → 239. It quantises only lighting
  and multiplies the albedo back in, and flat box faces under four soft area
  lights give quantisation nothing to bite on.
* **The multipart rig survives sprite art.** The mock-up showed independent arm
  aiming, weapon recoil along its own axis and gimballing thrusters all still
  reading with hand-drawn parts. That was the open question and the answer was
  yes — if the topic ever returns.

---

## 4. OPEN WORK — ask the user which, do not pick

**Nothing here is assigned.** Open the session by putting the options to him.

### 4a. The decal system is built and completely unused

`add_decal()` works — verified with a `07` and hazard chevrons rendered onto
HALCYON's armour, no Freestyle ring, no z-fighting, correct alpha. **No machine
carries a single marking.** The eight design sheets are covered in serials,
chevrons and stencils and none of it has been placed.

Placement wants flat panels to anchor to, which is partly why the geometry
remodel below was never started.

### 4b. HALCYON's geometry was never remodelled

The design sheets were commissioned to drive a remodel and no chassis has been
touched. The palette inversion delivered a large share of what the remodel was
for, so the remaining gap is narrower than it was — proportions and panel
breakup, not colour architecture.

### 4c. `TIER_LIST.md` is stale, since D145

Its numbers are no longer reproducible from current code. D154's tables are
current. Regenerating needs the `--matrix` chart, and the file's own rule is
that the chart and the row table come from **one run**. Assists are off, so the
assists-*off* baseline is the only one that matters: spread 0.210, CIRRUS
flagged +2.07σ.

### 4d. The title screen backdrop is still a placeholder

`TITLE_STAGE_ART` in `BootScene` is `false`; `TitleScene` draws a twilight
gradient. The owner said months ago he wanted to try **a space background**.
Never started. The distant-yards layer was never delivered either.

### 4e. The revision-2 texture prompt has a wrong target

`docs/PROMPT_MECH_TEXTURES.md` specifies `SD 38–52` for wear maps. That is
**exactly the shipped level, which is the invisible level**. It should be
**~75–95**. Fix before sending it to anyone.

### Also open

* **`arrive × nominal` is the real damage currency and the roster is authored on
  `nominal`.** Largest unexamined thing on the project. Needs a ruling.
* **PYRE, 40 % → 32 % with assists on.** Moot while assists are off, but it
  gates turning them back on. **Reach for `telemetry.ts` before hypothesising.**
* **Cutscene freeze on a tag call** — deferred with the feature.
* **README says "no reference executable was ever run"** — D152 records running
  the 2005 game. It is a rights statement and it is false.
* `add_swept_blade` in `build_mechs.py` is dead code.
* **`Element.Corrosive` is carried by nobody.**
* An untracked `mech_surface_textures_11_tiles.zip` sits in
  `assets/sprites/mechs/` — the owner's download, his to delete.

---

## 5. Traps this project has paid for

Older entries first; everything from this session is marked **NEW**.

* **Ablate; do not reason.** The most intuitive AI lever has measured worst
  **three** times — `breaker` (D143), `groundIq` (D148), `BUMP_STRENGTH` (D169).
* **Levers do not add.** Subsets beat their union, D143 and D148.
* **A comment is not evidence** (D150). **A passing test is not a legible
  result** (D162).
* **`tail -n` on vitest hides a test *file* failing to collect.** Read the file
  count.
* **NEW — piping vitest through `tail` throws away its exit code.** `$?` is
  `tail`'s. Redirect to a file, check `$?`, then grep. This was reported as
  "tests passed" when six were failing.
* **The Browser pane's own rAF keeps stepping the match between tool calls.**
  `game.loop.raf.stop()` hands you the clock.
* **NEW — `BattleScene.onBlur` auto-pauses the match** whenever the pane loses
  focus, which is every tool call. Frame capture silently froze after ~20 frames
  and the pause menu was invisible because it lives on the UI camera. Remove the
  BLUR listeners and clear `paused` each frame.
* **`renderer.snapshot` can hang.** Register the callback *before* the
  `loop.step` that renders it, and race it against a timeout.
* **A page reload clears `window.__t`**; `loop.step(NaN)` poisons the scene clock.
* **`preFX` is a one-way door.**

### Blender — all NEW this session

* **`x is y` on Blender RNA objects is unreliable.** Blender hands back a fresh
  Python wrapper per access, so `l.from_node is n` silently never matches.
  **Match by `.name`.** This produced 120 dangling nodes that looked installed.
* **`_drone_materials` rebuilds the chassis's materials by name**, deliberately,
  and `build_all` runs `build_drone` **before** `render_parts`. A palette change
  made in `build_mech` alone is repainted moments before the sprites render —
  the edit was correct, the build was clean, and the output was byte-identical.
  Both factories call `palette_roles()` now.
* **`Base Color.default_value` tells you nothing** when the socket is linked — it
  reads `0.8, 0.8, 0.8` on every material. **Walk the unlinked RGBA inputs** to
  find what a material is actually painted.
* **`_texture_dir()` derived its path from `bpy.data.filepath`**, which is empty
  for an entire headless run because `build_all` saves last. A full rebuild
  shipped 112 sprites with **no wear, rust or roughness at all** and raised no
  error. Fixed with a `__file__` fallback plus a loud warning.
* **Removing a node also deletes the links it carried.** A sweep that removed
  and re-added a node between samples left `Base Color` unlinked and rendered a
  progressively more broken material. **Reload the file per sample** instead.
* **The module caches hold Image datablocks across `open_mainfile`.** Reloading
  a file frees them and the stale pointers raise *"StructRNA of type Image has
  been removed"*. Clear `_IMG_CACHE` and `_DECAL_CACHE` between loads.
* **A `setattr` inside a `try/except` will hide a typo in an enum forever.**
  `fast_gi_method = "AMBIENT_OCCLUSION"` is invalid — it is
  `AMBIENT_OCCLUSION_ONLY` — so fast GI ran in GLOBAL_ILLUMINATION mode, bouncing
  light *into* the crevices it was meant to darken. Second occurrence in the same
  list after `use_gtao`. The list now verifies each value stuck.
* **Freestyle's line colour is a LINEAR value.** See D170.
* **`MeshPolygon.use_freestyle_mark` does not exist in 5.1.** Face marks are not
  available; exclude by **collection** (`BSR_NOLINE`), and a lineset names
  exactly one collection.
* **Rebuild order is not optional**:
  `build_mechs → energy_blade → electric_baton → pack_atlases`.
  `meleeEnergy` and `meleeArc` are owned by the two generators, which merge
  their own manifest rows *after* Blender. Running `build_mechs.py` alone
  stripped those rows from five machines and broke six assertions in
  `roster.test.ts`.
* **A full rebuild is ~11–13 minutes.** Run it backgrounded and wait on a
  completion marker in the log, not on `tasklist` — the owner's GUI Blender is
  also a `blender.exe` and an until-loop on the process name never exits.

### Images and measurement — NEW

* **GIF frame delays are centiseconds.** 60 fps is not expressible; **50 fps is
  exact** at 2 cs. Step the sim 20 ms per frame for true real-time.
* **Build a GIF palette from a sample spanning the whole clip.** Quantising from
  frame 0 turned the mechs beige, and file size gave no hint.
* **Thresholding on darkness to isolate a silhouette breaks** when a sheet has a
  dark background — `terramoth_design_v2.png` does. It produced a confident and
  completely wrong "the silhouette is broken" reading before being caught by
  looking at the panels directly.

---

## 6. Getting frames and images out

**Never use an `<a download>`.** Frame sink: `scratchpad/framesink.js` (recreate
if gone). Ports 8899, 8903, 8907, 8911 and 8915 have all been used; pick a fresh
one.

```js
const pending = new Promise((res) => g.renderer.snapshot(res));   // register FIRST
g.loop.step(t += 16.667);                                         // fulfils it
const img = await Promise.race([pending, timeout(8000)]);         // it can hang
await fetch('http://127.0.0.1:PORT/?i=' + idx, { method: 'POST', body: blob });
```

`window.__BSR__` is the Phaser game. To hide the whole interface for a clean
capture: `scene.uiCam.setVisible(false)` — the attract demo's own route, since
the entire HUD lives on that camera.

---

## 7. Identity, settled

**F.R.A.M.E. 2240** — Field-Rated Aerial Manoeuvre Element.

**`2240` is a survivor count, not a year, and the misreading is deliberate.** It
is the number taken off Stillwake alive on the lift Halden Rook held open.
**Nothing player-facing may gloss it** — no comma, no caption, no memorial
framing. Written into `GameConfig.ts` and into every art brief.

---

## 8. Art direction, settled

Semi-realistic machines in CATHEDRAL YARD's painted world. **Do not re-propose
cel shading, do not darken the mechs toward the stage, do not model energy as
geometry** (D128, D129, D132) — and **do not re-propose hand-drawn sprite art**,
rejected this session.

**Light armour carries the mass; the identity hue is deliberate panels** (D171).
The old rule saying the opposite is gone. **NULLTIDE is exempt** — its identity
*is* the neutral, and inverting it collapsed the value gap that separates it
from CIRRUS.

`assets/blender/concepts/NOTES.md` is authoritative over any individual design
sheet. Read it before modelling from one.

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
* **9k. NEW —** the markings on all eight design sheets are **aspirational**
  until decals are actually placed. The meshes have no UVs, which is why the
  decal system exists.
* Training ends on a timeout at 99 minutes.

---

## 10. Roster reference

| Mech | Pilot | HP | Faction | hull | height |
| --- | --- | --- | --- | --- | --- |
| HALCYON `AV-07` | Naia Vesk | 1750 | Concord | 0.62 | 8.2 m |
| NOCTURNE `AV-13` | Halden Rook | 1750 | Emberline | 0.76 | 10.1 m |
| VESPER `AV-12` | Kestrel Doyne | 1490 | Concord | 0.58 | 7.7 m |
| TERRAMOTH `HV-03` | Brunn Okonkwo | 2490 | Ironwake | 0.88 | 11.6 m |
| CIRRUS `LT-21` | Mira Holloway | 1440 | Free Latitude | 0.50 | 6.5 m |
| OBELISK `GD-09` | Saar Tengku | 2070 | Ironwake | 0.80 | 10.6 m |
| PYRE `IN-05` | Rasa Volkov | 1860 | Ashfall | 0.70 | 9.3 m |
| NULLTIDE `EW-14` | Io Senna | 1610 | Free Latitude | 0.54 | 7.1 m |

**Pilot genders are fixed by `docs/PILOT_PORTRAIT_SPEC.md`** — four women, four
men. **Mechs are "it"; pilots get their own pronouns. The present is 43 CE.**
