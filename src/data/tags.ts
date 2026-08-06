/**
 * TAG/ASSIST: who a pilot can call, and what the two of them say about it.
 *
 * A match is one machine against one machine. The assist is the exception —
 * another pilot crosses in from outside the stage, fights for four seconds and
 * leaves. They cannot be killed and they carry no escort; what they bring is a
 * few seconds of a second gun and the fact that somebody came.
 *
 * **Two choices per chassis, and they are not arbitrary.** Each pilot's pair is
 * drawn from `src/data/archive.ts` — shared service, a shared yard, or a shared
 * event. Five of the sixteen are stated outright in the Archive; the rest are
 * consistent with it and are marked below. The Archive is the authority: if a
 * pairing here ever contradicts it, this file is the one that is wrong.
 *
 * **Direction matters.** Vesk calling Doyne is not Doyne calling Vesk, so the
 * table is keyed on the caller. That is also why the roster is uneven — ROOK and
 * SENNA are each called by three pilots, because the story leans on them.
 *
 * Voices follow `banter.ts` and `docs/PILOT_PORTRAIT_SPEC.md` exactly: VESK
 * composed and faintly superior, ROOK unbothered, DOYNE barely speaks, OKONKWO
 * industrial, HOLLOWAY delighted, TENGKU patient, VOLKOV unhinged, SENNA
 * clinical. The difference from `matchups.ts` is that these two are on the same
 * side — so the shade is affectionate where it exists at all, and three of the
 * pairings are not funny in the slightest.
 *
 * Kept short for the same reason `banter.ts` is: the box is small and the fight
 * does not stop to let anyone finish a sentence.
 */
import type { Exchange } from './matchups';

/** An arrival: the assist speaks, their caller answers. Two lines, like an intro. */
export type TagExchange = readonly Exchange[];

/**
 * Who each pilot can call, in menu order.
 *
 * Exactly two, never themselves. `assists.test.ts` enforces both, and that every
 * id here is a real chassis — a typo would otherwise surface as an assist that
 * silently never arrives.
 */
export const TAG_PAIRS: Record<string, readonly [string, string]> = {
  // Concord, and the man Concord trained for twelve years and then struck off.
  // Vesk and Rook have never served together; they are the same pilot on
  // opposite sides of a settlement, and both of them know it.
  halcyon: ['vesper', 'nocturne'],
  // Stillwake, from the side that held the lift. And the service he left.
  nocturne: ['nulltide', 'halcyon'],
  // His own service, and the only other pilot on the roster who says nothing.
  vesper: ['halcyon', 'nulltide'],
  // Ironwake. And the contract escort that ended the convoy seizures. (inferred)
  terramoth: ['obelisk', 'pyre'],
  // Brightwake docks, and the only other pilot who closes without hedging.
  cirrus: ['nulltide', 'pyre'],
  // Ironwake. And the other man who held an opening until relief was recorded.
  obelisk: ['terramoth', 'nocturne'],
  // The same doctrine, and the client who kept re-hiring her anyway. (inferred)
  pyre: ['cirrus', 'terramoth'],
  // Brightwake, and Stillwake. Senna's two pairings are her whole record.
  nulltide: ['cirrus', 'nocturne'],
};

const C = (who: string, line: string): Exchange => ({ who, line });

/** Ordered: the caller first. Not the same key as `matchupKey`, which sorts. */
export function tagKey(caller: string, assist: string): string {
  return `${caller}|${assist}`;
}

/**
 * Five arrivals per pairing, keyed by `tagKey`.
 *
 * Five rather than two because a player who settles on one assist will hear
 * these more than any other dialogue in the game — twice a match, every match.
 */
