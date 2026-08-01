# Archive Rewrite Brief

**For an external editor. Read this whole file before writing anything.**

You are rewriting the in-game lore Archive for *Babel Sword: Reignition*, an
original 2D aerial mecha combat game. The current text was drafted by an AI and
reads like it. Your job is to make it read like it was written by a person — or
more precisely, by the several different institutions that are supposed to have
written it.

The complete current text is in **§7**, all 21 entries.

---

## 1. What the Archive is

An in-game lore reader, reached from the main menu. Three levels: section →
entry → page. Twenty-one entries in three sections:

| Section | Entries |
| --- | --- |
| THE WORLD | 5 — the setting, the catastrophe, the powers, the war, the incident |
| MACHINES | 8 — one per playable mech |
| PILOTS | 8 — one per pilot, same ids as the machines |

Each entry has four fields: `title`, `subtitle`, `tagline` (a short italic line
under the title), and `body` (an array of paragraphs, rendered with a blank line
between each). Pages scroll.

The conceit is that this is a **records system**, not a novel. Entries are
written by an institution about people and machines, some of which it dislikes.

**Planned feature, relevant to how you write:** entries will later start
*redacted* and unlock as the player progresses through a campaign. The text is
complete now precisely so it can be withheld later. Write it whole. Do not leave
mysteries, hooks, or "the truth may never be known" gestures — the game will
create mystery by hiding finished paragraphs, not by writing vague ones.

---

## 2. The job

Rewrite all 21 entries so they stop reading as machine-generated. Specifically:

1. **Break the uniformity.** This is the single biggest problem. Every entry is
   the same shape, the same length, and the same voice.
2. **Cut the tics** listed in §4 to roughly the frequencies given there.
3. **Vary the register.** Right now every entry is dry, wry and knowing. Some
   should be flat and bureaucratic. One or two should be partisan or annoyed.
   One should be badly written *in character* — a Free Latitude entry has no
   reason to read like a Concord file.
4. **Keep every fact.** See §3. This is a hard constraint and it is easy to
   violate by accident while rephrasing.

Length may move ±25% per entry. Total should stay roughly 4,000–5,500 words.

---

## 3. Canon lock — must not change

Rephrase freely. Do not alter any of the following.

### 3.1 The timeline

The present is **CE 43**. Every date below is fixed:

```
pre-era   the Descent; the ground closes over four generations
CE 25     the Emberline Pact forms from seven yards
CE 27     the Seven Yards War opens
CE 30     the settlement; thirty AV-13 airframes pass to Emberline
CE 31     STILLWAKE. The EW programme is tested on an inhabited yard
CE 32     the war formally ends; the court of inquiry sits
CE 33     Rook crosses to Emberline; Senna and the fourteenth frame vanish
CE 34     Ironwake arms the Pattern 3 walkers
CE 37     the EW-14's threat rating is entered as provisional
CE 38     Doyne requests detached duty
CE 43     now
```

Other fixed figures: 2,240 people evacuated from Stillwake; 14 EW airframes
built, 13 struck; ~900 processing stacks before the Descent; 140 lift spars per
yard; 40 AV-12 airframes built, 9 pilots certified (5 lost, 3 withdrew, 1 still
flying); Emberline held 7 yards at founding, holds 9, wants 13.

### 3.2 The Stillwake resolution

Three entries used to be separate mysteries and now resolve into one incident.
**This interlock must survive.** Concord's electronic-warfare programme was built
to collapse a *yard's* lift network, not to fight frames. It was tested on
inhabited Stillwake Yard in CE 31. From that:

- **The EW-14 NULLTIDE** is the fourteenth airframe, the one never recovered.
- **Io Senna** flew the trial, was cleared, and was erased from the record rather
  than charged. That is why she never finishes a helpless opponent.
- **Halden Rook** flew escort unbriefed, entered the yard against orders, held
  the evacuation lift nine hours (hence his burns), and testified in open session
  to what the trial was for — which is why the inquiry cleared him *and* ended his
  career with the same document.

### 3.3 Pilots — genders and ages are fixed

Fixed by a separate portrait spec. **Four women, four men.** Do not change any:

| Mech | Pilot | Gender / age |
| --- | --- | --- |
| HALCYON | Naia Vesk | Woman, early 30s |
| NOCTURNE | Halden Rook | Man, late 40s |
| VESPER | Kestrel Doyne | Man, late 20s |
| TERRAMOTH | Brunn Okonkwo | Man, 50s |
| CIRRUS | Mira Holloway | Woman, early 20s |
| OBELISK | Saar Tengku | Man, 40s |
| PYRE | Rasa Volkov | Woman, mid 20s |
| NULLTIDE | Io Senna | Woman, 30s |

**Machines are "it". Pilots get their own pronouns.** Never borrow a pilot's
pronoun for their mech.

### 3.4 Facts that match the game's simulation

The lore is written *against* what the game actually does, so a player who has
flown the mech recognises the description. These are mechanics, not flavour:

| Mech | Must remain true |
| --- | --- |
| HALCYON | Balanced/unremarkable. ARBITER drone raises energy regen ~45%. 6-hit melee; longest reach of any blade (200). |
| NOCTURNE | Heavier, slower rebuild of a Concord frame. Barrier regen ×2. WARDEN drone repairs barrier. Hydraulic claw, 3-hit melee. |
| VESPER | Longest range, second-thinnest hull, damage dealt ×1.14. SIGHTLINE drone shoots down incoming projectiles. 2-hit melee. |
| TERRAMOTH | Heaviest and slowest. Damage taken ×0.86 (ARMOUR BRACE). Mining machine, armed later. BULWARK drone lays mines. |
| CIRRUS | Fastest, most fragile. Boost regen ×2. 8-hit melee — longest on the roster. WISP drone strings a charged line to its owner. |
| OBELISK | Barrier-centric; guard drain ×0.55. Purpose-built defensive frame. AEGIS drone projects a dome that erases shots. 2-hit melee. |
| PYRE | Short range, saturation gain ×1.8. EMBER drone lays burning ground. 3-hit melee. Frailest drone. |
| NULLTIDE | Halves *opponent's* energy regen (JAMMING FIELD). Cryo/shock payloads. 5-hit melee cascade; reach 192, which is short — claim no reach superlative. STATIC drone projects a decoy. |

**Melee reference, authoritative** (from `meleeLock.hits` and `meleeRange`; the
mech-select screen prints the hit counts, so a player can check these):

| Mech | hits | reach |
| --- | --- | --- |
| HALCYON | 6 | 200 |
| NOCTURNE | 3 | 210 |
| VESPER | 2 | 180 |
| TERRAMOTH | 2 | 210 |
| CIRRUS | 8 | 195 |
| OBELISK | 2 | 205 |
| PYRE | 3 | 198 |
| NULLTIDE | 5 | 192 |

Two details people get wrong:

- **STATIC does not become the decoy.** It stays where it is and *projects* a
  separate false silhouette some distance away. Both are on screen at once, and
  the decoy imitates the **mech**, not the drone. The decoy does no damage; its
  shots only sometimes stun.
- **A drone is not a weapon the pilot fires.** Drones are permanently deployed,
  fly themselves, and can be shot down and rebuilt once.

---

## 4. The diagnosis — measured, not impressionistic

Counts over the current 4,871 words of body text, 89 paragraphs, 21 entries.

| Tic | Current | Target |
| --- | --- | --- |
| Em dashes (—) | **30** (6.2 per 1,000 words) | **≤10** |
| Negation frames — "is not X", "does not Y", "was not Z" | **73** | **≤25** |
| "never" / "not once" | **23** | **≤8** |
| ", which is/was …" appositive tails | **12** | **≤4** |
| "rather than" | **15** | **≤5** |
| "on the grounds/reasoning/assumption that" | **4** | **≤1** |
| The Archive referring to itself ("the Archive is obliged to note") | **3** | **≤1** |
| Entries ending on a short punchline (<14 words) | **9 of 21** | **≤4** |

### 4.1 The patterns behind the numbers

**a) The terminal sting.** Almost every entry ends on a short reversal. "They are
crew." / "Data point." / "It is not a compliment and it is not an insult; it is a
job description." / "Free Latitude has never asked anyone to." Individually good.
Twenty-one times, it is a machine writing a formula. Most entries should end on
an ordinary sentence, or trail off into a mundane detail.

**b) Definition by negation.** "It was not a war and it was not a single day." /
"This is not caution." / "The cheerfulness is not a front and it is not
stupidity." The text constantly tells you what something *isn't* before saying
what it is. Say what it is.

**c) Balanced antithesis.** "heavier by a fifth, slower by a tenth" / "His hands
are measurably slower and his reads are measurably better" / "few and heavy
against many and light." Real writing is lopsided.

**d) Identical architecture.** Every machine entry runs origin → mechanism →
drone → sting. Every pilot entry runs background → psychology → physical detail →
sting. Vary paragraph counts (3–6) and vary what a paragraph is *for*.

**e) Everything pays off.** No detail is inert. Real records contain dead weight:
a serial number, a procurement note, a date that leads nowhere. Add some.

**f) One register only.** Everything is dry, wry, knowing, faintly amused. There
is no anger, no boredom, no bureaucratic flatness, no partisanship.

**g) Spelled-out numbers as texture.** "two thousand two hundred and forty", "a
hundred and forty lift spars", "some nine hundred processing stacks". Keep the
figures (§3.1) but stop deploying them for rhythm. Digits are fine in a file.

---

## 5. What good looks like

- **Institutions with different voices.** A Concord file is procedural and
  defensive. Ironwake writes like a works foreman. Ashfall writes like an
  invoice. Free Latitude barely writes at all. Emberline is still angry about
  CE 30.
- **Concrete over clever.** A part number, a procedure, a piece of jargon used
  without explanation beats an epigram.
