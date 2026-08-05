# Roster tier list and matchup chart

Measured, not judged. Every number comes from `tools/probe/balance.ts` — each
machine against each other machine, **both slot orders on the same seed, 12
seeds**, at the real 180-second round cap. 84 samples per mech: about **0.03
standard error** on lead and **0.05–0.10** on an individual matchup.

```
npx vite-node tools/probe/balance.ts -- --tier extreme --seeds 12 --matrix
```

Current as of **D145**. `tools/probe/telemetry.ts` is the companion instrument:
same duels, same seeds, reporting *how* a machine spent its match rather than who
won it. Reach for it before proposing a fix — three OBELISK passes were spent on
reasoned hypotheses that each measured near zero, and VESPER's recorded diagnosis
turned out to name a mechanism that does not exist in the code.

**Read D144 before trusting an `arrive` number from before it.** The probe was
counting a numerator without its denominator: a committed melee lock and the
drone roles never call `Combatant.fire`, which is where `nominal` was being
accumulated, so every point of that damage landed without ever being thrown. It
counts at the pool now, and the shots table no longer drops rounds consumed in
the step they spawned in — which was silently keeping the misses and discarding
the hits.

## Two numbers, and they disagree

* **`win`** — the share of individual matches won. What a player experiences.
* **`lead`** — the life-bar *margin* a machine finishes ahead by, averaged over
  the field. Nominally the game's timeout tiebreaker, though no AI fight has ever
  reached the timeout — see §1.

They come apart whenever one matchup is lopsided or an ability converts losses
into narrow survivals, and **you have to read both**. Three live examples:

* **VESPER** tops the lead column and is *sixth of eight* on record. The entire
  margin is one matchup. Reading lead alone would call him the best machine.
* **PYRE** was the reverse and it took a player to notice. A near-even exchange
  rate and the flattest matchup row on the roster, on the worst record in the
  game, because she was bringing opponents to one hull point and a rule forbade
  her from finishing them (D121). **When the two columns disagree, something
  specific is happening — go and find it rather than averaging them.**
* **D145 chose a shipped value on this distinction.** Two candidate settings tied
  exactly on spread, 0.192 and 0.192. On win rate one of them was plainly worse —
  it moved the bottom of the roster onto a different machine rather than lifting
  it. Lead could not see that at all.

---

## 1. EXTREME

| Mech | Win | Lead | ± | z(lead/win) |
| --- | --- | --- | --- | --- |
| CIRRUS | **68 %** | +0.121 | 0.023 | +1.65 / +1.97 |
| VESPER | 56 % | +0.111 | 0.035 | +1.51 / +0.70 |
| HALCYON | 52 % | −0.018 | 0.025 | −0.25 / +0.27 |
| OBELISK | 50 % | −0.026 | 0.028 | −0.35 / +0.03 |
| NOCTURNE | 40 % | −0.028 | 0.025 | −0.38 / −1.07 |
| TERRAMOTH | 48 % | −0.039 | 0.035 | −0.53 / −0.27 |
| NULLTIDE | 43 % | −0.051 | 0.026 | −0.69 / −0.83 |
| PYRE | 43 % | −0.071 | 0.028 | −0.96 / −0.80 |

**spread 0.192.** lead SD 0.074 (true 0.068, 8 % measurement noise), win SD 8.9
points. **No outliers** — the field is one population.

### 0.192 is the best figure ever measured here, and it was paid back in one dial

D127 reached 0.198 and D142 spent it down to 0.266 buying a deliberate lock.
D143 records five measured attempts to pay that back through target selection,
all of which failed. **D145 paid it back with a roster change instead** —
TERRAMOTH's main `projSpeed` 11 → 17, nothing else — and went past the old best.

The diagnosis was reach. Range in this game is `projSpeed * projLife`, and
TERRAMOTH's repeater covered **682 px** while the machine fought at 664–745.
**60 % of its main rounds expired in open air**, against 18 % for HALCYON and
24 % for CIRRUS; it threw the roster's third-highest nominal damage into the
floor. It now throws slightly *less* and lands more, and its net exchange went
−11.1 to −2.3 bars a minute. Full sweep and differential in D145.

### CIRRUS is still the top, and the melee hypothesis is dead

68 % and +1.97σ on win rate — still the closest anything comes to the flag
without crossing it, and it came down from 71 % without being touched, because
the field tightened around it. Its margin is broad rather than concentrated,
though **TERRAMOTH now takes the pairing +0.10**, so it no longer beats all seven.

The standing hypothesis was that CIRRUS lands 3× the field share *because it
melees about half the time*. **D144 measured it and it fails three ways:**

