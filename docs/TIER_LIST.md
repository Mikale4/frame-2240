# Roster tier list and matchup chart

Measured, not judged. Every number comes from `tools/probe/balance.ts` — each
machine against each other machine, **both slot orders on the same seed, 12
seeds**, at the real 180-second round cap. 84 samples per mech: about **0.03
standard error** on lead and **0.05–0.10** on an individual matchup.

```
npx vite-node tools/probe/balance.ts -- --tier extreme --seeds 12 --matrix
```

## Two numbers, and they disagree

* **`win`** — the share of individual matches won. What a player experiences.
* **`lead`** — the life-bar *margin* a machine finishes ahead by, averaged over
  the field. Also the game's own timeout tiebreaker.

They come apart whenever an ability converts losses into narrow survivals rather
than winning bigger. **HALCYON is the standing example**: a mid-pack +0.012 lead
and the joint-highest 60 % win rate, because LAST STAND turns defeats into
one-hull escapes. Reading only the spread says there is nothing to look at.

---

## 1. EXTREME

| Mech | Win | Lead | ± | Polarisation |
| --- | --- | --- | --- | --- |
| CIRRUS | **60 %** | +0.108 | 0.026 | 0.134 |
| TERRAMOTH | 58 % | +0.059 | 0.029 | 0.149 |
| NULLTIDE | 54 % | +0.022 | 0.028 | 0.124 |
| HALCYON | **60 %** | +0.012 | 0.024 | 0.114 |
| NOCTURNE | 48 % | +0.008 | 0.028 | 0.131 |
| PYRE | 45 % | −0.026 | 0.024 | **0.099** |
| VESPER | 40 % | −0.083 | 0.038 | 0.167 |
| OBELISK | **36 %** | −0.100 | 0.027 | **0.076** |

**spread 0.208.**

### There are no real tiers, except at the bottom

At 0.03 standard error the top six span 0.135 — about four standard errors
across *six machines*, so almost every adjacent pair is inside noise. Honestly
read:

* **The pack**: CIRRUS, TERRAMOTH, NULLTIDE, HALCYON, NOCTURNE, PYRE. CIRRUS
  leads TERRAMOTH by 1.3σ; nothing in this group is separable with confidence.
* **VESPER and OBELISK** are genuinely adrift — OBELISK is 4.4σ below the top and
  the only machine that loses two matches in three.

## 2. Fairness

| | now |
| --- | --- |
| Matchups inside ±0.10 — a real fight | **13 of 28** |
| Matchups beyond ±0.30 — a bad fight | **1 of 28** |

The single bad pairing is **CIRRUS over VESPER, +0.336**, and it is the same
structural fault described in §5: he cannot hold range against a frame that
closes.

**OBELISK's polarisation of 0.076 is the lowest on the roster and it is not a
compliment** — its *best* matchup is −0.009. It has no good matchups at all, only
less-bad ones, which is a different problem from being swingy and needs a
different fix.

**PYRE remains the reference machine**: −0.026 with a polarisation of 0.099 and
nothing worse than −0.143. That is nominally HALCYON's job.

## 3. The full chart — EXTREME

Row beats column.

| | CIR | TER | NUL | HAL | NOC | PYR | VES | OBE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **CIRRUS** | — | −0.09 | +0.11 | +0.15 | +0.01 | +0.07 | **+0.34** | +0.18 |
| **TERRAMOTH** | +0.09 | — | −0.03 | −0.08 | +0.23 | +0.14 | −0.15 | +0.21 |
| **NULLTIDE** | −0.11 | +0.03 | — | +0.10 | −0.18 | +0.14 | +0.15 | +0.01 |
| **HALCYON** | −0.15 | +0.08 | −0.10 | — | +0.05 | +0.06 | +0.20 | +0.10 |
| **NOCTURNE** | −0.01 | −0.23 | +0.18 | −0.05 | — | +0.05 | +0.08 | +0.17 |
| **PYRE** | −0.07 | −0.14 | −0.14 | −0.06 | −0.05 | — | +0.12 | +0.12 |
| **VESPER** | **−0.34** | +0.15 | −0.15 | −0.20 | −0.08 | −0.12 | — | +0.09 |
| **OBELISK** | −0.18 | −0.21 | −0.01 | −0.10 | −0.17 | −0.12 | −0.09 | — |

## 4. HARD

| Mech | Win | Lead |
| --- | --- | --- |
| CIRRUS | 60 % | +0.117 |
| HALCYON | **71 %** | +0.103 |
| NULLTIDE | 58 % | +0.086 |
| PYRE | 51 % | +0.053 |
| NOCTURNE | 46 % | −0.029 |
| TERRAMOTH | 38 % | −0.068 |
| VESPER | 41 % | −0.148 |
| OBELISK | **32 %** | −0.114 |

**spread 0.265.** Two rows move sharply between tiers and both are diagnostic:

* **HALCYON is far stronger at HARD** (71 % against 60 %). LAST STAND is worth
  more against an opponent less able to finish a machine on one hull.
* **TERRAMOTH is far weaker** (38 % against 58 %), and **VESPER is weakest of
  all** at −0.148.

---

## 5. What is left to fix

Both are now the next task; see `SESSION_HANDOFF.md` §4.

1. **OBELISK.** Last at both tiers, on both metrics, and the only machine with no
   winning matchup anywhere. It binds the spread at both ends: every further nerf
   at the top moves the number by nothing until this floor comes up. Three passes
   have already ruled out dome durability, reach, and (partly) raw damage.
2. **VESPER, and specifically VESPER at HARD.** −0.148 and the holder of the one
   remaining lopsided matchup. Structural rather than numeric: `kites` and the
   sniper stance both depend on `rangeIq`, which is **EXTREME-only**, so at HARD
   he cannot enforce the spacing his design assumes.

---

*Caveats.* AI against AI at a fixed tier. A human plays differently: the rival
never deliberately fires a command motion (§8d) and never chooses a sub-weapon
(§8f), so lances, spreads and sub-weapons are under-represented. The gap is
widest around **CIRRUS's post-burnout state**, where the AI holds a mean 212px
from a mech with no thrusters and no guns and a person would simply back off —
her 60 % is probably flattering.
