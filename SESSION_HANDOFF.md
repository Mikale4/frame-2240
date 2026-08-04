# Session Handoff — Babel Sword: Reignition

> Rewritten at the end of a long session (D127–D135).
> Read this, then `CLAUDE.md`, then **`docs/TESTING_PROTOCOL.md`**, then §9.

---

## 1. Do these before working

1. **Read `docs/TESTING_PROTOCOL.md`.** Durable home for the rules in §9; this
   file is rewritten every session and that one is not. First rule: **test by
   playing at EXTREME**, never NORMAL — five AI traits execute at no other tier.
2. **Report EXTREME first.** HARD is a corroborating second sample and has
   overturned an EXTREME-only conclusion (D120).
3. **Report win rate, not just lead.** Different numbers; they disagree.
4. **"Last" is not "outlier".** `balance.ts` prints `z` and a dispersion line.
5. **Never bundle an incidental change with a fix** (D125).
6. **Show the user images, don't just describe them.** Use `SendUserFile`. Art
   feedback this session came almost entirely from images sent back and forth.
7. **Start the dev server**: `npm run dev` from Bash. Last session used **5173**.
8. Write commit messages to a file and `git commit -F` — backticks break heredocs.

---

## 2. State — verified

* **592 tests** (28 files), typecheck clean, production build clean.
* Working tree clean on `master`, no other branches. HEAD **`a80937f`**.
* `docs/DECISIONS.md` runs to **D135**.
* Blender is **5.1.2 / EEVEE Next**. `use_gtao` and every `gtao_*` property were
  removed in 4.2 — the old call sat in a `try/except` and had silently done
  nothing for a long time (D129).

---

## 3. What happened this session

**D127 — NOCTURNE fixed.** `projSpeed` main 12→15, heavy 10.2→12.75. 33 % → 45 %
at EXTREME, roster spread 0.230 → **0.198**, the best measured since the deck
became solid. Cost fell on TERRAMOTH at HARD only (one matchup, 0.00 → +0.22).

**D128–D129 — mech surfaces.** CC0 textures from Poly Haven driving wear and
roughness as *masks*, never albedo; per-faction finishes from the Archive's own
account of the five powers; crevice darkening; key light 1500 → 1150.

**D130 — melee motions.** `swingArcAngle` did not branch on motion at all, so all
eight machines ran one curve. Now `swipe`, `stab`, `reap`, `bash`, `sweep` plus
the original three. **The procedural panel grid was removed** — object-space
waves at fixed scale tiled identical lines across every part.

**D131–D133 — the energy blade.** Split into its own `meleeEnergy` sprite part,
then rebuilt as **generated 2D VFX** (`tools/energy_blade.py`) rather than
geometry. PYRE's snath rebuilt as real hardware with glowing conduit slots.

**D134–D135 — the reap.** Two-handed grip, and three new pose terms —
`weaponSpin`, `lean`, `lift` — because the rig could previously only express one
rigid rotation plus a forward push, which is a lever, not a swing.

---

## 4. NEXT TASK — pick one

### 4a. The other four energy weapons *(most contained)*
Only PYRE is converted. **HALCYON's saber, VESPER's bayonet, CIRRUS's daggers and
NULLTIDE's glaive still carry the old modelled energy**, and their hardware has
had none of the emitter/conduit treatment. `energy_blade.py`'s `BLADES` dict takes
a centreline, width profile and two colours, so each is data — but each needs its
curve measured off that mech's Blender geometry first.

### 4b. PYRE's melee reach *(needs a sweep)*
`meleeRange` **198**, lock range **76** — below NOCTURNE (210/96) and TERRAMOTH
(210/86) — while carrying a **219 logical px** blade. The user is right that it
should reach further. This is hit detection, so sweep it; do not just raise it.
The roster is at spread 0.198 with no outliers, its best, so expect any change to
read as a balance event.

### 4c. Projectile types and patterns *(largest gap)*
`docs/ARSENAL_PROPOSAL.md` has the full design, reviewed but unbuilt. The key
finding: `pattern` is **spawn-time only**, so spiral / ricochet / displacement /
side-swipe all need a second `behaviour` axis on `AttackDef`. Five spawn patterns
already exist (`line`, `stack`, `bundle`, `ripple`, `arc`) and **every roster
weapon uses `line`** — half the existing system is unused.

### 4d. The other melee motions against the references
`swipe`, `stab`, `sweep`, `bash` were authored by hand before the reference
library existed. `Double Dagger Stab`, `Bayonet Stab`, `Stable Sword Inward /
Outward Slash` and `Great Sword High Spin Attack` map directly onto them.

---

## 5. The animation reference library

