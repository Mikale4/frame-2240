# Reference Audit

Audit of the supplied research material for **Babel Sword: Reignition**.
Everything below was established by *reading* files in the reference folders. No
reference executable was ever run, and no reference asset is redistributed by
this project.

Date of audit: 2026-07-30

---

## 1. Inventory

| Folder | Files | Size | Engine / nature |
| --- | --- | --- | --- |
| `Babel Sword 2005/` | 297 | 19.7 MB | WinMUGEN game (`winmugen.exe`, `ALLEG40.DLL`, `zlib.dll`) |
| `Babel Sword 2011/` | 2652 | 22.9 MB | MUGEN 1.0-era build, many loose `.png` / `.pcx` work files |
| `Babel Sword 2018 and 2020/` | 681 | 53.9 MB | Two builds: "Babel Sword 2018" and "Babel Sword 2020 Demo"; MUGEN 1.1 / Ikemen-style (`.lua`, `.vert`, `.frag`) |
| `Screenshots of Original 2005 Babel Sword/` | 16 | 2.5 MB | 8 PNG + 8 JPG gameplay captures |
| `Legacy Babel Sword Fan Game (Iron Babel)…/` | 247 | 44.7 MB | Browser prototype: one 4.47 MB `IronBabel.html` plus PNG atlases and JSON rigs |
| `Important Babel Sword Notes.txt` | 1 | 242 B | Two-line steer toward 2005 (combat) and 2018 (presentation) |

### File-type census (largest groups)

* **2005** — 157 `.def`, 56 `.act` (palettes), 11 `.cns` (state logic), 2 `.air`
  (animation), 7 `.sff` (sprite archives), 16 `.mp3`, 8 `.fnt`.
* **2011** — 1056 `.png`, 666 `.pcx`, 188 `.act`, 162 `.def`, 60 `.sff`, 24 `.cns`.
* **2018/2020** — 487 `.def`, 49 `.txt`, 42 `.sff`, 9 `.snd`, 8 `.lua`,
  2 `.vert` + 2 `.frag` (GLSL).
* **Iron Babel** — 223 `.png`, 7 `.json`, 6 `.html`, 2 `.js`, 1 `.py`, 3 `.ps1`,
  plus three `.bak_*` copies of the monolithic HTML.

---

## 2. Readable vs. opaque formats

**Readable as text (used for this audit):**

* `.def` — INI-style manifests (character/stage/system definitions).
* `.cns` — MUGEN state-machine source. Plain text, Shift-JIS encoded.
* `.cmd` — command/motion definitions plus the `Statedef -1` dispatch table.
* `.air` — animation tables (sprite index, offset, duration, flags).
* `.cfg`, `.txt`, `.html`, `.css` — configuration and documentation.
* `.lua`, `.vert`, `.frag` — 2018-era scripting and shaders.
* `.json` — Iron Babel rigs, atlases and animation tables.

**Binary / not usefully readable, and not needed:** `.sff` (sprite archive),
`.snd` (audio archive), `.act` (palette), `.fnt` (bitmap font), `.pcx`, `.mp3`,
`.wav`, `.pyc`.

> **Encoding note.** The 2005 sources are **Shift-JIS (CP932)**. Reading them as
> UTF-8 produces mojibake and hides the Japanese comments, which is where most
> of the design intent actually lives. All quotes below were decoded with CP932.

---

## 3. Files that must never be executed

These were catalogued and deliberately left alone:

* `Babel Sword 2005/winmugen.exe`, `ALLEG40.DLL`, `zlib.dll`
* `Babel Sword 2011/` — 20 `.exe` and 44 `.dll` files
* `Babel Sword 2018 and 2020/` — 13 `.dll` files, `.manifest`
* `Legacy … (Iron Babel)…/*.ps1` (3 install scripts), `tools/*.py`, `*.pyc`

Nothing in this project links to, loads, or depends on any of them.

---

## 4. The combat model, as evidenced

### 4.1 Primary sources

The decisive files were:

* `Babel Sword 2005/ヒント.txt` — the author's own hint sheet.
* `Babel Sword 2005/chars/rs/st/0.cmd` — command table + `Statedef -1` dispatch.
* `Babel Sword 2005/chars/rs/st/sys.cns` — movement, part assembly, angles.
* `Babel Sword 2005/chars/rs/st/0.cns` — melee, barrier, saturation states.
* `Babel Sword 2005/chars/rs/st/cns.cns` — the numeric constants block.
* `Babel Sword 2005/howto-en.html` — the official English control list.

