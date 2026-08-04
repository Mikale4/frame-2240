# Testing Protocol

How to verify work on this project, and the rules that were learned by getting it
wrong. Read this before verifying anything by hand.

`SESSION_HANDOFF.md` is rewritten at the end of every session; this file is not.
Anything here is meant to survive that rewrite.

---

## 1. Play at EXTREME

**When testing the game by playing it, set the rival skill to EXTREME.** Not the
default NORMAL.

This is a standing instruction from the user, and the code agrees with it.
`Difficulty` in `src/core/Session.ts` is deliberately four tiers that play
*differently* rather than eight tiers of the same behaviour rolled more often,
and `AI_PROFILES` in `src/ai/RivalAI.ts` gates whole traits behind tier:

| Trait | EASY | NORMAL | HARD | EXTREME |
| --- | --- | --- | --- | --- |
| `statusIq` — reads status effects both ways | ❌ | ❌ | ✅ | ✅ |
| `frameIq` — invuln, repel window, dash cooldown, real recovery | ❌ | ❌ | ✅ | ✅ |
| `leadShots` — solves the intercept, aims via manual aim | ❌ | ❌ | ✅ | ✅ |
| `resourceIq` — reads the opponent's gauges | ❌ | ❌ | ❌ | ✅ |
| `droneIq` — values both escorts | ❌ | ❌ | ❌ | ✅ |
| `rangeIq` — reads reach and holds a computed distance | ❌ | ❌ | ❌ | ✅ |
| `tempoIq` — reads the exchange's rhythm | ❌ | ❌ | ❌ | ✅ |
| `planIq` — commits to a plan across ticks | ❌ | ❌ | ❌ | ✅ |

**Five** traits only ever execute at EXTREME: `resourceIq`, `droneIq`,
`rangeIq`, `tempoIq` and `planIq` (`RivalAI.ts:393–478`). This table listed two
of them until D118, which mattered — VESPER's whole diagnosis rests on `rangeIq`
being EXTREME-only, and the durable document did not record the trait it rests
on. **Check the source before trusting this table**; it is hand-maintained and
has been wrong once.

A test run at NORMAL
does not touch that code at all, so a fault living in it passes the test. EXTREME
also produces the longest matches, which means more of everything happens per
run — saturation bursts, desperation, drone rebuilds, guard breaks.

On the RIVAL SKILL panel, press Right to reach EXTREME before confirming. In
`aiVsAi` each side has its own dial — set both.

This applies to **manual and in-browser verification**. The automated harness
deliberately sweeps every tier and must keep doing so; `difficulty.test.ts`
asserts the ladder holds, and that assertion needs the lower tiers.

---

## 2. Measure AI changes; never reason about them

Every time an AI change has been reasoned about rather than measured on this
project, it has been wrong. The record so far:

* Per-pilot playstyles made the roster measurably **worse** (spread 0.555 →
  0.854), and retuning the obvious scalars afterwards moved the number by
  **0.000**. Only a per-lever ablation found the actual cause — `satPreference`.
* Handing EASY the same situational reads as EXTREME measured as **NORMAL losing
  to EASY**.
* Giving the designator drone homing measured as **EXTREME losing to HARD**.
* Four drone roles that replaced the drone's gun were worth less than the gun.

Run the harness. `playstyles.test.ts` and `difficulty.test.ts` are the ones that
measure the roster and the ladder; both play real matches, both slots, multiple
seeds. A change that "obviously" helps and measures flat is a change that does
nothing, and a change that measures worse is worse.

---

## 3. A passing measurement is not a legible result

**Measurement confirms behaviour exists. It does not confirm it can be seen.**
This is the single most expensive lesson on the project — six separate things
measured correct and read wrong on screen in one session:

* The decoy, in four distinct ways
* BULWARK's mines, which were pellet-sized
* The projectile textures, whose glow bled into square edges
* EMBER's size — twice, in both directions

**After any visual change, look at it.** Take the screenshot. The simulation
being healthy is not the claim being made when someone says a feature works.

The audio equivalent: a green `music.test.ts` proves the manifest matches the
directory. It does not prove a track decodes, plays, or is at a sane level. Get
it playing and confirm the playhead advances.