`C:\Games\Babel Sword Claude\animation examples` — **195 Mixamo FBX clips**.
`tools/blender/anim_probe.py` samples one and prints it in rig terms
(arm angle, weapon rotation, hand travel in *our* pixels, hand separation,
detected strike count).

```python
exec(open(r"<project>/tools/blender/anim_probe.py").read())
probe("Double Dagger Stab")
```

**Verify it runs before trusting it.** The import path fought the MCP bridge
twice and the current form has not been exercised end to end. Both failures are
documented in `_discard`:

* Removing the armature by iterating `bpy.data.objects` **hung Blender** and
  needed the process killed.
* Pre-resetting with `read_homefile()` breaks the importer — it calls
  `object.mode_set`, whose poll needs an active object, and MCP-driven code does
  not inherit the UI's selection.

It now imports into the live scene and discards by reloading `mechs.blend`.
**Never let a build run between import and discard** — `build_all` would save a
Mixamo skeleton into `mechs.blend`.

Useful beyond melee: `great sword power up` / `spell cast` (saturation bursts),
`hit reaction` / `great sword impact` (hitstun), `toss grenade` (sub-weapons),
`great sword blocking` (barrier), `jump *` (flight).

---

## 6. Roster balance — measured

### EXTREME — spread 0.198, no outliers

| Mech | Win | Lead | z(lead/win) |
| --- | --- | --- | --- |
| CIRRUS | **65 %** | +0.118 | +1.69 / +1.94 |
| VESPER | 56 % | +0.094 | +1.34 / +0.80 |
| OBELISK | 51 % | +0.004 | +0.06 / +0.08 |
| HALCYON | 50 % | −0.019 | −0.28 / +0.04 |
| NOCTURNE | 45 % | −0.032 | −0.46 / −0.69 |
| PYRE | 44 % | −0.039 | −0.56 / −0.76 |
| NULLTIDE | 49 % | −0.046 | −0.66 / −0.19 |
| **TERRAMOTH** | **40 %** | **−0.080** | −1.14 / −1.22 |

### HARD — spread 0.284, TERRAMOTH flagged at **−2.14σ**

First flagged outlier on this roster. It decomposes into a single matchup and
fires identically for every value swept in D127, so it is not an argument for a
smaller step. `TIER_LIST.md` §4 has the arithmetic; §5 records that **the
reasoning D120 rests on has decayed on all four of its measurements**.

---

## 7. Art direction, settled

**Semi-realistic machines that belong in CATHEDRAL YARD's painted world** — real
material response, weathered painted steel, believable light — while separating
from the background as foreground subjects.

Three directions were tried and rejected, all recorded:

* **Grounding the mechs to the deck's luminance** (D128). A machine that shares
  the background's value stops being the subject.
* **Cel shading** (D129). Built, rendered, rejected — it reproduces the 2005
  reference's flat poster look, which is not this project's target. `CEL_SHADE`
  remains in the file as a working toon path, set `False`.
* **Modelling energy as geometry** (D132). A mesh has a silhouette; projected
  energy does not.

Energy is drawn, not modelled: filaments accumulated into a blade shape, not a
solid eroded at the edges. Density and colour are **separate dials** — raising
filament counts without raising the intensity normalisers bleaches the blade
white.

---

## 8. Known-open defects

* **8a.** Ladder test is slow and coupled to HALCYON.
* **8b.** `Combatant.fire` builds its projectile spawn field by field. **Assert
  on the pooled projectile, never on the attack.**
* **8c.** New world-space `Graphics` must join `BattleScene.worldObjects`.
* **8d.** The AI never *chooses* a command motion; the lance connects 1–2 %.
* **8e.** `grounded` is **0.0 %** for all eight machines in AI play.
* **8f.** The AI never chooses a sub-weapon.
* **8h.** `Element.Corrosive` is carried by **nobody**.
* **8i.** Hand-built stand-ins for growing objects. `MechPoseSource` is the
  structural contract and it **worked three times this session** — every new pose
  field made the compiler reject `BattleScene.decoyState` until it was updated.
* **8j.** NOCTURNE is `{ ...HALCYON }` — any new `MechDef` field added to HALCYON
  needs a line on NOCTURNE.
* **NEW — the scythe's two sources must agree.** `build_mechs.py` still builds
  the scythe's energy geometry and `energy_blade.py` overwrites the resulting
  PNG, so the manifest's tile comes from Blender while the pixels come from the
  generator. The generator now reads the tile out of `manifest.json`, but the
  cleaner fix is to stop building that geometry at all.
* **NEW — rebuild order matters**: Blender → merge manifest → generator.
* **NEW — `build_all(only=[...])` writes a partial `manifest.json`.** Save a
  merge base **before** the build; a copy taken afterwards captures the damage.