### 4.2 Architecture: one shared engine, data-driven mechs

`chars/rs/` holds **one** character implementation shared by ~20 mechs. Each
`.def` (`hm-004a.def`, `ms-z2.def`, `xd-1.def`, …) points at the *same* state
files and differentiates itself by setting `var(1)` (chassis type) in
`Statedef 5900`. Animations are selected arithmetically:

```
anim = 61000 + var(1)*10
```

`var(1)` also selects chassis *family* behaviour: `0–19` are flight frames that
receive backpack and arm helpers; `20–59` are walker frames that instead receive
paired leg helpers (`6500`/`6510`).

**Lesson taken:** mechs are data, not code. Reignition mirrors this with
`MechDef` records rather than per-mech classes.

### 4.3 Multipart mechs are literal separate objects

`sys.cns` builds each mech from MUGEN *helpers*, one per part, under the comment
`パーツ構築` ("part construction"):

| Helper ID | Comment | Meaning |
| --- | --- | --- |
| 6000 | `頭部連結` | head attachment |
| 6200 | `上肢連結` | upper limbs / weapon mount |
| 6300 | (arms, `var(1) = [0,19]`) | arm unit |
| 6400 | `背中連結` | backpack |
| 6500 / 6510 | `走行足連結` + `反対側` | legs, near and far side |

This is direct evidence that the original's look comes from independently
transformed parts, not single-image sprites — and it is why CLAUDE.md asks for a
ten-part rig.

### 4.4 Per-part angles: banking, idle bob, sword spin

`sys.cns` maintains float vars as angles in **degrees**:

* `fvar(2)` — chassis bank target. Observed values: idle `350`, ground-idle `0`,
  running forward `320`, running back `15`, **dash forward `290`**, dash back `35`.
* `fvar(5)` — mount angle, with an explicit idle oscillation:
  `fvar(5) = 350 + cos(time / (30*fvar(11)+0.01)) * 9` → a **±9° hover bob**.
* `fvar(4)` — a slew-limited follower of `fvar(5)`; it only snaps when within 9°,
  i.e. hand-rolled angular damping.
* `fvar(1)` — sword rotation, advanced `±18°` per tick during melee
  (`StateNo = 210 && time > 8`, `211 && time > 5`) → one revolution per 20 ticks.
* `fvar(9)` — the **attack angle**, used as `Cos(fvar(9) * 0.0174)`. The constant
  `0.0174` is degrees→radians, confirming attacks fire along arbitrary angles
  rather than left/right only.

### 4.5 Flight

From `Statedef 0` in `sys.cns`:

* Velocity is **set**, not accumulated: `velset` per tick from held directions.
* Diagonals are normalised by dividing by `1.414`.
* `const(velocity.walk.fwd.x)` is scaled by `fvar(10)` (a per-mech speed stat).
* **Dash** (`var(17)`) multiplies velocity by **2.25**, and requires boost
  (`var(21) > 0`).
* Firing anchors movement — while shooting helpers are in charge:
  `velmul 0.2/fvar(10)` (charge states 6202/6210) or `0.5/fvar(10)` (6204).
* Speed saturation multiplies velocity by **1.75**.
* There is a ground/air duality: `var(20)` is a flight flag, `Statedef 40` is
  take-off and `55` is landing. `howto-en.html` lists **FlyingMode ON/OFF** as a
  player-toggled state that also engages automatically during a Level 2 shot.
* `var(10)` is a motion selector (`0` idle, `50` rising, `11` falling, `10`
  crouch, `20/21` forward/back, `100/105` dash forward/back).
* Auto-turn toward the opponent uses a 5px deadzone (`Turn` in `Statedef 0`) and
  a 10px deadzone inside the melee state.

From `cns.cns`:

```
life = 6000     power = 3000    attack = 100    defence = 50
walk.fwd = 2.0  run.fwd = 4.0   airjuggle = 15  liedown.time = 60
```

AI screen-bound checks (`ScreenPos X = [10,310]`, `ScreenPos Y > 230`,
`Y < 30`) confirm the original ran in MUGEN's **320×240** logical space.

### 4.6 Weapons

