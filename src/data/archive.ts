/**
 * The Archive: official lore for the eight machines and the eight pilots.
 *
 * This is the game's story bible in data form. It is *not* flavour bolted onto
 * the stat block — every entry is written against what the simulation already
 * does, so a reader who has played the mech recognises it. TERRAMOTH's armour
 * brace, NULLTIDE's jamming field and PYRE's saturation gain are all facts of
 * the fight before they are facts of the fiction, and the lore explains them
 * rather than contradicting them.
 *
 * Kept apart from `data/mechs.ts` deliberately: that file is tuning, changed
 * whenever a number measures badly, and prose has no business sharing a diff
 * with a damage value. Nothing here is read by the simulation.
 *
 * Pilot genders and ages are fixed by `docs/PILOT_PORTRAIT_SPEC.md` and must
 * agree with it. Four women, four men.
 *
 * **The Archive is complete on purpose.** An earlier draft left deliberate holes
 * — the EW-14's provenance, Io Senna's history, Rook's inquiry — as campaign
 * material. That is now written out in full, because the campaign's plan for
 * this screen is *progressive disclosure*, not omission: entries will start
 * redacted and unlock as the player reaches the dialogue, event or investigation
 * that earns them. You cannot redact a paragraph that was never written, so the
 * complete corpus is the prerequisite for the feature rather than a spoiler of
 * it. Anything added here should be written whole and then gated later.
 *
 * **The present is CE 43.** Every dated event below is relative to that, and the
 * timeline is load-bearing now that the three gaps resolve into one incident:
 *
 *   pre-era  the Descent; the ground closes over four generations
 *   CE 25    the Emberline Pact forms from seven yards
 *   CE 27    the Seven Yards War opens
 *   CE 30    the settlement; thirty AV-13 airframes pass to Emberline
 *   CE 31    STILLWAKE. The EW programme is tested on an inhabited yard
 *   CE 32    the war formally ends; the court of inquiry sits
 *   CE 33    Rook crosses to Emberline; Senna and the fourteenth frame vanish
 *   CE 34    Ironwake arms the Pattern 3s
 *   CE 37    the EW-14's threat rating is entered as provisional
 *   CE 38    Doyne requests detached duty
 *   CE 43    now
 */

export interface ArchiveEntry {
  /** Mech id this belongs to; the pilot entry shares it. */
  id: string;
  /** Headline, e.g. `AV-07 HALCYON` or `NAIA VESK`. */
  title: string;
  /** One line under the title: builder and mark, or callsign and origin. */
  subtitle: string;
  /** Short definitional line, shown before the body. */
  tagline: string;
  /** The body, one paragraph per element. */
  body: string[];
}

// ---------------------------------------------------------------- the world

/**
 * The setting, in one place, so every entry below can lean on it without
 * restating it.
 *
 * Shown as the Archive's opening page.
 */
export const WORLD_ENTRY: ArchiveEntry = {
  id: 'world',
  title: 'THE SKYWARD',
  subtitle: 'Standing orders, common era 43',
  tagline: 'Everything worth having is above the cloud deck.',
  body: [
    'The ground has not been survivable for four generations. What is left of it ' +
      'is weather — a permanent grey ceiling of storm and particulate that begins ' +
      'about two thousand metres up and does not end. Above that ceiling the air ' +
      'is clear, cold and thin, and every structure humanity still owns is bolted ' +
      'to a spar, a mast or a gantry hanging in it. The era is counted from the ' +
      'year the last ground city was abandoned; everything before that is filed ' +
      'as the Descent.',
    'These structures are called yards. They are cathedral-scale lattices of ' +
      'girder and plate, built outward rather than upward, and they exist because ' +
      'the ore convoys have to dock somewhere. A yard is a port, a foundry, a ' +
      'town and a fortress in the same breath, and whoever holds one holds ' +
      'everything that passes through it.',
    'Aerial frames — mechs — exist because nothing else works up here. A ship is ' +
      'too large to move inside a lattice and too obvious to hide behind one. A ' +
      'frame is a pilot, a reactor and as many thrusters as the airframe will ' +
      'carry, and it fights in three dimensions inside a structure that was built ' +
      'to hold cranes.',
    'There has not been a declared war since the Seven Yards War closed in 32 CE. ' +
      'There has also not been a week without a contested docking, a disputed ' +
      'claim or a yard changing hands. The five powers below all maintain that the ' +
      'other four started it, and this is inherited rather than argued: it is what ' +
      'they each say about the Descent as well.',
  ],
};

/**
 * How the ground was lost. The Archive's second page, and the piece every other
 * entry quietly rests on — the yards, the ore, the convoys and the grievance all
 * come from here.
 */