- **Let some entries be plain.** Not everything needs a thesis.
- **Vary form.** One entry could carry a quoted line from a testimony or an
  inspection note. One could be a list. One could be visibly incomplete because
  the institution writing it did not care.
- **British spelling** throughout (armour, metre, recognise, colour). Keep it.
- Serial commas are **not** used. Keep that.

---

## 6. What not to do

- Do not add new named characters, factions, yards, or machines.
- Do not resolve anything differently from §3.2.
- Do not make it grimmer or more melodramatic. The tone is matter-of-fact about
  terrible things; that part works.
- Do not use markdown formatting inside the prose (no bold, no bullets in body
  paragraphs).
- Do not write in second person or address the player.
- Avoid: "testament to", "stands as", "a stark reminder", "little more than",
  "it is worth noting", "in many ways", "the reality is". None appear now; do not
  introduce them.

---

## 7. Output format

Return **markdown in exactly the structure below**, all 21 entries, nothing else.
Do not output TypeScript, and do not attempt to escape anything — the developer
will handle integration.

```
### `halcyon` — AV-07 HALCYON
- **subtitle:** ...one line...
- **tagline:** ...one line...

**¶1.** ...paragraph...

**¶2.** ...paragraph...
```

Rules:

- Keep every `id` exactly as given. Keep machine designations (`AV-07`, `HV-03`,
  `LT-21`, `GD-09`, `IN-05`, `EW-14`) and pilot names exactly.
- Titles may not change. Subtitles and taglines may.
- Paragraph count per entry may change; state it implicitly by how many you write.
- Use straight apostrophes (`'`), not typographic ones.
- No double spaces anywhere. No trailing spaces.
- If you use a dash as punctuation use a spaced em dash ( — ), never a hyphen.
  But use far fewer than the current text does.

---

## 8. The current text

Everything below is the text to rewrite, dumped directly from the game data.


## SECTION: THE WORLD  `(id: world)`

### `world` — THE SKYWARD

- **subtitle:** Standing orders, common era 43
- **tagline:** Everything worth having is above the cloud deck.
- **paragraphs:** 4

**¶1.** The ground has not been survivable for four generations. What is left of it is weather — a permanent grey ceiling of storm and particulate that begins about two thousand metres up and does not end. Above that ceiling the air is clear, cold and thin, and every structure humanity still owns is bolted to a spar, a mast or a gantry hanging in it. The era is counted from the year the last ground city was abandoned; everything before that is filed as the Descent.

**¶2.** These structures are called yards. They are cathedral-scale lattices of girder and plate, built outward rather than upward, and they exist because the ore convoys have to dock somewhere. A yard is a port, a foundry, a town and a fortress in the same breath, and whoever holds one holds everything that passes through it.

**¶3.** Aerial frames — mechs — exist because nothing else works up here. A ship is too large to move inside a lattice and too obvious to hide behind one. A frame is a pilot, a reactor and as many thrusters as the airframe will carry, and it fights in three dimensions inside a structure that was built to hold cranes.

**¶4.** There has not been a declared war since the Seven Yards War closed in 32 CE. There has also not been a week without a contested docking, a disputed claim or a yard changing hands. The five powers below all maintain that the other four started it, and this is inherited rather than argued: it is what they each say about the Descent as well.

---

### `descent` — THE DESCENT

- **subtitle:** Before the era · cause of record
- **tagline:** Nobody did it. Everybody did it. Both statements are in the record.
- **paragraphs:** 4

**¶1.** It was not a war and it was not a single day. For roughly a century before the era, the lower atmosphere was worked industrially — some nine hundred processing stacks at their peak, owned by everyone, venting continuously into air that was assumed to be large enough not to notice. The assumption held for four generations of operators and then stopped holding within one.

**¶2.** What closed the ground was particulate. Enough of it, suspended long enough, to hold heat in the middle air and drive a storm layer that never fully discharges and never fully clears. There was no threshold anyone crossed deliberately, which is precisely the difficulty: no operator's stack was responsible and the sum of them was. The last ground city was abandoned in good order, over eleven months, with the lights still working.

**¶3.** The ore is the part nobody says out loud. The floating seams that Ironwake cuts, that the convoys carry and that every yard exists to receive, are mineral rafts precipitated out of the storm layer itself — a century of stack output, condensed, drifting and now the only resource above the cloud deck worth fighting over. The five powers are living on what killed the ground, and they are mining it.

**¶4.** Concord's doctrine calls the Descent an industrial accident. Emberline calls it a Concord accident. Ironwake, who cut the seams before anyone armed them and knows exactly what the ore is, has never issued a position, and the Colliery's silence on the question is the loudest thing in the record.

---

### `factions` — THE FIVE POWERS

- **subtitle:** Who builds, who flies, who pays
- **tagline:** Nobody up here calls themselves an empire. Everybody behaves like one.
- **paragraphs:** 5

**¶1.** CONCORD SKYWARD — the oldest surviving authority and the only one with a doctrine written down. It builds the AV line: airframes designed by committee, tested to exhaustion, and deliberately unexciting. A Concord frame is never the best machine in a fight and is very rarely the worst.

