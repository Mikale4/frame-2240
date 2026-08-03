# Roster tier list and matchup chart

Measured, not judged. Every number comes from `tools/probe/balance.ts` — each
machine against each other machine, **both slot orders on the same seed, 12
seeds**, at the real 180-second round cap. 84 samples per mech: about **0.03
standard error** on lead and **0.05–0.10** on an individual matchup.

```
npx vite-node tools/probe/balance.ts -- --tier extreme --seeds 12 --matrix
```

Current as of **D118/D119**. `tools/probe/telemetry.ts` is the companion
instrument: same duels, same seeds, reporting *how* a machine spent its match
rather than who won it. Reach for it before proposing a fix — three OBELISK
passes were spent on reasoned hypotheses that each measured near zero.

## Two numbers, and they disagree

* **`win`** — the share of individual matches won. What a player experiences.
* **`lead`** — the life-bar *margin* a machine finishes ahead by, averaged over
  the field. Also the game's own timeout tiebreaker.

They come apart whenever an ability converts losses into narrow survivals rather
than winning bigger. **HALCYON is the standing example**: 58 % wins on a +0.009
lead, because LAST STAND turns defeats into one-hull escapes. Reading only the
spread says there is nothing to look at.

---

## 1. EXTREME

| Mech | Win | Lead | ± |
| --- | --- | --- | --- |
| CIRRUS | 60 % | +0.097 | 0.027 |
| OBELISK | 57 % | +0.053 | 0.029 |
| TERRAMOTH | 56 % | +0.033 | 0.028 |
| HALCYON | 58 % | +0.009 | 0.025 |
| NULLTIDE | 52 % | −0.007 | 0.029 |
| PYRE | 40 % | −0.030 | 0.024 |
| NOCTURNE | 42 % | −0.036 | 0.030 |
| VESPER | **35 %** | **−0.119** | 0.036 |

**spread 0.216.**

### One machine is adrift, and it is no longer OBELISK

The top seven span 0.133 — roughly four standard errors across *seven* machines,
so almost every adjacent pair is inside noise and there are no honest tiers up
there. **VESPER is 0.086 below the next machine and 5.4σ below the top.** He is
the sole outlier and the sole remaining lopsided matchup.

**OBELISK was the floor and is now second on lead** (D118): 36 % / −0.100 →
57 % / +0.053, and 32 % / −0.114 → 61 % / +0.040 at HARD. It had no winning
matchup anywhere; it now has three, with three of its four losses inside ±0.03.

## 2. Fairness

| | before D118 | now |
| --- | --- | --- |
| Matchups inside ±0.10 — a real fight | 13 of 28 | **15 of 28** |
| Matchups beyond ±0.30 — a bad fight | 1 of 28 | **1 of 28** |

The single bad pairing is still **CIRRUS over VESPER, +0.34**, unchanged and
unaddressed: he cannot hold range against a frame that closes.

**PYRE remains the reference machine for shape** — −0.030 with nothing worse
than −0.14 — though its 40 % record now sits below its margin, which is the
win/lead split running the other way and is worth a look on its own.

## 3. The full chart — EXTREME

Row beats column.

| | HAL | NOC | VES | TER | CIR | OBE | PYR | NUL |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **HALCYON** | — | −0.01 | +0.20 | +0.08 | −0.15 | +0.02 | +0.03 | −0.10 |
| **NOCTURNE** | +0.01 | — | −0.01 | −0.23 | −0.01 | −0.17 | −0.02 | +0.18 |
| **VESPER** | −0.20 | +0.01 | — | +0.15 | **−0.34** | −0.19 | −0.12 | −0.15 |
| **TERRAMOTH** | −0.08 | +0.23 | −0.15 | — | +0.09 | +0.03 | +0.14 | −0.03 |
| **CIRRUS** | +0.15 | +0.01 | **+0.34** | −0.09 | — | +0.10 | +0.07 | +0.10 |
| **OBELISK** | −0.02 | +0.17 | +0.19 | −0.03 | −0.10 | — | −0.03 | +0.20 |
| **PYRE** | −0.03 | +0.02 | +0.12 | −0.14 | −0.07 | +0.03 | — | −0.14 |
| **NULLTIDE** | +0.10 | −0.18 | +0.15 | +0.03 | −0.10 | −0.20 | +0.14 | — |

## 4. HARD

| Mech | Win | Lead |
| --- | --- | --- |
| CIRRUS | 64 % | +0.104 |
| HALCYON | 64 % | +0.074 |
| NULLTIDE | 52 % | +0.051 |
| OBELISK | **61 %** | +0.040 |
| PYRE | 44 % | +0.023 |
| NOCTURNE | 41 % | −0.055 |
| TERRAMOTH | 37 % | −0.073 |
| VESPER | **38 %** | **−0.165** |

**spread 0.269.** Rows that move between tiers, and what each says:

* **HALCYON is stronger at HARD.** LAST STAND is worth more against an opponent
  less able to finish a machine on one hull.
* **TERRAMOTH is much weaker** (37 % against 56 %), and has been across every
  measurement this session. It is now the second-worst machine at HARD and is
  worth a pass of its own.
* **VESPER is weakest at both tiers and worst of all at HARD**, −0.165.

---

## 5. What is left to fix

1. **VESPER, and specifically VESPER at HARD.** The sole outlier and the holder
   of the one remaining lopsided matchup. Structural rather than numeric:
   `kites` and the sniper stance both depend on `rangeIq`, which is
   **EXTREME-only** (`RivalAI.ts`, `false` at Easy/Normal/Hard), so at HARD he
   cannot enforce the spacing his design assumes.

   Measured, his kit is not the problem. His sniper shot connects **83–84 %** —
   the best-connecting weapon in the game — against his main gun's 18–23 %. And
   his main gun fails in the *opposite* way to OBELISK's: **0 % expire, 82 %
   flies off the map.** He over-ranges rather than falling short, which means
   reach is not the lever and spacing is.

2. **TERRAMOTH at HARD**, 37 % / −0.073, second-worst and 19 points below its
   own EXTREME record.

3. **PYRE's record against its margin** — 40 % on a −0.030 lead with the
   flattest matchup spread on the roster. Something is converting good positions
   into losses.

---

*Caveats.* AI against AI at a fixed tier. A human plays differently: the rival
never deliberately fires a command motion (§8d) and never chooses a sub-weapon
(§8f), so lances, spreads and sub-weapons are under-represented — the lance in
particular connects **1–2 % of the time for every machine on the roster** and is
close to worthless in AI hands. `MechDef.gauges.satShieldDrain` (D119) is
likewise invisible here, because the rival never picks SHIELD on the one chassis
that has it. The gap is widest around **CIRRUS's post-burnout state**, where the
AI holds a mean 212px from a mech with no thrusters and no guns and a person
would simply back off — her 60 % is probably flattering.
