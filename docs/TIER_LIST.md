# Roster tier list and matchup chart

Measured, not judged. Every number comes from `tools/probe/balance.ts` — each
machine against each other machine, **both slot orders on the same seed, 12
seeds**, at the real 180-second round cap. 84 samples per mech: about **0.03
standard error** on lead and **0.05–0.10** on an individual matchup.

```
npx vite-node tools/probe/balance.ts -- --tier extreme --seeds 12 --matrix
```

Current as of **D143**. `tools/probe/telemetry.ts` is the companion instrument:
same duels, same seeds, reporting *how* a machine spent its match rather than who
won it. Reach for it before proposing a fix — three OBELISK passes were spent on
reasoned hypotheses that each measured near zero, and VESPER's recorded diagnosis
turned out to name a mechanism that does not exist in the code.

## Two numbers, and they disagree

* **`win`** — the share of individual matches won. What a player experiences.
* **`lead`** — the life-bar *margin* a machine finishes ahead by, averaged over
  the field. Nominally the game's timeout tiebreaker, though no AI fight has ever
  reached the timeout — see §1.

They come apart whenever one matchup is lopsided or an ability converts losses
into narrow survivals, and **you have to read both**. Two live examples:

* **VESPER** tops the lead column at +0.088 and is *sixth of eight* on record at
  49 %. The entire margin is one matchup — across the other six he averages
  +0.028. Reading lead alone would call him the best machine in the game.
* **PYRE** was the reverse and it took a player to notice. −0.045, a near-even
  exchange rate and the flattest matchup row on the roster, on the worst record
  in the game. Every aggregate said mid-pack and the record said last, because
  she was bringing opponents to one hull point and a rule forbade her from
  finishing them (D121). **When the two columns disagree, something specific is
  happening — go and find it rather than averaging them.**

---

## 1. EXTREME

| Mech | Win | Lead | ± | z(lead/win) |
| --- | --- | --- | --- | --- |
| CIRRUS | **71 %** | +0.134 | 0.022 | +1.48 / +1.95 |
| VESPER | 57 % | +0.127 | 0.036 | +1.40 / +0.71 |
| HALCYON | 55 % | +0.010 | 0.028 | +0.11 / +0.45 |
| NOCTURNE | 41 % | −0.020 | 0.027 | −0.22 / −0.85 |
| OBELISK | 50 % | −0.020 | 0.028 | −0.23 / −0.03 |
| NULLTIDE | 44 % | −0.042 | 0.028 | −0.46 / −0.59 |
| PYRE | 43 % | −0.058 | 0.028 | −0.64 / −0.65 |
| **TERRAMOTH** | **40 %** | **−0.132** | 0.038 | −1.45 / −0.99 |

**spread 0.266.** lead SD 0.091 (true 0.086, 5 % measurement noise). **No
outliers** — the field is one population.

### The spread went 0.198 → 0.266, and it was bought

D127 left this at 0.198, the best figure ever measured on this roster. It is now
0.266, and the cost is traceable to one change: **making the lock a choice**
(D142). Removing "whichever is nearer" took it 0.181 → 0.250 in a single step.

That rule was never a targeting policy. It never made a rival *decide* to kill
an escort — it swung the aim onto whatever drifted in front, constantly and
incidentally, so escorts soaked stray damage all match long. It was, in effect,
a handicap applied to every machine, and removing it let the strong ones convert.

**Five attempts to pay it back are recorded in D143, and none worked.** The
per-lever ablation is in `tools/probe/targetablate.ts`; the summary is that
deliberate target choice cannot reproduce an incidental damage sink, and
restoring the distance rule as an AI policy measured *worse* (0.320 throttled,
0.221 per tick, CIRRUS flagged in both).

Kept by design decision: 0.266 with the field as one population, over 0.221 with
a flagged outlier. **The next move is a roster pass, not a targeting one** — the
same shape as D127, which reached 0.198 by fixing the machine at the bottom
rather than trimming the top.

### CIRRUS is the one to look at, and its damage is not the reason

71 % on record and +1.95σ on win rate — the closest anything has come to the flag
without crossing it. Its margin is **broad, not concentrated**: it beats every
machine on the roster and only TERRAMOTH holds it even (−0.01). That is the
opposite of VESPER, whose +0.127 is nearly all one pairing.