| | swing % of match | melee % of landed | melee arrive | **ranged arrive** |
| --- | --- | --- | --- | --- |
| CIRRUS | 19 % | 19 % | 82 % | **18.3 %** |
| VESPER | 2 % | 5 % | 88 % | 15.3 % |
| NULLTIDE | 10 % | 11 % | 73 % | 14.3 % |
| HALCYON | 8 % | 13 % | 87 % | 8.0 % |
| PYRE | 8 % | 21 % | 82 % | 6.2 % |
| OBELISK | 6 % | 21 % | 83 % | 5.5 % |
| TERRAMOTH | 5 % | 20 % | 74 % | 5.2 % |
| NOCTURNE | 6 % | 21 % | 87 % | 5.2 % |

It melees a fifth of the time, not half — though it is still the roster's most
committed melee machine by a wide margin. **Melee is the one column where it is
ordinary**: every machine lands 73–88 % of a committed lock, and CIRRUS's 82 % is
fourth of eight. The entire gap is in the **ranged** column, 18.3 % against a
field median of 6.2 %, corroborated at HARD.

So the eight-hit chain is not the lever. Two constraints on whatever is:

* **Distance alone does not explain it.** VESPER is second on ranged arrival from
  **790 px**, the furthest on the roster, against CIRRUS's 533.
* **The three best ranged arrivals belong to the three lowest nominal dps** on
  the roster. Real dps is `arrive × nominal`, and CIRRUS's is **70.7** against
  VESPER's 43.2 and a field of 22.5–34.6. The roster's damage numbers are
  authored as if nominal were the currency and it is not.

## 2. Fairness

| | D117 | D120 | D126 | D127 | D143 | now |
| --- | --- | --- | --- | --- | --- | --- |
| Matchups inside ±0.10 — a real fight | 13/28 | 18/28 | 17/28 | 19/28 | 13/28 | **15/28** |
| Matchups beyond ±0.30 — a bad fight | 1/28 | 1/28 | 2/28 | 1/28 | 1/28 | **1/28** |

**Counted from the §3 chart, which was regenerated from the same run as §1.**

Two of the six pairings D142 cost have come back. The recovery is concentrated
where the change was: **TERRAMOTH's row is now inside ±0.10 against six of its
seven opponents**, where before it was inside against two. The single bad pairing
is unchanged in identity and reduced in size — VESPER over TERRAMOTH, **+0.66 →
+0.55** — see §5, and read D120 before touching it.

## 3. The full chart — EXTREME

Row beats column. **Regenerated from the same run as §1**, which is the rule this
table exists under — it was allowed to drift through D125–D126 and was wrong by
up to 0.13 in a cell while the row table above it was exact, which put a bad
pairing out of sight and corrupted the §2 counts.

| | HAL | NOC | VES | TER | CIR | OBE | PYR | NUL |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **HALCYON** | — | −0.01 | +0.03 | +0.04 | −0.18 | +0.01 | +0.11 | −0.13 |
| **NOCTURNE** | +0.01 | — | −0.11 | −0.10 | −0.19 | −0.16 | +0.10 | +0.27 |
| **VESPER** | −0.03 | +0.11 | — | **+0.55** | −0.15 | +0.24 | +0.03 | +0.03 |
| **TERRAMOTH** | −0.04 | +0.10 | **−0.55** | — | +0.10 | +0.10 | +0.06 | −0.05 |
| **CIRRUS** | +0.18 | +0.19 | +0.15 | −0.10 | — | +0.18 | +0.09 | +0.15 |
| **OBELISK** | −0.01 | +0.16 | −0.24 | −0.10 | −0.18 | — | −0.00 | +0.19 |
| **PYRE** | −0.11 | −0.10 | −0.03 | −0.06 | −0.09 | +0.00 | — | −0.10 |
| **NULLTIDE** | +0.13 | −0.27 | −0.03 | +0.05 | −0.15 | −0.19 | +0.10 | — |

Two rows to notice. **TERRAMOTH's** is the change: every cell but VESPER now sits
inside ±0.10, and it takes CIRRUS. **CIRRUS's** is still the strongest, positive
against six of seven, but it is no longer positive against all of them.

## 4. HARD

