/**
 * In-battle pilot banter.
 *
 * The 2005 reference talks at you constantly during a fight — a portrait and a
 * line in the corner on openings, reversals and finishes. It is most of what
 * gives that game a cast rather than eight selectable stat blocks, and it costs
 * nothing at runtime.
 *
 * Every line here is written to the pilot descriptions in
 * `docs/PILOT_PORTRAIT_SPEC.md`, so the voice matches the face: VESK is
 * composed and a little superior, ROOK is unbothered, DOYNE barely speaks,
 * OKONKWO is industrial rather than military, HOLLOWAY is delighted to be here,
 * TENGKU is patient, VOLKOV is unhinged, SENNA is clinical.
 *
 * Kept short on purpose. The box is small, the fight does not stop, and a line
 * nobody can finish reading before it fades is worse than no line.
 */

/** What just happened, from the speaking pilot's point of view. */
export type BanterTrigger =
  /** The round has just started. */
  | 'intro'
  /** Their first clean hit of the match. */
  | 'firstHit'
  /** They are running a combo of four or more. */
  | 'combo'
  /** They opened a saturation burst on a full meter. */
  | 'saturation'
  /** They forced one open early, on a part-charged meter. */
  | 'saturationEarly'
  /** Their burst ran dry and left them helpless. */
  | 'burnout'
  /** Their own drone was shot down. */
  | 'droneLost'
  /** They shot down the opponent's drone. */
  | 'droneKill'
  /** They have dropped below a third of their life. */
  | 'hurt'
  /** Their guard was broken. */
  | 'guardBroken'
  /** They refused a killing blow. LAST STAND. */
  | 'lastStand'
  /**
   * TAG/ASSIST was called and the partner is going to be late.
   *
   * Spoken by the *partner*, over the radio, from wherever they are — see
   * `BanterBox.say`'s `as` parameter, which lends the owner's box to whoever is
   * actually talking.
   */
  | 'tagLate'
  /** The partner has arrived. Two lines: theirs, then their caller's reply. */
  | 'tagArrive'
  /** Their reactor dumped into all three modes at once. OVERDRIVE. */
  | 'overdrive'
  /** OVERDRIVE burned out: thrusters and guns gone, sword left. */
  | 'overdriveSpent'
  | 'win'
  | 'lose';

/**
 * How much a line wants the box.
 *
 * A KO must never be swallowed because a combo line is still on screen, and a
 * combo line must never stomp a KO. Higher wins; equal priority does not
 * interrupt, so a line always gets to finish against its own kind.
 */
export const BANTER_PRIORITY: Record<BanterTrigger, number> = {
  intro: 1,
  firstHit: 2,
  combo: 2,
  droneKill: 3,
  saturation: 3,
  saturationEarly: 3,
  hurt: 4,
  guardBroken: 4,
  droneLost: 4,
  burnout: 4,
  /**
   * Above every ordinary in-fight line and below LAST STAND.
   *
   * A partner arriving is a scripted, twice-a-match event with writing behind
   * it that the player chose at select. A combo line stomping the one moment
   * Rook and Senna speak to each other would be the wrong trade — and the
   * arrival is *two* lines that have to land in order, so the first must be able
   * to hold the box against the chatter its own gunfire is generating.
   */
  tagArrive: 6,
  // Slightly lower: it is information, not a moment, and it must never stomp an
  // arrival still finishing from the previous call.
  tagLate: 5,
  // Above every in-fight line and below only the KO. Refusing to die is the
  // loudest thing that can happen without the match ending, and a combo line
  // stomping it would be absurd.
  lastStand: 8,
  // Both OVERDRIVE beats sit with LAST STAND: the loudest things that can happen
  // without the match ending.
  overdrive: 8,
  overdriveSpent: 8,
  win: 9,
  lose: 9,
};

export type BanterLines = Partial<Record<BanterTrigger, readonly string[]>>;

/**
 * Lines per mech id. Two takes on the frequent triggers, one on the rest —
 * `firstHit` and `combo` fire many times a session and a single line becomes a
 * catchphrase fast.
 */
