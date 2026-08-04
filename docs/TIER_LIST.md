# Roster tier list and matchup chart

Measured, not judged. Every number comes from `tools/probe/balance.ts` — each
machine against each other machine, **both slot orders on the same seed, 12
seeds**, at the real 180-second round cap. 84 samples per mech: about **0.03
standard error** on lead and **0.05–0.10** on an individual matchup.

```
npx vite-node tools/probe/balance.ts -- --tier extreme --seeds 12 --matrix
```

Current as of **D127**. `tools/probe/telemetry.ts` is the companion instrument:
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
| CIRRUS | **65 %** | +0.118 | 0.022 | +1.69 / +1.94 |
| VESPER | 56 % | +0.094 | 0.034 | +1.34 / +0.80 |
| OBELISK | 51 % | +0.004 | 0.026 | +0.06 / +0.08 |
| HALCYON | 50 % | −0.019 | 0.021 | −0.28 / +0.04 |
| NOCTURNE | 45 % | −0.032 | 0.026 | −0.46 / −0.69 |
| PYRE | 44 % | −0.039 | 0.022 | −0.56 / −0.76 |
| NULLTIDE | 49 % | −0.046 | 0.025 | −0.66 / −0.19 |
| **TERRAMOTH** | **40 %** | **−0.080** | 0.033 | −1.14 / −1.22 |

**spread 0.198.** lead SD 0.070 (true 0.065, 8 % measurement noise). **No
outliers** — the field is one population.

### The spread went 0.143 → 0.230 → 0.198

It rose to 0.230 for two deliberate reasons. **The deck became solid** (D125) —
the game had been balanced around a floor that did not exist in flight, and
putting it back cost 0.075 for machines and 0.019 for rounds. **OVERDRIVE went
back to 5.5 seconds** by request (D126), which is most of the rest.

It then fell to **0.198 — the lowest figure measured on this roster since the
deck became solid** — by fixing the machine at the bottom rather than by trimming
the top (D127). NOCTURNE went 33 % → 45 % on projectile speed alone.

**At this spread, record is a very sensitive function of margin.** VESPER gained
4.5 % output against 2.3 % intake from the deck, and that moved him eight points
of win rate. Expect any mechanical change to read as a balance event.

## 2. Fairness

| | D117 | D118 | D120 | D126 | now |
| --- | --- | --- | --- | --- | --- |
| Matchups inside ±0.10 — a real fight | 13/28 | 15/28 | 18/28 | 17/28 | **19/28** |
| Matchups beyond ±0.30 — a bad fight | 1/28 | 1/28 | 1/28 | 2/28 | **1/28** |

**The D126 column is a correction.** It was recorded as 15/28 and 1/28, computed
off the §3 chart below — which had gone stale against its own §1 row table and
was under-counting. Re-measured from the same run as the rows, D126 was 17/28 and
**2/28**: the deck change had quietly created a second bad pairing,
NOCTURNE–OBELISK at −0.33, and the stale chart was showing it as −0.20.

D127 closed exactly that one. The single bad pairing is once again **VESPER over
TERRAMOTH at +0.58**, kept by design decision — see §5, and read D120 before
touching it.

Fairness peaked at D120, gave some back in D121 (making every element damage
moved several pairings, most of them NULLTIDE's, who carries three of the four
elements in the game), and is now at its best recorded value.

## 3. The full chart — EXTREME

Row beats column. **Regenerate this from the same run as §1 whenever §1 moves.**
It was allowed to drift out of step through D125–D126 and was wrong by up to 0.13
in a cell while the row table above it was exact, which put a bad pairing out of
sight and corrupted the §2 fairness counts.

| | HAL | NOC | VES | TER | CIR | OBE | PYR | NUL |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **HALCYON** | — | 0.00 | −0.05 | +0.08 | −0.17 | +0.01 | +0.06 | −0.07 |
| **NOCTURNE** | 0.00 | — | +0.02 | −0.18 | −0.08 | −0.09 | −0.06 | +0.17 |
| **VESPER** | +0.05 | −0.02 | — | **+0.58** | −0.24 | +0.21 | +0.03 | +0.05 |
| **TERRAMOTH** | −0.08 | +0.18 | **−0.58** | — | +0.05 | −0.09 | +0.02 | −0.06 |
| **CIRRUS** | +0.17 | +0.08 | +0.24 | −0.05 | — | +0.18 | +0.08 | +0.14 |
| **OBELISK** | −0.01 | +0.09 | −0.21 | +0.09 | −0.18 | — | +0.05 | +0.20 |
| **PYRE** | −0.06 | +0.06 | −0.03 | −0.02 | −0.08 | −0.05 | — | −0.10 |
| **NULLTIDE** | +0.07 | −0.17 | −0.05 | +0.06 | −0.14 | −0.20 | +0.10 | — |

## 4. HARD

| Mech | Win | Lead | z(lead/win) |
| --- | --- | --- | --- |
| CIRRUS | 65 % | +0.109 | +1.33 / +1.31 |
| VESPER | 50 % | +0.034 | +0.41 / −0.03 |
| NULLTIDE | 55 % | +0.031 | +0.38 / +0.41 |
| OBELISK | 55 % | +0.028 | +0.34 / +0.44 |
| HALCYON | 60 % | +0.018 | +0.23 / +0.82 |
| NOCTURNE | 48 % | −0.013 | −0.16 / −0.21 |
| PYRE | 39 % | −0.033 | −0.40 / −0.93 |
| **TERRAMOTH** | **29 %** | **−0.175** | **−2.14 / −1.83  ← outlier** |

**spread 0.284.** TERRAMOTH has been the weakest machine at HARD in every
measurement taken across three sessions, before and after every change — left
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

1. **TERRAMOTH at HARD**, 29 % / −0.175, now past the outlier flag. Long-standing
   and out of scope by design decision (D120) — but §4 above is new, and the
   decision was taken when it was inside the flag rather than outside it. Worth a
   deliberate answer rather than an inherited one.
2. **Acid is carried by nobody.** `Element.Corrosive` is implemented and applied
   by no weapon on the roster.
3. **The lance connects 1–2 % of the time for every machine**, which the rival's
   inability to choose a command motion (§8d) explains and does not excuse.
4. **NOCTURNE is resolved** (D127): 33 % → 45 % at EXTREME on projectile speed,
   and it now has no matchup worse than −0.18. Nothing is owed here.

---

*Caveats.* AI against AI at a fixed tier. A human plays differently: the rival
never deliberately fires a command motion (§8d) and never chooses a sub-weapon
(§8f), so lances, spreads and sub-weapons are under-represented — the lance in
particular connects **1–2 % of the time for every machine on the roster** and is
close to worthless in AI hands. `MechDef.gauges.satShieldDrain` (D119) is
likewise invisible here, because the rival never picks SHIELD on the one chassis
that has it. The gap is widest around **CIRRUS's post-burnout state**, where the
AI holds a mean 212px from a mech with no thrusters and no guns and a person
would simply back off.