export const DESCENT_ENTRY: ArchiveEntry = {
  id: 'descent',
  title: 'THE DESCENT',
  subtitle: 'Before the era · cause of record',
  tagline: 'Nobody did it. Everybody did it. Both statements are in the record.',
  body: [
    'It was not a war and it was not a single day. For roughly a century before ' +
      'the era, the lower atmosphere was worked industrially — some nine hundred ' +
      'processing stacks at their peak, owned by everyone, venting continuously ' +
      'into air that was assumed to be large enough not to notice. The assumption ' +
      'held for four generations of operators and then stopped holding within one.',
    'What closed the ground was particulate. Enough of it, suspended long enough, ' +
      'to hold heat in the middle air and drive a storm layer that never fully ' +
      'discharges and never fully clears. There was no threshold anyone crossed ' +
      'deliberately, which is precisely the difficulty: no operator\'s stack was ' +
      'responsible and the sum of them was. The last ground city was abandoned in ' +
      'good order, over eleven months, with the lights still working.',
    'The ore is the part nobody says out loud. The floating seams that Ironwake ' +
      'cuts, that the convoys carry and that every yard exists to receive, are ' +
      'mineral rafts precipitated out of the storm layer itself — a century of ' +
      'stack output, condensed, drifting and now the only resource above the ' +
      'cloud deck worth fighting over. The five powers are living on what killed ' +
      'the ground, and they are mining it.',
    'Concord\'s doctrine calls the Descent an industrial accident. Emberline calls ' +
      'it a Concord accident. Ironwake, who cut the seams before anyone armed ' +
      'them and knows exactly what the ore is, has never issued a position, and ' +
      'the Colliery\'s silence on the question is the loudest thing in the record.',
  ],
};

/** The last declared war, and the standoff it left behind. */
export const WAR_ENTRY: ArchiveEntry = {
  id: 'war',
  title: 'THE SEVEN YARDS WAR',
  subtitle: 'CE 27 – CE 32 · Concord Skyward against the Emberline Pact',
  tagline: 'It ended in a settlement. Nobody has described it as a peace.',
  body: [
    'The Emberline Pact was formed in 25 CE by seven yards who had each, ' +
      'separately, been informed by Concord Skyward that their docking rights were ' +
      'under review. Two years later the review was carried out with frames. ' +
      'Concord has never accepted the word invasion and has never proposed an ' +
      'alternative one.',
    'It was fought the way everything up here is fought: not for ground, because ' +
      'there is none, but for the lattices the convoys must pass through. Five ' +
      'years, no front line, and a casualty figure that both sides publish and ' +
      'neither will reconcile. The war is the reason every machine on this roster ' +
      'exists in the form it does.',
    'The settlement of 30 CE transferred thirty AV-13 airframes to the Pact as ' +
      'reparation, which Concord regarded as a generous disposal of an obsolete ' +
      'mark and Emberline regarded as thirty free spars. Within two years they had ' +
      'been stripped and rebuilt into something Concord would not certify. The ' +
      'formal end came in 32 CE, eighteen months after the fighting had already ' +
      'stopped, and after STILLWAKE.',
    'The Pact held seven yards when it was formed and holds nine now. Its stated ' +
      'intention is thirteen. Concord\'s standing orders describe the current ' +
      'arrangement as a cessation, which is a word chosen carefully by people who ' +
      'expect to need it again.',
  ],
};

/**
 * The incident. This is the hinge the Archive's three former mysteries all turn
 * on — the EW-14, Io Senna and Rook's inquiry are one event seen from three
 * sides, and the campaign is expected to unlock them in that order.
 */
export const STILLWAKE_ENTRY: ArchiveEntry = {
  id: 'stillwake',
  title: 'STILLWAKE',
  subtitle: 'CE 31 · Concord Skyward · electronic warfare trial',
  tagline: 'The programme worked. That was the finding.',
  body: [
    'Concord\'s electronic-warfare programme was not designed against frames. A ' +
      'frame carries a pilot who can glide, and jamming one produces an ' +
      'inconvenience. A yard carries nine thousand people and holds its altitude ' +
      'by continuous reactor output across a hundred and forty lift spars, and the ' +
      'programme was designed against that. Fourteen airframes were built. The ' +
      'operational question was whether a single frame could put a yard\'s spar ' +
      'network into cascade from outside its defensive envelope.',
    'On the eleventh of the fourth, 31 CE, that question was tested against ' +
      'Stillwake Yard, which was in Pact hands and was inhabited. The cascade took ' +
      'four minutes to propagate and a further nineteen to become unrecoverable. ' +
      'The yard did not fall; it settled, over most of a day, into the storm layer ' +
      'and through it. Two thousand two hundred and forty people were taken off. ' +
      'The remainder were not.',
    'Concord\'s position, then and now, is that Stillwake was a legitimate ' +
      'military target under review and that the loss of the lift network was not ' +
      'the anticipated outcome of the trial. Both halves of that sentence are ' +
      'defensible. Together they are the reason the fighting stopped eighteen ' +
      'months before anyone signed anything: neither side could work out how to ' +
      'continue a war in which this had happened and been survivable to admit.',
    'The programme was closed the following year. Thirteen airframes were ' +
      'recovered to inventory and struck. The fourteenth was not, and the pilot ' +
      'who had flown the trial was removed from the record rather than charged — ' +
      'a decision the court of inquiry noted, declined to overturn, and did not ' +
      'explain. Every later mystery in this Archive is a consequence of that ' +
      'paragraph.',
  ],
};