`0.cmd` defines a three-tier shot grammar plus a sub-weapon:

| Command | Motion | Result |
| --- | --- | --- |
| `s1` | `x` | Level 1 shot → `var(11) = 200`, state 200 |
| `s1-s` / `s1-s2` | `~D,F,x` / `~D,B,x` | directed Level 1 variants |
| `s2` | `y` | Level 2 shot → `var(11) = 400`, state 400 |
| `s2-s` | `~D,F,y` | directed Level 2 |
| `s3` | `~D,B,y` | Level 3 → `var(11) = 1000`, state 1000 |
| `op-a/b/c` | `b`, `~D,F,b`, `~D,B,b` | three sub-weapon variants |
| `s1-h` / `s2-h` | `/x`, `/y` | hold-to-autofire |

Gating is by energy threshold: Level 1 needs `var(28) >= PowerMax/3`, Levels 2
and 3 need `>= PowerMax/2`. `command.time = 15`, `command.buffer.time = 1`.

`howto-en.html` adds: *"hold X or Y for Auto-Fire"* and *"hold Y and direction
keys during Lv1 shoot to modify shooting direction"* — i.e. manual aim override
while firing.

### 4.7 Melee shares the main-gun button

In `0.cmd`, the same `s1` command routes to **state 210** instead of a shot when
`var(31) > 0` (a proximity flag). `howto-en.html` confirms: *"Attack — X (at
close quarters)"*.

`Statedef 210`/`211` in `0.cns` give exact frame data:

* State 210: hit spawned at `time = 20`, state ends at `time > 35`.
* State 211 (follow-up): hit at `time = 12`.
* **Chain window** `time = [14,26]` with `command = "x"` → `var(37)`.
* **Hit-confirm gate**: the chain only advances while `var(36)` is set, and
  `var(36)` is only set by `ProjHitTime(21)` / `ProjContactTime(21)`. A whiffed
  swing therefore cannot be chained.
* **Hit cap** `var(41) < 3` normally, `var(41) < 6` while Speed saturation is up.
* Damage: `200/120` opener, `50/30` middles, `200/50` finisher (projID 22).
* Knockback: `TargetVelAdd -3.2·cos(fvar(9))`, finisher `TargetVelSet -12·cos`.
* Attacker recoil after the finisher: `-8.2` airborne, `-16` grounded.
* `pausetime = 20,20` on the opener (hitstop), `10,10` on the finisher.
* Homing approach during startup: `posadd 4.2–5.0 · cos(fvar(9))` while outside
  ±15 px horizontally / ±10 px vertically.
* `attr = S, HP` carries the comment `防壁不能型` — *"barrier-impossible type"* —
  with a commented-out alternative `防壁相殺型` ("barrier-cancellable"). **Melee
  bypasses the barrier.**

### 4.8 Barrier

`Statedef 1200` in `0.cns`, bound to `a` with no direction held:

* Spawns helper `1200`; bubble scale steps `1.0 / 1.5 / 2.0` by `fvar(11)`.
* Grants `var(53) = 36` — the source comments this `;(f)`, i.e. **36 frames of
  invulnerability**.
* Costs `PowerMax/4`; the entry trigger requires `>= PowerMax/3`.
* The whole action lasts only `time > 6` before returning to state 0/50.
* **Cancel penalty:** entering from `PrevStateNo = 151` (guard) or `5030`
  (hitstun) plays a distinct sound, spawns sparks, and charges a *second*
  `PowerMax/4`. So you may barrier out of blockstun or hitstun, at double cost.

The hint sheet adds the two rules that make barrier the heart of the game:

> ・バリア発動の瞬間、自機は無敵状態(敵のソードアタックも回避可能)
> ・バリアで防いだ敵弾は「集中」ゲージに還元

*At the instant the barrier fires you are invincible (even the enemy's sword
attack can be evaded); enemy shots blocked by the barrier are converted into the
"concentration" gauge.* It also notes the first guard after pressing back takes
no damage.

### 4.9 The SATuration ("集中") meter

`0.cmd` and the hint sheet together fully specify it:

* Gauge is `var(40)`, full at **500**. Fills `+1` per 2 ticks passively, and on
  firing: `+10` (state 200), `+20` (state 400), `+50` (state 1000).
