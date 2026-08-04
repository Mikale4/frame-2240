# Roster tier list and matchup chart

Measured, not judged. Every number comes from `tools/probe/balance.ts` — each
machine against each other machine, **both slot orders on the same seed, 12
seeds**, at the real 180-second round cap. 84 samples per mech: about **0.03
standard error** on lead and **0.05–0.10** on an individual matchup.

```
npx vite-node tools/probe/balance.ts -- --tier extreme --seeds 12 --matrix
```

Current as of **D126**. `tools/probe/telemetry.ts` is the companion instrument:
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
| VESPER | 60 % | +0.127 | 0.035 | +1.48 / +1.02 |
| CIRRUS | **65 %** | +0.116 | 0.022 | +1.35 / +1.48 |
| OBELISK | 54 % | +0.039 | 0.029 | +0.45 / +0.38 |
| HALCYON | 51 % | −0.017 | 0.021 | −0.19 / +0.12 |
| PYRE | 45 % | −0.040 | 0.022 | −0.46 / −0.46 |
| NULLTIDE | 49 % | −0.042 | 0.024 | −0.49 / −0.09 |
| TERRAMOTH | 42 % | −0.082 | 0.032 | −0.95 / −0.75 |
| **NOCTURNE** | **33 %** | **−0.102** | 0.026 | −1.19 / −1.68 |

**spread 0.230.** lead SD 0.086 (true 0.082). **No outliers** — the field is one
population at both tiers.

### The spread rose from 0.143 and that is not a regression

Two deliberate changes account for it. **The deck became solid** (D125) — the
game had been balanced around a floor that did not exist in flight, and putting
it back cost 0.075 for machines and 0.019 for rounds. **OVERDRIVE went back to
5.5 seconds** by request (D126), which is most of the rest.

**At this spread, record is a very sensitive function of margin.** VESPER gained
4.5 % output against 2.3 % intake from the deck, and that moved him eight points
of win rate. Expect any mechanical change to read as a balance event.

## 2. Fairness

| | D117 | D118 | D120 | now |
| --- | --- | --- | --- | --- |
| Matchups inside ±0.10 — a real fight | 13/28 | 15/28 | 18/28 | **15/28** |
| Matchups beyond ±0.30 — a bad fight | 1/28 | 1/28 | 1/28 | **1/28** |

Fairness peaked at D120 and gave some back in D121: making every element damage
moved several pairings, most of them NULLTIDE's, who carries three of the four
elements in the game. The spread and the win-rate range both improved across the
same change, so this is redistribution rather than regression — but it is worth
watching rather than reading as noise.

The single bad pairing is **VESPER over TERRAMOTH at +0.59**, kept by design
decision. See §5, and read D120 before touching it.

## 3. The full chart — EXTREME

Row beats column.

| | HAL | NOC | VES | TER | CIR | OBE | PYR | NUL |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **HALCYON** | — | −0.02 | +0.10 | +0.08 | −0.15 | +0.02 | +0.02 | −0.12 |
| **NOCTURNE** | +0.02 | — | −0.13 | −0.20 | 0.00 | −0.20 | −0.04 | +0.15 |
| **VESPER** | −0.10 | +0.13 | — | **+0.59** | −0.05 | +0.19 | −0.02 | −0.12 |
| **TERRAMOTH** | −0.08 | +0.20 | **−0.59** | — | +0.09 | 0.00 | +0.14 | −0.02 |
| **CIRRUS** | +0.15 | 0.00 | +0.05 | −0.09 | — | +0.10 | +0.07 | +0.14 |
| **OBELISK** | −0.02 | +0.20 | −0.19 | 0.00 | −0.10 | — | −0.05 | +0.14 |
| **PYRE** | −0.02 | +0.04 | +0.02 | −0.14 | −0.07 | +0.05 | — | −0.19 |
| **NULLTIDE** | +0.12 | −0.15 | +0.12 | +0.02 | −0.14 | −0.14 | +0.19 | — |

## 4. HARD

| Mech | Win | Lead | z(lead/win) |
| --- | --- | --- | --- |
| CIRRUS | 66 % | +0.118 | +1.56 / +1.42 |
| NULLTIDE | 55 % | +0.036 | +0.47 / +0.47 |
| VESPER | 51 % | +0.034 | +0.44 / +0.05 |
| OBELISK | 55 % | +0.016 | +0.21 / +0.45 |
| HALCYON | 60 % | +0.006 | +0.08 / +0.84 |
| PYRE | 40 % | −0.012 | −0.16 / −0.87 |
| NOCTURNE | 41 % | −0.054 | −0.70 / −0.79 |
| **TERRAMOTH** | **32 %** | **−0.144** | −1.89 / −1.58 |

**spread 0.262.** No outliers. TERRAMOTH has been the weakest machine at HARD in
every measurement taken across two sessions, before and after every change —
left alone by design decision, see §5 and D120.

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

1. **NOCTURNE at EXTREME, 33 % / −0.102.** The lowest record in the game. Options
   are already swept and the answer is projectile speed — see `SESSION_HANDOFF.md`
   §4 for the table and the two cautions attached to it.
2. **TERRAMOTH at HARD**, 32 % / −0.144. Long-standing, and out of scope by
   design decision.
3. **Acid is carried by nobody.** `Element.Corrosive` is implemented and applied
   by no weapon on the roster.
4. **The lance connects 1–2 % of the time for every machine**, which the rival's
   inability to choose a command motion (§8d) explains and does not excuse.

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
