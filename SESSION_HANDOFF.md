# Session Handoff — Babel Sword: Reignition

> Rewritten at the end of a long session (D136–D143).
> Read this, then `CLAUDE.md`, then **`docs/TESTING_PROTOCOL.md`**, then §9.

---

## 1. Do these before working

1. **Read `docs/TESTING_PROTOCOL.md`.** Durable home for the rules in §9; this
   file is rewritten every session and that one is not. First rule: **test by
   playing at EXTREME**, never NORMAL — five AI traits execute at no other tier,
   and there are now **six** (`targetIq` joined them).
2. **Report EXTREME first.** HARD is a corroborating second sample and has
   overturned an EXTREME-only conclusion (D120).
3. **Report win rate, not just lead.** Different numbers; they disagree. CIRRUS
   is the live example — see §6.
4. **"Last" is not "outlier".** `balance.ts` prints `z` and a dispersion line.
5. **Never bundle an incidental change with a fix** (D125).
6. **Show the user images, don't just describe them.** Use `SendUserFile`.
   Nearly all the useful art feedback this session came from images going back
   and forth — including three separate defects the user spotted on screen that
   no test would have caught.
7. **Start the dev server**: `npm run dev` from Bash. Port **5173**.
8. Write commit messages to a file and `git commit -F` — backticks break
   heredocs, and they will also silently eat a `\`name\`` inside a Python
   `str.replace`, which mangled a doc comment this session.
9. **Git has no configured identity.** Commit with
   `GIT_AUTHOR_NAME=Claude GIT_AUTHOR_EMAIL=noreply@anthropic.com` (and the
   `GIT_COMMITTER_*` pair) or it fails.

---

## 2. State — verified

* **647 tests** (29 files), typecheck clean, production build clean.
* Working tree clean on `master`, no other branches. HEAD **`100576d`**.
* `docs/DECISIONS.md` runs to **D146**. `docs/TIER_LIST.md` regenerated from one
  12-seed run and is current.
* Blender is **5.1.2 / EEVEE Next**.

---

## 3. What happened this session

**D136 — the other four energy blades.** HALCYON, VESPER, CIRRUS and NULLTIDE
were still modelled energy, and all four rendered as the *same flat white cone*
because emission 2.4/3.0 clips every channel. All five are drawn now.
**Blender builds no energy geometry at all** — `energy_blade.py` owns the PNG,
the canvas and the manifest row.

**D137–D139 — training.** A rig console on the pause menu (drones, infinite sat,
health, command list, PLAYER 2 dummy/CPU, force button/command/move), a cosmetic
weapon-draw toggle, and the pilot now revives like the dummy.

**D140 — the flicker**, transcribed from the 2005 reference's own `.air` tables.

**D141 — melee reaches the escort.** **D142 — the lock is a choice.**
**D143 — target selection cannot pay for D142.** See §4 and §6.

**Art, unnumbered but committed.** Hands on all eight machines (every arm ended
in a bare block), NOCTURNE's claws rebuilt to the supplied concept sheet, and
the default controls moved to arrows + ZXC.

---

## 4. NEXT TASK

All three items the previous handoff named are **done** — D144, D145, D146. What
is open now:

1. **CIRRUS is still the top at 68 % / +1.97σ**, and D144 killed the standing
   explanation. Melee arrival is a roster-wide constant of 73–88 % and CIRRUS is
   *fourth of eight* on it; the entire gap is **ranged** arrival, 18.3 % against
   a field median of 6.2 %. No account of it can rest on fighting close, because
   VESPER is second on that column from **790 px**, the furthest on the roster.
2. **The largest unexamined thing on the project**: real dps is
   `arrive × nominal`, and the roster's damage numbers are authored as if
   nominal were the currency. The three best ranged arrivals belong to the three
   *lowest* nominal dps machines. CIRRUS turns 331 nominal into 70.7 real;
   OBELISK turns 394 into 27.3. That is a roster-wide authoring question.
3. **`add_swept_blade` in `build_mechs.py` is dead code** — untouched, still
   dead, and now that no weapon models energy at all it can go.
4. The arc layer is one machine's. If a second ever wants discharge, the
   `meleeArc` plumbing is general — only `BLADES`-style per-mech geometry in
   `electric_baton.py` is hard-coded to NULLTIDE.

## 5. Traps this session paid for

* **Ablate; do not reason.** `breaker` — "kill the escort that keeps shoving you
  out of melee" — was the most intuitive of five levers and measured as the
  *worst configuration on the table*, worse than doing nothing, and it broke the
  difficulty ladder by itself.
* **Levers do not add.** `finish` and `blocking` each beat doing nothing and
  *together* were worse than either alone.
* **A 6-seed harness is not the instrument.** `targetablate.ts` separated levers
  that `balance.ts` at 12 seeds showed were noise. Only compare within one
  harness; confirm on `balance.ts` before believing anything.
* **A silhouette is an extremum, not a mean.** Antithetic pairing cancelled the
  filaments' average displacement and did nothing for the blade's outline,
  because whichever single filament reaches furthest still sets the edge.
* **`roundPixels` turns sub-pixel motion into 1 px shake.** Scaling about a
  sprite centre and translating back is exact arithmetic and visibly shivered.
  Put the origin on the anchor instead, once.
* **Amplitude on a long blade is measured at the tip, in pixels.** ±3 % is 10
  logical px on PYRE's scythe.
