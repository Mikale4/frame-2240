import { Difficulty } from '../../core/Session';
import type { ChapterDef, StoryApi } from '../Story';
import type { Script } from '../Script';
import { regionById } from '../Regions';

/**
 * HALDEN ROOK — Chapter 1: IMPOSSIBLE TO IMPRESS.
 *
 * Canon used: Rook flies the AV-13 NOCTURNE for the Emberline 7th Assault and
 * trains its recruits — the lowest first-year loss rate in the sky — and is
 * impossible to impress. Emberline holds nine yards and presses its claim to
 * the thirteen; Emberrest keeps the claims office. Tengku has stood Ironwake's
 * watch over the same three yards for twenty years and never pursues: success
 * is the route staying closed. Disputes are flown at Cathedral Yard under the
 * standing rules. Rook's past is not touched here. Nobody is named who is not
 * canon: the recruits and the clerk are roles.
 */

const R = regionById('emberrest')!;
const pad = R.pad;
// The region's recruit spots are up on the range platform, and actors are
// placed at main-deck height, so the recruits wait at its foot instead, on
// open deck either side of the ramp.
const RECRUIT_A = { x: -8, z: 6 };
const RECRUIT_B = { x: 8, z: 6 };

function* intro(s: StoryApi): Script {
  yield s.fade(true, 0);
  yield s.caption('EMBERREST  ·  EMBERLINE PACT  ·  43 CE', 2.6);
  yield s.fade(false, 1.2);
  // A recruit runs over from the foot of the range.
  yield s.walk('recruitA', R.spawn.x - 0.6, R.spawn.z - 2.2, true);
  s.shot('me', 'recruitA');
  yield s.say('recruitA', 'Instructor. We ran the range drill, both of us. Clean, and under time.');
  yield s.say('me', 'Under whose time?');
  yield s.say('recruitA', 'The range clock.');
  yield s.say('me', 'The range clock does not shoot back. Run it again.');
  yield s.say('recruitA', 'Yes, Instructor. And the claims office sent for you. Something about one of the thirteen.');
  yield s.say('me', 'And you ran across an open deck to tell me. Walk, next time.');
  s.release();
  s.objective('Talk to the claims clerk.');
}

function* claims(s: StoryApi): Script {
  if (s.flag('took_flight')) {
    if (s.flag('lost_once')) {
      yield s.say('claims', 'The board will hear it again whenever you are ready. Tengku is not going anywhere. That is rather his point.');
    } else {
      yield s.say('claims', 'Your frame is on the pad, Instructor. The board has the flight on its list.');
    }
    return;
  }
  s.shot('me', 'claims');
  yield s.say('claims', 'Instructor Rook. The office has a claim before the standing-rules board. One of the thirteen.');
  yield s.say('me', 'I train recruits. I do not file paper.');
  yield s.say('claims', 'The paper is filed. The claim needs a docking through Kettle Gate, and Ironwake refuses it.');
  yield s.say('claims', 'The board has sent it to Cathedral Yard. Their standing watch flies for them. Tengku, in the GD-09.');
  yield s.say('me', 'Then it will be a long flight. He will not come to me.');
  yield s.say('claims', 'You know him?');
  yield s.say('me', 'I know how he flies.');
  const pick = (yield s.ask('claims', 'Will you fly it for the office?', ['I will fly it.', 'Send someone younger.', 'What does a win buy?'])) as number;
  if (pick === 1) {
    yield s.say('me', 'Send someone younger. I have a range full of them.');
    yield s.say('claims', 'The board will not sanction a first-year pilot, and the office asked for you.');
    yield s.say('me', 'Then I will fly it. Have the paper ready.');
  } else if (pick === 2) {
    yield s.say('me', 'What does a win buy the office?');
    yield s.say('claims', 'One docking through Kettle Gate. One survey crew, under escort, once.');
    yield s.say('me', 'Once.');
    yield s.say('claims', 'Once is a precedent. The office likes precedents.');
    yield s.say('me', 'Then I will fly it. Have the paper ready.');
  } else {
    yield s.say('me', 'I will fly it.');
    yield s.say('claims', 'Thank you, Instructor.');
    yield s.say('me', 'Do not thank me. Have the paper ready.');
  }
  yield s.say('claims','The standing rules give you one sanctioned flight at Cathedral Yard. Your frame is on the pad.');
  s.release();
  s.set('took_flight');
  s.objective('Go to your frame and fly the sanctioned flight.');
}