**¶2.** IRONWAKE COLLIERY — not a military at all. A mining concern that armed its excavation walkers when the convoys started being taken, and discovered that equipment built to survive a rock fall survives most other things too. Its HV and GD frames are industrial machines that were never asked whether they wanted to be weapons.

**¶3.** THE EMBERLINE PACT — a defensive alliance of seven yards that has outlived the threat it was formed against and become the thing it was formed against. Emberline frames are Concord designs taken apart and rebuilt heavier, by people who thought the committee was wrong.

**¶4.** FREE LATITUDE — less an organisation than an agreement not to ask. It flies LT and EW frames assembled from salvage, and it is the only power whose machines are each genuinely unique. Concord calls them pirates. They dock at Concord yards regularly and are not turned away.

**¶5.** THE ASHFALL IRREGULARS — mercenaries, and the only honest people in the sky about it. They take contracts from all four of the above, sometimes in the same month, and their IN frames are built on the assumption that a fight is short and somebody else is paying for the repairs.

---

### `war` — THE SEVEN YARDS WAR

- **subtitle:** CE 27 – CE 32 · Concord Skyward against the Emberline Pact
- **tagline:** It ended in a settlement. Nobody has described it as a peace.
- **paragraphs:** 4

**¶1.** The Emberline Pact was formed in 25 CE by seven yards who had each, separately, been informed by Concord Skyward that their docking rights were under review. Two years later the review was carried out with frames. Concord has never accepted the word invasion and has never proposed an alternative one.

**¶2.** It was fought the way everything up here is fought: not for ground, because there is none, but for the lattices the convoys must pass through. Five years, no front line, and a casualty figure that both sides publish and neither will reconcile. The war is the reason every machine on this roster exists in the form it does.

**¶3.** The settlement of 30 CE transferred thirty AV-13 airframes to the Pact as reparation, which Concord regarded as a generous disposal of an obsolete mark and Emberline regarded as thirty free spars. Within two years they had been stripped and rebuilt into something Concord would not certify. The formal end came in 32 CE, eighteen months after the fighting had already stopped, and after STILLWAKE.

**¶4.** The Pact held seven yards when it was formed and holds nine now. Its stated intention is thirteen. Concord's standing orders describe the current arrangement as a cessation, which is a word chosen carefully by people who expect to need it again.

---

### `stillwake` — STILLWAKE

- **subtitle:** CE 31 · Concord Skyward · electronic warfare trial
- **tagline:** The programme worked. That was the finding.
- **paragraphs:** 4

**¶1.** Concord's electronic-warfare programme was not designed against frames. A frame carries a pilot who can glide, and jamming one produces an inconvenience. A yard carries nine thousand people and holds its altitude by continuous reactor output across a hundred and forty lift spars, and the programme was designed against that. Fourteen airframes were built. The operational question was whether a single frame could put a yard's spar network into cascade from outside its defensive envelope.

**¶2.** On the eleventh of the fourth, 31 CE, that question was tested against Stillwake Yard, which was in Pact hands and was inhabited. The cascade took four minutes to propagate and a further nineteen to become unrecoverable. The yard did not fall; it settled, over most of a day, into the storm layer and through it. Two thousand two hundred and forty people were taken off. The remainder were not.

**¶3.** Concord's position, then and now, is that Stillwake was a legitimate military target under review and that the loss of the lift network was not the anticipated outcome of the trial. Both halves of that sentence are defensible. Together they are the reason the fighting stopped eighteen months before anyone signed anything: neither side could work out how to continue a war in which this had happened and been survivable to admit.

**¶4.** The programme was closed the following year. Thirteen airframes were recovered to inventory and struck. The fourteenth was not, and the pilot who had flown the trial was removed from the record rather than charged — a decision the court of inquiry noted, declined to overturn, and did not explain. Every later mystery in this Archive is a consequence of that paragraph.

---


## SECTION: MACHINES  `(id: mechs)`

### `halcyon` — AV-07 HALCYON

- **subtitle:** Concord Skyward · Vantor Aeroworks · Mark VII
- **tagline:** The frame every other frame is measured against.
- **paragraphs:** 4

**¶1.** The seventh airframe of the Aerial Vanguard programme and the first that Concord considered finished. Where the six before it each solved one problem and created two, the HALCYON solved none outstandingly and created none at all. Vantor Aeroworks delivered it eleven years late, four times over budget, and it has not needed a redesign since.

**¶2.** Its reputation is for being unremarkable, which its pilots resent and its opponents do not. Every gauge on it is adequate. The beam saber is the shortest chain of any sword on the roster and the most reliable. The lance charges fast enough to threaten and cheap enough to repeat. It has no trick, and so there is nothing to take away from it.

**¶3.** The REACTOR LINK is the one genuine innovation: the ARBITER escort carries a secondary coupling that feeds the parent reactor while deployed, raising regeneration by nearly half. Vantor spent a decade insisting this was a cooling system. It is a cooling system. It also happens to mean a HALCYON pilot can afford to be wrong more often than anyone else.

