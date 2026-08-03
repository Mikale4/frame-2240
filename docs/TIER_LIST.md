# Roster tier list and matchup chart

Measured, not judged. Every number comes from `tools/probe/balance.ts` — each
machine against each other machine, **both slot orders on the same seed, 12
seeds**, at the real 180-second round cap. 84 samples per mech: about **0.03
standard error** on lead and **0.05–0.10** on an individual matchup.

```
npx vite-node tools/probe/balance.ts -- --tier extreme --seeds 12 --matrix
```

Current as of **D121**. `tools/probe/telemetry.ts` is the companion instrument:
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

| Mech | Win | Lead | ± |
| --- | --- | --- | --- |
| VESPER | 49 % | +0.088 | 0.037 |
| CIRRUS | 57 % | +0.059 | 0.025 |
| NULLTIDE | 53 % | +0.004 | 0.026 |
| OBELISK | 50 % | −0.003 | 0.028 |
| HALCYON | 53 % | −0.011 | 0.022 |
| TERRAMOTH | 53 % | −0.037 | 0.035 |
| PYRE | 41 % | −0.044 | 0.024 |
| NOCTURNE | 43 % | −0.055 | 0.030 |

**spread 0.143 — the tightest the roster has ever measured** (0.208 before D118).
The win-rate range is 16 points, down from 21.

### Every fight ends by KO

Measured in `tools/probe/outcomes.ts`: across 1344 duels, **zero** were decided
by the clock. The 180-second cap is never reached, so `lead` — documented as the
game's timeout tiebreaker — never acts as one in AI play. Read it as "how
comfortably this machine kills", not as a tiebreak.

**Draws are now a real outcome.** Letting a status land the killing blow (D121)
made double KOs possible; they run about 11 of 168 fights for PYRE. `balance.ts`
scores them as half a win each. It did not until D121, and the bug flattered
whichever machine sat later in `ROSTER`.

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

| Mech | Win | Lead |
| --- | --- | --- |
| CIRRUS | 59 % | +0.070 |
| VESPER | 54 % | +0.052 |
| NULLTIDE | 55 % | +0.040 |
| HALCYON | 60 % | +0.039 |
| PYRE | 43 % | +0.013 |
| OBELISK | 56 % | +0.009 |
| NOCTURNE | 38 % | −0.087 |
| TERRAMOTH | **34 %** | **−0.136** |

**spread 0.206** (0.265 before D118). Six of eight sit inside 0.061 of each
other. The two that do not are NOCTURNE and TERRAMOTH, and TERRAMOTH has been the
weakest machine at HARD in every measurement taken — 37 % before the VESPER work
and 38 % before D118, so neither change caused it.

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

1. **NOCTURNE, 43 % / −0.055 at EXTREME and 38 % / −0.087 at HARD.** The lowest
   lead in the game and the second-lowest record at both tiers. Unlike PYRE
   before D121, the aggregates agree it is genuinely losing the exchange:
   96.9 bar/min dealt against 108.1 taken, the worst net on the roster, and the
   lowest `arrive` figure at 6.2 %. It is `{ ...HALCYON }` with a different
   escort and it is 15 points behind her.
2. **TERRAMOTH at HARD**, 34 % / −0.136. Long-standing, predates D118 and D120,
   and separate from the VESPER pairing in §5.
3. **Acid is carried by nobody.** `Element.Corrosive` is implemented, tuned at
   0.42/tick over 210 ticks and applied by **no weapon on the roster** — it
   appears only in test files. Either give it to something or delete it.
4. **The lance connects 1–2 % of the time for every machine.** It is close to
   worthless in AI hands, which the rival's inability to choose a command motion
   (§8d) fully explains and does not excuse.

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