* Activated by `command = "x" && command = "y"` when `var(40) >= 500`.
* Mode is `var(58)`, cycled by the **Start** button: `var(58) = (var(58)+1)%3`.
* While active the gauge runs negative and drains `+1` per 2 ticks, **plus an
  extra `+5` when `var(58) = 0`** — the shield mode burns down fastest.

The three modes, quoting the hint sheet:

| Mode | Japanese | Effects |
| --- | --- | --- |
| ① Shield | シールド | longer invulnerability; erases enemy shots |
| ② Shoot | シュート | bullet speed +150–175%; firepower +150%; homing improved; power +50% restored; faster power regen |
| ③ Speed | スピード | move speed +150–200%; **sword attack multi-hits**; boost fully restored |

`howto-en.html` names this in English — *"Saturation … power-exchange activates
following abilities: wide shield / high-speed bullets / quick maneuver
(Start button: type change)"* — which is where CLAUDE.md's "SATuration" comes
from. Corroborated in code by
`Ifelse((var(40)<0 && var(58)=2), 1.5, 1)` on movement and the `var(41) < 6`
melee cap.

### 4.10 Official control list (2005, `howto-en.html`)

Guard · Level 1 Shoot `X` · Level 2 Shoot `Y` · Sub Shoot `B` ·
**Barrier `A` (only)** · Recovery `A` (when hit-sliding or guarding) ·
**Attack `X` at close quarters** · **SpeedUp `Direction + A` — "unguardable while
SpeedUp"** · FlyingMode ON/OFF (`direction + A`) · **Saturation `X + Y`**,
Start = type change.

The HUD is enumerated as seven elements: player main shoot, **supporter sub
shoot**, jet power indicator, sub shoot charge indicator, timer, life indicator,
power charge indicator. Win/loss: life to zero, or on timeout the higher total
life wins.

### 4.11 AI shape

`0.cmd` carries the usual MUGEN AI-activation cheat commands and **eight** levels
(`ai_1`…`ai_8` → `var(51)`). The commented-out movement block shows the intended
behaviour: pick a numpad direction from `var(55)%10`, retreat when
`Random > distance*10`, dodge when `Enemy,StateNo = 200 || 400 || 1000`
(annotated `敵弾避け`, "enemy bullet dodge"), and steer away from screen edges.
`var(51)` also tags special roles (`4`/`11` boss, `7` special, `5` escort).

### 4.12 Presentation, from the screenshots

The eight captures show: a strict side view with mechs banked at steep angles;
long smeared projectile trails in red/magenta; bright thruster plumes; a combo
readout (`HIT` + count) at the left; score popups (`SHOOTING BONUS +1000`,
`+100`); `TIME` centred at the top; twin life bars top-right with a pilot
portrait beside them; and parallax industrial or nebula arenas with a hazard-
striped foreground rail. Mechs are visibly multi-part (separate shoulder pods,
arms, weapons, thruster packs).

---

## 4b. Second pass on 2005 — corrections and newly found functions

A later review, prompted by in-game screenshots, corrected one wrong conclusion
and surfaced several functions the first audit missed.

### 4b.1 Correction: the roster is NOT near-monochrome

The first audit inferred an off-white, near-monochrome palette from the 2018
documentation portraits (`data/bs1/howto/rs/mars1/p-*.gif`). **Those portraits
are rendered in a neutral placeholder palette.** In-game the machines are vividly
coloured.

Verified against the 2005 build's own palette files — `chars/rs/pal/*.act`, 56 of
them, each a plain 768-byte RGB table:

| Palette | Sampled identity colours |
| --- | --- |
| `00-1.act` | `#0090FF` `#00DCFF` `#007DFF` with `#FF5500` / `#FF0000` |
| `01-1.act` | `#FF5000` `#BE3500` over `#00CECE` `#009E9E`, plus `#55F600` |
| `10-1.act` | `#1200A3` deep blue with `#00FFFF` |
| `20-1.act` | `#00B13A` `#008A57` `#00706B` green-teal ramp |
| `30-1.act` | `#0000E1` … `#000089` pure blue ramp |

`#FF00FF` appears in every palette as MUGEN's transparency key, not a body
colour. Two `.act` files per mech (`-1`, `-2`) give each machine a player-1 and
player-2 scheme.

**Lesson recorded:** derive colour from the palette files or gameplay captures,
never from documentation renders.

### 4b.2 The HUD is custom, not MUGEN's