**¶4.** Concord issues it to instructors, to first postings, and to the pilots it expects to still be alive in ten years. It is the machine you are given when nobody has decided yet what you are.

---

### `nocturne` — AV-13 NOCTURNE

- **subtitle:** Emberline Pact · rebuilt from Concord pattern · Mark XIII
- **tagline:** A HALCYON that was told it was wrong and agreed.
- **paragraphs:** 4

**¶1.** Not a Concord machine, whatever the designation says. The Emberline Pact acquired thirty AV-13 airframes in the settlement of 30 CE and had stripped every one of them to the spar within two years. What came back out was heavier by a fifth, slower by a tenth, and hit like something that had stopped caring about the review process.

**¶2.** The rotary cannon is the visible change and the least important one. The real work was structural: Emberline replaced the barrier emitter with a twin-coil unit that regenerates at double rate, on the reasoning that a frame which can afford to guard does not need to be able to dodge. Concord filed a formal objection. Emberline filed it.

**¶3.** Its hydraulic claw is not a weapon Concord would have authorised. It was adapted from a salvage grapple, it is slow, and it does not cut so much as close. Pilots who have been on the receiving end describe the sound more often than the damage.

**¶4.** The Pact fields it as a line-holder and a statement. Thirteen is not an unlucky number in Emberline service; it is the number of yards they intend to hold.

---

### `vesper` — AV-12 VESPER

- **subtitle:** Concord Skyward · Vantor Aeroworks · Mark XII, limited run
- **tagline:** Built for one shot, and given only enough hull to take one in return.
- **paragraphs:** 4

**¶1.** A specialist frame from a programme that does not like specialists. The AV-12 exists because the yards are enormous and because a lattice offers sightlines a kilometre long if you know where to sit. Vantor built forty and then stopped, on the grounds that the pilots who could use it properly numbered fewer than forty.

**¶2.** Everything is traded for reach. The beam bayonet is a formality — a two-hit chain that exists so the frame is not defenceless, not because anyone expects it to be used. The hull is the second thinnest in the sky. In exchange it out-ranges every machine listed here, and the targeting suite adds fourteen per cent to everything that lands.

**¶3.** The SIGHTLINE escort was a late addition and changed the frame entirely. It does not shoot at the enemy; it shoots at what the enemy has fired, picking rounds out of the air so its pilot never has to break position. A VESPER that is allowed to stand still is the most dangerous thing at this altitude. Everything about fighting one is about not allowing it.

**¶4.** The loss rate is not advertised and is not classified; it is simply never quoted. Nine pilots have been certified on the AV-12. Five were lost, three withdrew from certification without flying an engagement, and one is still flying. That is not the highest total on the roster — the frame is too rare for that — but per engagement flown it is the highest figure Concord holds, by a margin it has twice reviewed and twice left alone. A VESPER that is found is finished. The forty airframes built have outlived the programme that could staff them.

---

### `terramoth` — HV-03 TERRAMOTH

- **subtitle:** Ironwake Colliery · Pattern 3 excavation walker, armed
- **tagline:** It was never designed to fight. It was designed not to stop.
- **paragraphs:** 4

**¶1.** A mining machine. The Pattern 3 was cutting ore out of a floating seam sixty years before anyone bolted a mortar to it, and the parts of it that make it terrifying are all original: the armour is rock-fall plating, the frame tolerances assume a collapse, and the ARMOUR BRACE that shaves fourteen per cent off everything it takes is a safety system with the interlocks removed.

**¶2.** Ironwake armed them in 34 CE after the third convoy in a season was taken and the Concord response was a written apology. The conversion was crude — a siege repeater where the cutting head sat, mortars in the spoil hoppers, the pile driver left exactly as it was because nothing needed improving. It remains the heaviest frame flying, and the slowest.

**¶3.** The BULWARK escort seeds charges rather than shooting: a Pattern 3 cannot chase, so it makes the ground behind it expensive instead. The tactic is inherited directly from seam work, where you do not pursue a rock fall, you make sure it does not follow you.

**¶4.** It is the only machine here whose pilots are not soldiers, and Ironwake has never once described them as such. They are crew.

---

### `cirrus` — LT-21 CIRRUS

- **subtitle:** Free Latitude · assembled at Brightwake · no two alike
- **tagline:** Thirty kilos of armour and every thruster that would fit.
- **paragraphs:** 4

**¶1.** There is no CIRRUS production line. There is a pattern, circulated freely, and twenty-one recorded machines built to it by people who mostly did not know each other. What they share is a philosophy: strip everything that is not thrust, then strip some of the thrust mountings too.

**¶2.** The result is the fastest frame in the sky and very nearly the most fragile. Boost regenerates at double rate because there is almost nothing else drawing on the reactor. The twin daggers carry an eight-hit chain — the longest melee sequence on the roster — because a machine this light cannot win a trade and has to win an exchange instead.

