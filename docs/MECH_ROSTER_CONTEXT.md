# Mech Roster — Context Pack

Everything an outside artist or model needs to know about the eight machines,
their pilots and where they came from, in order to author **surface textures**
for them.

Companion to `docs/PROMPT_MECH_TEXTURES.md`, which is the prompt itself. Attach
both. `docs/CATHEDRAL_YARD_CONTEXT.md` is the equivalent pack for the stage.

**This document is internal.** It states things the game deliberately withholds
from the player — see §7.

---

## 1. What is being asked for, in one paragraph

The eight machines are 3D models in Blender, rendered to flat sprite parts. They
are painted from a fixed per-machine palette in code. What this pack is for is
the **surface** on top of that paint: the scuffing, the oxide, the panel work,
the soot, the bare alloy showing through. That surface is currently **one shared
set of three greyscale maps used by all eight machines**, and the fiction says it
should not be. Five powers build and maintain hardware five different ways, and
the roster is wasting that.

**You are not being asked to draw the mechs.** You are being asked to author
tiling surface material — the equivalent of a worn-paint photo scan — that gets
projected onto them.

---

## 2. The world, briefly

The ground was lost generations ago. Everyone lives on **yards**: industrial
platforms held above a permanent cloud deck by networks of lift spars. The year
is **43 CE**. Five powers share that sky.

It is cold, industrial, salt-damp and worn. Machines live outdoors on open decks
in weather. Nothing is clean, nothing is new, and nothing is abandoned either —
these are all *working* machines that somebody is responsible for.

Matches are fought on **CATHEDRAL YARD**, an abandoned high-altitude drydock held
by no power, which is why disputes get settled on it. Its practical lighting is
**sodium — hue ≈ 30°**, warm. Any grime tone authored here should sit in that
family so the machines read as native to the place.

---

## 3. The five powers — this is the part that drives the textures

Taken from the in-game Archive's own text, not invented. **Each of these is a
different theory of how a machine should be looked after**, and that is the
distinction the textures have to carry.

### CONCORD SKYWARD — *maintained to a standard*
The oldest continuous authority above the deck, and the only one with a published
doctrine and central certification. Its airframes are committee designs put
through extended trials, standardised broadly, with unusual behaviour revised out
before issue. **Reliability is recorded as the first requirement and distinction
as a secondary one.**

**Surface reading:** even factory paint, crisp regular panel work, sharp
fastener lines, very little corrosion. Wear where hands and hardpoints go, not
everywhere. This machine has a maintenance schedule and somebody signs it.

Carries: **HALCYON**, **VESPER**.

### IRONWAKE COLLIERY — *industrial plant that was handed a gun*
Files as an extraction concern with convoy protection duties. Its first armed
frames were **excavation walkers already rated for seam collapse and falling
ore**. It uses crew grades, shift assignments and equipment patterns where other
powers use ranks and combat types. Operators are entered as **crew, not
soldiers**, and conversion sheets retain the original trade classification.

**Surface reading:** the most beaten hardware on the roster. Thick paint applied
in layers and chipped down through them. Impact scarring and gouges — rock
damage, not battle damage. Ore dust packed into every recess. Real oxide.

Carries: **TERRAMOTH**, **OBELISK**.

### THE EMBERLINE PACT — *a machine with a paint history*
A defensive agreement among yards subject to Concord control measures. Its
machines include **Concord airframes transferred under settlement terms, rebuilt
to Pact standards and returned to service without Concord certification.** Thirty
frames were stripped to the main spar within two years of transfer.

**Surface reading:** the tell is *mismatched paint age*. Panels resprayed at
different times in slightly different mixes, so the machine drifts in tone across
its own body. Corrosion that was **painted over rather than cured**, blistering
back through from underneath. Competent work done without the original factory's
blessing or its materials.

Carries: **NOCTURNE**.

### FREE LATITUDE — *no two are alike*
Supplies no central description. Independent crews operating frames **assembled
from salvage, copied patterns and recovered systems**. Individual machines differ
substantially — the LT-21 pattern passed yard to yard and no two completion
sheets describe the same fit. Concord calls the same crews pirates in enforcement
notices and authorised visitors in docking returns; both forms remain current.

**Surface reading:** **barely painted at all.** Bare alloy, brushed and scuffed.
Critically, **bare metal scuffs *bright*, not dark** — this is the one faction
whose wear lightens the surface. Mismatched panels from different donor hulls.
Low corrosion, because salvage crews run corrosion-resistant recovered stock;
they just never finish it.

Carries: **CIRRUS**, **NULLTIDE**.