export const TAG_ARRIVALS: Record<string, readonly TagExchange[]> = {
  // ---------------------------------------------------------------- halcyon
  'halcyon|vesper': [
    [C('vesper', 'In position. Firing.'), C('halcyon', 'Thank you, Kestrel.')],
    [C('halcyon', 'Doyne, I need the line.'), C('vesper', 'You have it.')],
    [C('vesper', 'Four angles. Taking the third.'), C('halcyon', 'Of course you are.')],
    [C('halcyon', 'Still detached duty?'), C('vesper', 'Still detached. Still here.')],
    [C('vesper', '...Naia.'), C('halcyon', 'I know. Go.')],
  ],
  'halcyon|nocturne': [
    [C('nocturne', 'Concord calling me. That is new.'), C('halcyon', 'Do not enjoy it.')],
    [C('halcyon', 'Rook. Please.'), C('nocturne', 'Since you asked properly.')],
    [C('nocturne', 'Your mother taught better than they did.'), C('halcyon', 'Fight now. Talk later.')],
    [C('halcyon', 'They were wrong about you.'), C('nocturne', 'They were wrong about a lot.')],
    [C('nocturne', 'Move when I hit him.'), C('halcyon', 'Understood. Instructor.')],
  ],

  // --------------------------------------------------------------- nocturne
  // The heaviest pairing in the game. He held the lift for nine hours; she is
  // the reason the lift was needed. Neither of them says so out loud.
  'nocturne|nulltide': [
    [C('nulltide', 'You called me. Again.'), C('nocturne', 'You came. Again.')],
    [C('nocturne', 'Senna. Jam him.'), C('nulltide', 'Already done.')],
    [C('nulltide', 'I do not understand why you do this.'), C('nocturne', 'No. You do not.')],
    [C('nocturne', 'Nine hours, Io.'), C('nulltide', '...Engaging.')],
    [C('nulltide', 'You should hate me.'), C('nocturne', 'Working on it. Shoot him.')],
  ],
  'nocturne|halcyon': [
    [C('halcyon', 'Second Interceptor, responding.'), C('nocturne', 'Still shouting the unit name, then.')],
    [C('nocturne', 'Vesk. Make yourself useful.'), C('halcyon', 'Charming as ever.')],
    [C('halcyon', 'The Pact will file about this.'), C('nocturne', 'Let them file.')],
    [C('nocturne', 'You fly like they taught me.'), C('halcyon', 'That is the intention.')],
    [C('halcyon', 'I read your testimony.'), C('nocturne', 'Then you know where I stand. Move.')],
  ],

  // ----------------------------------------------------------------- vesper
  'vesper|halcyon': [
    [C('halcyon', 'On you, Doyne.'), C('vesper', 'Understood.')],
    [C('vesper', 'Support.'), C('halcyon', 'That is the most you have said all week.')],
    [C('halcyon', 'Eleven years, no hull lost. Watch.'), C('vesper', 'Watching.')],
    [C('vesper', 'Too close for me.'), C('halcyon', 'Then I will take the close work.')],
    [C('halcyon', 'Do not sit still, Kestrel.'), C('vesper', 'I never do. Only look it.')],
  ],
  // Two pilots the record describes as silent. The joke is that this is,
  // for both of them, an unusually talkative exchange.
  'vesper|nulltide': [
    [C('nulltide', 'Present.'), C('vesper', 'Noted.')],
    [C('vesper', 'Left.'), C('nulltide', 'Taking left.')],
    [C('nulltide', 'Your firing position is good.'), C('vesper', 'I know.')],
    [C('vesper', '...'), C('nulltide', 'Yes. That was my reading also.')],
    [C('nulltide', 'We could simply not speak.'), C('vesper', 'Agreed.')],
  ],

  // -------------------------------------------------------------- terramoth
  'terramoth|obelisk': [
    [C('obelisk', 'Route is held. Coming across.'), C('terramoth', 'Take your time, Saar.')],
    [C('terramoth', 'Need a wall, Tengku.'), C('obelisk', 'You have one.')],
    [C('obelisk', 'Who is holding your seam?'), C('terramoth', 'Nobody. That is why you are here.')],
    [C('terramoth', 'Same shift, different sky.'), C('obelisk', 'The work does not change.')],
    [C('obelisk', 'Brace up. I am not fast.'), C('terramoth', 'Neither am I. Never mattered.')],
  ],
  'terramoth|pyre': [
    [C('pyre', 'You called ME? Oh, this is a good day!'), C('terramoth', 'Mind the plant, Volkov.')],
    [C('terramoth', 'Ashfall. Do the job.'), C('pyre', 'The job is FIRE, yes?')],
    [C('pyre', 'Anything I should not burn?'), C('terramoth', 'The convoy. Everything else is yours.')],
    [C('terramoth', 'Invoice me later.'), C('pyre', 'I will! With interest!')],
    [C('pyre', 'Do you ever get excited?'), C('terramoth', 'Once. In 36. Did not care for it.')],
  ],

  // ----------------------------------------------------------------- cirrus
  'cirrus|nulltide': [
    [C('nulltide', 'Holloway.'), C('cirrus', 'IO! You came! You never come!')],
    [C('cirrus', 'Io, do the scary thing!'), C('nulltide', 'Specify the scary thing.')],
    [C('nulltide', 'Your approach is reckless.'), C('cirrus', 'Yes! Isn\'t it great?')],
    [C('cirrus', 'We are the best team in the sky.'), C('nulltide', 'We are a team of two. But yes.')],
    [C('nulltide', 'Do not die, Mira.'), C('cirrus', 'Aww. That was almost warm!')],
  ],
  'cirrus|pyre': [
    [C('pyre', 'LITTLE SILVER ONE! I brought fire!'), C('cirrus', 'You always bring fire!')],
    [C('cirrus', 'Rasa! Set something on fire!'), C('pyre', 'You did not have to ask!')],
    [C('pyre', 'Race you through him!'), C('cirrus', 'You are ON —')],
    [C('cirrus', 'Do not hit ME this time.'), C('pyre', 'No promises, tiny friend!')],
    [C('pyre', 'Two of us. He is finished.'), C('cirrus', 'He was finished at one of us!')],
  ],

  // ---------------------------------------------------------------- obelisk
  'obelisk|terramoth': [
    [C('terramoth', 'Heavy plant, coming through.'), C('obelisk', 'The line is yours, Brunn.')],
    [C('obelisk', 'Okonkwo. Pressure, please.'), C('terramoth', 'Pressure is what I have.')],
    [C('terramoth', 'You still refusing that commission?'), C('obelisk', 'You still refusing yours?')],
    [C('obelisk', 'I do not chase. You do not run.'), C('terramoth', 'Suits us both.')],
    [C('terramoth', 'Four seconds of me. Spend it well.'), C('obelisk', 'I will.')],
  ],
  // Two men who each held an opening until relief was recorded. One of them
  // was relieved. The other was not, and did it for nine hours anyway.
  'obelisk|nocturne': [
    [C('nocturne', 'Where do you want me?'), C('obelisk', 'The gap. You know the one.')],
    [C('obelisk', 'Hold this with me.'), C('nocturne', 'That I can do.')],
    [C('nocturne', 'Ironwake asking Emberline. Strange sky.'), C('obelisk', 'The route does not care.')],
    [C('obelisk', 'I heard what you held.'), C('nocturne', 'Then do not make me hold this one alone.')],
    [C('nocturne', 'You would have done the same.'), C('obelisk', 'I would like to think so.')],
  ],

  // ------------------------------------------------------------------- pyre
  'pyre|cirrus': [
    [C('cirrus', 'Cavalry! That is me!'), C('pyre', 'My favourite little comet!')],
    [C('pyre', 'Mira! Cut him for me!'), C('cirrus', 'Cutting! Cutting!')],
    [C('cirrus', 'You are on fire again.'), C('pyre', 'I am ALWAYS on fire!')],
    [C('pyre', 'Go fast. I will go loud.'), C('cirrus', 'Best plan I have ever heard.')],
    [C('cirrus', 'Four seconds! Make it count!'), C('pyre', 'I only need one!')],
  ],
  'pyre|terramoth': [
    [C('terramoth', 'Rig is warm. Where do you want it?'), C('pyre', 'Everywhere! All of it!')],
    [C('pyre', 'Big man! Squash him!'), C('terramoth', 'That is the general idea.')],
    [C('terramoth', 'Contract says defend. Not burn.'), C('pyre', 'Contracts are so specific!')],
    [C('pyre', 'You never flinch. Why?'), C('terramoth', 'Seen a seam come down. This is quiet.')],
    [C('terramoth', 'Stay off my swing arc.'), C('pyre', 'I will TRY.')],
  ],

  // --------------------------------------------------------------- nulltide
  'nulltide|cirrus': [
    [C('cirrus', 'You called ME? Best day ever!'), C('nulltide', 'Do not make me regret it.')],
    [C('nulltide', 'Holloway. Fast side.'), C('cirrus', 'Fast side is my ONLY side!')],
    [C('cirrus', 'What do you need?'), C('nulltide', 'Noise. You are extremely good at noise.')],
    [C('nulltide', 'The model gives you eleven percent.'), C('cirrus', 'The model has never met me!')],
    [C('cirrus', 'You do like me!'), C('nulltide', 'I have not finished the analysis.')],
  ],
  // She is calling the man who spent nine hours undoing what she did.
  'nulltide|nocturne': [
    [C('nocturne', 'Rook, inbound.'), C('nulltide', 'Thank you for coming.')],
    [C('nulltide', 'I did not expect an answer.'), C('nocturne', 'Neither did I.')],
    [C('nocturne', 'I am not here for you.'), C('nulltide', 'I know. Understood.')],
    [C('nulltide', 'You held it for nine hours.'), C('nocturne', 'And you have flown ten years. Fight.')],
    [C('nocturne', 'One day we talk about it.'), C('nulltide', 'One day. Not today.')],
  ],
};