**¶3.** The WISP escort strings a charged line back to its parent. Flown well, in the pincer the Free Latitude pilots call *the scissor*, the wire sweeps through anything caught between the two. Flown badly it is a tether attached to the most fragile thing in the fight.

**¶4.** Concord assessments describe the LT-21 as unsurvivable and decline to certify it. Free Latitude has never asked anyone to.

---

### `obelisk` — GD-09 OBELISK

- **subtitle:** Ironwake Colliery · Guard pattern, yard defence
- **tagline:** Designed around the barrier, not around the gun.
- **paragraphs:** 4

**¶1.** Ironwake built the Pattern 3 to work and the GD-09 to stand in front of it. Where the TERRAMOTH is an industrial machine that was armed, the OBELISK is a purpose-built defensive frame — the only one the Colliery has ever designed from a blank sheet, and it shows in how single-minded it is.

**¶2.** The barrier is the entire machine. Its emitter pool is the largest fielded, it regenerates fastest, it recovers soonest after a break, and it drains at slightly over half the normal rate while held. Every other system is arranged to buy the barrier time: the ram shield exists to create distance, the bash chain is two hits because two is all you need to reset a fight.

**¶3.** The AEGIS escort projects a dome that erases incoming rounds outright. It costs the drone nothing to maintain and everything to be caught doing — holding the dome means holding position, and an AEGIS that is shot down takes the frame's whole defensive posture with it.

**¶4.** Yard crews call it the door. It is not a compliment and it is not an insult; it is a job description.

---

### `pyre` — IN-05 PYRE

- **subtitle:** Ashfall Irregulars · field-built · fifth of its name
- **tagline:** A short fight is a cheap fight, and Ashfall is paid either way.
- **paragraphs:** 4

**¶1.** The fifth frame to carry the name, and the first four are all accounted for in the wreck ledgers. Ashfall does not build machines to last a career; it builds them to make a contract short. Everything about the IN-05 is calibrated to the assumption that the engagement will be decided within ninety seconds.

**¶2.** The thermal cleaver, the cinder jet and the incendiary loadout all share a flaw the Irregulars decided was a feature: nothing on this frame reaches very far. The main gun dies at three hundred metres. In exchange the saturation reactor charges at nearly twice the standard rate, so a PYRE that is being hit is a PYRE that is about to do something drastic.

**¶3.** The EMBER escort lays burning ground in short bursts rather than shooting. The Irregulars did not invent area denial, but they are the only ones flying a machine that treats the whole engagement envelope as a consumable.

**¶4.** Ashfall's contract terms are the only ones in the sky that price hull loss separately from mission failure. Their pilots know this and it does not appear to slow them down.

---

### `nulltide` — EW-14 NULLTIDE

- **subtitle:** Concord Skyward, struck from inventory · flown under Free Latitude
- **tagline:** It does not out-shoot you. It makes you unable to shoot.
- **paragraphs:** 5

**¶1.** The fourteenth and last airframe of Concord's electronic-warfare programme, and the one that flew the Stillwake trial. Thirteen were recovered and struck when the programme closed in 32 CE. This one left with its pilot. Free Latitude has claimed it as salvage for eleven years and Concord has never once contested the claim, which is the most informative thing either party has said about it.

**¶2.** The missing maker's plate is not concealment and was not removed in the field. Programme airframes were never plated: an EW-14 was intended to be deniable while it was still in service. The hull that is hardest to identify in the sky is that way by Concord's own specification, and the Archive is obliged to note that the design intent and the current situation are indistinguishable from the outside.

**¶3.** It wins by subtraction. Its guns carry cryogenic and electrical payloads that slow, drain and stall rather than destroy, and its arc glaive is the longest-reaching sword on the roster because the frame expects to be fighting something that can no longer move properly.

**¶4.** The JAMMING FIELD halves the opponent's reactor regeneration outright — the only passive in service that reaches across and takes something away. The STATIC escort goes further: it projects a full false frame, indistinguishable from the real machine at any useful distance, which drifts, fires and cannot hurt anyone. Every round spent on it is a round that was aimed correctly at nothing.

**¶5.** Its threat rating was entered as provisional in 37 CE and has not been revised. The rating is provisional because the assessment board could not agree on what to rate: the frame in the sky is a light skirmisher with poor damage output, and the frame on the Stillwake file is the only weapon ever fielded that has taken a yard off the sky. They are the same airframe. Nobody has been willing to sign the sentence that says so.

---


## SECTION: PILOTS  `(id: pilots)`

### `halcyon` — NAIA VESK

- **subtitle:** Concord Skyward · Instructor, 2nd Interceptor · Woman, early 30s
- **tagline:** "I am not the best pilot here. I am the one who is still here."
- **paragraphs:** 5

**¶1.** Third generation Concord. Her grandmother signed off on the AV-01 and never flew anything. Her mother flew an AV-04 and did not come back from it, in a spar-root failure that had been raised as a fault three years earlier, scheduled for a revision in the following mark, and left in service meanwhile because the revision was not finished. Eleven other AV-04 airframes were grounded the same week. Vesk was nine.

