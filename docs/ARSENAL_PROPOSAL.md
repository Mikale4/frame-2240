# Arsenal proposal — projectiles, patterns, melee

**Status: proposal. Nothing here is built.** For review before implementation.

Reasoned from each machine's *own design* — mass, frame, role, and what its yard
built it to do — following the TERRAMOTH example: a heavy excavation frame should
throw heavy things, carry a large reactor, and fight with a digging tool rather
than a sword.

---

## 1. What already exists, so we extend rather than duplicate

Two things are further along than they look, and one is further behind.

**Melee weapons are already eight distinct designs**, modelled, rigged and
named — `beam`, `claw`, `bayonet`, `pile`, `twindagger`, `ramshield`, `cleaver`,
`glaive`. **TERRAMOTH already has no sword**: it carries a 2-hit pile driver,
which is an excavation tool. The gap is not the weapons. It is that only **three
motions** exist (`thrust`, `piston`, `bash`) plus a generic swing, so a pile
driver and a glaive animate almost identically.

**Five spawn patterns exist**: `line`, `stack`, `bundle`, `ripple`, `arc`. But
**every weapon on the roster uses `line`** — the other four are used only by
drones and effects. Half the existing system is unused.

**Every machine carries the identical seven slots** — main, heavy, lance, spread,
sub, salvo, meleeLock. That is the real uniformity problem: the roster differs in
numbers, not in kind.

## 2. The framework: two axes, and only one of them exists

The current `pattern` field is **spawn-time only** — it sets where a projectile
starts, at what angle and speed, and then never touches it again. Everything the
brief asks for beyond spread (spiral, ricochet, displacement, tracking,
side-swipe) is a **flight-time** behaviour and needs a second, independent axis.

Proposed: keep `pattern` as the launch shape, add `behaviour` for what a round
does *after* it leaves the barrel. Any weapon can combine one of each.

| axis | existing | proposed additions |
| --- | --- | --- |
| **`pattern`** — launch shape | line, stack, bundle, ripple, arc | **wall** (abreast, released together), **column** (single file, timed), **burst** (radial, all angles) |
| **`behaviour`** — flight | *(none; only `homing`)* | **ballistic** (gravity), **ricochet** (bounces, with a count), **spiral** (orbits the flight axis), **wave** (lateral sine — side-swipe), **drift** (lateral acceleration — displacement), **seek** (true tracking, distinct from current weak homing), **bloom** (splits into children), **linger** (stops and persists as a hazard) |

This is what makes variety cheap: 8 patterns × 8 behaviours is a large space from
two small enums, and each is a few lines in the projectile update.

---

## 3. Per machine

### TERRAMOTH · HV-03 · Ironwake · 2490 hull · the slowest thing in the sky
*Excavation walker rated for seam collapse and falling ore.*

The frame is a mining platform with guns bolted on. It has the largest hull, the
lowest speed, and a **defence bonus while grounded** that nothing else has — it
is the one machine the game already rewards for planting its feet.

* **Projectiles — heavy and ballistic.** Its MORTAR should actually *arc*
  (`ballistic`), the only weapon in the game affected by gravity. That gives it a
  unique threat: it can shell a position it cannot see straight to, and a target
  that closes underneath it is safe from the mortar — a real trade.
* **Beam — SEISMIC CUTTER**, replacing BREACH LANCE. Slow charge, wide, and
  **only fires while grounded**, paying off the passive nobody exploits. A
  sustained cutting beam, not a lance: it is a rock-cutting tool.
* **Pattern — `wall`.** GRAPESHOT's seven pellets abreast, released together, a
  moving barrier rather than a cone.
* **Melee — keep the pile driver, make it read.** Single enormous piston blow
  with a long wind-up, a hard stop, and **deck cracking on contact** if grounded.
  Not a combo. One hit that hurts.
* **Animation** — the slowest in the game: 40-tick wind-up, 6-tick strike,
  recoil that shoves TERRAMOTH backwards.

### OBELISK · GD-09 · Ironwake · 2070 hull · guard pattern, yard defence
*Built to hold a position, not to take one.*