function* recruitA(s: StoryApi): Script {
  if (!s.flag('took_flight')) {
    yield s.say('recruitA', 'The clerk is outside the claims office, Instructor. West side of the deck.');
    return;
  }
  yield s.say('recruitA', 'Can we watch the flight, Instructor?');
  yield s.say('me', 'You can watch the record. Then you can tell me what I did wrong.');
  yield s.say('recruitA', 'What if you do nothing wrong?');
  yield s.say('me', 'Then you were not watching.');
}

function* recruitB(s: StoryApi): Script {
  if (s.flag('lost_once')) {
    yield s.say('recruitB', 'We watched the record, Instructor. He hardly moved for the first minute.');
    yield s.say('me', 'He did not need to. Remember that.');
    return;
  }
  yield s.say('recruitB', 'Instructor. Is there anything we could do on the range that would impress you?');
  yield s.say('me', 'Bring the frame back. Every flight, for a year.');
  yield s.say('recruitB', 'And then?');
  yield s.say('me', 'Then I will think of something else.');
}

function* frame(s: StoryApi): Script {
  if (!s.flag('took_flight')) {
    yield s.say('me', 'Nobody has asked me to fly anything yet. The claims office first.');
    return;
  }
  const how = (yield s.ask('me', 'Fly the sanctioned flight against Tengku?', ['Fly it in the open (FREE ORBIT)', 'Fly it on the plate', 'Not yet'])) as number;
  if (how === 2) return;
  yield s.fade(true, 0.6);
  const result = (yield s.battle({ foe: 'obelisk', difficulty: Difficulty.Normal, mode: how === 0 ? 'orbit' : 'versus' })) as 'win' | 'lose';
  yield s.fade(false, 0.8);
  if (result === 'lose') {
    s.set('lost_once');
    yield s.say('me', 'He held. That is what he is for. Again.');
    s.objective('Fly the sanctioned flight again when ready.');
    return;
  }
  // The clerk comes out to the pad with the ruling.
  yield s.walk('claims', pad.x + 5, pad.z - 1.5);
  s.shot('me', 'claims');
  yield s.say('claims', 'The board has ruled. The office may take one survey crew through Kettle Gate, once, under escort.');
  yield s.say('me', 'Once.');
  yield s.say('claims', 'It is a precedent, Instructor. The office is very pleased.');
  yield s.say('me', 'The office is easily pleased.');
  if (s.flag('lost_once')) {
    yield s.say('claims', 'The recruits watched both flights. They want to know what you changed the second time.');
    yield s.say('me', 'Tell them to work it out. That is the lesson.');
  } else {
    yield s.say('claims', 'The recruits watched the record. They say it was the cleanest flight they have ever seen.');
    yield s.say('me', 'They have not seen many.');
  }
  yield s.say('claims', 'Ironwake sent a note with the ruling. Their watch says the gate will be closed again by evening.');
  yield s.say('me', 'It will be. He does not leave doors open.');
  s.release();
  s.unlock('obelisk');
  s.complete();
}

export const NOCTURNE_1: ChapterDef = {
  id: 'nocturne-1',
  pilot: 'nocturne',
  number: 1,
  title: 'IMPOSSIBLE TO IMPRESS',
  region: 'emberrest',
  start: { x: R.spawn.x, z: R.spawn.z, facing: R.spawn.facing },
  objective: 'Talk to the claims clerk.',
  actors: [
    { id: 'claims', name: 'CLAIMS CLERK', look: 'extra', sex: 'm', seed: 58, suit: 0x3a3436, trim: 0x36e2ea, x: R.people.claims.x, z: R.people.claims.z, facing: Math.PI / 2 },
    { id: 'recruitA', name: 'RECRUIT', look: 'extra', sex: 'f', seed: 23, suit: 0x781c22, trim: 0x36e2ea, x: RECRUIT_A.x, z: RECRUIT_A.z, facing: 0 },
    { id: 'recruitB', name: 'RECRUIT', look: 'extra', sex: 'm', seed: 37, suit: 0x781c22, trim: 0x36e2ea, x: RECRUIT_B.x, z: RECRUIT_B.z, facing: 0 },
  ],
  intro,
  talk: { claims, recruitA, recruitB },
  areas: [{ id: 'frame', x: pad.x, z: pad.z, r: 5.2, prompt: 'BOARD AV-13 NOCTURNE', run: frame }],
  features: ['obelisk'],
};