---

## 9. Traps

`docs/TESTING_PROTOCOL.md` is authoritative. What this session added:

* **A caution to re-measure is worth obeying.** The baseline reproduced exactly,
  but a step recorded as *flat* had become worth eight points of win rate.
* **Ablate before believing.** The blade's black contour was proven to be
  Freestyle by rendering with it off — 28.4 % vs 2.4 % dark pixels.
* **Measure the right population.** `windupFrac` was set to 0.19 from "strike at
  frames 20–22 of 107" — but that clip is **three slashes**. Within one slash the
  answer is 0.60.
* **Filtering by colour is not filtering by material.** Hue-bucketing blamed the
  trim palette for blowouts; mesh area by material showed trim is 4.2 % of the
  chassis and the culprit was specular on everything.
* **Freestyle face marks do not work.** `.freestyle_face` survives the join and
  the line pass ignores it. `select_by_collection` is honoured — which is why the
  energy had to become its own object.
* **A dead API call inside `try/except` is invisible.** `use_gtao` had done
  nothing since Blender 4.2.
* **Raising a negative sample to a fractional power yields a complex number.**

**Driving the game from the Browser pane**: `window.__BSR__` is the Phaser game.
Keyboard input frequently does not reach the page and `computer{action:'key'}`
never reaches Phaser. Skip the menus:

```js
const mod = await import('/src/core/Session.ts');
Object.assign(mod.session, { mode:'aiVsAi', playerMech:'pyre',
  enemyMech:'terramoth', playerDifficulty:3, enemyDifficulty:3 });
window.__BSR__.scene.stop('Title'); window.__BSR__.scene.stop('Results');
window.__BSR__.scene.start('Battle');
```

`game.scene.start` does **not** stop its caller, so Title renders under the match
and through the results screen — an artefact, not a defect. A frozen sim is
usually the pause menu: `scene.closePause()`. **Phaser's loop does not advance
during a blocking `javascript_tool` eval**, so anything sampled in a loop reads
frozen; that is why the swing could be verified numerically but not watched.

---

## 10. Documents worth reading

| File | What it holds |
| --- | --- |
| `CLAUDE.md` | Project rules, structure, definition of done |
| **`docs/TESTING_PROTOCOL.md`** | How to verify. Test at EXTREME; the traps |
| **`docs/TIER_LIST.md`** | Measured tiers, matchup chart, dispersion |
| **`docs/ARSENAL_PROPOSAL.md`** | **Reviewed, unbuilt.** Projectiles, patterns, melee |
| **`docs/REFERENCE_ART_STUDY.md`** | What Babel Sword 2005 actually does |
| `docs/DECISIONS.md` | **D1–D135** |
| `assets/blender/textures/README.md` | Texture provenance and the 16-bit trap |
| `assets/arenas/source/README.md` | **Which stage art is derived. Read before editing art** |
| `tools/probe/balance.ts` | Who is winning. Run `--selftest` first |
| `tools/probe/swingcurve.ts` | PYRE's composed swing curves |
| `tools/blender/anim_probe.py` | Sample a reference clip in rig terms |
| `tools/energy_blade.py` | Draws the projected blades |

---

## 11. Roster reference

| Mech | Pilot | HP | Faction | Melee | Motion |
| --- | --- | --- | --- | --- | --- |
| HALCYON `AV-07` | Naia Vesk | 1750 | Concord | beam saber, 6 | `swing` |
| NOCTURNE `AV-13` | Halden Rook | 1750 | Emberline | claw, 3 | `swipe` |
| VESPER `AV-12` | Kestrel Doyne | 1490 | Concord | bayonet, 2 | `thrust` |
| TERRAMOTH `HV-03` | Brunn Okonkwo | 2490 | Ironwake | pile driver, 2 | `piston` |
| CIRRUS `LT-21` | Mira Holloway | 1440 | Free Latitude | twin daggers, 8 | `stab` |
| OBELISK `GD-09` | Saar Tengku | 2070 | Ironwake | ram shield, 2 | `bash` |
| PYRE `IN-05` | Rasa Volkov | 1860 | Ashfall | **energy scythe, 3** | `reap` |
| NULLTIDE `EW-14` | Io Senna | 1610 | Free Latitude | glaive, 5 | `sweep` |

**Energy blades**: HALCYON, VESPER, CIRRUS, PYRE, NULLTIDE. The claw, pile driver
and shield project nothing and correctly have no `meleeEnergy` part.

**Pilot genders are fixed by `docs/PILOT_PORTRAIT_SPEC.md`** — four women, four
men. **Mechs are "it"; pilots get their own pronouns. The present is 43 CE.**