`data/fight.def` **disables the entire stock lifebar system**: every element is
`anim = -1` and positioned at `999, 999` (off-screen), including `[Lifebar]`,
`[Powerbar]`, `[Face]` and `[Name]`.

The HUD visible in-game — twin life bars, a second power bar, a labelled
**SHIELD** gauge, pilot portraits, the large timer — is therefore drawn entirely
by the character's own states via `Explod`. Example, from `Statedef 8000`:

```
[State 0] ; face
	type = Explod
	anim = 36100 + Root,var(24)      ; var(24) = pilot id
	postype = Left
	pos = Ifelse(TeamSide = 1, 18, 302), 236
	scale = 0.5, 0.5
	ontop = 1
```

This is why the layout has three bars per player, which stock MUGEN cannot do.

### 4b.3 Newly found: sprites scale with screen height (pseudo-3D depth)

`Statedef 8000` maintains:

```
fvar(35) = (ScreenPos Y + 25) / 240.0 * 0.4 + 0.8
```

A scale factor driven by **vertical screen position**: ~`0.8` at the top of the
240px play field, ~`1.2` at the bottom. Mechs higher up read as further away.
This is a core part of why the reference arenas feel like they have depth rather
than being flat side-view planes.

**Not yet implemented in Reignition.** This is the single largest presentation
gap and is queued as the next milestone.

### 4b.4 Newly found: per-tier defence multipliers

Also in `Statedef 8000`, `var(30)` selects a defence multiplier applied through
`DefenceMulSet`:

| `var(30)` | `fvar(6)` |
| --- | --- |
| 4 | 0.55 |
| 3 | 0.85 |
| 2 | 0.65 |
| 1 | 0.75 |

Combined with `[Data] defence = 50` in `cns.cns` and the arcade-mode
`DefenceMulSet` in `Statedef -3`, defence is layered rather than a single stat.

### 4b.5 Gap analysis — 2005 functions vs. Reignition

| Function | Evidence | Status |
| --- | --- | --- |
| 8-direction free flight, normalised diagonals | `sys.cns Statedef 0` | implemented |
| Dash ×2.25 costing boost, unguardable | `sys.cns`, `howto-en.html` | implemented |
| Firing anchors movement (`velmul`) | `sys.cns` | implemented |
| Tiered shots Lv1/Lv2/Lv3 + motion variants | `0.cmd` | implemented |
| Hold-to-autofire | `0.cmd` `/x` `/y` | implemented |
| Sub-weapon on its own charge | `0.cmd`, `howto-en.html` | implemented |
| Hit-confirmed melee chain, barrier-piercing | `0.cns 210/211` | implemented |
| Barrier burst, 36f invuln, absorb→meter | `0.cns 1200`, hint sheet | implemented |
| Barrier cancel penalty from guard/hitstun | `0.cns 1200` | implemented |
| Saturation, 3 modes, Start to cycle | `0.cmd`, hint sheet | implemented |
| Per-part aim/bank/spin angles | `sys.cns fvar(1..5)` | implemented |
| Eight AI tiers | `0.cmd ai_1..ai_8` | implemented |
| Timeout resolved by remaining life | `howto-en.html` | implemented |
| **Y-position sprite scaling** | `1.cns fvar(35)` | **missing** |
| **Custom Explod-drawn HUD w/ portraits** | `fight.def` all disabled | partial (no portraits) |
| **Ground plane + landing/takeoff states** | `sys.cns 40 / 55`, `var(20)` | missing (flight only) |
| **FlyingMode ON/OFF toggle** | `howto-en.html` | missing |
| **Layered defence multipliers** | `1.cns var(30)`, `-3` | missing |
| **Supporter/drone firing the sub-shot** | `howto-en.html` HUD list | **implemented** — see 4c |
| **Mission win conditions (escort, waves)** | `sys.cns 7000/8100, var(50)` | missing |
| **Boss / special AI roles** | `var(51)` = 4, 7, 11 | missing |
| **Stock/round icons** | screenshots | missing |


---

## 4c. Third pass on 2005 — the supporter

Prompted by the supporter/assist milestone. Everything below is read from the
supplied 2005 files; nothing is copied. The `.cns` files are Shift-JIS, so the
Japanese comments only decode with codepage 932 — read as UTF-8 they are
mojibake, which is why earlier passes missed most of this.