Telemetry says the cause is hit rate, not damage:

| | nominal dps | arrive | real dps | dist |
| --- | --- | --- | --- | --- |
| CIRRUS | 312.8 | **22.6 %** | **52.9** | **538** |
| HALCYON | 379.5 | 9.1 % | 38.7 | 670 |
| NOCTURNE | 381.8 | 6.5 % | 29.6 | 715 |
| OBELISK | 390.3 | 7.0 % | 24.6 | 685 |

**It throws less than three machines that lose to it** and lands roughly three
times the share. It also fights closest on the roster and takes the *least* stun
of anyone (14 %), so it is not paying the usual price for the range it chooses.

Trimming its attack values would be treating a variable that is not the cause.
The lever is whatever makes its output arrive — the eight-hit chain, its speed,
and whatever keeps its stun taken so low at 538 px.

## 2. Fairness

| | D117 | D118 | D120 | D126 | D127 | now |
| --- | --- | --- | --- | --- | --- | --- |
| Matchups inside ±0.10 — a real fight | 13/28 | 15/28 | 18/28 | 17/28 | 19/28 | **13/28** |
| Matchups beyond ±0.30 — a bad fight | 1/28 | 1/28 | 1/28 | 2/28 | 1/28 | **1/28** |

**Counted from the §3 chart, which was regenerated from the same run as §1.**

Fairness peaked at D127 and has given back everything it gained, landing on its
D117 figure. The single bad pairing is unchanged and is still **VESPER over
TERRAMOTH at +0.66** — see §5, and read D120 before touching it.

This is the same event as the spread: the lock rework removed a rule that was
incidentally taxing every machine, and pairings that were close only because both
sides were paying that tax are no longer close. Six matchups left the ±0.10 band;
none of them by a landslide, and the bad-fight count did not move.

## 3. The full chart — EXTREME

Row beats column. **Regenerated from the same run as §1**, which is the rule this
table exists under — it was allowed to drift through D125–D126 and was wrong by
up to 0.13 in a cell while the row table above it was exact, which put a bad
pairing out of sight and corrupted the §2 counts.

| | HAL | NOC | VES | TER | CIR | OBE | PYR | NUL |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **HALCYON** | — | −0.01 | +0.03 | +0.24 | −0.18 | +0.01 | +0.11 | −0.13 |
| **NOCTURNE** | +0.01 | — | −0.11 | −0.05 | −0.19 | −0.16 | +0.10 | +0.27 |
| **VESPER** | −0.03 | +0.11 | — | **+0.66** | −0.15 | +0.24 | +0.03 | +0.03 |
| **TERRAMOTH** | −0.24 | +0.05 | **−0.66** | — | +0.01 | +0.07 | −0.03 | −0.12 |
| **CIRRUS** | +0.18 | +0.19 | +0.15 | −0.01 | — | +0.18 | +0.09 | +0.15 |
| **OBELISK** | −0.01 | +0.16 | −0.24 | −0.07 | −0.18 | — | −0.00 | +0.19 |
| **PYRE** | −0.11 | −0.10 | −0.03 | +0.03 | −0.09 | −0.00 | — | −0.10 |
| **NULLTIDE** | +0.13 | −0.27 | −0.03 | +0.12 | −0.15 | −0.19 | +0.10 | — |

CIRRUS's row is the thing to notice: **positive against all seven**, and only
TERRAMOTH holds it even. VESPER's +0.127 lead is the opposite shape — take the
TERRAMOTH cell out and it averages +0.06.

## 4. HARD

| Mech | Win | Lead | z(lead/win) |
| --- | --- | --- | --- |
| CIRRUS | 64 % | +0.122 | +1.36 / +1.24 |
| VESPER | 51 % | +0.059 | +0.66 / +0.13 |
| NULLTIDE | 54 % | +0.048 | +0.54 / +0.30 |
| HALCYON | 62 % | +0.010 | +0.11 / +1.03 |
| OBELISK | 54 % | −0.002 | −0.02 / +0.30 |
| PYRE | 44 % | −0.019 | −0.21 / −0.50 |
| NOCTURNE | 43 % | −0.033 | −0.37 / −0.61 |
| **TERRAMOTH** | **28 %** | **−0.185** | **−2.06 / −1.89  ← outlier** |

