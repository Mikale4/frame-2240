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
  subtitle: 'Concord standing-orders digest · general issue · revision 43 CE',
  tagline: 'Operating conditions above the cloud deck.',
  body: [
    'The ground has remained uninhabitable for four generations. A continuous layer of ' +
      'storm and suspended particulate begins at approximately 2,000 metres and covers ' +
      'the former surface. Air above the layer is clear, cold and thin. Surviving ' +
      'settlements, industrial plant and docking structures are carried on spars, masts ' +
      'and gantries. The era begins with abandonment of the last ground city. Earlier ' +
      'records are grouped under the Descent.',
    'Permanent structures are classed as yards. Each is a lattice of girder and plate ' +
      'built to receive ore convoys, process cargo and support a resident population. ' +
      'Yard control therefore includes the docks, foundries and transit routes attached ' +
      'to it. Defensive works are installed within the same lattice and frequently share ' +
      'access with civilian cranes and lift machinery.',
    'Aerial frames operate where ships cannot manoeuvre safely. Their size permits ' +
      'movement between spars and through service openings, with one pilot, one reactor ' +
      'and an airframe built around three-dimensional thrust. No war has been declared ' +
      'since the Seven Yards War closed in 32 CE. Contested docking, claim enforcement ' +
      'and changes of yard control continue under the standing rules issued for each ' +
      'case. Each of the five powers attributes the present condition to the other four ' +
      'and uses the same allocation of responsibility in its Descent records.',
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
  subtitle:
    'Archive compilation · pre-era stack registries and evacuation returns · undated ' +
    'series',
  tagline: 'Cause classification remains industrial.',
  body: [
    'Pre-era registries list approximately 900 atmospheric processing stacks at peak ' +
      'operation. Ownership is distributed across the authorities, companies and ' +
      'municipalities represented in the surviving copies. The registries cover roughly a ' +
      'century of continuous discharge into the lower atmosphere. No complete ' +
      'consolidated return has been found.',
    'Recorded output rose over four generations without an associated closure order. ' +
      'Conditions remained within the expected range for those generations and failed ' +
      'within the next. Suspended particulate then retained heat in the middle atmosphere ' +
      'and established a storm layer that ceased to discharge fully. Individual stack ' +
      'returns remain below any stated contemporary prohibition. The combined output ' +
      'produced the condition later filed as the Descent.',
    'Evacuation returns for the last ground city cover eleven months. Departure was ' +
      'orderly enough for utilities to remain in service until the final district ' +
      'cleared. Surviving returns list lighting and pumping systems as operational on the ' +
      'last day. Population totals are incomplete because several district sheets ' +
      'duplicate household entries.',
    'Mineral rafts now cut from the storm layer consist of material precipitated from ' +
      'the same industrial output. Ironwake extracts the seams, convoys move them and ' +
      'every yard is equipped to receive them. The principal resource above the cloud ' +
      'deck is therefore part of the recorded cause of ground loss. All five powers draw ' +
      'strategic material from it.',
    'Concord classifies the Descent as an industrial accident. Emberline records it as ' +
      'a Concord accident. No Ironwake position has been issued, despite the Colliery ' +
      'holding the longest extraction series. The Archive retains the blank position ' +
      'field because later summaries repeatedly refer to it.',
  ],
};