### 4c.1 The supporter is a first-class HUD element

`howto-en.html` labels the seven screen elements, and two of them are the
supporter:

```text
1) player - main shoot
2) supporter - sub shoot
3) jet power indicator
4) sub shoot charge indicator
5) timer
6) life indicator
7) power charge indicator
```

The labelled screenshot (`data/howto/bg2.gif`) places them. Marker **2** sits on
a small machine flying just below and behind the player machine — clearly a
separate, smaller entity, not a weapon on the chassis. Marker **4** points at a
short green bar drawn *next to the supporter itself*, in world space, not in the
corner HUD. So the reference tells the player whether the assist is ready by
drawing the gauge on the helper.

### 4c.2 Where the supporter lives in the state machine

`chars/rs/st/f-o.cns` opens with the comment `サポーター射撃` — "supporter
shooting". It holds one state block per chassis (`110000`, `110010`, `110020`,
`110030`, `110050`, commented `A-00`…`A-05`), each with the same four sections:
`初期化` (init), `派生射撃` (derived shots), `派生角度` (derived angles),
`速度` (speed).

`0.cns` spawns it:

```text
type = Helper
trigger1 = RoundState = 2 && var(9) = 0 && var(11)
ID = 10000
stateno = 110000 + var(9) * 10
```

`var(9)` is the machine type, so the chassis selects its own supporter shot.
`var(11)` is documented in the variable legend as
`射撃スイッチ` — the shooting switch — and is cleared again immediately after
firing, so it is a one-shot edge, not a held state.

### 4c.3 Shot shape

Inside state `110000` the supporter spawns two further helpers (`10001`,
`10002`) and offsets their angles:

```text
fvar(1) = -40      ; helper 10001
fvar(1) = +40      ; helper 10002
fvar(20) = Ifelse(var(25), 3.4, 5.0)
```

So the assist is a **1-or-3-way spread at ±40°**, travelling 3.4–5.0 units per
tick in the reference's 320-wide space. The narrower spread fires faster.

### 4c.4 Follow offset

A helper positions itself off its parent with:

```text
fvar(17) = Parent,Pos X - 20 * Parent,fvar(11) * Parent,facing
fvar(18) = Parent,Pos Y - Parent,var(9) - 20 * Parent,fvar(11)
```

`fvar(11)` is the weight class (`重量級`, 1.0 / 1.5 / 2.0). The supporter
therefore trails **behind the owner's facing and offset vertically, at a
distance that scales with how heavy the chassis is** — a heavier machine keeps
its helper further out.

### 4c.5 The supporter mirrors its owner

`sys.cns` repeatedly copies root state down into the helper:

```text
triggerall = IsHelper(112233)
var(22) = Root,var(22)     ; stage / gravity type
var(20) = Root,var(20)     ; flight mode
sysvar(4) = Root,sysvar(4)
```

The helper is not an independent actor. It inherits flight mode and stage state
from the machine it serves.

### 4c.6 Charge behaviour

`var(26)` is the `チャージシステム カウンター` — charge counter. Its rule is
worth copying because it shapes the pacing:

```text
; charge is cancelled outright while acting
triggerall = var(26) > 0
trigger1 = StateNo = [200,2100]
var(26) = 0

; otherwise it counts up, and the gain ramps in
trigger1 = var(26) = [1,30]
var(28) = Floor(var(26) / 10.0)     ; ramp-in over 30 ticks
trigger1 = var(26) > 30
var(28) = Floor(50 * (var(28)/PowerMax + 0.1))   ; steady rate
```

Charging only happens while the machine is *not* in an action state, any action
resets the counter to zero, and there is a deliberate ~30-tick ramp before the
full rate applies. Pressure denies charge; disengaging restores it.

### 4c.7 What this justifies in Reignition

| Reference finding | Reignition decision |
| --- | --- |
| Supporter is a visible separate entity (HUD 2) | A real simulated entity with its own position, not an effect on the chassis |
| Its gauge is drawn on it (HUD 4) | Readiness ring drawn at the drone, not a sixth corner gauge |
| Trails behind facing, offset scaled by weight | Follow offset scaled per chassis |
| Inherits flight mode from the owner | Follows the owner's depth/ground state; not independently targetable |
| Fires 1-or-3 way at ±40°, 3.4–5.0 u/tick | Per-chassis spread and speed, retuned to this game's scale |
| `var(11)` cleared right after firing | Assist fires on the pressed edge, never on hold |
| Charge zeroed by acting, ramps in over 30 ticks | Charge pauses while the owner attacks, and ramps back in |