**spread 0.306.** TERRAMOTH has been the weakest machine at HARD in every
measurement taken across four sessions, before and after every change — left
alone by design decision, see §5 and D120.

### TERRAMOTH is now flagged at HARD, and it is one matchup

It was **−1.89σ** before D127 and is **−2.14σ** after — the first flagged outlier
in any sweep on this roster. The cause is not diffuse. NOCTURNE–TERRAMOTH at HARD
went from a dead-even 0.00 to **+0.22** for NOCTURNE, and 0.22 spread over seven
opponents is 0.031 of mean lead, which is exactly the drop observed
(−0.144 → −0.175). Field mean lead is zero by construction and the field SD
barely moved, so nothing else is involved.

Three things about it, and none of them is that it does not matter:

* **It does not discriminate between the swept values.** All three flag TERRAMOTH
  at HARD (−2.12σ, −2.14σ, −2.06σ), and its response across them is flat within
  one standard error. A smaller NOCTURNE change would not have avoided this.
* TERRAMOTH was already at the edge. Any change lifting the bottom crosses it.
* **At EXTREME it does not happen at all** — TERRAMOTH is −0.082 → −0.080 there,
  and NOCTURNE's gain comes out of OBELISK and VESPER instead.

**No compensating change was bundled with D127.** If this is to be addressed it
gets its own sweep and its own entry — D125 is why.

---

## 5. The one bad matchup, and why it stays

**VESPER over TERRAMOTH, +0.58.** Not an excess in any single dial — measured
separately, VESPER's stance cut puts it at +0.50, his dash at +0.40 and his
stance mobility at +0.50, each alone. The only change that leaves it alone
(+0.13) is the one that made him *slower*. Any mobility at all breaks it: the
slowest machine on the roster cannot answer a marksman who can disengage.

**Kept, by design decision** (D120). Do not "fix" it without re-reading D120
first.

### The reasoning D120 rests on has decayed, and this is the record of it

D120 kept the matchup because TERRAMOTH was paying for it elsewhere: it outlasted
the field through bulk and trading. **Every number that argument was built on has
moved against it**, and none of the movement is D127's — TERRAMOTH went 42 % →
40 % across that change, while the decay below accumulated over D121–D126.

| | at D120 | now |
| --- | --- | --- |
| Exchange rate | 76.7 out / 76.5 in — *the most even on the roster* | **76.0 out / 82.6 in, net −6.6** |
| Matchup row excluding VESPER | **+0.063**, above average | **+0.003**, dead average |
| Losses excluding VESPER | two, marginal | **three** |
| Win rate at EXTREME | 52 % | **40 %** |
| At HARD | −1.89σ, inside the flag | **−2.14σ, flagged** |

The decision may still be the right one — bulk is a real identity and the fix
options in D120 all measured badly. But it should be **re-decided on these
numbers rather than inherited from those**, and that is a design call, not a
tuning one.

## 6. What is left

1. **CIRRUS at the top**, 71 % and +1.95σ on win rate — the closest anything has
   come to the flag without crossing it. Broad rather than concentrated: it beats
   all seven and only TERRAMOTH holds it even. Telemetry says the cause is
   **hit rate, not damage** — it throws less than three machines that lose to it
   and lands three times the share, at the closest range on the roster, while
   taking the least stun of anyone. Its attack values are the wrong lever.
2. **Spread 0.198 → 0.266**, bought deliberately in D142 and not yet paid back.
   D143 records five measured attempts that failed. The next move is a roster
   pass in the shape of D127 — fix the bottom rather than trim the top — not
   another targeting change.
3. **TERRAMOTH at HARD**, 28 % and −2.06σ, still the only flagged outlier
   anywhere and still out of scope by design decision (D120). §5 records that
   every number that decision rested on has decayed.
4. **Acid is carried by nobody.** `Element.Corrosive` is implemented and applied
   by no weapon on the roster.
5. **The lance connects 1–2 % of the time for every machine**, which the rival's
   inability to choose a command motion (§8d) explains and does not excuse.
