# Roster tier list and matchup chart

Measured, not judged. Every number comes from `tools/probe/balance.ts` — each
machine against each other machine, **both slot orders on the same seed, 12
seeds**, at the real 180-second round cap. 84 samples per mech: about **0.03
standard error** on lead and **0.05–0.10** on an individual matchup.

```
npx vite-node tools/probe/balance.ts -- --tier extreme --seeds 12 --matrix
```

Current as of **D120**. `tools/probe/telemetry.ts` is the companion instrument:
same duels, same seeds, reporting *how* a machine spent its match rather than who
won it. Reach for it before proposing a fix — three OBELISK passes were spent on
reasoned hypotheses that each measured near zero, and VESPER's recorded diagnosis
turned out to name a mechanism that does not exist in the code.

## Two numbers, and they disagree

* **`win`** — the share of individual matches won. What a player experiences.
* **`lead`** — the life-bar *margin* a machine finishes ahead by, averaged over
  the field. Also the game's own timeout tiebreaker.

They come apart whenever one matchup is lopsided or an ability converts losses
into narrow survivals. **VESPER is now the sharpest example on the roster**: top
of the lead column at +0.102 and *fifth of eight* on record at 51 %. The entire
margin is one matchup — across the other six he averages +0.037. Reading the lead
column alone would call him the best machine in the game.

---

## 1. EXTREME

| Mech | Win | Lead | ± |
| --- | --- | --- | --- |
| VESPER | 51 % | +0.102 | 0.037 |
| CIRRUS | 57 % | +0.056 | 0.025 |
| OBELISK | 52 % | −0.001 | 0.029 |
| HALCYON | 57 % | −0.008 | 0.021 |
| NULLTIDE | 52 % | −0.021 | 0.026 |
| TERRAMOTH | 52 % | −0.030 | 0.035 |
| PYRE | 38 % | −0.045 | 0.022 |
| NOCTURNE | 42 % | −0.054 | 0.030 |

**spread 0.156 — the tightest the roster has ever measured** (0.208 before D118).

### Read the record column, not the margin

Six machines sit inside 0.110 of each other on lead and five of them are within
five points of an even record. The two genuinely low records are **PYRE at 38 %**
and **NOCTURNE at 42 %**, and neither shows up as an outlier on margin — PYRE's
lead is −0.045 with the flattest matchup row in the game.

**VESPER's +0.102 is one matchup**, not a tier. See §5.

## 2. Fairness

| | before D118 | after D118 | now |
| --- | --- | --- | --- |
| Matchups inside ±0.10 — a real fight | 13 of 28 | 15 of 28 | **18 of 28** |
| Matchups beyond ±0.30 — a bad fight | 1 of 28 | 1 of 28 | **1 of 28** |

The best fairness on record. The single bad pairing changed identity in D120:
**CIRRUS over VESPER, long the one unfair fight in the game, is fixed at −0.05.**
It was replaced by **VESPER over TERRAMOTH at +0.59**, which is larger, and which
is a deliberate design decision rather than an oversight — see §5.

## 3. The full chart — EXTREME

Row beats column.

| | HAL | NOC | VES | TER | CIR | OBE | PYR | NUL |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **HALCYON** | — | −0.01 | +0.08 | +0.08 | −0.15 | +0.02 | +0.03 | −0.10 |
| **NOCTURNE** | +0.01 | — | −0.13 | −0.23 | −0.01 | −0.17 | −0.02 | +0.18 |
| **VESPER** | −0.08 | +0.13 | — | **+0.59** | −0.05 | +0.19 | −0.02 | −0.05 |
| **TERRAMOTH** | −0.08 | +0.23 | **−0.59** | — | +0.09 | +0.03 | +0.14 | −0.03 |
| **CIRRUS** | +0.15 | +0.01 | +0.05 | −0.09 | — | +0.10 | +0.07 | +0.10 |
| **OBELISK** | −0.02 | +0.17 | −0.19 | −0.03 | −0.10 | — | −0.03 | +0.20 |
| **PYRE** | −0.03 | +0.02 | +0.02 | −0.14 | −0.07 | +0.03 | — | −0.14 |
| **NULLTIDE** | +0.10 | −0.18 | +0.05 | +0.03 | −0.10 | −0.20 | +0.14 | — |

## 4. HARD

| Mech | Win | Lead |
| --- | --- | --- |
| CIRRUS | 62 % | +0.076 |
| VESPER | 57 % | +0.064 |
| HALCYON | 61 % | +0.046 |
| NULLTIDE | 50 % | +0.025 |
| OBELISK | 60 % | +0.021 |
| PYRE | 40 % | −0.011 |
| NOCTURNE | 38 % | −0.082 |
| TERRAMOTH | **33 %** | **−0.140** |

**spread 0.216** (0.265 before D118). Six of eight are inside 0.090 of each
other. The tier split worth knowing:

* **OBELISK is stronger at HARD than EXTREME on record** — 60 % against 52 %.
  It wins more fights by smaller margins, which is what a heavy does against
  opponents less able to finish it.
* **TERRAMOTH is much weaker at HARD**, and has been in every measurement:
  37 % before the VESPER work and 38 % before D118, so this is not caused by
  either. Bulk stops paying when fights end sooner.

---

## 5. The one bad matchup, and why it stays

**VESPER over TERRAMOTH, +0.59.** Not an excess in any single dial — measured
separately, VESPER's stance cut puts it at +0.50, his dash at +0.40 and his
stance mobility at +0.50, each alone. The only change that leaves it alone
(+0.13) is the one that made him *slower*. Any mobility at all breaks it: the
slowest machine on the roster cannot answer a marksman who can disengage.

**Kept, by design decision** (D120): TERRAMOTH's hull is high enough that it
outlasts most of the field through bulk and trading, and the measurement supports
that at EXTREME. Its exchange rate is **the most even on the roster — 76.7
bar/min dealt against 76.5 taken** — on the lowest damage intake in the game, and
excluding VESPER its matchup row averages **+0.063**, above average, with only
two marginal losses. It sits at 52 % wins.

Do not "fix" this without re-reading D120 first.

## 6. What is left

1. **PYRE, 38 % at EXTREME and 40 % at HARD.** The lowest record in the game on
   a −0.045 margin and the flattest matchup row on the roster — nothing worse
   than −0.14. Its margin says mid-pack and its record says worst. Something
   converts good positions into losses, and nobody has pulled that thread.
2. **NOCTURNE, 42 % / −0.054.** Quietly the second-lowest record at both tiers.
3. **TERRAMOTH at HARD**, 33 % / −0.140. Separate from §5 and long-standing.

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