/**
 * What the assist says when they are going to be late.
 *
 * Spoken the moment the button is pressed, not on arrival — the point is that
 * the player finds out immediately that help is four to seven seconds away
 * rather than one to three, and can decide what to do with that.
 *
 * Two per pairing. A late roll is 20 % of a call and there are two calls in a
 * match, so these surface roughly once every three fights; a third take would
 * never be heard.
 */
export const TAG_LATE: Record<string, readonly string[]> = {
  'halcyon|vesper': ['Repositioning. I will be slow.', 'Bad approach. Give me a moment.'],
  'halcyon|nocturne': ['Old frame, Vesk. Coming as fast as it goes.', 'Hold him. I am not quick any more.'],
  'nocturne|nulltide': ['Recalculating an approach. Delayed.', 'I am far out. Survive until I am not.'],
  'nocturne|halcyon': ['Breaking off my own contact. Wait.', 'On my way, Rook. Not immediately.'],
  'vesper|halcyon': ['Give me a minute, Kestrel.', 'Coming. Not fast.'],
  'vesper|nulltide': ['Delayed.', 'Distance. Wait.'],
  'terramoth|obelisk': ['Route first. Then you.', 'I will be late. I will still come.'],
  'terramoth|pyre': ['Reloading the fun one! Wait for me!', 'Coming! Slowly! Sorry!'],
  'cirrus|nulltide': ['I am a long way out, Mira.', 'Delayed. Do not do anything reckless.'],
  'cirrus|pyre': ['Refuelling! Do not start without me!', 'Late! But worth it!'],
  'obelisk|terramoth': ['Plant does not hurry, Saar.', 'Walking. It takes what it takes.'],
  'obelisk|nocturne': ['Coming the long way. Hold it.', 'Late. You know how that goes.'],
  'pyre|cirrus': ['Coming the scenic route!', 'Two seconds! Maybe six!'],
  'pyre|terramoth': ['Rig is cold. Give me time.', 'Late. Brace yourself in the meantime.'],
  'nulltide|cirrus': ['Wrong side of the stage! Coming!', 'Late! Do not be dead!'],
  'nulltide|nocturne': ['Distance is against me. Hold.', 'I am coming. It will take time.'],
};

/** Whether `assist` is one of the two `caller` may bring. */
export function canTag(caller: string, assist: string): boolean {
  return TAG_PAIRS[caller]?.includes(assist) ?? false;
}

/**
 * The arrival exchange for a call, or null if the pairing is not a legal one.
 *
 * Same `roll`-indexed shape as `pickConversation`, so the caller supplies the
 * randomness and the pick stays replay-safe.
 */
export function pickTagArrival(caller: string, assist: string, roll: number): TagExchange | null {
  const set = TAG_ARRIVALS[tagKey(caller, assist)];
  if (!set || set.length === 0) return null;
  return set[Math.min(set.length - 1, Math.max(0, Math.floor(roll * set.length)))];
}

/** The line spoken at press time when this call rolled late. */
export function pickTagLate(caller: string, assist: string, roll: number): string | null {
  const set = TAG_LATE[tagKey(caller, assist)];
  if (!set || set.length === 0) return null;
  return set[Math.min(set.length - 1, Math.max(0, Math.floor(roll * set.length)))];
}