/** The five powers, for the Archive's second page. */
export const FACTION_ENTRY: ArchiveEntry = {
  id: 'factions',
  title: 'THE FIVE POWERS',
  subtitle: 'Who builds, who flies, who pays',
  tagline: 'Nobody up here calls themselves an empire. Everybody behaves like one.',
  body: [
    'CONCORD SKYWARD — the oldest surviving authority and the only one with a ' +
      'doctrine written down. It builds the AV line: airframes designed by ' +
      'committee, tested to exhaustion, and deliberately unexciting. A Concord ' +
      'frame is never the best machine in a fight and is very rarely the worst.',
    'IRONWAKE COLLIERY — not a military at all. A mining concern that armed its ' +
      'excavation walkers when the convoys started being taken, and discovered ' +
      'that equipment built to survive a rock fall survives most other things ' +
      'too. Its HV and GD frames are industrial machines that were never asked ' +
      'whether they wanted to be weapons.',
    'THE EMBERLINE PACT — a defensive alliance of seven yards that has outlived ' +
      'the threat it was formed against and become the thing it was formed ' +
      'against. Emberline frames are Concord designs taken apart and rebuilt ' +
      'heavier, by people who thought the committee was wrong.',
    'FREE LATITUDE — less an organisation than an agreement not to ask. It flies ' +
      'LT and EW frames assembled from salvage, and it is the only power whose ' +
      'machines are each genuinely unique. Concord calls them pirates. They dock ' +
      'at Concord yards regularly and are not turned away.',
    'THE ASHFALL IRREGULARS — mercenaries, and the only honest people in the sky ' +
      'about it. They take contracts from all four of the above, sometimes in the ' +
      'same month, and their IN frames are built on the assumption that a fight ' +
      'is short and somebody else is paying for the repairs.',
  ],
};

// ---------------------------------------------------------------- the mechs