Nothing above is reused as data or code; the numbers are recorded as evidence
for original tuning, exactly as in section 7.

---

## 5. 2011 and 2018/2020

* **2011** is a transitional MUGEN 1.0 build. Its value is content evolution:
  1056 loose `.png` and 666 `.pcx` files indicate the sprite pipeline was moving
  from palette-indexed to truecolour art. `.cns` count drops from 11 to 24 files
  but the same shared-engine pattern persists.
* **2018/2020** targets MUGEN 1.1 with `.lua` screenpack scripting and GLSL
  (`.vert`/`.frag`) — i.e. programmable presentation. `memo.txt` gives a full
  changelog from `2005/09/15 BETA版公開` to `2018/01/11 v1.1b8.1`, including
  `2017/09/02 v1.1b7 story-mode` and `2018/01/01 v1.1b8 20+players/pilots
  selectable`. `howto.html` links story, credits and per-character pages, and
  names the machine class **M.A.R.S. — "Machines of Assured Resourceful
  Structures"**, with factions UNION / RESISTAN / SPARTAN / FRONTIER / CURIA and
  a roster of 20 mechs each paired with a named pilot and Power/Speed/Range
  ratings.

This confirms the note's steer: **2005 for combat depth, 2018 for presentation
and campaign scope.**

---

## 6. Iron Babel: lessons, not code

The prototype is a single **4.47 MB `IronBabel.html`**, with three further
`.bak_*` copies of the same file (~4.46 MB each). That is precisely the
monolith CLAUDE.md forbids reproducing, and it is why this project is modular.

One artefact *is* worth keeping conceptually — `assets/mechs/rigs/light_exo.json`
expresses a rig as a bone table plus an explicit paint order:

```json
"bones": { "torso": { "parent": "root", "x": 0, "y": -10, "rotation": 0 },
           "fireWeapon": { "parent": "frontArm", "x": 70, "y": 4, ... } },
"drawOrder": ["backpack","rearLeg","meleeWeapon","rearArm","torso",
              "frontLeg","head","frontArm","fireWeapon"]
```

Parent + offset + rotation + a separate draw order is exactly the right shape for
a 2D multipart mech, and Reignition's `MechRigDef` adopts it (with a `follow`
field added so each part can track the chassis, the aim, or thruster load).

---

## 6b. Iron Babel (working build) — battle-system study

A later, working build of the Iron Babel fan game was supplied separately
(14.2 MB, 266 files, still a single 4.57 MB `IronBabel.html`). Unlike the copy in
the reference folder, its combat actually runs. Studied for **mechanics only** —
the monolithic architecture is still explicitly not to be copied, per CLAUDE.md.
Extraction was to a scratchpad outside the project; nothing from it ships.

### 6b.1 What its combat does

| Mechanic | Evidence | Notes |
| --- | --- | --- |
| **Damage-scaled hitstun** | `hitstun = max(10, min(54, 8 + damage*1.15 + (strong?8:0)))` | Systemic rather than authored per attack, with a hard clamp |
| **Post-hit invulnerability** | `target.inv = 2`, and `8` on a finisher | A couple of frames after every hit, stopping multi-hit lock |
| **Both sides gain meter on a hit** | `target.sat += damage*.35; source.sat += damage*.45` | The victim gains too — a comeback valve |
| **Melee lockout** | `player.meleeLockout = max(..., profile.lockout \|\| 66)`; `28` when a sequence breaks | Cooldown preventing endless sword pressure |
| **Overheat** | `player.overheat = max(overheat, 34)` after a melee sequence | A second cost on top of energy |
| **Lock-on melee** | `startLockOnMelee`, `meleeLock`, `nearestProjectileTarget`, reticle, `ml.phase`/`ml.maxLife` | The mech *homes* onto a locked target across a multi-swing sequence |
| **Melee cooldown formula** | `cooldown = 18 + hits*(swing+gap) + 8` | Derived from the move profile rather than hand-set |
| **Finisher shape** | `finishPush`, `finalLift`, attacker `vx = -face*max(5, finishPush*.28)`, `vy *= .45` | Launch plus attacker recoil, same shape as ours |
| **Barrier as a deployed field** | `Trap({barrier:true, followOwner:true, w:124, h:96, damage:6, knock:11, life:70})`, `barrierCooldown = 150` | A damaging field that follows you, not just an invuln burst |
| **Boost costs energy** | `boost = (satMode==="speed" && satActive ? 18.5 : 14.5) * mech.boost; spendEnergy(player, 16)` | Boost draws the *weapon* pool; Speed saturation raises it |
| **Per-character move quirks** | `superArmor`, `teleport`, `barrier`, `dash` flags patched per character/family | Data-driven identity |
| **Pull / stun-grab** | `pullToOwner`, `stunGrab`, `stunDuration`, `pullStrength` | A vacuum move class we have no equivalent of |
| **Traps / mines** | `Trap` class with `armed`, `armTimer`, `life` | Deployables |
| **Grappling hook** | `player.grapplingHook`, platform targeting | Terrain interaction |

