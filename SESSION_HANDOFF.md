# Session Handoff — Babel Sword: Reignition

> Rewritten at the end of a long session (D144–D149).
> Read this, then `CLAUDE.md`, then **`docs/TESTING_PROTOCOL.md`**, then §4.

---

## 1. Do these before working

1. **Read `docs/TESTING_PROTOCOL.md`.** Durable home for these rules; this file
   is rewritten every session and that one is not. First rule: **test by playing
   at EXTREME**, never NORMAL — six AI traits execute at no other tier.
2. **Report EXTREME first.** HARD is a corroborating second sample and has
   overturned an EXTREME-only conclusion (D120).
3. **Report win rate, not just lead.** They disagree, and D145 chose a shipped
   value on exactly that — two settings tied on spread and only win rate could
   tell them apart.
4. **"Last" is not "outlier".** `balance.ts` prints `z` and a dispersion line.
5. **Never bundle an incidental change with a fix** (D125).
6. **Show the user images, don't describe them.** Use `SendUserFile`. Every
   visual fault this session came from the user looking at the screen; not one
   came from a test.
7. **Start the dev server**: `npm run dev` from Bash. Port **5173**, or **5174**
   if 5173 is taken — read the output rather than assuming.
8. Write commit messages to a file and `git commit -F`. Backticks break
   heredocs, and a heredoc **ate a `\'` escape** this session and silently broke
   a test file's parse.
9. **Git has no configured identity.** Commit with
   `GIT_AUTHOR_NAME=Claude GIT_AUTHOR_EMAIL=noreply@anthropic.com` (and the
   `GIT_COMMITTER_*` pair) or it fails.

---

## 2. State — verified

* **660 tests** (29 files), typecheck clean, production build clean.
* Working tree clean on `master`, no other branches. HEAD **`fd18bfa`**.
* `docs/DECISIONS.md` runs to **D149**. `docs/TIER_LIST.md` is current as of
  D145, regenerated from one 12-seed run.
* Blender is **5.1.2 / EEVEE Next**.

---

## 3. What happened this session

**D144 — CIRRUS's accuracy is not its melee.** The probe was counting a
numerator without its denominator. Melee arrival is a roster constant of 73–88 %
and CIRRUS is fourth of eight on it; its edge is entirely *ranged* arrival.

**D145 — TERRAMOTH's repeater 11 → 17.** Spread **0.266 → 0.192** at EXTREME,
best ever measured, and **0.306 → 0.195** at HARD, clearing the only flagged
outlier the project has produced.

**D146 — NULLTIDE's glaive became an extended shock baton**, all hardware, with
electricity drawn over it by `tools/electric_baton.py`.

**D147 — the ground game got verbs.** **D148 — teaching the rival to use them
measured worse in every configuration and ships off.**

**D149 — a long presentation pass.** The pattern worth carrying: four separate
faults were *code that said it did something and did not*.

---

## 4. NEXT TASK — the sub-weapon button

`Btn.Sub` is the one control in the game that does not work, and it is **not
unwired — it is starved.** The diagnosis is done; the design choice is not.

`Combatant.tryStartAction` (~line 2025) calls `orderAssist(d.sub)`, which
refuses unless `subCharges >= cost && supporter.ready`. The drone's own
`requestVolley()` — whose comment says it *"asks every tick"* — spends those
charges first. The button competes with the escort for one pool and always
loses. Every mech, every match.

There is a vestigial second half: **`RivalAI.ts` (~line 2006) still carries a
comment saying `Btn.Sub` "deploys and recalls the drone"**, true two designs ago
and not now, and the AI presses it via `wantsDroneToggle` for a reason that no
longer exists. Whatever is chosen, that and `wantsDroneToggle` go with it.

**Three options were put to the user and none has been chosen — ask first.**

1. **Reserve a charge for the player.** Smallest fix: the drone's auto-volley
   cannot spend the last charge; only the button can. Makes the existing design
   work as written.
2. **Manual drone command** — reclaim the original intent: aim, send forward,
   recall. **This was the recommendation**: CLAUDE.md lists drones as core
   identity and the player currently has no relationship with theirs.
3. **Give it to the mech instead of the drone** — a real second weapon per
   chassis. Most work, most new game.

### Also open

* **Roster.** EXTREME spread 0.192, no outliers at either tier. The bottom is
  **NOCTURNE at 40 % win while sitting 5th on lead** — the two columns
  disagreeing is the PYRE-at-D121 signature, and `TIER_LIST.md` says to find the
  specific cause rather than average them.
* **`arrive × nominal` is the real damage currency and the roster is authored on
  `nominal`.** The three best ranged arrivals belong to the three *lowest*
  nominal-dps machines. Largest unexamined thing on the project.
* **Title rename.** The user likes **S.P.A.R.** as an acronym naming *the
  machines*. On the table: **Self-Propelled Armoured Rig** — real military
  nomenclature, faction-neutral, and it splits registers usefully (paperwork
  says S.P.A.R., pilots say "frame"). Not applied. `GAME_TITLE` /
  `GAME_SUBTITLE` in `GameConfig.ts`, plus a docs pass.
* **Art briefs written and unused**: `docs/PROMPT_PILOT_PORTRAITS.md`,
  `docs/PROMPT_TITLE_ART.md`. **The anime portrait restyle was abandoned** — the
  select screen shows an animated mech instead. Thumbnails unchanged.
* **CATHEDRAL YARD's lore is a proposal awaiting approval**
  (`STAGE_ART_BRIEF.md` §2.3). The user floated making the stage Stillwake,
  which contradicts Stillwake having fallen below the storm layer. Needs a
  ruling.
