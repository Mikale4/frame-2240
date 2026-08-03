# Roster tier list and matchup chart

Measured, not judged. Every number comes from `tools/probe/balance.ts` — each
machine against each other machine, **both slot orders on the same seed, 12
seeds**, at the real 180-second round cap. 84 samples per mech: about **0.03
standard error** on lead and **0.05–0.10** on an individual matchup.

```
npx vite-node tools/probe/balance.ts -- --tier extreme --seeds 12 --matrix
```

Current as of **D125** — the deck became solid, which moved these numbers. `tools/probe/telemetry.ts` is the companion instrument:
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
| VESPER | 60 % | +0.136 | 0.034 | +1.77 / +1.31 |
| OBELISK | 55 % | +0.049 | 0.029 | +0.64 / +0.64 |
| CIRRUS | 54 % | +0.058 | 0.024 | +0.75 / +0.49 |
| HALCYON | 52 % | −0.014 | 0.021 | −0.18 / +0.30 |
| NULLTIDE | 51 % | −0.032 | 0.023 | −0.41 / +0.19 |
| PYRE | 48 % | −0.025 | 0.022 | −0.33 / −0.30 |
| TERRAMOTH | 45 % | −0.071 | 0.033 | −0.92 / −0.60 |
| **NOCTURNE** | **34 %** | **−0.101** | 0.026 | −1.32 / **−2.02** |

**spread 0.237.** lead SD 0.077 (true 0.072). **Outlier: NOCTURNE**, on record.

### The deck cost this, and it is worth knowing why

The spread was **0.143** before the floor became solid (D125). Making it solid
cost 0.075 for the mech half and 0.019 for the projectile half. Neither is a
tuning mistake — the floor had never been solid in flight and the game was
balanced around a hole in it.

**The mechanism is small and the response is large.** Measured on VESPER across
the change: 4.5 % more damage dealt, 2.3 % more taken. That is what an
eight-point record swing is made of, because at a spread this tight a couple of
percent of net edge flips a great many near-even matchups. Expect any mechanical
change to read as a balance event from here on.

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
| NULLTIDE | 58 % | +0.047 | +0.74 / +0.85 |
| HALCYON | 61 % | +0.013 | +0.20 / +1.14 |
| OBELISK | 57 % | +0.029 | +0.46 / +0.73 |
| CIRRUS | 54 % | +0.051 | +0.81 / +0.47 |
| VESPER | 51 % | +0.040 | +0.63 / +0.06 |
| PYRE | 43 % | −0.001 | −0.01 / −0.76 |
| NOCTURNE | 43 % | −0.042 | −0.67 / −0.73 |
| **TERRAMOTH** | **33 %** | **−0.136** | **−2.17** / −1.77 |

**spread 0.186 — improved** from 0.206, the one place the deck helped. Six of
eight sit inside 0.09. **Outlier: TERRAMOTH**, and it has been the weakest
machine at HARD in every measurement taken this session, before and after every
change. Left alone by design decision — see §5 and D120.

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

1. **NOCTURNE at EXTREME, 34 % / −0.101, −2.02σ.** The only flagged outlier at
   that tier and the lowest record in the game. Note that D122 explicitly found
   it *was not* an outlier and that calling it one was an error — that was true
   then and the deck change made it true no longer. Relevant context from the
   same entry: **HALCYON with LAST STAND stripped measures 36 %**, so the AV
   frame both machines share is the weakest chassis in the game and NOCTURNE is
   the one riding it without a signature.
2. **The EXTREME spread, 0.143 → 0.237.** Owed to the deck being solid rather
   than to any machine's tuning. One pass over the whole roster, not eight
   individual ones.
3. **VESPER at +1.77σ.** Not flagged, but the highest on the board and the
   machine that gained most from the deck.
4. **Acid is carried by nobody.** `Element.Corrosive` is implemented, tuned at
   0.42/tick over 210 ticks and applied by no weapon on the roster.

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