### THE ASHFALL IRREGULARS — *costed for ninety seconds*
A contract force that accepts work from all four other powers, sometimes in the
same month. Deployment, ammunition, hull loss and mission failure are **priced
separately**. Its frames are built for short engagements and replacement from
contract revenue.

**Surface reading:** cheap thin paint over unprepared metal, no refit budget.
**Soot rather than rust** — and on PYRE specifically, scorching from its own
incendiary weapon. Heat discolouration around the muzzle and vents. This machine
is not expected to last and its finish knows it.

Carries: **PYRE**.

---

## 4. The eight machines

Palette hex is **approximate sRGB for orientation only** — the authority is the
float triple in `PALETTES` in `tools/blender/build_mechs.py`. **Do not author
colour.** These are listed so you know what your greyscale map will be sitting
on top of, and can judge whether your contrast will survive against it.

| Mech | Faction | Pilot | Identity | Accent | HP | Role |
| --- | --- | --- | --- | --- | --- | --- |
| **HALCYON** `AV-07` | Concord | Naia Vesk | azure `#1A70DB` | orange `#FF5C0F` | 1750 | All-round interceptor |
| **NOCTURNE** `AV-13` | Emberline | Halden Rook | crimson `#D1291A` | cyan `#1AEBDB` | 1750 | Heavy assault, line-holder |
| **VESPER** `AV-12` | Concord | Kestrel Doyne | teal `#2EA8A1` | sulphur `#F2E04D` | 1490 | Marksman, longest lock range |
| **TERRAMOTH** `HV-03` | Ironwake | Brunn Okonkwo | ochre `#996B2E` | amber `#FFC24D` | 2490 | Siege walker, heaviest and slowest |
| **CIRRUS** `LT-21` | Free Latitude | Mira Holloway | silver `#D9DEE8` | cyan `#4AD6FF` | 1440 | Skirmisher, fastest and frailest |
| **OBELISK** `GD-09` | Ironwake | Saar Tengku | violet `#6E5EA8` | lilac `#C7B5FF` | 2070 | Bulwark, largest barrier |
| **PYRE** `IN-05` | Ashfall | Rasa Volkov | orange `#E8751C` | pale gold `#FFE066` | 1860 | Incendiary brawler |
| **NULLTIDE** `EW-14` | Free Latitude | Io Senna | slate `#243B4A` | cyan `#8AFFE0` | 1610 | Electronic warfare |

**The identity hue has to dominate the surface** — eight machines must be
distinguishable instantly at gameplay scale. This is the single binding
constraint on everything in this pack and it is why textures here are never
allowed to carry colour.

### Per-machine origin notes that should change the surface

**HALCYON `AV-07`** — Delivered eleven years late at four times the approved
development cost, and accepted anyway; no full redesign has been authorised
since. Middle-band in every category. Pilot surveys object to the word
*unremarkable* more often than opposing-action reports do. *The best-maintained
machine in the game, and the most boring surface. That is correct — let Concord
be dull.*

**VESPER `AV-12`** — Long-sightline specialist. Reach was bought with structure:
**second-thinnest hull in service**. Forty airframes built; production ended
because suitable pilots ran out below the hull count. Nine pilots certified, five
lost, three withdrew before flying, one remains active. *Concord finish, but on a
frame with visibly less material — the surface should feel thin over its
structure.*

**NOCTURNE `AV-13`** — A Concord AV-13 stripped to the main spar and rebuilt one
fifth heavier. The rotary cannon is the visible alteration; the structural work
matters more. Concord's formal objection is still filed with the rebuild sheets
as an external attachment. *The strongest respray-history read on the roster.*

**TERRAMOTH `HV-03`** — **Pattern 3 walkers cut ore for sixty years before
armament work began.** Rock-fall plate and collapse tolerances belong to the
excavation design. The siege repeater is fitted at the former cutting-head mount;
mortars sit in both spoil hoppers; the pile driver was simply left in place. *Six
decades of mining damage under a weapons conversion. The most extreme surface in
the game.*

**OBELISK `GD-09`** — The Colliery's only blank-sheet combat design, and the one
Ironwake machine that was never a mine walker. Yard crews enter it as **door
equipment** on local watch sheets. Inspection returns list barrier hours before
ammunition. *Ironwake finish, but standing-watch wear rather than excavation
scarring — weathered by being outdoors for twenty years, not by being hit with
rock.*

**CIRRUS `LT-21`** — No production line; the pattern passed yard to yard.
Completion count is 20 on one copy and 21 on another. `armour, fitted: 30 kg`.
Concord classifies the pattern as unsurvivable and declines certification; no
request for certification is attached. *The one genuinely unpainted machine.
Bare alloy is the entire look.*