* `add_swept_blade` in `build_mechs.py` is dead code.

---

## 5. Traps this project has paid for

* **Ablate; do not reason.** The most intuitive AI lever has now measured worst
  **twice** — `breaker` (D143), `groundIq` (D148).
* **Levers do not add.** Subsets beat their union, in both D143 and D148.
* **A lever that ties on spread can still buy a flagged outlier.** Check the
  outlier line, not just the spread.
* **A 6-seed harness is not the instrument.** Confirm on `balance.ts` at 12
  seeds before believing anything.
* **`tail -n` on vitest hides a test *file* failing to collect.** Read the file
  count. That cost ten tests silently this session.
* **The manual loop pump reports near-zero `dt`.** Particle lifetimes and pool
  saturation must be measured on real frames — 90/90 was really 37/90.
* **A comment is not evidence.** Four D149 faults were code contradicting its
  own docstring.
* **NOCTURNE has its own `NOCTURNE_RIG`** and does *not* inherit rig changes
  from HALCYON by spread. Missed once this session.
* **The Browser pane stops compositing when it loses foreground.** Pump by hand.
* **Scripted `Enter` in battle opens the pause menu.** Drive menus, not fights.
  An orphaned `requestAnimationFrame` from a timed-out call keeps running and
  will crash the game with *your* code in the stack.

---

## 6. Roster — measured, current

**EXTREME: spread 0.192, no outliers. HARD: 0.195, no outliers** — the first
sweep with nothing flagged anywhere. CIRRUS 68 % top, NOCTURNE 40 % bottom.
Fairness 15/28 inside ±0.10. The one bad pairing is VESPER over TERRAMOTH at
+0.55, kept by design decision (D120), and now the *only* thing wrong with that
machine.

`docs/TIER_LIST.md` has the full rows, the chart and the CIRRUS analysis.

---

## 7. Art direction, settled

Semi-realistic machines in CATHEDRAL YARD's painted world. **Do not re-propose
cel shading, do not darken the mechs toward the stage, do not model energy as
geometry** — all tried and rejected (D128, D129, D132).

Energy is drawn, not modelled. Brightness is **stepped**; length **rides between
keys**. `src/ui/HoloPanel.ts` owns the UI panel language;
`src/render/ThrusterProfiles.ts` owns exhaust behaviour **by faction**.

---

## 8. Known-open defects

* **8a.** Ladder test is slow and coupled to HALCYON.
* **8b.** `Combatant.fire` builds its spawn field by field. **Assert on the
  pooled projectile, never on the attack.**
* **8c.** New world-space `Graphics` must join `BattleScene.worldObjects`, or
  the UI camera draws a second copy elsewhere.
* **8d.** ~~The AI never chooses a command motion~~ — **corrected this session.**
  It does produce them (it has no other route to the lance); it just does not
  deliberate. The old "lance connects 1–2 %" figure is wrong: it is 18–24 %.
* **8e.** ~~`grounded` is 0.0 %~~ — **explained in D147**: nothing on the deck
  was worth choosing. Still 0.0 % in AI play by design after D148.
* **8f.** The sub-weapon button — **now §4, diagnosis complete.**
* **8h.** `Element.Corrosive` is carried by nobody.
* **8i.** `MechPoseSource` is the structural contract for anything drawn through
  `MechRenderer`; it now also covers `MechDemo`.
* **8j.** NOCTURNE is `{ ...HALCYON }` **but its rig is a separate constant.**
* Training ends on a timeout at 99 minutes.

---

## 9. Driving the game from the Browser pane

`window.__BSR__` is the Phaser game. **Pump the loop by hand.**

```js
const pump = (n = 6) => { for (let i = 0; i < n; i++) __BSR__.loop.step(performance.now() + i * 16); };
const key = (code) => {
  const mk = t => new KeyboardEvent(t, { code, key: code, bubbles: true, cancelable: true });
  window.dispatchEvent(mk('keydown')); pump(14);
  window.dispatchEvent(mk('keyup')); pump(8);
};
```

Menus drive reliably; battles do not. To inspect a cutscene or a panel, call it
directly — `getScene('Battle').cutscene.play({...})` — rather than trying to
produce the situation in play. **Never leave a `requestAnimationFrame` loop
running.**

---

## 10. Documents worth reading

| File | What it holds |
| --- | --- |
| `CLAUDE.md` | Project rules, structure, definition of done |
| **`docs/TESTING_PROTOCOL.md`** | How to verify. Test at EXTREME; the traps |
| **`docs/TIER_LIST.md`** | Rows, chart, dispersion, CIRRUS |
| `docs/DECISIONS.md` | **D1–D149** |
| `docs/ARSENAL_PROPOSAL.md` | Reviewed, unbuilt |
| `docs/PROMPT_PILOT_PORTRAITS.md` | Portrait brief. **Restyle abandoned** |
| `docs/PROMPT_TITLE_ART.md` | Title key-visual brief. Unused |
| `tools/probe/balance.ts` | Who is winning. The instrument of record |
| `tools/probe/telemetry.ts` | *How* a machine spent its match |
| `tools/electric_baton.py` | NULLTIDE's discharge |

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

**Energy blades**: HALCYON, VESPER, CIRRUS, PYRE. **NULLTIDE carries `meleeArc`
instead** — hardware with discharge drawn over it. The claw, pile driver and ram
shield project nothing. `roster.test.ts` enforces all three cases.

**Pilot genders are fixed by `docs/PILOT_PORTRAIT_SPEC.md`** — four women, four
men. **Mechs are "it"; pilots get their own pronouns. The present is 43 CE.**