| Mech | Win | Lead | z(lead/win) |
| --- | --- | --- | --- |
| CIRRUS | 62 % | +0.095 | +1.45 / +1.31 |
| VESPER | 52 % | +0.069 | +1.06 / +0.22 |
| NULLTIDE | 52 % | +0.028 | +0.43 / +0.22 |
| HALCYON | 61 % | +0.013 | +0.19 / +1.15 |
| OBELISK | 54 % | −0.003 | −0.04 / +0.38 |
| NOCTURNE | 40 % | −0.051 | −0.78 / −1.06 |
| PYRE | 41 % | −0.052 | −0.79 / −0.96 |
| TERRAMOTH | 38 % | −0.100 | −1.53 / −1.28 |

**spread 0.306 → 0.195. No outliers at either tier, for the first time.**

### The one flagged outlier the project ever produced has cleared

TERRAMOTH was **−2.06σ** at HARD and is **−1.53σ**, at 38 % rather than 28 %.
It is still the weakest machine at this tier, as it has been in every measurement
taken across five sessions — but it is now inside the field rather than outside
it, and the flag that D127 raised is down.

It cleared on a reach change, not on a durability or damage one. §4b of
`TESTING_PROTOCOL.md` records that the flag *did not discriminate between the
swept values* when it fired, which was the tell that it was structural rather
than caused by the change under test. It was structural: the machine's main gun
could not reach the range it fought at, and that was equally true at every tier.

## 5. The one bad matchup, and why it stays

**VESPER over TERRAMOTH, +0.55.** Not an excess in any single dial — measured
separately, VESPER's stance cut puts it at +0.50, his dash at +0.40 and his
stance mobility at +0.50, each alone. The only change that leaves it alone
(+0.13) is the one that made him *slower*. Any mobility at all breaks it: the
slowest machine on the roster cannot answer a marksman who can disengage.

**Kept, by design decision** (D120). Do not "fix" it without re-reading D120
first.

### The reasoning D120 rests on had decayed, and D145 restored it

D120 kept the matchup because TERRAMOTH was paying for it elsewhere: it outlasted
the field through bulk and trading. Every number that argument was built on had
moved against it by D143. **D145 moved all of them back, without touching the
matchup itself:**

| | at D120 | at D143 | now |
| --- | --- | --- | --- |
| Exchange rate, bars/min | 76.7 out / 76.5 in | 74.8 / 85.9, net −11.1 | **79.6 / 81.8, net −2.3** |
| Matchup row excluding VESPER | +0.063 | +0.003, dead average | **+0.045** |
| Losses excluding VESPER | two, marginal | three | **two, marginal** |
| Win rate at EXTREME | 52 % | 40 % | **48 %** |
| At HARD | −1.89σ, inside the flag | −2.14σ, flagged | **−1.53σ, inside** |

So the argument D120 made is available again on current numbers rather than
inherited from old ones, and the machine is once more a bulk platform with one
bad matchup rather than a machine that was losing broadly and had a bad matchup
as well. **The bad pairing itself was never the problem it was blamed for** —
what had actually decayed was everything around it, and a reach fix in a
different weapon repaired all five rows.

The decision stays. Re-decide it on this table, not on D120's.

## 6. What is left

1. **CIRRUS at the top**, 68 % and +1.97σ on win rate — still the closest
   anything comes to the flag without crossing it. **D144 killed the melee
   explanation**: melee arrival is a roster-wide constant of 73–88 % and CIRRUS
   is fourth of eight on it. The whole gap is *ranged* arrival, 18.3 % against a
   field median of 6.2 %, and no account of it can rest on fighting close —
   VESPER is second from 790 px. Its attack values remain the wrong lever.
2. **Real dps is `arrive × nominal`, and the roster is authored on nominal.**
   The three highest ranged arrivals belong to the three *lowest* nominal dps
   machines. CIRRUS converts 331 nominal into 70.7 real; OBELISK converts 394
   into 27.3. This is a roster-wide authoring question, not a CIRRUS one, and it
   is the largest unexamined thing on this page.
3. **TERRAMOTH at HARD**, 38 % and −1.53σ, still the weakest at that tier but no
   longer flagged. **VESPER over TERRAMOTH at +0.55 is now the only thing wrong
   with it** — six of its other seven pairings are inside ±0.10. That is the
   state D120 assumed when it kept the matchup and §5 records had decayed; on
   these numbers the D120 reasoning is closer to true again than it has been
   since D120 itself.
4. **Acid is carried by nobody.** `Element.Corrosive` is implemented and applied
   by no weapon on the roster.
5. **The lance connects 1–2 % of the time for every machine**, which the rival's
   inability to choose a command motion (§8d of the handoff) explains and does
   not excuse. TERRAMOTH's lance still flies off 47 % of the time.
6. **Nothing has ever reached the 180 s timeout**, so `lead` remains a proxy for
   a tiebreaker that never fires. Mean fight is 46 s.