export const BANTER: Record<string, BanterLines> = {
  // NAIA VESK — composed, professional, faintly superior.
  halcyon: {
    intro: ['Concord Skyward, cleared to engage.'],
    firstHit: ['Registered.', 'That is the range I wanted.'],
    combo: ['Stay still. It is easier for both of us.', 'You are behind. Again.'],
    lastStand: [
      'Not yet.',
      'Reactor is gone. I am not.',
      'You will have to do that twice.',
    ],
    saturation: [
      'Opening it up.',
      'Reactor to full. Watch closely.',
      'This is the part you lose.',
      'No more measuring you.',
      'Concord authorises everything.',
    ],
    saturationEarly: [
      'It is not ready. Neither am I.',
      'Forcing it. Forgive me, ARBITER.',
      'Early. I know. I know.',
      'No time to wait for green.',
      'This is going to hurt. Go.',
    ],
    burnout: ['Reactor sag. Give me a second.'],
    droneLost: ['ARBITER is gone. Noted.'],
    droneKill: ['Escort down. You are alone now.'],
    hurt: ['Fine. Properly, then.'],
    guardBroken: ['Guard is open — moving.'],
    win: ['Textbook. Log it.'],
    lose: ['...I misread that. My error.'],
  },

  // HALDEN ROOK — older, scarred, entirely unbothered.
  nocturne: {
    intro: ['Let us get this over with.'],
    firstHit: ['Felt that, did you.', 'Good.'],
    combo: ['Not done.', 'Stand still and take it.'],
    saturation: [
      'Right. No more warm-up.',
      'Now you have my attention.',
      'Old frame, full throttle.',
      'Let us finish this properly.',
      'I remember how this goes.',
    ],
    saturationEarly: [
      'Not charged. Do it anyway.',
      'Old trick. Bad idea.',
      'Push it. I will pay for this.',
      'Come on, you rusted thing.',
      'No time. Burn it now.',
    ],
    burnout: ['Old frame. Old lungs.'],
    droneLost: ['WARDEN is down. It served.'],
    droneKill: ['One less thing buzzing at me.'],
    hurt: ['Had worse. Twice.'],
    guardBroken: ['Hah. Fair hit.'],
    win: ['Go home, kid.'],
    lose: ['Should have retired. Ah well.'],
  },

  // KESTREL DOYNE — quiet, watchful, barely speaks.
  vesper: {
    intro: ['Holding. Watching.'],
    firstHit: ['Solution found.', 'Wind accounted for.'],
    combo: ['Tracking.', 'Do not move.'],
    saturation: [
      'Optics wide.',
      'Every solution at once.',
      'No more waiting.',
      'Breathing out.',
      'The shot is already yours.',
    ],
    saturationEarly: [
      'Too early. No choice.',
      'Forcing the optics.',
      'Not ready. Firing anyway.',
      'This will cost me.',
      'Now. It has to be now.',
    ],
    burnout: ['Sight is dark. Blind.'],
    droneLost: ['SIGHTLINE is gone. I am blind long.'],
    droneKill: ['Their eyes are out.'],
    hurt: ['Too close. Breaking off.'],
    guardBroken: ['Exposed.'],
    win: ['Clean.'],
    lose: ['Missed the one that mattered.'],
  },

  // BRUNN OKONKWO — industrial, calm, immovable.
  terramoth: {
    intro: ['Rig is warm. Let us work.'],
    firstHit: ['Load bearing.', 'Struck true.'],
    combo: ['Keep swinging, I keep standing.', 'Steady now.'],
    saturation: [
      'Full output. Mind the noise.',
      'Opening every valve.',
      'The rig has more in it.',
      'Overburden. Stand clear.',
      'Now we work properly.',
    ],
    saturationEarly: [
      'Overriding the interlock.',
      'She is not up to pressure.',
      'Forcing it. Mind the blast.',
      'This breaks something. Fine.',
      'Red line. Going anyway.',
    ],
    burnout: ['Overpressure. Venting.'],
    droneLost: ['BULWARK is scrap. Costly.'],
    droneKill: ['Stripped their cover.'],
    hurt: ['Plating is holding. Mostly.'],
    guardBroken: ['Brace failed.'],
    win: ['Site secure. Shutting down.'],
    lose: ['Frame gave before I did.'],
  },

  // MIRA HOLLOWAY — young, fast, delighted to be here.
  cirrus: {
    intro: ['Oh, this is going to be fun!'],
    firstHit: ['Got you!', 'Too slow, too slow!'],
    combo: ['Keep up! Keep up!', 'I can do this all day!'],
        overdrive: [
      'Everything. All of it. Now.',
      'Burning the whole reactor. Watch.',
      'No more saving anything for later.',
    ],
    overdriveSpent: [
      'Thrusters gone. Guns gone. Still here.',
      'Just the blade left. It will do.',
      'Then we do this the short way.',
    ],
    saturation: [
      'Watch this bit!',
      'Everything at once! Ready?',
      'Okay okay okay HERE WE GO!',
      'This is my favourite part!',
      'Blink and you miss it!',
    ],
    saturationEarly: [
      'Not full — not full — going!',
      'Okay this is a bad idea!',
      'Please please please work!',
      'I do not have time to wait!',
      'This is going to sting!',
    ],
    burnout: ['Ow — okay, that was too much.'],
    droneLost: ['WISP! No — that is not fair!'],
    droneKill: ['Popped it! Did you see that?'],
    hurt: ['Ow. Ow. Still here!'],
    guardBroken: ['Nope nope nope —'],
    win: ['Told you it would be fun.'],
    lose: ['Okay. Rematch. Right now.'],
  },

  // SAAR TENGKU — patient, defensive, unhurried.
  obelisk: {
    intro: ['I will be here a while.'],
    firstHit: ['Noted.', 'A start.'],
    combo: ['Patience pays.', 'And again.'],
    saturation: [
      'Shield forward.',
      'The wall advances.',
      'Now I stop being polite.',
      'Everything holds. Come on.',
      'Ironwake, full brace.',
    ],
    saturationEarly: [
      'I cannot wait. Forgive me.',
      'Forcing the field. Too soon.',
      'Patience spent. Going early.',
      'The wall will crack for this.',
      'Not ready. Neither is he.',
    ],
    burnout: ['Field is down. Briefly.'],
    droneLost: ['AEGIS has fallen. A shame.'],
    droneKill: ['Their guard is thinner now.'],
    hurt: ['Still standing. That is the job.'],
    guardBroken: ['My wall broke. Rare.'],
    win: ['You spent yourself on me.'],
    lose: ['You were patient too. Good.'],
  },

  // RASA VOLKOV — reckless, cheerful, not entirely well.
  pyre: {
    intro: ['Let us burn something!'],
    firstHit: ['Ha! Lit you up!', 'Warmer already!'],
    combo: ['More! More!', 'Burn burn burn —'],
    saturation: [
      'EVERYTHING at once!',
      'Light it all up!',
      'No more saving it!',
      'Burn the whole sky!',
      'Full furnace! Full furnace!',
    ],
    saturationEarly: [
      'Do not care! Light it!',
      'Half a tank is still a tank!',
      'It will blow! Good!',
      'Too soon! Perfect!',
      'Burn now, cry later!',
    ],
    burnout: ['Aw. Fire is out.'],
    droneLost: ['EMBER! You took my little one!'],
    droneKill: ['Their toy is ash!'],
    hurt: ['Smells like me cooking!'],
    guardBroken: ['Wide open — do not care!'],
    win: ['Ash and cinders. Beautiful.'],
    lose: ['Out... of... fuel...'],
  },

  // IO SENNA — detached, clinical, unreadable.
  nulltide: {
    intro: ['Beginning the observation.'],
    firstHit: ['Data point.', 'As modelled.'],
    combo: ['Your pattern is trivial.', 'Predicted. Continue.'],
    saturation: [
      'Raising output.',
      'All systems to maximum.',
      'The projection favours me now.',
      'Full spectrum. Hold still.',
      'Observation concludes shortly.',
    ],
    saturationEarly: [
      'Insufficient charge. Proceeding.',
      'Outside tolerance. Accepted.',
      'This is a poor decision.',
      'Forcing output. Logging it.',
      'The model advises against this.',
    ],
    burnout: ['Systems quiet. Inconvenient.'],
    droneLost: ['STATIC is offline. Recalculating.'],
    droneKill: ['Their support is severed.'],
    hurt: ['Damage within tolerance.'],
    guardBroken: ['Barrier null. Adjusting.'],
    win: ['Result matched the projection.'],
    lose: ['The model was wrong. Interesting.'],
  },
};

/**
 * Picks a line, or null when this pilot has nothing for this trigger.
 *
 * `roll` is a 0..1 value from the caller's own generator rather than
 * `Math.random`, so a replay of the same match says the same things.
 */
export function pickBanter(
  mechId: string,
  trigger: BanterTrigger,
  roll: number,
): string | null {
  const lines = BANTER[mechId]?.[trigger];
  if (!lines || lines.length === 0) return null;
  const i = Math.min(lines.length - 1, Math.max(0, Math.floor(roll * lines.length)));
  return lines[i];
}