Already carries the only mines on the roster and a dome drone. Its identity is
**area denial**, and it is the machine whose weapons should not need aiming.

* **Projectiles — placed, not fired.** Mines are already there; they should
  `linger` properly as persistent objects with an arming delay.
* **Pattern — `wall` and `column`.** MINEFIELD laid as an evenly spaced barrier
  across the lane rather than three shots forward. This is the clearest example
  of a pattern that is *tactically* different rather than cosmetically.
* **Beam — AEGIS REPULSOR.** Short, wide cone rather than a lance. Pushes rather
  than pierces: heavy knockback, low damage. A door-closing weapon.
* **Melee — ramshield.** Shield-edge bash with `drift`: OBELISK advances *through*
  the hit. Two heavy hits, enormous guard damage, poor reach.
* **Animation** — a braced shove: no wind-up above the shoulder, all of it
  forward from the hips.

### CIRRUS · LT-21 · Free Latitude · 1440 hull · the fastest frame
*Salvage-built, boost regen ×2, eight-hit melee, OVERDRIVE.*

Lightest, fastest, least armoured, already has the longest melee chain. Its
identity is **volume and motion**.

* **Projectiles — small, fast, many.** Rice bullets: TWIN SMG as a genuine
  high-rate stream of tiny rounds, individually trivial.
* **Behaviour — `wave`.** Rounds that oscillate laterally as they travel — the
  side-swiping pattern, and thematically right for a pilot who never flies
  straight. Cheap to dodge one, hard to dodge forty.
* **Pattern — `spiral`** on the salvo: a corkscrew of darts around the aim axis.
* **Melee — twin daggers, and it should be the flurry.** Eight hits is already
  the most; it should *look* like the most. Alternating left/right, each hit
  tiny, the chain doing the work.
* **Animation** — the only machine with smear frames and a visible blade trail.
  If one melee in the game reads as fluid, this is the one to spend it on.

### VESPER · AV-12 · Concord · 1490 hull · marksman
*Damage ×1.14, SNIPER MODE, SIGHTLINE paints targets.*

The one machine that wants to be far away, and the only one with a **paint**
mechanic that currently does very little.

* **Projectiles — one round, very fast, very thin.** RAILNEEDLE with a long
  tracer and near-flat travel. Already the highest projectile speed; lean in.
* **Behaviour — `seek`, but only on painted targets.** This is the proposal I
  like most: SIGHTLINE paints, and VESPER's shots track *only what is painted*.
  It turns an inert mechanic into the machine's whole identity and gives the
  drone a reason to exist beyond a stat line.
* **Pattern — none. Deliberately.** VESPER should be the machine with no spread
  weapon worth using. Its FLECHETTE is an admission of failure at close range.
* **Melee — bayonet, and it is a *disengage*.** Two hits: a jab and a
  thruster-assisted shove that puts distance between them. It should not be a
  combo, because winning at melee range is not a thing this frame does.
* **Animation** — economical, almost reluctant. Fewest frames on the roster.

### NOCTURNE · AV-13 · Emberline · 1750 hull · rebuilt line-holder
*"Guard through incoming fire instead of spending thrust on evasions."*
*The claw began as a salvage grapple.*

* **Projectiles — sustained, not burst.** The rotary cannon should **spin up**:
  fire rate climbing while held, falling when released. Nothing else on the
  roster has a warm-up, and it suits a machine built to stand and hold.
* **Behaviour — `drift`.** Recoil walks the stream sideways as it fires, so
  holding the trigger sweeps an area. Emergent, physical, and free of aiming.
* **Pattern — `column`** on SLUG: single-file heavy rounds on a timer.
* **Melee — the claw is a grab, and the Archive says so.** "Closes, holds and
  finishes the compression cycle." Three stages where the middle one **holds the
  opponent in place**. That is a mechanic no other machine has, already written
  into the lore, and currently rendered as an ordinary swing.
* **Animation** — heavy and mechanical, with a genuine hold frame in the middle.