export const MECH_ARCHIVE: ArchiveEntry[] = [
  {
    id: 'halcyon',
    title: 'AV-07 HALCYON',
    subtitle: 'Concord Skyward · Vantor Aeroworks · Mark VII',
    tagline: 'The frame every other frame is measured against.',
    body: [
      'The seventh airframe of the Aerial Vanguard programme and the first that ' +
        'Concord considered finished. Where the six before it each solved one ' +
        'problem and created two, the HALCYON solved none outstandingly and ' +
        'created none at all. Vantor Aeroworks delivered it eleven years late, ' +
        'four times over budget, and it has not needed a redesign since.',
      'Its reputation is for being unremarkable, which its pilots resent and its ' +
        'opponents do not. Every gauge on it is adequate. The beam saber is the ' +
        'shortest chain of any sword on the roster and the most reliable. The ' +
        'lance charges fast enough to threaten and cheap enough to repeat. It has ' +
        'no trick, and so there is nothing to take away from it.',
      'The REACTOR LINK is the one genuine innovation: the ARBITER escort carries ' +
        'a secondary coupling that feeds the parent reactor while deployed, ' +
        'raising regeneration by nearly half. Vantor spent a decade insisting ' +
        'this was a cooling system. It is a cooling system. It also happens to ' +
        'mean a HALCYON pilot can afford to be wrong more often than anyone else.',
      'Concord issues it to instructors, to first postings, and to the pilots it ' +
        'expects to still be alive in ten years. It is the machine you are given ' +
        'when nobody has decided yet what you are.',
    ],
  },
  {
    id: 'nocturne',
    title: 'AV-13 NOCTURNE',
    subtitle: 'Emberline Pact · rebuilt from Concord pattern · Mark XIII',
    tagline: 'A HALCYON that was told it was wrong and agreed.',
    body: [
      'Not a Concord machine, whatever the designation says. The Emberline Pact ' +
        'acquired thirty AV-13 airframes in the settlement of 30 CE and had ' +
        'stripped every one of them to the spar within two years. What came back ' +
        'out was heavier by a fifth, slower by a tenth, and hit like something ' +
        'that had stopped caring about the review process.',
      'The rotary cannon is the visible change and the least important one. The ' +
        'real work was structural: Emberline replaced the barrier emitter with a ' +
        'twin-coil unit that regenerates at double rate, on the reasoning that a ' +
        'frame which can afford to guard does not need to be able to dodge. ' +
        'Concord filed a formal objection. Emberline filed it.',
      'Its hydraulic claw is not a weapon Concord would have authorised. It was ' +
        'adapted from a salvage grapple, it is slow, and it does not cut so much ' +
        'as close. Pilots who have been on the receiving end describe the sound ' +
        'more often than the damage.',
      'The Pact fields it as a line-holder and a statement. Thirteen is not an ' +
        'unlucky number in Emberline service; it is the number of yards they ' +
        'intend to hold.',
    ],
  },
  {
    id: 'vesper',
    title: 'AV-12 VESPER',
    subtitle: 'Concord Skyward · Vantor Aeroworks · Mark XII, limited run',
    tagline: 'Built for one shot, and given only enough hull to take one in return.',
    body: [
      'A specialist frame from a programme that does not like specialists. The ' +
        'AV-12 exists because the yards are enormous and because a lattice offers ' +
        'sightlines a kilometre long if you know where to sit. Vantor built forty ' +
        'and then stopped, on the grounds that the pilots who could use it ' +
        'properly numbered fewer than forty.',
      'Everything is traded for reach. The beam bayonet is a formality — a ' +
        'two-hit chain that exists so the frame is not defenceless, not because ' +
        'anyone expects it to be used. The hull is the second thinnest in the ' +
        'sky. In exchange it out-ranges every machine listed here, and the ' +
        'targeting suite adds fourteen per cent to everything that lands.',
      'The SIGHTLINE escort was a late addition and changed the frame entirely. ' +
        'It does not shoot at the enemy; it shoots at what the enemy has fired, ' +
        'picking rounds out of the air so its pilot never has to break position. ' +
        'A VESPER that is allowed to stand still is the most dangerous thing at ' +
        'this altitude. Everything about fighting one is about not allowing it.',
      'The loss rate is not advertised and is not classified; it is simply never ' +
        'quoted. Nine pilots have been certified on the AV-12. Five were lost, ' +
        'three withdrew from certification without flying an engagement, and one ' +
        'is still flying. That is not the highest total on the roster — the frame ' +
        'is too rare for that — but per engagement flown it is the highest figure ' +
        'Concord holds, by a margin it has twice reviewed and twice left alone. A ' +
        'VESPER that is found is finished. The forty airframes built have outlived ' +
        'the programme that could staff them.',
    ],
  },
  {
    id: 'terramoth',
    title: 'HV-03 TERRAMOTH',
    subtitle: 'Ironwake Colliery · Pattern 3 excavation walker, armed',
    tagline: 'It was never designed to fight. It was designed not to stop.',
    body: [
      'A mining machine. The Pattern 3 was cutting ore out of a floating seam ' +
        'sixty years before anyone bolted a mortar to it, and the parts of it ' +
        'that make it terrifying are all original: the armour is rock-fall ' +
        'plating, the frame tolerances assume a collapse, and the ARMOUR BRACE ' +
        'that shaves fourteen per cent off everything it takes is a safety system ' +
        'with the interlocks removed.',
      'Ironwake armed them in 34 CE after the third convoy in a season was taken ' +
        'and the Concord response was a written apology. The conversion was ' +
        'crude — a siege repeater where the cutting head sat, mortars in the spoil ' +
        'hoppers, the pile driver left exactly as it was because nothing needed ' +
        'improving. It remains the heaviest frame flying, and the slowest.',
      'The BULWARK escort seeds charges rather than shooting: a Pattern 3 cannot ' +
        'chase, so it makes the ground behind it expensive instead. The tactic is ' +
        'inherited directly from seam work, where you do not pursue a rock fall, ' +
        'you make sure it does not follow you.',
      'It is the only machine here whose pilots are not soldiers, and Ironwake ' +
        'has never once described them as such. They are crew.',
    ],
  },
  {
    id: 'cirrus',
    title: 'LT-21 CIRRUS',
    subtitle: 'Free Latitude · assembled at Brightwake · no two alike',
    tagline: 'Thirty kilos of armour and every thruster that would fit.',
    body: [
      'There is no CIRRUS production line. There is a pattern, circulated freely, ' +
        'and twenty-one recorded machines built to it by people who mostly did ' +
        'not know each other. What they share is a philosophy: strip everything ' +
        'that is not thrust, then strip some of the thrust mountings too.',
      'The result is the fastest frame in the sky and very nearly the most ' +
        'fragile. Boost regenerates at double rate because there is almost ' +
        'nothing else drawing on the reactor. The twin daggers carry an eight-hit ' +
        'chain — the longest melee sequence on the roster — because a machine ' +
        'this light cannot win a trade and has to win an exchange instead.',
      'The WISP escort strings a charged line back to its parent. Flown well, in ' +
        'the pincer the Free Latitude pilots call *the scissor*, the wire sweeps ' +
        'through anything caught between the two. Flown badly it is a tether ' +
        'attached to the most fragile thing in the fight.',
      'Concord assessments describe the LT-21 as unsurvivable and decline to ' +
        'certify it. Free Latitude has never asked anyone to.',
    ],
  },
  {
    id: 'obelisk',
    title: 'GD-09 OBELISK',
    subtitle: 'Ironwake Colliery · Guard pattern, yard defence',
    tagline: 'Designed around the barrier, not around the gun.',
    body: [
      'Ironwake built the Pattern 3 to work and the GD-09 to stand in front of ' +
        'it. Where the TERRAMOTH is an industrial machine that was armed, the ' +
        'OBELISK is a purpose-built defensive frame — the only one the Colliery ' +
        'has ever designed from a blank sheet, and it shows in how single-minded ' +
        'it is.',
      'The barrier is the entire machine. Its emitter pool is the largest ' +
        'fielded, it regenerates fastest, it recovers soonest after a break, and ' +
        'it drains at slightly over half the normal rate while held. Every other ' +
        'system is arranged to buy the barrier time: the ram shield exists to ' +
        'create distance, the bash chain is two hits because two is all you need ' +
        'to reset a fight.',
      'The AEGIS escort projects a dome that erases incoming rounds outright. It ' +
        'costs the drone nothing to maintain and everything to be caught doing — ' +
        'holding the dome means holding position, and an AEGIS that is shot down ' +
        'takes the frame\'s whole defensive posture with it.',
      'Yard crews call it the door. It is not a compliment and it is not an ' +
        'insult; it is a job description.',
    ],
  },
  {
    id: 'pyre',
    title: 'IN-05 PYRE',
    subtitle: 'Ashfall Irregulars · field-built · fifth of its name',
    tagline: 'A short fight is a cheap fight, and Ashfall is paid either way.',
    body: [
      'The fifth frame to carry the name, and the first four are all accounted ' +
        'for in the wreck ledgers. Ashfall does not build machines to last a ' +
        'career; it builds them to make a contract short. Everything about the ' +
        'IN-05 is calibrated to the assumption that the engagement will be ' +
        'decided within ninety seconds.',
      'The thermal cleaver, the cinder jet and the incendiary loadout all share a ' +
        'flaw the Irregulars decided was a feature: nothing on this frame reaches ' +
        'very far. The main gun dies at three hundred metres. In exchange the ' +
        'saturation reactor charges at nearly twice the standard rate, so a PYRE ' +
        'that is being hit is a PYRE that is about to do something drastic.',
      'The EMBER escort lays burning ground in short bursts rather than shooting. ' +
        'The Irregulars did not invent area denial, but they are the only ones ' +
        'flying a machine that treats the whole engagement envelope as a ' +
        'consumable.',
      'Ashfall\'s contract terms are the only ones in the sky that price hull ' +
        'loss separately from mission failure. Their pilots know this and it does ' +
        'not appear to slow them down.',
    ],
  },
  {
    id: 'nulltide',
    title: 'EW-14 NULLTIDE',
    subtitle: 'Concord Skyward, struck from inventory · flown under Free Latitude',
    tagline: 'It does not out-shoot you. It makes you unable to shoot.',
    body: [
      'The fourteenth and last airframe of Concord\'s electronic-warfare ' +
        'programme, and the one that flew the Stillwake trial. Thirteen were ' +
        'recovered and struck when the programme closed in 32 CE. This one left ' +
        'with its pilot. Free Latitude has claimed it as salvage for eleven years ' +
        'and Concord has never once contested the claim, which is the most ' +
        'informative thing either party has said about it.',
      'The missing maker\'s plate is not concealment and was not removed in the ' +
        'field. Programme airframes were never plated: an EW-14 was intended to be ' +
        'deniable while it was still in service. The hull that is hardest to ' +
        'identify in the sky is that way by Concord\'s own specification, and the ' +
        'Archive is obliged to note that the design intent and the current ' +
        'situation are indistinguishable from the outside.',
      'It wins by subtraction. Its guns carry cryogenic and electrical payloads ' +
        'that slow, drain and stall rather than destroy, and its arc glaive is ' +
        'the longest-reaching sword on the roster because the frame expects to be ' +
        'fighting something that can no longer move properly.',
      'The JAMMING FIELD halves the opponent\'s reactor regeneration outright — ' +
        'the only passive in service that reaches across and takes something ' +
        'away. The STATIC escort goes further: it projects a full false frame, ' +
        'indistinguishable from the real machine at any useful distance, which ' +
        'drifts, fires and cannot hurt anyone. Every round spent on it is a round ' +
        'that was aimed correctly at nothing.',
      'Its threat rating was entered as provisional in 37 CE and has not been ' +
        'revised. The rating is provisional because the assessment board could ' +
        'not agree on what to rate: the frame in the sky is a light skirmisher ' +
        'with poor damage output, and the frame on the Stillwake file is the only ' +
        'weapon ever fielded that has taken a yard off the sky. They are the same ' +
        'airframe. Nobody has been willing to sign the sentence that says so.',
    ],
  },
];

