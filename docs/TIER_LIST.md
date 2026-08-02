# Roster tier list and matchup chart

Measured, not judged. Every number here comes from
`tools/probe/balance.ts` — each machine against each other machine, **both slot
orders on the same seed, 12 seeds**, at the real 180-second round cap. That is
84 samples per mech and 12 per matchup, giving a standard error of about **0.03
on a mech's overall lead** and about **0.05–0.10 on an individual matchup**.

Reproduce with:

```
npx vite-node tools/probe/balance.ts -- --tier extreme --seeds 12 --matrix
```

**Lead** is the life-bar fraction a machine finishes ahead by, averaged over the
field. It is also the game's own timeout tiebreaker, so +0.20 means "ends a match
a fifth of a life bar up on the average opponent".

> **This is a deliberately unbalanced snapshot.** After the tuning pass
> (D97–D104) the roster sat at a spread of **0.169 with no outliers**. VESPER and
> NULLTIDE were then given large requested buffs (D105, D107–D109) and explicitly
> left untuned pending play. Everything below reflects that.

---

## 1. Tiers — EXTREME

The tier the game is meant to be played at. `resourceIq`, `droneIq`, `planIq` and
`rangeIq` execute at no other tier.

| Tier | Mech | Lead | ± | Read |
| --- | --- | --- | --- | --- |
| **S** | **VESPER** | **+0.321** | 0.040 | Loses to nobody. Its worst matchup is +0.038. |
| **S** | **NULLTIDE** | **+0.215** | 0.031 | One losing matchup on the board, and it is VESPER. |
| **A** | PYRE | −0.003 | 0.028 | Dead centre of the roster, and the steadiest thing in it. |
| **A** | TERRAMOTH | −0.030 | 0.039 | Average on paper, wild in practice — see §3. |
| **A** | NOCTURNE | −0.058 | 0.032 | Quietly fine. Beats the bottom, loses to the top. |
| **B** | HALCYON | −0.117 | 0.030 | **Wins no matchup at all.** Best result is a dead heat. |
| **B** | CIRRUS | −0.118 | 0.035 | Beats HALCYON and OBELISK, loses the rest. |
| **C** | OBELISK | −0.210 | 0.035 | One non-losing matchup on the entire board. |

**spread 0.531.**

Which tier breaks are real, at ~0.03 standard error:

* **S→A is enormous** — 0.218 between NULLTIDE and PYRE. Unambiguous.
* **VESPER above NULLTIDE** is 0.106, about 2.1σ. Real, but they are closer to
  each other than either is to the field.
* **PYRE / TERRAMOTH / NOCTURNE are one tier.** The whole band spans 0.055,
  inside the noise. Do not read an order into it.
* **A→B is 0.059, about 1.3σ.** The weakest boundary on the chart. Treat
  NOCTURNE, HALCYON and CIRRUS as nearly interchangeable in strength — they
  differ in *how* they get there, not how much.
* **HALCYON and CIRRUS are tied** to three decimal places by accident (0.001).
* **B→C is 0.092, about 2σ.** Real: OBELISK is genuinely last.

## 2. Tiers — HARD

The corroborating sample. Notable because it is **not** the same list.

| Mech | Lead | ± | vs EXTREME |
| --- | --- | --- | --- |
| NULLTIDE | **+0.288** | 0.030 | ▲ stronger at the lower tier |
| VESPER | +0.163 | 0.044 | ▼ much weaker |
| PYRE | +0.023 | 0.035 | ~ |
| HALCYON | −0.015 | 0.032 | ▲ |
| CIRRUS | −0.075 | 0.036 | ~ |
| NOCTURNE | −0.079 | 0.031 | ~ |
| TERRAMOTH | −0.095 | 0.031 | ▼ |
| OBELISK | −0.208 | 0.036 | ~ last at both tiers |

**spread 0.496.**

The two machines that move are the two that were buffed, in opposite directions.
NULLTIDE's projection is *stronger* against a weaker opponent — homing stun
rounds land more often on a pilot with worse evasion. VESPER's kit is the
reverse: kiting and the sniper stance both need the higher tier's competence to
pay off, so half his advantage evaporates at HARD.

**OBELISK is last at both tiers, and it is the only machine that is.**

---

## 3. How fair are the fights?

A tier list says who is strong. It does not say whether the fights are *good*.
These two numbers do:

| | EXTREME | HARD |
| --- | --- | --- |
| Matchups inside ±0.10 — a real fight | **11 of 28** | 9 of 28 |
| Matchups beyond ±0.30 — a bad fight | **5 of 28** | 6 of 28 |

So a bit under half the roster pairings are close, and roughly one in five is
decided by the select screen.

### Polarisation — how much a machine's result depends on who it drew

Standard deviation of a mech's lead across its seven opponents. Low means it
plays the same fight against everyone; high means it is rock-paper-scissors.

| Mech | Polarisation | Best matchup | Worst matchup |
| --- | --- | --- | --- |
| HALCYON | **0.118** | −0.003 | −0.370 |
| PYRE | **0.134** | +0.119 | −0.258 |
| NULLTIDE | 0.165 | +0.377 | −0.077 |
| CIRRUS | 0.197 | +0.183 | −0.377 |
| NOCTURNE | 0.212 | +0.148 | −0.433 |
| OBELISK | 0.231 | +0.053 | −0.680 |
| VESPER | 0.276 | +0.680 | +0.038 |
| TERRAMOTH | **0.321** | +0.234 | −0.662 |