---

## 4. Driving the game from the Browser pane

Four tricks, all required:

1. **`computer{action:'key'}` does not reach Phaser.** Dispatch `KeyboardEvent`
   on `window`, keyed by physical `code`.
2. **Hold keys ~220 ms.** Menus read *held* state, not key-down edges.
3. **Freeze with `game.loop.sleep()` and resume with `game.loop.wake()`.** Not by
   pausing — Escape lays a scrim over the thing you wanted to see.

   **Do not hijack `requestAnimationFrame` to freeze.** Earlier notes recommended
   it; it is a trap. Phaser's `TimeStep` schedules itself *recursively*, so the
   moment a stub returns without invoking the callback the loop stops scheduling
   and is dead for good. Restoring `window.requestAnimationFrame` does **not**
   bring it back, and neither does `loop.wake()` — `loop.running` keeps reporting
   `true` while `loop.frame` sits still. Worse, a plain rAF probe still reports a
   healthy ~50 fps, because that is measuring *your own* loop, not Phaser's. The
   only recovery short of a reload is:

   ```js
   const raf = game.loop.raf;
   raf.stop();
   raf.start(game.loop.step.bind(game.loop), false);
   ```

4. **You cannot read the canvas back** — the context has no
   `preserveDrawingBuffer`. Screenshot instead.
5. **`window.__BSR__` is the Phaser game instance.** This is the way into
   everything: `__BSR__.scene.getScene('Battle').sim` is the live `MatchSim`, so
   combatant and supporter state can be sampled directly instead of guessed at
   from pixels. It sidesteps the HMR module-instance problem entirely.
6. **`getScene('Battle')` returns the dormant scene after a match ends**, still
   holding its finished `sim` — `phase` 3 and a stale `tick`. Always check
   `scene.isActive()` and `cameras.main` before trusting anything read from it.
7. **`BattleScene` has two cameras**: the world camera (`cameras.main`, zoom
   ~0.44) and a `ui` camera at zoom 1. A debug overlay added without being put in
   an ignore list is drawn *twice*, slightly offset. Add it in screen space with
   `setScrollFactor(0)` and then `cameras.main.ignore([...])` so only the UI
   camera draws it. World→screen is
   `(x - cam.worldView.x) * cam.zoom`.
8. **`game.scene.start('Battle')` does not stop the scene you were on**, and the
   shortcut everyone uses to skip the menus goes through exactly that global
   manager. Title stays active *underneath* the match, and when the fight ends
   the results screen renders on top of a live title screen — "PRESS START"
   overlapping "MECH SELECT", the title logo behind the score table.

   **This is an artefact of the harness route, not a defect.** The shipped path
   is `this.scene.start('Battle')` from `MechSelectScene.ts` — a *scene-instance*
   call, which stops its caller. Stop the menu scenes yourself first:

   ```js
   game.scene.stop('Title'); game.scene.stop('Results');
   game.scene.start('Battle');
   ```

   Check with `game.scene.getScenes(true).map(s => s.scene.key)` — that should
   name **one** scene, and if it names two the screenshot you are about to take
   is of two scenes stacked.

A working key helper:

```js
window.__tap = (code, ms) => new Promise(res => {
  const mk = t => new KeyboardEvent(t, { code, key: code, bubbles: true, cancelable: true });
  window.dispatchEvent(mk('keydown'));
  setTimeout(() => { window.dispatchEvent(mk('keyup')); setTimeout(res, 90); }, ms || 220);
});
```

**The Browser pane silently stops compositing** when the window loses foreground:
`requestAnimationFrame` drops below 1 fps, the Phaser loop freezes, screenshots
time out. **`document.hidden` still reports `false`** — do not trust it. Measure
rAF instead; ~50–61 is healthy, ~1 is throttled:

```js
let n=0; const t=performance.now();
const tick=()=>{n++; if(performance.now()-t<800) requestAnimationFrame(tick); else console.log(n);};
requestAnimationFrame(tick);
```

**`javascript_tool` times out at 30 s.** Anything that waits on a whole match has
to be split across calls.

**Inspecting the music player**: it holds `HTMLAudioElement`s created with
`new Audio()`, which are never in the DOM, so `document.querySelectorAll('audio')`
finds nothing and proves nothing. Hook the constructor path instead:

