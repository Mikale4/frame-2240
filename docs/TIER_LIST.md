# Roster tier list and matchup chart

Measured, not judged. Every number comes from `tools/probe/balance.ts` — each
machine against each other machine, **both slot orders on the same seed, 12
seeds**, at the real 180-second round cap. 84 samples per mech, 12 per matchup:
about **0.03 standard error** on a mech's overall lead and **0.05–0.10** on an
individual matchup.

```
npx vite-node tools/probe/balance.ts -- --tier extreme --seeds 12 --matrix
```

**Lead** is the life-bar fraction a machine finishes ahead by, averaged over the
field, and it is also the game's own timeout tiebreaker.

---

## 1. EXTREME — the roster is level

| Mech | Lead | ± | Polarisation | Best mu | Worst mu |
| --- | --- | --- | --- | --- | --- |
| TERRAMOTH | +0.089 | 0.027 | 0.120 | +0.234 | −0.097 |
| PYRE | +0.050 | 0.026 | **0.079** | +0.119 | −0.071 |
| NOCTURNE | +0.044 | 0.028 | 0.142 | +0.178 | −0.234 |
| CIRRUS | −0.010 | 0.035 | 0.144 | +0.183 | −0.196 |
| NULLTIDE | −0.026 | 0.029 | 0.158 | +0.207 | −0.270 |
| OBELISK | −0.033 | 0.031 | 0.161 | +0.270 | −0.183 |
| HALCYON | −0.035 | 0.031 | 0.104 | +0.183 | −0.130 |
| VESPER | −0.079 | 0.036 | 0.105 | +0.097 | −0.207 |

**spread 0.169** — the tightest this roster has ever measured.

### There are no real tiers left, and that is the finding

At 0.03 standard error the whole field spans about 5.6σ, and almost every
adjacent pair is inside noise. Honestly read, it is **two soft groups**:

* **TERRAMOTH / PYRE / NOCTURNE** — +0.089 to +0.044, mutually indistinguishable
  (TERRAMOTH over PYRE is 1.0σ).
* **CIRRUS / NULLTIDE / OBELISK / HALCYON** — −0.010 to −0.035, a 0.025 band
  across four machines. These four are the same machine as far as the numbers go.
* **VESPER** at −0.079 is the only one measurably adrift, and only by about 2σ
  from the middle group.

Anyone publishing an S/A/B tier list off this would be inventing structure the
measurement does not support.

## 2. Fairness — the part a tier list misses

| | now | before this session's last three changes |
| --- | --- | --- |
| Matchups inside ±0.10 — a real fight | **15 of 28** | 11 of 28 |
| Matchups beyond ±0.30 — a bad fight | **0 of 28** | 5 of 28 |

**Not one matchup on the board is decided at the select screen.** The single
worst pairing in the game is NULLTIDE→OBELISK at −0.270, and the previous
record-holders (VESPER over OBELISK at +0.680, over TERRAMOTH at +0.662) are
gone entirely.

Polarisation — the spread of a machine's results across its seven opponents —
has collapsed with it. TERRAMOTH used to sit at 0.321, a rock-paper-scissors
machine whose result was decided by the draw; it is now 0.120. Nothing on the
roster is above 0.161.

**PYRE remains the most balanced machine in the game**: +0.050 with a
polarisation of 0.079, nothing better than +0.119 or worse than −0.071. It is the
reference machine the roster has, and that is still nominally HALCYON's job.

## 3. The full chart — EXTREME

Row beats column.

| | TER | PYR | NOC | CIR | NUL | OBE | HAL | VES |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **TERRAMOTH** | — | +0.07 | +0.23 | +0.20 | +0.03 | +0.18 | +0.00 | −0.10 |
| **PYRE** | −0.07 | — | +0.03 | +0.11 | −0.04 | +0.12 | +0.09 | +0.12 |
| **NOCTURNE** | −0.23 | −0.03 | — | +0.15 | +0.18 | +0.08 | +0.13 | +0.04 |
| **CIRRUS** | −0.20 | −0.11 | −0.15 | — | +0.01 | +0.18 | +0.10 | +0.10 |
| **NULLTIDE** | −0.03 | +0.04 | −0.18 | −0.01 | — | **−0.27** | +0.06 | +0.21 |
| **OBELISK** | −0.18 | −0.12 | −0.08 | −0.18 | **+0.27** | — | +0.05 | +0.01 |
| **HALCYON** | −0.00 | −0.09 | −0.13 | −0.10 | −0.06 | −0.05 | — | +0.18 |
| **VESPER** | +0.10 | −0.12 | −0.04 | −0.10 | −0.21 | −0.01 | −0.18 | — |

OBELISK over NULLTIDE (+0.270) is now the roster's hardest counter, and it is a
sensible one: AEGIS's dome erases the projection's rounds wholesale, and the
guard takes 80 % off what gets past.

## 4. HARD

| Mech | Lead | ± | Polarisation |
| --- | --- | --- | --- |
| PYRE | +0.097 | 0.030 | 0.146 |
| NULLTIDE | +0.071 | 0.029 | 0.133 |
| HALCYON | +0.051 | 0.029 | 0.138 |
| CIRRUS | +0.028 | 0.039 | **0.247** |
| NOCTURNE | −0.001 | 0.028 | 0.109 |
| TERRAMOTH | −0.015 | 0.029 | 0.089 |
| OBELISK | −0.073 | 0.032 | 0.104 |
| VESPER | **−0.159** | 0.036 | 0.196 |

**spread 0.257.** Looser than EXTREME, and one matchup is genuinely bad:
**CIRRUS over VESPER, +0.509** — the worst pairing anywhere at either tier.

## 5. What is left to fix

1. **VESPER, and specifically VESPER at HARD.** Last at both tiers, and the
   holder of the one remaining lopsided matchup. The cause is structural rather
   than numeric: his kit is built on `kites` and the sniper stance, and holding
   range needs `rangeIq`, which is **EXTREME-only**. At HARD he cannot enforce
   the spacing his whole design assumes, so CIRRUS simply walks him down. Either
   the kite wants a tier-independent floor, or he needs something that works
   while crowded.
2. **HALCYON is still a bent yardstick, but much less so.** It went from winning
   *no* matchup at all to winning one (VESPER, +0.183) and sitting at −0.035. The
   designated neutral baseline is still slightly negative against everyone but
   is no longer an outlier.
3. **Nothing else.** No machine is more than 0.09 from the field at EXTREME and
   no matchup is beyond ±0.30. Further tuning here would be fitting noise — see
   the protocol's rule about dials that have run out of resolution.

---

*Caveats.* AI against AI at a fixed tier. A human plays differently: the rival
never deliberately fires a command motion (§8c) and never chooses a sub-weapon
(§8f), so lances, spreads and sub-weapons are under-represented relative to a
person's hands. This measures what the simulation does, which is the part that
can be measured.