Its saturation is the same three-mode idea as 2005 (`satMode === "speed"`), which
is good corroboration that the meter design in `docs/DECISIONS.md` D8 is right.

### 6b.2 Adopted

Three were clear improvements on what Reignition had and are now implemented:

* **Melee lockout.** We had no cooldown at all, so sword pressure could be
  maintained indefinitely. Now a finisher or a broken chain locks melee out.
* **Post-hit invulnerability.** A brief window after every hit, so overlapping
  multi-hit sources cannot chain-lock a mech.
* **Meter on damage taken.** The victim now gains saturation from being hit, so
  a losing pilot builds toward their overdrive.

### 6b.3 Considered and deferred

* **Damage-scaled hitstun** — attractive, but our hitstun is authored per attack
  and is what the frame-data tests assert. Worth revisiting as a *floor* applied
  on top of the authored value rather than a replacement.
* **Homing lock-on melee** — likely the biggest remaining feel improvement, and
  it matches 2005 too (which ran `posadd` toward the enemy during melee startup
  with ±15/±10 deadzones). Ours lunges along the soft-locked aim without
  correcting mid-swing.
* **Overheat**, **deployable barrier field**, **pull/grab class**, **traps**,
  **grappling hook** — all real content, all beyond the current slice's scope.

---

## 7. Rights and originality

* Reference folders are treated as read-only. Nothing in them was modified,
  renamed, reorganised or deleted.
* No reference sprite, sound, font, palette or archive is copied into this
  project. Every asset in `assets/` is generated from
  `tools/blender/build_mechs.py` and `tools/blender/build_arena.py`.
* All names are original to this project: the mechs **AV-07 HALCYON** and
  **AV-13 NOCTURNE**, pilots **NAIA VESK** and **HALDEN ROOK**, factions
  **CONCORD SKYWARD** and **EMBERLINE PACT**, arena **CATHEDRAL YARD**.
* What is reused is *mechanical design*, reimplemented from scratch: the
  hit-confirmed melee chain, barrier-absorbs-into-meter, a three-mode
  saturation resource, firing that anchors movement, and per-part aim/bank.

---

## 8. Summary of the model Reignition implements

1. Free 8-direction flight with normalised diagonals and a per-mech speed stat.
2. A dash that costs boost, multiplies speed, and cannot guard.
3. Firing that scales your velocity down for the duration.
4. Soft-lock auto-facing with a deadzone, plus manual aim override.
5. Tiered shots (light / heavy / motion-input beam) gated on energy, with
   directional motion variants and hold-to-autofire.
6. A sub-weapon on its own charge economy.
7. A melee chain on the main-gun button at close range: startup/active/recovery,
   a chain window, a hit-confirm gate, a rising hit cap under Speed saturation,
   a launching finisher, and immunity to barriers.
8. A barrier burst: brief action, generous invulnerability, converts absorbed
   shots into meter, and can cancel out of guard or hitstun for double cost.
9. A held guard with its own gauge and a guard break.
10. A saturation meter charged by time, by firing and by absorbing, spent on one
    of three selectable modes (Shield / Shoot / Speed).
11. Win by depletion, or on timeout by remaining life fraction.

Frame numbers, damage values and gauge sizes in `src/data/mechs.ts` are this
project's own tuning; the reference supplied the *structure* and the relative
relationships, which are cited in comments where they informed a value.