**¶2.** She grew up inside the programme and has spent her career being quietly furious at how slow it is, which has not once shown in her flying. The fury and the caution are the same thing viewed from either end: she does not believe a machine is safe because a committee has not yet finished saying it is not.

**¶3.** She holds the longest unbroken active record in Concord service — eleven years, no hull loss — and is entirely aware that this is a statement about her judgement rather than her hands. It is also the reason she is an instructor at an age when her peers are still line pilots, a posting she asked for and now cannot leave.

**¶4.** The arrogance her file notes is real and narrower than it reads. She is not confident she will win. She is confident she will not lose in any of the ways that are her own fault, which is a much smaller claim and one she can actually support.

**¶5.** She flies the HALCYON because she was given it at nineteen and has never been offered a reason to change. Vantor has twice asked her to evaluate a successor frame. She has twice returned it with notes.

---

### `nocturne` — HALDEN ROOK

- **subtitle:** Emberline Pact · Line Sergeant, 7th Assault · Man, late 40s
- **tagline:** "Everyone gets old up here or they get famous. Pick one."
- **paragraphs:** 5

**¶1.** Concord trained him. He does not hide it and he does not dwell on it — twelve years in the AV line, two commendations, one court of inquiry that cleared him and ended his career anyway. He crossed to Emberline in 33 CE and took his flight manual with him, which the Pact found more valuable than the pilot.

**¶2.** He is the oldest active combatant in the sky by six years. His hands are measurably slower than they were and his reads are measurably better, and he has arranged his entire flying around that trade: guard rather than dodge, absorb rather than evade, let the young ones spend themselves on a frame that does not care.

**¶3.** The scarring is from Stillwake. Rook was flying escort on the trial and was not briefed on what it was; his squadron was told to hold a perimeter and did. When the lift network began to cascade he went into the yard against a standing order and spent the next nine hours on evacuation lift, which is where the burns are from. The frame he brought home at four thousand metres with a failed canopy was not his because its pilot was already dead in it, and he would not leave the body in the storm layer.

**¶4.** The court of inquiry in 32 CE cleared him of the order he had broken and ended his career with the same document. He had testified to what the trial was for, in open session, having worked it out afterwards from the flight tapes — and Concord could neither contradict a decorated witness nor keep one. He will not discuss any of it. The two thousand two hundred and forty people taken off Stillwake were taken off on the lift he held open, and he has never mentioned this either.

**¶5.** He trains Emberline's intake personally. His pilots have the lowest first-year loss rate of any unit in the sky and describe him, without affection, as impossible to impress.

---

### `vesper` — KESTREL DOYNE

- **subtitle:** Concord Skyward · Marksman, detached duty · Man, late 20s
- **tagline:** "You are all very fast. It has not helped yet."
- **paragraphs:** 4

**¶1.** One of nine pilots ever certified on the AV-12 and the only one currently flying. Doyne came out of yard survey rather than the flight programme — six years mapping lattice structure for Concord engineering, which is where he learned to read a yard as geometry instead of as terrain.

**¶2.** It is the whole of his advantage. He does not out-aim anyone. He knows, before an engagement starts, which four places in a given yard have a kilometre of clear line and a covered approach, and he is in one of them by the time anybody is looking for him.

**¶3.** The stillness his file describes is not calm. Colleagues who have flown wing with him report that he does not speak on the channel at all for the first several minutes of an engagement, and that this is more unnerving than anything the enemy does.

**¶4.** He requested detached duty in 38 CE and has not returned to a squadron since. Concord permits it because the results are not arguable. His evaluations note, every year, that he has no demonstrated ability to fight at close quarters, and that he has never needed to.

---

### `terramoth` — BRUNN OKONKWO

- **subtitle:** Ironwake Colliery · Seam Foreman, Pattern 3 crew · Man, 50s
- **tagline:** "It is not a war. It is a shift. Shifts end."
- **paragraphs:** 4

**¶1.** Not a soldier and does not pretend otherwise. Okonkwo has thirty-one years on the Pattern 3 and twenty-six of them were spent cutting ore. He was foreman of the Ironwake seam crew when the convoys started being taken, and he was foreman of the same crew, in the same machines, when they stopped being taken.

**¶2.** He is the calmest combatant in the sky and the reason is not courage. A seam collapse gives you about four seconds and no options; a firefight gives you minutes and dozens. He has said, on record and apparently without irony, that combat is the more relaxing of the two.

**¶3.** The goggles are welding gear and he has never replaced them with anything military. The Colliery offered him a commission in 36 CE and he declined it on the grounds that he already had a job, then declined it again in 39 and 42 on the same grounds.

**¶4.** His crew are miners. He is emphatic about this in a way that Ironwake management finds inconvenient and has stopped arguing with. Every one of them is still on the payroll under their original trade.

---