* **A partial `build_all(only=[...])` still writes a partial `manifest.json`.**
  Save a merge base **before** the build. Rebuild order: Blender → merge →
  `energy_blade.py` → `pack_atlases.py`.
* **`await import('/src/core/Session.ts')` hands back a module the game is not
  using**, reliably, once `Session.ts` has been edited. Drive the real menus.
* **The Browser pane stops compositing when it loses foreground** and Phaser's
  loop stalls while `loop.running` still reports `true`. Pump it by hand:
  `game.loop.step(performance.now())`. Without that, menu navigation silently
  does nothing and the cursor just sits there.
* **Watch out for hitstun swallowing a test's only button press.** Two false
  negatives this session came from that and from a drone being yanked back to
  its owner every tick, so it was never where the harness put it.

---

## 6. Roster — measured, current

**EXTREME: spread 0.192, no outliers.** CIRRUS 68 %, NOCTURNE 40 % on win rate,
PYRE last on lead. **HARD: spread 0.195, and for the first time there is no
flagged outlier at either tier** — TERRAMOTH cleared, −2.06σ → −1.53σ.

0.192 is the best figure ever measured here, past D127's 0.198, and it was paid
for with **one dial**: TERRAMOTH's main `projSpeed` 11 → 17 (D145). Its repeater
reached 682 px while the machine fought at 664–745, and 60 % of its rounds were
expiring in open air.

Fairness 13/28 → **15/28** inside ±0.10. The one bad pairing is unchanged in
identity and smaller: **VESPER over TERRAMOTH, +0.66 → +0.55**, and it is now the
*only* thing wrong with that machine — six of its other seven pairings are inside
±0.10. §5 of `TIER_LIST.md` records that this restores the argument D120 rested
on, every row of which had decayed.

`docs/TIER_LIST.md` has the full rows, the regenerated matchup chart, the CIRRUS
analysis and the D145 sweep. All sections came from one run, which is the rule
that table exists under.

## 7. Art direction, settled

Semi-realistic machines that belong in CATHEDRAL YARD's painted world, separating
from the background as foreground subjects. **Do not re-propose cel shading, do
not darken the mechs toward the stage, do not model energy as geometry** — all
three were tried and rejected (D128, D129, D132).

Energy is drawn, not modelled. Density and colour are separate dials. Brightness
is **stepped** (a lamp is lit or it is not, and the jump is the effect); length
**rides between keys** (a blade that steps its length reads as resizing).

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
* **8i.** `MechPoseSource` is the structural contract for anything drawn through
  `MechRenderer`; it has caught `BattleScene.decoyState` repeatedly.
* **8j.** NOCTURNE is `{ ...HALCYON }` — any new `MechDef` field added to
  HALCYON needs a line on NOCTURNE. `roster.test.ts` now guards the one that
  matters (`meleeEnergy` and its anchor).
* **NEW — training ends the session if the player dies to a P2 CPU?** No: both
  sides revive (D138/D141 era). But `MatchPhase.Over` still ends it on a
  *timeout*, which a long drill will hit at 99 minutes.

---

## 9. Driving the game from the Browser pane

`window.__BSR__` is the Phaser game. **Pump the loop by hand** — see §5. Skip the
menus only if you can reach the game's own `session`; this session could not, so
drive the real menus with the pump.

```js
const pump = (n = 6) => { for (let i = 0; i < n; i++) __BSR__.loop.step(performance.now() + i * 16); };
const key = (code) => {
  const mk = t => new KeyboardEvent(t, { code, key: code, bubbles: true, cancelable: true });
  window.dispatchEvent(mk('keydown')); pump(4);
  window.dispatchEvent(mk('keyup')); pump(4);
};
```

`game.scene.start` does **not** stop its caller. Freeze with `game.loop.sleep()`.
You **cannot** read the canvas back, but `game.renderer.snapshotArea` works —
though pulling the base64 out is expensive, so prefer composing evidence offline
from the sprite PNGs.

---

## 10. Documents worth reading

| File | What it holds |
| --- | --- |
| `CLAUDE.md` | Project rules, structure, definition of done |
| **`docs/TESTING_PROTOCOL.md`** | How to verify. Test at EXTREME; the traps |
| **`docs/TIER_LIST.md`** | **Current.** Rows, chart, dispersion, CIRRUS |
| `docs/DECISIONS.md` | **D1–D143** |
| `docs/ARSENAL_PROPOSAL.md` | **Reviewed, unbuilt.** Projectiles and patterns |
| `tools/probe/balance.ts` | Who is winning. The instrument of record |
| `tools/probe/telemetry.ts` | *How* a machine spent its match |
| `tools/probe/targetablate.ts` | **New.** Per-lever ablation of target selection |
| `tools/energy_blade.py` | Draws all five projected blades |

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
| PYRE `IN-05` | Rasa Volkov | 1860 | Ashfall | energy scythe, 3 | `reap` |
| NULLTIDE `EW-14` | Io Senna | 1610 | Free Latitude | shock baton, 5 | `sweep` |

**Energy blades**: HALCYON, VESPER, CIRRUS, PYRE. The claw, pile driver and
shield project nothing and correctly have no `meleeEnergy` part. **NULLTIDE
carries `meleeArc` instead** (D146) — hardware with discharge drawn over it, from
`tools/electric_baton.py`. `roster.test.ts` enforces both parts both ways, and
that no machine carries both.

**Pilot genders are fixed by `docs/PILOT_PORTRAIT_SPEC.md`** — four women, four
men. **Mechs are "it"; pilots get their own pronouns. The present is 43 CE.**