// --------------------------------------------------------------- the pilots

export const PILOT_ARCHIVE: ArchiveEntry[] = [
  {
    id: 'halcyon',
    title: 'NAIA VESK',
    subtitle: 'Concord Skyward · Instructor, 2nd Interceptor · Woman, early 30s',
    tagline: '"I am not the best pilot here. I am the one who is still here."',
    body: [
      'Third generation Concord. Her grandmother signed off on the AV-01 and never ' +
        'flew anything. Her mother flew an AV-04 and did not come back from it, in ' +
        'a spar-root failure that had been raised as a fault three years earlier, ' +
        'scheduled for a revision in the following mark, and left in service ' +
        'meanwhile because the revision was not finished. Eleven other AV-04 ' +
        'airframes were grounded the same week. Vesk was nine.',
      'She grew up inside the programme and has spent her career being quietly ' +
        'furious at how slow it is, which has not once shown in her flying. The ' +
        'fury and the caution are the same thing viewed from either end: she does ' +
        'not believe a machine is safe because a committee has not yet finished ' +
        'saying it is not.',
      'She holds the longest unbroken active record in Concord service — eleven ' +
        'years, no hull loss — and is entirely aware that this is a statement ' +
        'about her judgement rather than her hands. It is also the reason she is ' +
        'an instructor at an age when her peers are still line pilots, a posting ' +
        'she asked for and now cannot leave.',
      'The arrogance her file notes is real and narrower than it reads. She is ' +
        'not confident she will win. She is confident she will not lose in any of ' +
        'the ways that are her own fault, which is a much smaller claim and one ' +
        'she can actually support.',
      'She flies the HALCYON because she was given it at nineteen and has never ' +
        'been offered a reason to change. Vantor has twice asked her to evaluate ' +
        'a successor frame. She has twice returned it with notes.',
    ],
  },
  {
    id: 'nocturne',
    title: 'HALDEN ROOK',
    subtitle: 'Emberline Pact · Line Sergeant, 7th Assault · Man, late 40s',
    tagline: '"Everyone gets old up here or they get famous. Pick one."',
    body: [
      'Concord trained him. He does not hide it and he does not dwell on it — ' +
        'twelve years in the AV line, two commendations, one court of inquiry ' +
        'that cleared him and ended his career anyway. He crossed to Emberline in ' +
        '33 CE and took his flight manual with him, which the Pact found more ' +
        'valuable than the pilot.',
      'He is the oldest active combatant in the sky by six years. His hands are ' +
        'measurably slower than they were and his reads are measurably better, ' +
        'and he has arranged his entire flying around that trade: guard rather ' +
        'than dodge, absorb rather than evade, let the young ones spend ' +
        'themselves on a frame that does not care.',
      'The scarring is from Stillwake. Rook was flying escort on the trial and was ' +
        'not briefed on what it was; his squadron was told to hold a perimeter and ' +
        'did. When the lift network began to cascade he went into the yard against ' +
        'a standing order and spent the next nine hours on evacuation lift, which ' +
        'is where the burns are from. The frame he brought home at four thousand ' +
        'metres with a failed canopy was not his because its pilot was already ' +
        'dead in it, and he would not leave the body in the storm layer.',
      'The court of inquiry in 32 CE cleared him of the order he had broken and ' +
        'ended his career with the same document. He had testified to what the ' +
        'trial was for, in open session, having worked it out afterwards from the ' +
        'flight tapes — and Concord could neither contradict a decorated witness ' +
        'nor keep one. He will not discuss any of it. The two thousand two hundred ' +
        'and forty people taken off Stillwake were taken off on the lift he held ' +
        'open, and he has never mentioned this either.',
      'He trains Emberline\'s intake personally. His pilots have the lowest ' +
        'first-year loss rate of any unit in the sky and describe him, without ' +
        'affection, as impossible to impress.',
    ],
  },
  {
    id: 'vesper',
    title: 'KESTREL DOYNE',
    subtitle: 'Concord Skyward · Marksman, detached duty · Man, late 20s',
    tagline: '"You are all very fast. It has not helped yet."',
    body: [
      'One of nine pilots ever certified on the AV-12 and the only one currently ' +
        'flying. Doyne came out of yard survey rather than the flight programme — ' +
        'six years mapping lattice structure for Concord engineering, which is ' +
        'where he learned to read a yard as geometry instead of as terrain.',
      'It is the whole of his advantage. He does not out-aim anyone. He knows, ' +
        'before an engagement starts, which four places in a given yard have a ' +
        'kilometre of clear line and a covered approach, and he is in one of them ' +
        'by the time anybody is looking for him.',
      'The stillness his file describes is not calm. Colleagues who have flown ' +
        'wing with him report that he does not speak on the channel at all for ' +
        'the first several minutes of an engagement, and that this is more ' +
        'unnerving than anything the enemy does.',
      'He requested detached duty in 38 CE and has not returned to a squadron ' +
        'since. Concord permits it because the results are not arguable. His ' +
        'evaluations note, every year, that he has no demonstrated ability to ' +
        'fight at close quarters, and that he has never needed to.',
    ],
  },
  {
    id: 'terramoth',
    title: 'BRUNN OKONKWO',
    subtitle: 'Ironwake Colliery · Seam Foreman, Pattern 3 crew · Man, 50s',
    tagline: '"It is not a war. It is a shift. Shifts end."',
    body: [
      'Not a soldier and does not pretend otherwise. Okonkwo has thirty-one years ' +
        'on the Pattern 3 and twenty-six of them were spent cutting ore. He was ' +
        'foreman of the Ironwake seam crew when the convoys started being taken, ' +
        'and he was foreman of the same crew, in the same machines, when they ' +
        'stopped being taken.',
      'He is the calmest combatant in the sky and the reason is not courage. A ' +
        'seam collapse gives you about four seconds and no options; a firefight ' +
        'gives you minutes and dozens. He has said, on record and apparently ' +
        'without irony, that combat is the more relaxing of the two.',
      'The goggles are welding gear and he has never replaced them with anything ' +
        'military. The Colliery offered him a commission in 36 CE and he declined ' +
        'it on the grounds that he already had a job, then declined it again in ' +
        '39 and 42 on the same grounds.',
      'His crew are miners. He is emphatic about this in a way that Ironwake ' +
        'management finds inconvenient and has stopped arguing with. Every one of ' +
        'them is still on the payroll under their original trade.',
    ],
  },
  {
    id: 'cirrus',
    title: 'MIRA HOLLOWAY',
    subtitle: 'Free Latitude · unaffiliated · Woman, early 20s',
    tagline: '"Worst case, I am somewhere else before it lands."',
    body: [
      'Yard-born, at Brightwake, which is not a place anyone is from on purpose. ' +
        'Holloway assembled her first LT-21 at seventeen out of three wrecks and ' +
        'a stolen reactor, flew it badly for a year, and has flown it better than ' +
        'anyone since. She has never held a rank or signed a contract.',
      'Her flying is genuinely reckless and it is not naive. She has run the ' +
        'numbers that everyone else has run and reached a different conclusion: ' +
        'that a frame this fragile does not get safer by being careful, only ' +
        'slower, and slower is the one thing it cannot survive. So she commits, ' +
        'every time, on purpose.',
      'The eight-hit dagger chain is hers. The pattern circulated with a four; ' +
        'Holloway extended it, published the modification for nothing, and was ' +
        'mildly offended when Concord assessment described it as impractical.',
      'She is the youngest active pilot in the sky and has the highest recorded ' +
        'engagement count of anyone under thirty. Free Latitude does not track ' +
        'hull losses. Hers would not flatter her.',
    ],
  },
  {
    id: 'obelisk',
    title: 'SAAR TENGKU',
    subtitle: 'Ironwake Colliery · Yard Defence, standing watch · Man, 40s',
    tagline: '"Nothing gets past. That is the whole of it."',
    body: [
      'Twenty years of standing watch at the same three yards, which is a career ' +
        'most pilots would consider a punishment posting and which Tengku ' +
        'requested twice. He came up through Colliery security rather than ' +
        'mining, and he is the only pilot on this roster whose job has a defined ' +
        'success condition.',
      'He does not pursue. This is not caution — pursuing means leaving, and ' +
        'leaving is the failure state. Opponents who mistake his patience for ' +
        'passivity discover that the GD-09 has a two-hit bash chain and that both ' +
        'hits are meant for someone who has just committed to something.',
      'The braid is Colliery tradition, worn by anyone who has held a yard ' +
        'through a contested docking. Tengku has eleven. He does not mention this ' +
        'and someone else always does.',
      'Asked, in a Concord liaison interview, what he would do if ordered to ' +
        'advance, he reportedly thought about it for some time and then asked ' +
        'what would be holding the door.',
    ],
  },
  {
    id: 'pyre',
    title: 'RASA VOLKOV',
    subtitle: 'Ashfall Irregulars · Contract pilot · Woman, mid 20s',
    tagline: '"They are paying for ninety seconds. Why would I take longer?"',
    body: [
      'Four PYRE frames, four wrecks, no injuries worth the word. Volkov holds ' +
        'the Irregulars\' record for hull loss and, in the same ledger, their ' +
        'record for contracts completed. Ashfall\'s accountants have raised this ' +
        'twice and dropped it twice, because the second number pays for the first ' +
        'with room to spare.',
      'The cheerfulness is not a front and it is not stupidity. She has read the ' +
        'same range charts as everyone else and knows exactly what a three ' +
        'hundred metre main gun means: that there is no version of her fight that ' +
        'happens at a comfortable distance, so there is no point being ' +
        'uncomfortable about it.',
      'She has burned two yards she was contracted to defend. Both were ruled ' +
        'within terms. Neither client rehired her, and the queue behind them did ' +
        'not shorten.',
      'The soot does not come off. She has stopped trying and now regards it as ' +
        'part of the uniform, which the Irregulars — who have no uniform — have ' +
        'quietly adopted.',
    ],
  },
  {
    id: 'nulltide',
    title: 'IO SENNA',
    subtitle: 'Concord Skyward, struck from record · flies under Free Latitude · Woman, 30s',
    tagline: '"Data point."',
    body: [
      'Senna was Concord\'s electronic-warfare programme. Not a member of it — the ' +
        'trials pilot the fourteen airframes were built around, certified at ' +
        'twenty-two, and the only person who ever flew one operationally. On the ' +
        'eleventh of the fourth, 31 CE, she flew the Stillwake trial. She was ' +
        'twenty-four. The gaps in her file are the wrong shape to be accidental ' +
        'because they are not gaps: the record was removed rather than lost, in ' +
        'the year the programme closed, by an authority the inquiry declined to ' +
        'name.',
      'She was not charged. The finding was that the trial had been ordered, ' +
        'correctly briefed and correctly flown, and that its consequence was a ' +
        'failure of the yard\'s lift network rather than of the pilot — a ' +
        'conclusion that clears her completely and that she has never once been ' +
        'recorded accepting. She left with the airframe in 33 CE. Concord did not ' +
        'pursue it, and the Archive is required to observe that not pursuing it ' +
        'was also a decision.',
      'What is observable now: she does not raise her voice, does not pursue, does ' +
        'not finish opponents who have stopped being able to fight, and appears ' +
        'to treat every engagement as a measurement rather than a contest. Pilots ' +
        'who have fought her describe the experience as being catalogued. The ' +
        'refusal to finish a helpless opponent is the only part of her flying that ' +
        'has never varied in eleven years, and it is the one thing in this entry ' +
        'the Archive would call a choice rather than a habit.',
      'Her method is subtraction. Cryogenic and shock payloads to take away ' +
        'movement and power, a jamming field to take away the reactor, a false ' +
        'frame to take away certainty. By the time the arc glaive is relevant the ' +
        'opponent has usually been made unable to do anything about it.',
      'She has never been recorded speaking about Stillwake, or about herself. ' +
        'The single personal remark in the file is secondhand: a Brightwake ' +
        'mechanic who says she once asked, apparently in earnest, why anyone would ' +
        'want to be remembered. He took it for detachment at the time. He has ' +
        'since revised the interpretation and asked that the revision be recorded ' +
        'here, which is why this line exists.',
    ],
  },
];

/** Everything the Archive shows, in the order its sections appear. */
export const ARCHIVE_SECTIONS = [
  {
    id: 'world',
    label: 'THE WORLD',
    // Chronological, not by importance: the Descent explains the yards, the yards
    // explain the powers, the powers explain the war, and the war ends at
    // Stillwake — which is where three of the roster's entries lead back to.
    entries: [WORLD_ENTRY, DESCENT_ENTRY, FACTION_ENTRY, WAR_ENTRY, STILLWAKE_ENTRY],
  },
  { id: 'mechs', label: 'MACHINES', entries: MECH_ARCHIVE },
  { id: 'pilots', label: 'PILOTS', entries: PILOT_ARCHIVE },
] as const;