/** The last declared war, and the standoff it left behind. */
export const WAR_ENTRY: ArchiveEntry = {
  id: 'war',
  title: 'THE SEVEN YARDS WAR',
  subtitle: 'Emberline settlement history · Concord annotation attached · revised 43 CE',
  tagline: 'Five years of enforcement entered as war.',
  body: [
    'The Pact began in 25 CE when seven yards received separate Concord notices placing ' +
      'their docking rights under review. Meetings, shared stores and mutual defence ' +
      'followed. In 27 CE Concord frames entered the affected routes to carry out the ' +
      'review. Emberline records the opening action as an invasion.',
    'Fighting continued for five years around convoy approaches, docking lattices and ' +
      'the yards controlling passage between them. There was no stable front. Casualty ' +
      'returns from both sides use incompatible categories and have not been reconciled. ' +
      'Every current service frame was built, converted or selected under requirements ' +
      'produced by the war.',
    'The 30 CE settlement transferred 30 AV-13 airframes from Concord inventory to the ' +
      'Pact as reparation. Concord described the transfer as disposal of an obsolete ' +
      'mark. Emberline treated the airframes as 30 available spars and stripped all of ' +
      'them within two years. The rebuilt machines entered service without Concord ' +
      'approval.',
    'STILLWAKE occurred before the cessation. Neither side resumed the previous ' +
      'operational tempo after the trial, and the formal closure was signed eighteen ' +
      'months later, in 32 CE. Concord annotation: the signed instrument is classed as a ' +
      'cessation agreement and does not constitute recognition of Emberline claims beyond ' +
      'the nine yards then held. Concord rejects the term invasion and supplies no ' +
      'replacement classification.',
    'Emberline began with seven yards, holds nine in 43 CE and continues to publish ' +
      'thirteen as its required settlement. The Pact records the settlement as ' +
      'incomplete.',
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
  subtitle: 'Concord Court of Inquiry summary, 32 CE · Archive addendum, 43 CE',
  tagline: 'Finding: the programme met its trial objective.',
  body: [
    'The electronic-warfare programme was built to interrupt a yard\'s lift network. ' +
      'Frame combat was secondary to the requirement. A disabled frame retains some ' +
      'capacity to glide. A yard supporting 9,000 people maintains altitude through ' +
      'continuous reactor output distributed across 140 lift spars. The trial question ' +
      'was whether one airframe, operating outside the defensive envelope, could drive ' +
      'that network into cascade.',
    'Fourteen programme airframes were completed. On the eleventh of the fourth, 31 CE, ' +
      'one was assigned to a live trial against Stillwake Yard. The yard was held by the ' +
      'Emberline Pact, remained inhabited and had been entered for review as a military ' +
      'target. Trial authorisation covered disruption of the lift network and observation ' +
      'of its recovery.',
    'The cascade propagated in four minutes. Recovery became impossible nineteen ' +
      'minutes later. Stillwake settled through the remainder of the day, entered the ' +
      'storm layer and continued below it. Evacuation lift removed 2,240 people before ' +
      'access failed. The remaining population was lost with the yard.',
    'The inquiry recorded Stillwake as a legitimate military target under review. It ' +
      'also recorded total lift loss outside the anticipated trial outcome. The two ' +
      'findings were filed separately. After Stillwake, neither side resumed the previous ' +
      'operational tempo. Formal closure of the Seven Yards War followed eighteen months ' +
      'later, in 32 CE.',
    'The programme closed that year. Thirteen airframes returned to inventory and were ' +
      'struck. The fourteenth remained unaccounted for. The trial pilot was cleared, ' +
      'removed from the record instead of charged and omitted from subsequent programme ' +
      'disposition. The inquiry noted the removal, declined to reverse it and supplied no ' +
      'explanation.',
    'Archive addendum: later field material identifies the missing airframe as EW-14 ' +
      'NULLTIDE in Free Latitude service. Concord recovery traffic contains no pursuit ' +
      'order. The addendum remains attached to the 32 CE programme closure file.',
  ],
};

/** The five powers, for the Archive's second page. */
export const FACTION_ENTRY: ArchiveEntry = {
  id: 'factions',
  title: 'THE FIVE POWERS',
  subtitle:
    'Archive editorial overview · current self-descriptions and operating records · 43 CE',
  tagline: 'Five authorities recognised for filing purposes.',
  body: [
    'CONCORD SKYWARD describes itself as the oldest continuous civil and military ' +
      'authority above the cloud deck. It alone maintains a published doctrine and a ' +
      'central certification system. Its AV airframes are committee designs subjected to ' +
      'extended trials, broad standardisation and revisions intended to remove unusual ' +
      'behaviour before issue. Concord records reliability as the first requirement and ' +
      'distinction as a secondary one. AV frames seldom lead a performance category and ' +
      'seldom fail one outright.',
    'IRONWAKE COLLIERY files as an extraction concern with convoy protection duties. ' +
      'Its first armed frames were excavation walkers already rated for seam collapse and ' +
      'falling ore. Later Guard-pattern machines were designed for yard defence. Ironwake ' +
      'documents use crew grades, shift assignments and equipment patterns where the ' +
      'other powers use ranks and combat types.',
    'THE EMBERLINE PACT defines itself as a defensive agreement among yards subject to ' +
      'Concord control measures. Seven yards formed the Pact in 25 CE. It now holds nine ' +
      'and states a requirement for thirteen. Its machines include Concord airframes ' +
      'transferred under settlement terms, rebuilt to Pact standards and returned to ' +
      'service without Concord certification.',
    'FREE LATITUDE supplies no central description. Dock records show independent crews ' +
      'operating LT and EW frames assembled from salvage, copied patterns and recovered ' +
      'systems. Individual machines differ substantially. Concord traffic calls the same ' +
      'crews pirates in enforcement notices and authorised visitors in docking returns. ' +
      'Both forms remain current.',
    'THE ASHFALL IRREGULARS register as a contract force. They accept work from all ' +
      'four other powers. More than one client appears in some monthly returns. ' +
      'Deployment, ammunition, hull loss and mission failure are priced separately. Their ' +
      'IN frames are built for short engagements and replacement from contract revenue. ' +
      'The Archive uses Ashfall\'s own account headings because no alternative ' +
      'organisation chart has been supplied.',
  ],
};

// ---------------------------------------------------------------- the mechs

export const MECH_ARCHIVE: ArchiveEntry[] = [
  {
    id: 'halcyon',
    title: 'AV-07 HALCYON',
    subtitle:
      'Concord procurement acceptance record · Vantor Aeroworks Mark VII · current issue',
    tagline: 'General-service airframe accepted without role restriction.',
    body: [
      'AV-07 was the seventh Aerial Vanguard airframe and the first accepted as a ' +
        'completed general-service design. Vantor Aeroworks delivered the mark eleven ' +
        'years behind the initial schedule and at four times the approved development ' +
        'cost. No full redesign has been authorised since acceptance. Recorded ' +
        'performance remains within the middle band across mobility, protection and ' +
        'output.',
      'The beam saber carries a dependable six-hit chain and has the longest reach of ' +
        'any blade fielded. The lance reaches charge state within the normal engagement ' +
        'cycle and can be used repeatedly without specialist reactor management. Neither ' +
        'system requires a separate role qualification. Trial reports record fewer ' +
        'interrupted melee sequences than for the preceding six marks. Pilot surveys ' +
        'object to the word unremarkable more often than opposing-action reports do.',
      'ARBITER remains deployed as an autonomous escort and carries a secondary reactor ' +
        'coupling. While available, it raises HALCYON energy regeneration by ' +
        'approximately 45 per cent. The coupling is filed as a cooling system and ' +
        'performs that function; the regeneration increase appears under secondary ' +
        'effects. A destroyed unit may be rebuilt once. Concord assigns the frame to ' +
        'instructors, first postings and pilots retained on long service projections, ' +
        'with issue determined by availability rather than specialist selection.',
    ],
  },
  {
    id: 'nocturne',
    title: 'AV-13 NOCTURNE',
    subtitle:
      'Emberline rebuild and fielding note · AV-13 settlement stock · revision 32 CE',
    tagline: 'Pact standard for transferred Concord airframes.',
    body: [
      'Concord transferred 30 AV-13 airframes under the settlement of 30 CE. The Pact ' +
        'accepted the count and rejected the configuration. Every frame was stripped to ' +
        'the main spar within two years. Completed rebuilds are one fifth heavier than ' +
        'the Concord mark and one tenth slower under standard thrust measurement.',
      'The rotary cannon is the most visible alteration. Structural work matters more. ' +
        'A twin-coil barrier unit replaces the original emitter and restores barrier ' +
        'strength at twice the standard rate. WARDEN remains deployed with the frame and ' +
        'repairs barrier loss until shot down. One rebuild is available after ' +
        'destruction.',
      'Emberline crews were instructed to guard through incoming fire instead of ' +
        'spending thrust on repeated evasions. The added mass supports that method and ' +
        'reduces the value of Concord\'s original balance assumptions. Field returns place ' +
        'NOCTURNE in line-holding sections and close escort around damaged frames. ' +
        'Concord\'s formal objection remains filed with the rebuild sheets as an external ' +
        'attachment.',
      'The hydraulic claw began as a salvage grapple. Its three-hit sequence closes, ' +
        'holds and finishes the compression cycle. It is slower than a Concord blade and ' +
        'carries no cutting edge. Damage reports frequently include canopy audio because ' +
        'the closing mechanism transmits through both frames.',
      'Concord continues to classify the rebuild as an uncertified AV-13 variant. ' +
        'Emberline enters it under the yard total sought at settlement. Thirteen is a ' +
        'service number here.',
    ],
  },
  {
    id: 'vesper',
    title: 'AV-12 VESPER',
    subtitle:
      'Concord certification and loss review · Vantor Aeroworks Mark XII · limited run',
    tagline: 'Specialist issue retained under restricted certification.',
    body: [
      'AV-12 was authorised to exploit long sightlines within yard lattices. The frame ' +
        'carries the longest effective lock range in current service. Vantor completed 40 ' +
        'airframes and ended production when the number of suitable pilots remained below ' +
        'the available hull count. The programme was retained as a limited-run ' +
        'capability.',
      'Reach was purchased through reduced structure. VESPER has the second-thinnest ' +
        'hull in current service. Its targeting suite applies a 1.14 multiplier to damage ' +
        'from confirmed hits. The beam bayonet carries a two-hit sequence and is listed ' +
        'as an emergency close-defence system. No additional armour package passed flight ' +
        'trials without unacceptable sighting loss.',
      'SIGHTLINE remains deployed beside the airframe and intercepts incoming ' +
        'projectiles before they reach the firing position. It does not engage the ' +
        'opposing frame. One replacement build is available after loss. Certification ' +
        'trials found the escort most effective while VESPER held a fixed firing line.',
      'Nine pilots completed AV-12 certification. Five were lost in service. Three ' +
        'withdrew after certification and before flying an engagement. One remains ' +
        'active. These figures are published separately from general AV loss returns ' +
        'because the sample is too small for comparison by total hull count. The combined ' +
        'rate is unclassified and omitted from public programme summaries.',
      'The review board recorded the highest loss rate per engagement in Concord ' +
        'holdings. It also recorded that trained pilots achieved the longest confirmed ' +
        'engagements and the highest average opening damage. The findings were filed ' +
        'separately. Two subsequent reviews retained the certification standard without ' +
        'amendment.',
      'Current instructions assign VESPER only where a covered approach and a firing ' +
        'line can be identified before launch. Once located at close range, the ' +
        'second-thinnest hull provides little recovery margin. Forty completed airframes ' +
        'remain on the inventory return, including those without a certified pilot ' +
        'assignment.',
    ],
  },
  {
    id: 'terramoth',
    title: 'HV-03 TERRAMOTH',
    subtitle:
      'Ironwake conversion works log · Pattern 3 excavation walker · armed series from 34 ' +
      'CE',
    tagline: 'Cutting equipment retained unless the conversion sheet says otherwise.',
    body: [
      'Pattern 3 walkers cut ore for sixty years before armament work began. Rock-fall ' +
        'plate, collapse tolerances and the ARMOUR BRACE interlock belong to the ' +
        'excavation design. With the interlock removed, incoming damage is recorded at ' +
        '0.86 of the standard value. Completed walkers remain the heaviest and slowest ' +
        'frames cleared for flight.',
      'Conversion started in 34 CE after the third convoy loss in one season. Fit the ' +
        'siege repeater at the former cutting-head mount. Fit mortars in both spoil ' +
        'hoppers. Leave the pile driver in place and set the strike cycle to two impacts. ' +
        'Concord\'s written response to the convoy claims is attached to the first ' +
        'conversion sheet.',
      'BULWARK stays deployed and lays mines across the route behind the walker. It may ' +
        'be rebuilt once after loss. Pattern 3 crews use the mines to close pursuit lanes ' +
        'while the main frame continues on its assigned heading. Operators remain entered ' +
        'as crew rather than soldiers. Completed conversion sheets retain the original ' +
        'trade classification and inspection interval.',
    ],
  },
  {
    id: 'cirrus',
    title: 'LT-21 CIRRUS',
    subtitle:
      'Free Latitude build copy · twenty-one recorded completions · revisions mixed',
    tagline: 'Use the measurements on the frame in front of you.',
    body: [
      'No LT-21 production line. Pattern passed yard to yard. Builders mostly separate ' +
        'and no two completion sheets describe the same fit. Completion count: 20 on the ' +
        'Brightwake copy, 21 on the later dock copy. Use 21 until somebody brings the ' +
        'missing sheet. What stays is thrust. Remove the rest, then check what the thrust ' +
        'is still attached to. weight, final:',
      'armour, fitted: 30 kg. Fastest frame in service and the most fragile. Boost ' +
        'recovery is twice standard because little reactor output goes elsewhere. Twin ' +
        'daggers: four hits on the early pattern, eight on the Holloway revision. Fit the ' +
        'eight. It is the longest current melee sequence. Holloway published the revision ' +
        'without charge; Concord called it impractical and the note beside that line says ' +
        'they tested it wrong.',
      'WISP flies itself and stays out. String the charged line back to the LT-21. Put ' +
        'the target between them, cross once and pull the line through. The scissor. If ' +
        'the line becomes a tether, break away. Do not chase the drone round the frame. ' +
        'If WISP is shot down, rebuild once. One copy repeats the rebuild instruction ' +
        'twice. The second line has no initials.',
      'Concord classifies the pattern as unsurvivable and declines certification. No ' +
        'request for certification is attached. Armour mass, thruster fit and final ' +
        'weight remain the builder\'s entries on each completion sheet, including sheets ' +
        'where the final weight field was left blank.',
    ],
  },
  {
    id: 'obelisk',
    title: 'GD-09 OBELISK',
    subtitle: 'Ironwake yard-defence specification · Guard pattern 09 · issue sheet',
    tagline: 'Hold the assigned opening until relief is entered.',
    body: [
      'GD-09 was designed as a defensive frame from the first drawing and remains the ' +
        'Colliery\'s only blank-sheet combat design. It stands between Pattern 3 crews and ' +
        'an approach route, docking throat or damaged spar. The barrier emitter is the ' +
        'primary system. Armament and thrust allocation were approved only after barrier ' +
        'requirements were met.',
      'The emitter pool is the largest fielded by Ironwake, restores fastest and ' +
        'returns soonest after a full break. Sustained guard drains at 0.55 of the ' +
        'standard rate. Operators are instructed to retain the barrier through contact ' +
        'and use thrust only to restore the assigned line.',
      'The ram shield creates separation after an impact. The follow-up bash is a ' +
        'two-hit sequence intended to clear the opening and return the frame to guard. ' +
        'Pursuit beyond the marked defence sector requires a second order because the ' +
        'position then has no assigned frame.',
      'AEGIS remains deployed with GD-09 and projects a fixed dome. Incoming rounds ' +
        'entering the dome are erased. Projection draws no timed charge from AEGIS. The ' +
        'escort must hold position during projection and becomes an exposed target while ' +
        'doing so. If destroyed, it may be rebuilt once after the normal recovery ' +
        'interval.',
      'Yard crews enter the frame as door equipment on local watch sheets. Inspection ' +
        'returns therefore list barrier hours before ammunition expenditure. Replacement ' +
        'allocation remains one AEGIS unit for each cleared GD-09 airframe.',
    ],
  },
  {
    id: 'pyre',
    title: 'IN-05 PYRE',
    subtitle: 'Ashfall asset-cost note · fifth named hull · current contract schedule',
    tagline: 'Engagement allowance calculated at ninety seconds.',
    body: [
      'IN-05 is the fifth frame entered under the name PYRE. The preceding four appear ' +
        'in the wreck ledger. Current costing assumes a decisive engagement within ninety ' +
        'seconds and does not include service life beyond the active contract. Hull ' +
        'replacement is charged separately from mission failure.',
      'The main gun is effective to 300 metres. Thermal cleaver, cinder jet and ' +
        'incendiary loadout are costed for the same close envelope. Saturation gain runs ' +
        'at 1.8 times standard. The cleaver completes a three-hit sequence. No ' +
        'comparative range claim is entered because contract terrain varies.',
      'EMBER remains deployed and lays burning ground in short bursts. Its hull is the ' +
        'frailest among current escort units and one rebuild is allowed after ' +
        'destruction. Area-denial expenditure is billed as ammunition. Unused incendiary ' +
        'stock returns to Ashfall stores at contract close.',
    ],
  },
  {
    id: 'nulltide',
    title: 'EW-14 NULLTIDE',
    subtitle:
      'Concord provisional threat assessment · struck programme asset · field addenda ' +
      'through 43 CE',
    tagline:
      'Rating remains provisional pending classification of the original trial role.',
    body: [
      'EW-14 was the fourteenth and final airframe built under the electronic-warfare ' +
        'programme. It conducted the Stillwake trial. Thirteen sister airframes returned ' +
        'to inventory when the programme closed in 32 CE and were struck. EW-14 remained ' +
        'unaccounted for and later appeared in Free Latitude service. No recovery action ' +
        'is present in the attached traffic.',
      'Programme hulls carried no maker\'s plate. The omission was part of the original ' +
        'specification and allowed operational denial while the airframes remained in ' +
        'Concord service. Current identification relies on internal layout, emitter ' +
        'signature and trial-series components. Free Latitude enters the machine as ' +
        'salvage.',
      'Cryogenic and electrical payloads slow movement, drain systems and produce ' +
        'intermittent stalls. Direct damage output remains below that of current line ' +
        'frames. The arc glaive opens a five-hit cascade once the target has been slowed. ' +
        'No reach distinction is assigned to the weapon.',
      'JAMMING FIELD halves the opposing frame\'s energy regeneration while EW-14 ' +
        'remains active. STATIC stays deployed and projects a separate false silhouette ' +
        'of NULLTIDE at distance. Drone, airframe and projection may be visible at the ' +
        'same time. The projection causes no damage. Its imitation fire may produce a ' +
        'stun. STATIC may be rebuilt once after destruction.',
      'Field addenda classify the current machine as a light skirmisher intended to ' +
        'reduce an opponent\'s available movement, power and certainty before close ' +
        'contact. The 37 CE board entered a provisional threat rating. No later board has ' +
        'replaced it.',
      'The airframe in field reports and the airframe in the Stillwake programme return ' +
        'carry the same serial identity. The Stillwake return records the programme as ' +
        'the only fielded weapon to remove a yard\'s lift network. The board has yet to ' +
        'rate both records under one heading.',
    ],
  },
];

// --------------------------------------------------------------- the pilots

export const PILOT_ARCHIVE: ArchiveEntry[] = [
  {
    id: 'halcyon',
    title: 'NAIA VESK',
    subtitle: 'Concord instructor personnel file · 2nd Interceptor · review 43 CE',
    tagline: 'Active service record retained for instructional assignment.',
    body: [
      'Vesk, Naia. Woman, early 30s. Third-generation Concord service. Her grandmother ' +
        'signed acceptance work on AV-01 and held no flight qualification. Her mother ' +
        'flew AV-04 and was killed in a spar-root failure when Vesk was nine. The fault ' +
        'had been raised three years earlier and scheduled for correction in the ' +
        'following mark. Eleven other AV-04 airframes were grounded during the same week.',
      'Evaluations describe sustained objection to delayed safety findings and exact ' +
        'compliance with current flight procedure. Vesk does not treat pending committee ' +
        'action as evidence that a reported fault is safe. Her operational decisions show ' +
        'a narrow preference for risks she can identify, test and assign to her own ' +
        'conduct.',
      'She holds eleven years of continuous active service without hull loss, the ' +
        'longest unbroken record in Concord. She requested instructor duty and received ' +
        'the posting earlier than most pilots of equivalent age. Retention reviews ' +
        'continue to place her in instruction because first-posting loss figures remain ' +
        'lower under her supervision.',
      'Vesk has flown AV-07 since receiving it at nineteen. Vantor Aeroworks has twice ' +
        'supplied a successor frame for evaluation. Both were returned with written notes ' +
        'and no request for transfer from her current airframe.',
    ],
  },
  {
    id: 'nocturne',
    title: 'HALDEN ROOK',
    subtitle:
      'Emberline transfer and training record · 7th Assault intake · updated 43 CE',
    tagline: 'Prior Concord service accepted with restrictions removed.',
    body: [
      'Rook, Halden. Man, late 40s. Concord trained him for the AV line and retained ' +
        'him for twelve years. His transfer packet includes two commendations and one ' +
        'court finding that cleared his conduct while ending his Concord flying career. ' +
        'He crossed to Emberline in 33 CE with his flight manual. The manual was copied ' +
        'before his first Pact assignment.',
      'He is the oldest active combatant by six years. Flight testing records reduced ' +
        'hand speed against his earlier Concord figures and improved contact assessment. ' +
        'Rook\'s training notes convert that difference into method: hold guard, accept ' +
        'the first pressure and force younger pilots to spend thrust before he commits.',
      'Rook flew escort during the Stillwake trial without a briefing on the programme ' +
        'objective. His squadron received a perimeter order. When the lift network ' +
        'entered cascade, he crossed into the yard against that order and held an ' +
        'evacuation lift for nine hours. The burns recorded on his face and hands date ' +
        'from that period.',
      'He returned at 4,000 metres in a frame with a failed canopy. The frame belonged ' +
        'to another pilot, already dead inside it. Recovery testimony states that Rook ' +
        'refused to leave the body in the storm layer. Maintenance declared the airframe ' +
        'beyond return to service.',
      'The 32 CE inquiry cleared the broken order and terminated his flying status in ' +
        'the same finding. Rook testified in open session after reconstructing the trial ' +
        'from flight tapes. The record notes his testimony and the inquiry\'s refusal to ' +
        'contradict it. The 2,240 people removed from Stillwake used the lift he held ' +
        'open. No later interview contains comment from Rook on the trial or the ' +
        'evacuation total.',
      'Rook now trains Emberline intake personally. His sections have the lowest ' +
        'first-year pilot loss rate in the sky. Trainee reports use the phrase impossible ' +
        'to impress without recording it as a complaint.',
    ],
  },
  {
    id: 'vesper',
    title: 'KESTREL DOYNE',
    subtitle: 'Concord detached-duty annual review · AV-12 certification file · 43 CE',
    tagline: 'Assignment renewed without squadron attachment.',
    body: [
      'Doyne, Kestrel. Man, late 20s. One of nine pilots certified for AV-12 and the ' +
        'only one in current service. He entered from yard survey after six years mapping ' +
        'lattice structure for Concord engineering. His certification board identified ' +
        'route reading, covered approach selection and long sightline prediction as the ' +
        'basis of his results.',
      'Wing reports record no channel speech during the opening minutes of most ' +
        'engagements. They also record that Doyne usually identifies four viable firing ' +
        'positions with a kilometre of clear line and a covered approach, then occupies ' +
        'one before opposing search begins. Marksmanship scores are within the upper ' +
        'service band. Site selection accounts for the difference between those scores ' +
        'and his engagement record.',
      'Doyne requested detached duty in 38 CE and has remained outside squadron ' +
        'assignment. Annual reviews continue to find no demonstrated close-quarters ' +
        'capability because no qualifying engagement has occurred. Detached status is ' +
        'renewed on the existing results return.',
    ],
  },
  {
    id: 'terramoth',
    title: 'BRUNN OKONKWO',
    subtitle:
      'Ironwake payroll and competency record · Pattern 3 seam crew · current shift grade',
    tagline: 'Trade classification retained through armed duty.',
    body: [
      'Okonkwo, Brunn. Man, 50s. Thirty-one years on Pattern 3 equipment, including ' +
        'twenty-six years in ore cutting. He was foreman of the same seam crew before ' +
        'convoy seizures began and after armed escort reduced them. Combat hours are ' +
        'entered under equipment operation because no separate pilot grade was created.',
      'Competency interviews consistently grade him calm under fire and record his view ' +
        'that seam collapse is less forgiving than frame combat. A collapse provides ' +
        'about four seconds and few usable responses. An engagement provides minutes and ' +
        'multiple routes. Supervisors found the comparison accurate enough for training ' +
        'use and removed the word relaxing from the printed copy.',
      'His goggles remain approved welding equipment. Ironwake offered a commission in ' +
        '36 CE, 39 CE and 42 CE. Okonkwo declined each offer on the basis that he already ' +
        'held a job. No disciplinary note followed any refusal.',
      'Every member of his crew remains paid under the original mining trade. Payroll ' +
        'classification: seam crew.',
    ],
  },
  {
    id: 'cirrus',
    title: 'MIRA HOLLOWAY',
    subtitle: 'Free Latitude dock record · several hands · entries 37 to 43 CE',
    tagline: 'Identification follows the frame because no contract file exists.',
    body: [
      'Holloway, Mira. Woman, early 20s. Yard-born at Brightwake. First LT-21 assembled ' +
        'at seventeen from three wrecks and a stolen reactor. The first year of dock ' +
        'notes calls the flying poor, then stops using the word. No rank is entered. No ' +
        'signed contract has been produced.',
      'Engagement notes call the flying reckless. Holloway\'s own margin calculation ' +
        'says the frame gains nothing by slowing down because its armour cannot support ' +
        'an exchange. She commits early, crosses through the target and uses boost ' +
        'recovery to leave before return fire settles. Later notes repeat the method ' +
        'without the warning attached to the first copy.',
      'The eight-hit dagger sequence is her revision. Earlier pattern sheets show four. ' +
        'Holloway extended the chain, published the change without charge and supplied ' +
        'fitting measurements for other LT-21 builds. A Concord assessment called the ' +
        'sequence impractical. Dock witnesses record that she objected to the test ' +
        'method, not to publication of the result.',
      'She is the youngest active pilot and holds the highest recorded engagement count ' +
        'among pilots under thirty. These claims use sightings and docking returns ' +
        'because Free Latitude carries no central service register. The entries agree on ' +
        'her identity across replacement parts and hull work.',
      'Hull-loss totals are unavailable. Dock charges show repeated major repairs, two ' +
        'reactor removals and more than one replacement spar, but the sheets do not ' +
        'distinguish a rebuilt frame from a new one. The account remains open under the ' +
        'same LT-21 identification.',
    ],
  },
  {
    id: 'obelisk',
    title: 'SAAR TENGKU',
    subtitle: 'Ironwake standing-watch log · three-yard rotation · service review 43 CE',
    tagline: 'Success condition: assigned route remains closed.',
    body: [
      'Tengku, Saar. Man, 40s. Twenty years on standing watch across the same three ' +
        'yards. He requested the posting twice and entered from Colliery security instead ' +
        'of seam work. His duty sheet defines success as preventing passage through the ' +
        'assigned route until relief or withdrawal is recorded.',
      'Tengku does not pursue beyond the defence sector because pursuit leaves the ' +
        'route without its assigned frame. A Concord liaison asked what action he would ' +
        'take under an advance order. The interview records a request for the identity of ' +
        'the replacement holding the opening. GD-09 close-contact qualification covers ' +
        'the standard two-hit bash sequence.',
      'Colliery braid record: eleven, each issued after a contested docking held. The ' +
        'latest was entered during the current three-yard rotation and requires no change ' +
        'to duty grade.',
    ],
  },
  {
    id: 'pyre',
    title: 'RASA VOLKOV',
    subtitle: 'Ashfall contract-performance ledger · four hull losses · current account',
    tagline: 'Contract completion and asset loss, same ledger.',
    body: [
      'Volkov, Rasa. Contract pilot, woman, mid 20s. Four PYRE assignments are entered ' +
        'against her name. Four hulls were written off. No injury required extended ' +
        'stand-down. She holds the Irregulars\' record for hull loss and their record for ' +
        'completed contracts. Accounts reviewed the pairing twice and closed both reviews ' +
        'after margin calculation.',
      'Range acknowledgements are complete. The main gun remains effective to 300 ' +
        'metres and the rest of the loadout requires the same close approach. Channel ' +
        'recordings show conversation continuing during final entry. Debriefs record no ' +
        'request for revised tactics. Her stated position is that delay adds no useful ' +
        'reach.',
      'Volkov burned two yards she had been contracted to defend. Both claims were ' +
        'ruled within terms. Neither client placed a second contract. Subsequent Ashfall ' +
        'booking volume remained unchanged.',
      'Cleaning requisitions stop after the second written-off hull. Soot staining ' +
        'remains on her issued kit and she refers to it as part of the uniform. Similar ' +
        'marking now appears across Ashfall flight crews. The Irregulars continue to ' +
        'carry no uniform allowance.',
    ],
  },
  {
    id: 'nulltide',
    title: 'IO SENNA',
    subtitle:
      'Archive reconstruction · Free Latitude dock records and third-party combat reports ' +
      '· revised 43 CE',
    tagline: '"Data point."',
    body: [
      'The Archive holds no Concord personnel file under Io Senna. Cross-referenced ' +
        'ages identify her as a woman in her 30s, assessed age thirty-six in 43 CE. ' +
        'Surviving programme material refers to a trials pilot around whom all fourteen ' +
        'EW airframes were built. She was certified at twenty-two and was the only pilot ' +
        'to fly one operationally. The same dates place her at twenty-four on the ' +
        'eleventh of the fourth, 31 CE, when she flew the Stillwake trial.',
      'The court of inquiry described her record as removed. It did not identify the ' +
        'authority responsible. No charge was entered. The finding states that the trial ' +
        'was ordered, correctly briefed and correctly flown, and assigns the result to ' +
        'failure of the yard\'s lift network instead of pilot action. Programme references ' +
        'to the pilot cease when the airframes were struck in 32 CE.',
      'Free Latitude dock records first place Senna and the fourteenth airframe ' +
        'together in 33 CE. Later entries identify the frame as EW-14 NULLTIDE. Remaining ' +
        'Concord traffic contains no recovery order, interception request or notice of ' +
        'pursuit. Free Latitude has continued to enter the machine as salvage.',
      'Across ten years of sightings, reports agree on three repeated behaviours: ' +
        'low-volume communications, disengagement from retreating opponents and cessation ' +
        'of fire once a target loses the ability to resist. Pilots who have fought her ' +
        'describe the encounter as being catalogued. The reports provide no further ' +
        'explanation.',
      'Observed loadout remains consistent. Cryogenic and electrical payloads slow ' +
        'movement, drain systems and produce intermittent stalls. JAMMING FIELD halves ' +
        'the opposing frame\'s energy regeneration. STATIC remains deployed while ' +
        'projecting a separate false silhouette of NULLTIDE; drone, frame and projection ' +
        'may all be visible together. The projection causes no damage, though its ' +
        'imitation fire may stun. The arc glaive opens a five-hit cascade once the target ' +
        'has been slowed.',
      'One personal remark survives in a Brightwake mechanic\'s statement. Senna asked ' +
        'why anyone would want to be remembered. The witness first entered the remark as ' +
        'evidence of detachment, later withdrew that interpretation and requested an ' +
        'amendment. The Archive records the remark and the withdrawal. Both remain ' +
        'attached to the same dock report.',
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