**PYRE `IN-05`** — The fifth frame entered under the name; the preceding four are
in the wreck ledger. Costing assumes a decisive engagement **within ninety
seconds** and excludes service life beyond the active contract. *Scorched by its
own weapon. Soot, not oxide.*

**NULLTIDE `EW-14`** — The fourteenth and final airframe of a closed
electronic-warfare programme. Thirteen sisters were struck; this one went
unaccounted for and reappeared in Free Latitude service. **Programme hulls
carried no maker's plate** — the omission was specified, to allow operational
denial. *Free Latitude bare-alloy treatment over a machine built to be
untraceable. Nothing stencilled, nothing stamped, no plate anywhere.*

---

## 5. The pilots

Included because the machine is maintained by the person flying it, and on this
roster that shows. **Mechs are "it". Pilots get their own pronouns.** Full
character detail is in `docs/PILOT_PORTRAIT_SPEC.md` and
`docs/PROMPT_PILOT_PORTRAITS.md`.

| Pilot | Machine | | Bearing, and what it does to the finish |
| --- | --- | --- | --- |
| **Naia Vesk** | HALCYON | woman, early 30s | Third-generation service, eleven years without losing a hull. Exacting about procedure because a fault nobody corrected in time killed her mother. **Her machine is immaculate and that is a character trait.** |
| **Halden Rook** | NOCTURNE | man, late 40s | Oldest of the cast. Trains new pilots, lowest first-year loss rate in the sky. Blunt, unbothered. **Maintains what matters and lets the paint go.** |
| **Kestrel Doyne** | VESPER | man, late 20s | Six years of survey work before flying. Very still; says nothing on the channel for the opening minutes. **Nothing on his machine is out of place, because nothing about him is.** |
| **Brunn Okonkwo** | TERRAMOTH | man, 50s | Thirty-one years on the same class of equipment, twenty-six cutting ore. Declined a commission three times on the grounds that he already had a job. **He is at work.** |
| **Mira Holloway** | CIRRUS | woman, early 20s | Yard-born. Built her first machine at seventeen from three wrecks and a stolen reactor, then published her weapon improvement for free with fitting measurements. **Rebuilt constantly, finished never.** |
| **Saar Tengku** | OBELISK | man, 40s | Twenty years standing the same watch over the same three yards, a posting he requested twice. Eleven commendation braids, each for a position held. **Weathered in one place.** |
| **Rasa Volkov** | PYRE | woman, mid 20s | Holds her company's record for contracts completed *and* for machines destroyed. Stopped requisitioning cleaning after the second wreck and **calls the soot part of the uniform**; other crews copy it. |
| **Io Senna** | NULLTIDE | woman, 30s | No personnel file exists anywhere; her record was erased by someone never named. Pilots who have fought her describe it as *being catalogued*. **Deliberately unmarked, and that is a decision.** |

---

## 6. How the textures are actually used — the binding technical facts

Read `docs/PROMPT_MECH_TEXTURES.md` for the full spec. The four facts that most
change what you should author:

1. **The meshes carry no UV maps.** Everything is **box-projected in object
   space**, so a tile lands on all six faces of a part at arbitrary orientations
   and mirrorings. **Nothing directional, nothing readable, nothing with a
   top or bottom.** No text, no logos, no arrows, no stencils — they would appear
   backwards, sideways and repeated.
2. **Maps drive masks, roughness and bump — never albedo colour.** Photographic
   colour would pull all eight machines toward the same brown-grey and destroy
   the roster's readability. Deliver greyscale.
3. **A part occupies 35–100 logical pixels on screen.** Detail finer than that
   becomes halftone mush. What matters is whether the **large-scale** structure
   survives a brutal downsample; the current maps retain roughly 88 % of their
   contrast down to 32 px, and that is the bar.
4. **The stage is painted, not photoreal.** Photoreal machines would clash with
   it in a new direction. Semi-realistic weathered painted steel is the target —
   see `docs/CATHEDRAL_YARD_CONTEXT.md` §4.

---

## 7. Canon constraints — do not violate these

* **`2240` is a survivor count, not a year, and the misreading is deliberate.**
  It is the number of people taken off Stillwake alive on the lift Halden Rook
  held open. The player is *meant* to read the title as a date until late.
  **Nothing player-facing may gloss it** — no comma, no caption, no memorial
  framing. Do not put it on a machine.
* **NULLTIDE carries no maker's plate**, by specification. Do not add one.
* **Mechs are "it".** Pilots get their own pronouns.
* **The present is 43 CE.**
* Art direction already settled and **not to be re-proposed**: no cel shading, do
  not darken the mechs toward the stage, do not model energy as geometry.
* **Original work only.** No real manufacturer marks, no existing mecha
  franchise's design language, insignia or house style.