```js
const proto = (window.AudioContext || window.webkitAudioContext).prototype;
const orig = proto.createMediaElementSource;
proto.createMediaElementSource = function (el) { (window.__voices ??= []).push(el); return orig.call(this, el); };
```

---

## 4b. "Last" is not "outlier"

A sorted table always has a bottom row. Whether that row is a *problem* is a
separate question and the sort cannot answer it.

`tools/probe/balance.ts` prints a `z` column and a dispersion line on every full
sweep. **Use them before calling anything an outlier.** The convention here is
|z| >= 2, and it is a flag rather than a verdict — with eight machines, one
landing past 2σ is unremarkable. Its real value is the negative: when nothing is
flagged, the roster is one population and "X is the outlier" is not a claim the
data supports.

This is written down because the claim was made and was wrong. NOCTURNE was
called "the next real outlier" off a sorted list, on the strength of being last
on lead. It was **−1.10σ**. PYRE was further out on win rate (−1.57σ), and the
genuinely most extreme machine was VESPER at **+1.75σ, at the top of the table**.
Nothing was beyond 2σ at either tier.

Two things follow:

* **Subtract the noise.** Each row carries its own standard error, so observed
  dispersion is inflated: `observed² ≈ true² + SE²`. At 12 seeds about a fifth of
  the visible spread at EXTREME is measurement error. A 0.01 gap between adjacent
  machines is noise by construction.
* **The dispersion block suppresses itself on a partial sweep.** `--only X`
  gives X 84 samples and everyone else 12; that is not a field. Detected by
  unequal `n`, because the first cut of this check read the flag instead and duly
  printed a confident "no outliers" over meaningless numbers.

### And when the flag *does* fire, it is still not a verdict

D127 produced the first one: TERRAMOTH crossed to −2.14σ at HARD. The useful move
was not to act on the flag but to ask where it came from, and it decomposed
completely — **one matchup** swung 0.22, which over seven opponents is 0.031 of
mean lead, which was the entire observed drop. Field mean lead is zero by
construction, so `z = lead / SD`; check whether the numerator moved or the
denominator did before believing a σ has changed meaning.

The tell that it was structural rather than caused by the change under test: the
machine was already at −1.89σ, and **all three swept values flagged it equally**
(−2.12, −2.14, −2.06σ). A flag that does not discriminate between your arms is
not telling you about your arms.

---

## 5. Things that will mislead you

* **Vite answers unknown paths with `index.html` and a 200.** Requesting an asset
  that does not exist hands the decoder HTML rather than failing, and the loader
  hangs forever. This is why `MUSIC_CUES` and `BootScene`'s `MODELLED` /
  `PORTRAITS` sets are hand-maintained.
* **Vite HMR hands `await import()` a different module instance** than the
  running game holds. A singleton read that way can look empty while the game's
  copy is fine. **Reload the page before believing a reading.**
* **Synthetic key events are not user activation.** They fire listeners, so
  `sfx.unlock()` runs, but `HTMLAudioElement.play()` can still be refused. Music
  appearing dead after a scripted reload is usually this, not a broken player.
* **The Browser pane has its own empty `localStorage`**, so it gets default
  bindings: `Enter`/`J` confirm, `WASD`/arrows move, `Escape` pause, `F` barrier,
  `E` saturation, `J` main, `U` melee. **The user's own browser has remapped
  bindings** — boost `Space`/`KeyS`, barrier `KeyF`/`KeyD`, `ShiftLeft` flight
  toggle, melee `KeyU`/`KeyC`, modeCycle `Tab`/`KeyA`.
* **`visualScale` multiplies the family's dimensions; it does not set an absolute
  size.** Check `64 × scale × halo` against a pellet's `26 × 1.9` before
  believing a number.
* **Canvas `shadowBlur` is not clipped to the shape that cast it.** Projectile
  atlas cells need padding for it.

---

## 6. Before calling a work block done

* `npx vitest run` — all green
* `npx tsc --noEmit` — clean
* `npm run build` — clean
* The change **looked at** in the browser if it is visible at all
* No fatal console errors