**PYRE is the most balanced machine in the game** — a lead of −0.003, the
second-lowest polarisation, no matchup better than +0.119 or worse than −0.258.
It is the closest thing the roster has to a reference machine, which is a job
HALCYON is supposed to have.

**TERRAMOTH is the swingiest.** Average overall, but it beats NOCTURNE by +0.234
and loses to VESPER by −0.662. Its result is decided more by the draw than by
anything that happens in the match.

**HALCYON is uniform and uniformly behind.** The lowest polarisation on the
roster, and its single best result across all seven opponents is **−0.003** — a
dead heat with TERRAMOTH. It never wins a matchup. As the designated neutral
baseline that is a problem worth its own pass: the yardstick is bent.

---

## 4. The full chart — EXTREME

Row beats column. Positive means the row machine finishes ahead.

| | VES | NUL | PYR | TER | NOC | HAL | CIR | OBE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **VESPER** | — | +0.08 | +0.04 | **+0.66** | **+0.43** | +0.08 | +0.27 | **+0.68** |
| **NULLTIDE** | −0.08 | — | +0.26 | +0.24 | +0.07 | **+0.37** | **+0.38** | +0.28 |
| **PYRE** | −0.04 | −0.26 | — | −0.07 | +0.03 | +0.09 | +0.11 | +0.12 |
| **TERRAMOTH** | **−0.66** | −0.24 | +0.07 | — | +0.23 | +0.00 | +0.20 | +0.18 |
| **NOCTURNE** | **−0.43** | −0.07 | −0.03 | −0.23 | — | +0.13 | +0.15 | +0.08 |
| **HALCYON** | −0.08 | **−0.37** | −0.09 | −0.00 | −0.13 | — | −0.10 | −0.05 |
| **CIRRUS** | −0.27 | **−0.38** | −0.11 | −0.20 | −0.15 | +0.10 | — | +0.18 |
| **OBELISK** | **−0.68** | −0.28 | −0.12 | −0.18 | −0.08 | +0.05 | −0.18 | — |

### The five worst fights at EXTREME

| Matchup | Lead | ± |
| --- | --- | --- |
| VESPER over OBELISK | +0.680 | 0.066 |
| VESPER over TERRAMOTH | +0.662 | 0.051 |
| VESPER over NOCTURNE | +0.433 | 0.070 |
| NULLTIDE over CIRRUS | +0.377 | 0.088 |
| NULLTIDE over HALCYON | +0.370 | 0.049 |

Every one of them involves a machine buffed this session, and the two worst are
both VESPER against a slow frame. A sniper who can hold 792px against something
that cannot close is not in a fight; TERRAMOTH and OBELISK are the two slowest
chassis on the roster and they have no answer to the stance at all.

---

## 5. VESPER vs NULLTIDE — the matchup that flips

Worth its own section, because it is the one being played and the two tiers
disagree completely:

```
  EXTREME   VESPER over NULLTIDE   +0.077  +/-0.101   (0.8 sigma — a coin flip)
  HARD      VESPER over NULLTIDE   -0.330  +/-0.085   (3.9 sigma — decisive)
```

**At EXTREME it is the fairest fight either machine has.** VESPER's +0.077 is
inside its own error bar; across twelve seed pairs it is statistically
indistinguishable from even, and it is NULLTIDE's only losing matchup and
VESPER's narrowest win.

**At HARD, NULLTIDE wins it decisively.** Same two machines, opposite result,
and the flip is mechanical rather than random: the projection's homing stun
rounds land far more often against a pilot with worse evasion, while VESPER's
kiting and stance both need `rangeIq` and the top tier's dodging to be worth
what they cost.

So if this matchup feels inconsistent to play, that is because it is — but it is
inconsistent along the difficulty dial, not along the seed. Test it at EXTREME
and it is close; test it at HARD and it is not.

---

## 6. If the goal is to fix it

In the order the measurements support:

1. **VESPER and NULLTIDE are the whole problem.** Remove them and the remaining
   six span −0.210 to −0.003 — 0.207, which is a healthy band. The levers are in
   D105 (the projection's stun chance and duration) and D109 (the disarm chance
   and the stance's cadence — **not** projectile speed, which is measured out).
2. **OBELISK is last at both tiers** and was last before the buffs too. It has
   had three passes already (D99, D103, and the reach ablation that measured
   nothing). Its problem is not one number.
3. **HALCYON wins nothing.** Lowest polarisation, no positive matchup. Cheapest
   of the three to fix and the most valuable, because it is supposed to be the
   yardstick everything else is measured against.
4. **TERRAMOTH's polarisation, not its average.** At −0.030 it looks fine and it
   is not: it is two different machines depending on the draw.

---

*Caveats worth keeping in mind.* This is AI against AI at a fixed tier, and a
human plays differently — most obviously, the rival never deliberately fires a
command motion (§8c) and never chooses a sub-weapon (§8f), so lances, spreads and
sub-weapons are under-represented here relative to how a person plays. Nothing on
this page is a claim about how the roster feels in a human's hands; it is a claim
about what the simulation does, which is the part that can be measured.