### HALCYON · AV-07 · Concord · 1750 hull · general service
*"Recorded performance remains within the middle band."*
*Pilot surveys object to the word unremarkable.*

The baseline. Its identity is that it has no identity — and that should be
deliberate rather than accidental.

* **Everything textbook.** HALCYON is where each pattern appears in its clean,
  unmodified form: `arc` spread, `ripple` salvo, plain `line` main. It is the
  machine you learn the vocabulary on.
* **Melee — the beam saber stays.** Six hits, longest reach of any blade, and it
  should remain the most *reliable* chain: the least likely to whiff, the
  easiest to confirm.
* **Animation** — correct fencing form. Not flashy. The reference against which
  the others read as strange.

### PYRE · IN-05 · Ashfall · 1860 hull · incendiary
*"Built for short engagements and replacement from contract revenue."*
*Saturation gain ×1.8 — it wants the fight loud and brief.*

* **Projectiles — nothing it throws should stop existing on impact.**
  `linger` is PYRE's behaviour: CINDER JET leaves burning air, FIREBOMB leaves a
  pool, NAPALM POD leaves a wall.
* **Behaviour — `ricochet`** on FIREBOMB: it bounces along the deck, leaving fire
  at each impact. The deck became solid in D125 and nothing uses it.
* **Pattern — `burst`** on FIRESTORM: radial, all angles, no aiming. A machine
  that is paid by the engagement does not aim carefully.
* **Melee — the cleaver sets fire.** Three hits, each applying Incendiary, the
  third detonating stacks already applied. Rewards the burn it already causes.
* **Animation** — wide sweeping arcs that leave a fire trail hanging in the air
  behind the blade.

### NULLTIDE · EW-14 · Free Latitude · 1610 hull · electronic warfare
*Halves the opponent's energy regeneration. Carries three of the four elements.*
*Two decoys.*

* **Projectiles — fields, not bullets.** DISRUPT NET should expand as it travels
  and pass *through* the target applying a status rather than damage.
* **Behaviour — `spiral`.** Orbiting charges circling the aim axis, and — better
  — **orbiting NULLTIDE itself**, a defensive ring of static that punishes
  approach. It is the machine whose weapons should not travel in straight lines.
* **Pattern — `burst` and `column`**, and its decoys should be able to fire the
  same patterns, so a player cannot tell which NULLTIDE is real from the
  projectiles alone. That is an EW machine using EW.
* **Melee — the glaive at reach.** Five hits, longest non-beam reach, each
  applying a different status: shock, cryo, then a finisher that strips barrier.
* **Animation** — fluid, whipping, with arcs of electricity between hits.

---

## 4. What this needs

1. **A `behaviour` field on `AttackDef`** plus the update-side switch in the
   projectile step. This is the load-bearing change; every proposal above depends
   on it. Note `Combatant.fire` builds its spawn field by field (§8b) — a new
   property must be copied there or it never reaches the projectile.
2. **Three new spawn patterns** — `wall`, `column`, `burst` — in the existing
   switch. Cheap.
3. **Melee motion types** beyond `thrust`/`piston`/`bash`: `flurry`, `grab`,
   `shove`, `sweep`, and per-motion frame counts so a pile driver and a dagger
   are not the same animation at different speeds.
4. **Persistent-object support** for `linger` (mines already approximate this;
   fire pools and static rings would share it).

## 5. Order I would build it in

1. `behaviour` axis + `ballistic`, `ricochet`, `wave` — three behaviours prove
   the framework and are immediately visible.
2. `wall` / `column` / `burst` patterns.
3. Melee motions and per-weapon frame counts — the biggest readability win.
4. `seek`-on-painted for VESPER and the NOCTURNE grab, the two proposals that
   turn existing inert mechanics into identities.
5. `linger` and persistent hazards.

**Balance warning.** Every one of these changes matchup outcomes. The roster is
currently at spread 0.198 with no outliers, which is the best it has measured.
Expect to re-sweep after each step rather than at the end — §5 of the tier list
records that at this spread, record is a very sensitive function of margin.