### `cirrus` — MIRA HOLLOWAY

- **subtitle:** Free Latitude · unaffiliated · Woman, early 20s
- **tagline:** "Worst case, I am somewhere else before it lands."
- **paragraphs:** 4

**¶1.** Yard-born, at Brightwake, which is not a place anyone is from on purpose. Holloway assembled her first LT-21 at seventeen out of three wrecks and a stolen reactor, flew it badly for a year, and has flown it better than anyone since. She has never held a rank or signed a contract.

**¶2.** Her flying is genuinely reckless and it is not naive. She has run the numbers that everyone else has run and reached a different conclusion: that a frame this fragile does not get safer by being careful, only slower, and slower is the one thing it cannot survive. So she commits, every time, on purpose.

**¶3.** The eight-hit dagger chain is hers. The pattern circulated with a four; Holloway extended it, published the modification for nothing, and was mildly offended when Concord assessment described it as impractical.

**¶4.** She is the youngest active pilot in the sky and has the highest recorded engagement count of anyone under thirty. Free Latitude does not track hull losses. Hers would not flatter her.

---

### `obelisk` — SAAR TENGKU

- **subtitle:** Ironwake Colliery · Yard Defence, standing watch · Man, 40s
- **tagline:** "Nothing gets past. That is the whole of it."
- **paragraphs:** 4

**¶1.** Twenty years of standing watch at the same three yards, which is a career most pilots would consider a punishment posting and which Tengku requested twice. He came up through Colliery security rather than mining, and he is the only pilot on this roster whose job has a defined success condition.

**¶2.** He does not pursue. This is not caution — pursuing means leaving, and leaving is the failure state. Opponents who mistake his patience for passivity discover that the GD-09 has a two-hit bash chain and that both hits are meant for someone who has just committed to something.

**¶3.** The braid is Colliery tradition, worn by anyone who has held a yard through a contested docking. Tengku has eleven. He does not mention this and someone else always does.

**¶4.** Asked, in a Concord liaison interview, what he would do if ordered to advance, he reportedly thought about it for some time and then asked what would be holding the door.

---

### `pyre` — RASA VOLKOV

- **subtitle:** Ashfall Irregulars · Contract pilot · Woman, mid 20s
- **tagline:** "They are paying for ninety seconds. Why would I take longer?"
- **paragraphs:** 4

**¶1.** Four PYRE frames, four wrecks, no injuries worth the word. Volkov holds the Irregulars' record for hull loss and, in the same ledger, their record for contracts completed. Ashfall's accountants have raised this twice and dropped it twice, because the second number pays for the first with room to spare.

**¶2.** The cheerfulness is not a front and it is not stupidity. She has read the same range charts as everyone else and knows exactly what a three hundred metre main gun means: that there is no version of her fight that happens at a comfortable distance, so there is no point being uncomfortable about it.

**¶3.** She has burned two yards she was contracted to defend. Both were ruled within terms. Neither client rehired her, and the queue behind them did not shorten.

**¶4.** The soot does not come off. She has stopped trying and now regards it as part of the uniform, which the Irregulars — who have no uniform — have quietly adopted.

---

### `nulltide` — IO SENNA

- **subtitle:** Concord Skyward, struck from record · flies under Free Latitude · Woman, 30s
- **tagline:** "Data point."
- **paragraphs:** 5

**¶1.** Senna was Concord's electronic-warfare programme. Not a member of it — the trials pilot the fourteen airframes were built around, certified at twenty-two, and the only person who ever flew one operationally. On the eleventh of the fourth, 31 CE, she flew the Stillwake trial. She was twenty-four. The gaps in her file are the wrong shape to be accidental because they are not gaps: the record was removed rather than lost, in the year the programme closed, by an authority the inquiry declined to name.

**¶2.** She was not charged. The finding was that the trial had been ordered, correctly briefed and correctly flown, and that its consequence was a failure of the yard's lift network rather than of the pilot — a conclusion that clears her completely and that she has never once been recorded accepting. She left with the airframe in 33 CE. Concord did not pursue it, and the Archive is required to observe that not pursuing it was also a decision.

**¶3.** What is observable now: she does not raise her voice, does not pursue, does not finish opponents who have stopped being able to fight, and appears to treat every engagement as a measurement rather than a contest. Pilots who have fought her describe the experience as being catalogued. The refusal to finish a helpless opponent is the only part of her flying that has never varied in eleven years, and it is the one thing in this entry the Archive would call a choice rather than a habit.

**¶4.** Her method is subtraction. Cryogenic and shock payloads to take away movement and power, a jamming field to take away the reactor, a false frame to take away certainty. By the time the arc glaive is relevant the opponent has usually been made unable to do anything about it.

**¶5.** She has never been recorded speaking about Stillwake, or about herself. The single personal remark in the file is secondhand: a Brightwake mechanic who says she once asked, apparently in earnest, why anyone would want to be remembered. He took it for detachment at the time. He has since revised the interpretation and asked that the revision be recorded here, which is why this line exists.

---
