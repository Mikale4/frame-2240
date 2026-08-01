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

`resourceIq` and `droneIq` **only ever execute at EXTREME**. A test run at NORMAL
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
3. **Freeze by hijacking `requestAnimationFrame`**, not by pausing — Escape lays
   a scrim over the thing you wanted to see. Restore it afterwards.
4. **You cannot read the canvas back** — the context has no
   `preserveDrawingBuffer`. Screenshot instead.

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
