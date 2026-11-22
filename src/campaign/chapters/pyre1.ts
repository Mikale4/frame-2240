import { Difficulty } from '../../core/Session';
import type { ChapterDef, StoryApi } from '../Story';
import type { Script } from '../Script';
import { regionById } from '../Regions';

/**
 * RASA VOLKOV — Chapter 1: WITHIN TERMS.
 *
 * Canon used: Ashfall prices every risk separately and works for all four
 * other powers; Volkov holds its contracts-completed record, has written off
 * four hulls, and burned two yards she was hired to defend — both ruled
 * "within terms". Ashfall crews copy her soot. Emberline wants thirteen yards
 * and holds nine; Ironwake protects convoys and has no position on the Descent.
 * Disputes are flown at Cathedral Yard under the standing rules. Okonkwo
 * declined a commission three times and thinks a seam collapse is worse than a
 * fight. Nobody here is named who is not canon: the broker and the crews are
 * roles.
 */

const R = regionById('cinder')!;
const pad = R.pad;

function* intro(s: StoryApi): Script {
  yield s.fade(true, 0);
  yield s.caption('CINDER BERTH  ·  ASHFALL IRREGULARS  ·  43 CE', 2.6);
  yield s.fade(false, 1.2);
  // One of the crews jogs over from the cargo stacks.
  yield s.walk('crewA', R.spawn.x - 2.2, R.spawn.z - 0.6, true);
  s.shot('me', 'crewA');
  yield s.say('crewA', 'Broker wants you. Two envelopes, one desk. She said to say "both urgent".');
  yield s.say('me', 'Everything is urgent until it has a price on it.');
  yield s.say('crewB', 'We did the soot again. For the inspection.');
  yield s.say('me', 'It is part of the uniform. Do the other cheek.');
  s.release();
  s.objective('Talk to the broker.');
}

function* broker(s: StoryApi): Script {
  if (s.flag('took_terms')) {
    if (s.flag('lost_once')) {
      yield s.say('broker', 'Ashfall prices losses too. Okonkwo is still on the lane. The flight is yours when you want it.');
    } else {
      yield s.say('broker', 'Your frame is fuelled. Okonkwo is waiting on the lane, and he does not get bored.');
    }
    return;
  }
  s.shot('me', 'broker');
  yield s.say('broker', 'Two contracts. The Emberline claims office wants a survey convoy escorted to one of the thirteen.');
  yield s.say('broker', 'Ironwake wants the same lane kept closed for the season. Same lane. Same week.');
  yield s.say('me', 'What do they pay?');
  yield s.say('broker', 'Emberline pays on arrival. Ironwake pays per day the lane stays shut.');
  const pick = (yield s.ask('broker', 'Which one do you sign?', ['Both.', 'Emberline.', 'Ironwake.'])) as number;
  if (pick === 0) {
    yield s.say('me', 'Both. They do not overlap until the convoy moves, and the convoy does not move until the lane is open.');
    yield s.say('broker', 'That is one way to read the terms.');
    yield s.say('me', 'It is the way Ashfall reads them.');
    s.set('signed_both');
  } else {
    yield s.say('me', pick === 1 ? 'Emberline. Arrival money spends the same as any other.' : 'Ironwake. I like being paid for nothing happening.');
    yield s.say('broker', 'Noted. The other side will hire someone else, and you will meet them on the lane.');
  }
  yield s.say('broker', 'Ironwake has already put a walker on that lane. Okonkwo, in the HV-03.');
  yield s.say('me', 'The one who keeps turning down commissions.');
  yield s.say('broker', 'Three times. The standing rules give you one sanctioned flight at Cathedral Yard to settle who holds the lane.');
  s.release();
  s.set('took_terms');
  s.objective('Go to your frame and fly the sanctioned flight.');
}

function* crewA(s: StoryApi): Script {
  yield s.say('crewA', s.flag('took_terms') ? 'Both envelopes? Course you did.' : 'Broker. Desk by the hangar. Go on.');
}

function* crewB(s: StoryApi): Script {
  yield s.say('crewB', 'Four hulls written off and the frame still comes back. They say that about you on every berth.');
  yield s.say('me', 'They say it because it is in the record.');
}

function* frame(s: StoryApi): Script {
  if (!s.flag('took_terms')) {
    yield s.say('me', 'Nobody has paid for anything yet. The broker first.');
    return;
  }
  const how = (yield s.ask('me', 'Fly the sanctioned flight against Okonkwo?', ['Fly it in the open (FREE ORBIT)', 'Fly it on the plate', 'Not yet'])) as number;
  if (how === 2) return;
  yield s.fade(true, 0.6);
  const result = (yield s.battle({ foe: 'terramoth', difficulty: Difficulty.Normal, mode: how === 0 ? 'orbit' : 'versus' })) as 'win' | 'lose';
  yield s.fade(false, 0.8);
  if (result === 'lose') {
    s.set('lost_once');
    yield s.say('me', 'He held. Walkers do that. Again.');
    s.objective('Fly the sanctioned flight again when ready.');
    return;
  }
  // The broker comes out to the pad with the ruling.
  yield s.walk('broker', pad.x + 5, pad.z - 1.5);
  s.shot('me', 'broker');
  yield s.say('broker', 'The board has ruled. The lane is Ironwake\'s for the season, and the convoy is escorted the day after.');
  if (s.flag('signed_both')) {
    yield s.say('broker', 'Both clients paid. Both clients complained. The board says it was within terms.');
  } else {
    yield s.say('broker', 'Your client paid. The other one complained. The board says it was within terms.');
  }
  yield s.say('me', 'It always is.');
  yield s.say('broker', 'Okonkwo left a message. He said you fly like a seam fire: fast, and somebody else\'s problem.');
  yield s.say('me', 'Tell him I took it as a compliment.');
  s.release();
  s.unlock('terramoth');
  s.complete();
}

export const PYRE_1: ChapterDef = {
  id: 'pyre-1',
  pilot: 'pyre',
  number: 1,
  title: 'WITHIN TERMS',
  region: 'cinder',
  start: { x: R.spawn.x, z: R.spawn.z, facing: R.spawn.facing },
  objective: 'Talk to the broker.',
  actors: [
    { id: 'broker', name: 'THE BROKER', look: 'extra', sex: 'f', seed: 11, suit: 0x2a2020, trim: 0xff7a2a, x: R.people.broker.x, z: R.people.broker.z, facing: Math.PI / 2 },
    { id: 'crewA', name: 'ASHFALL CREW', look: 'extra', sex: 'm', seed: 4, suit: 0x5a3020, trim: 0xff9a3a, x: R.people.crewA.x, z: R.people.crewA.z },
    { id: 'crewB', name: 'ASHFALL CREW', look: 'extra', sex: 'f', seed: 9, suit: 0x4a2a1c, trim: 0xff7a2a, x: R.people.crewB.x, z: R.people.crewB.z, facing: Math.PI },
  ],
  intro,
  talk: { broker, crewA, crewB },
  areas: [{ id: 'frame', x: pad.x, z: pad.z, r: 5.2, prompt: 'BOARD IN-05 PYRE', run: frame }],
  features: ['terramoth'],
};
