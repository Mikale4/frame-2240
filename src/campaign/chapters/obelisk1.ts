import { Difficulty } from '../../core/Session';
import type { ChapterDef, StoryApi } from '../Story';
import type { Script } from '../Script';
import { regionById } from '../Regions';

/**
 * SAAR TENGKU — Chapter 1: THE ROUTE STAYS CLOSED.
 *
 * Canon used: Tengku has stood Ironwake's watch over the same three yards for
 * twenty years and is at Kettle Gate; he never pursues, because success means
 * the route stays closed. Eleven braids, one for each contested docking he
 * held. Yard crews enter the GD-09 as door equipment on the watch sheets.
 * Ironwake has crew and shifts, not ranks. Holloway is Free Latitude, built her
 * first frame at seventeen from three wrecks and a stolen reactor, publishes
 * her fittings, and rebuilds the LT-21 constantly — reckless by design, never
 * stupid. Disputes are flown at Cathedral Yard under the standing rules.
 * Nobody is named who is not canon: the watch officer and the dockhand are
 * roles.
 */

const R = regionById('gatewatch')!;
const pad = R.pad;

function* intro(s: StoryApi): Script {
  yield s.fade(true, 0);
  yield s.caption('GATEWATCH  ·  KETTLE GATE  ·  43 CE', 2.6);
  yield s.fade(false, 1.2);
  // The dockhand comes over from beside the pad.
  yield s.walk('dockhand', R.spawn.x + 0.6, R.spawn.z + 2.2, true);
  s.shot('me', 'dockhand');
  yield s.say('dockhand', 'Morning, Tengku. A Free Latitude crew filed to dock through the route overnight.');
  yield s.say('me', 'Filed. Not tried.');
  yield s.say('dockhand', 'Filed properly, too. Every form in order. The watch officer has the paper.');
  yield s.say('me', 'Then somebody over there can read. That is worth knowing.');
  s.release();
  s.objective('Talk to the watch officer.');
}

function* watch(s: StoryApi): Script {
  if (s.flag('took_flight')) {
    if (s.flag('lost_once')) {
      yield s.say('watch', 'The board will hear it again. Until it rules, the gate is closed. Same as every other night.');
    } else {
      yield s.say('watch', 'Your frame is on the pad. If she gets to Cathedral Yard early, let her wait.');
    }
    return;
  }
  s.shot('me', 'watch');
  yield s.say('watch', 'Free Latitude has filed for a docking through Kettle Gate. One crew, one frame, passage down the route.');
  yield s.say('me', 'Refused.');
  yield s.say('watch', 'Refused, and they appealed. The standing-rules board has sent it to Cathedral Yard.');
  yield s.say('me', 'Who flies for them?');
  yield s.say('watch', 'Holloway. The LT-21.');
  yield s.say('me', 'The one who built her first frame out of three wrecks.');
  yield s.say('watch', 'And a stolen reactor. At seventeen. She publishes her fittings for anyone to copy.');
  yield s.say('me', 'Then she is clever. Clever pilots come to you.');
  const pick = (yield s.ask('watch', 'How do you want it flown?', ['I hold. She comes to me.', 'I could press her early.', 'What is she flying now?'])) as number;
  if (pick === 1) {
    yield s.say('me', 'I could press her early.');
    yield s.say('watch', 'You have never chased anything off this gate.');
    yield s.say('me', 'No. And I will not start at Cathedral Yard. I hold. She comes to me.');
  } else if (pick === 2) {
    yield s.say('me', 'What is she flying now?');
    yield s.say('watch', 'Brightwake says she rebuilds it between flights. No two sheets describe the same fit.');
    yield s.say('me', 'Then I will not fly against the sheet. I hold, and she comes to me.');
  } else {
    yield s.say('me', 'I hold. She comes to me.');
    yield s.say('watch', 'And if she does not?');
    yield s.say('me', 'Then the route stays closed, and the board writes that down too.');
  }
  yield s.say('watch', 'One sanctioned flight under the standing rules. AEGIS is up and your frame is on the pad.');
  s.release();
  s.set('took_flight');
  s.objective('Go to your frame and fly the sanctioned flight.');
}

function* dockhand(s: StoryApi): Script {
  if (!s.flag('took_flight')) {
    yield s.say('dockhand', 'The watch officer has the board notice. I only carry the crates.');
    return;
  }
  if (s.flag('lost_once')) {
    yield s.say('dockhand', 'Brightwake crews are already saying the gate is open.');
    yield s.say('me', 'Brightwake says a lot of things. The gate is closed until the board says otherwise.');
    return;
  }
  yield s.say('dockhand', 'I have logged your frame out on the sheet. Door equipment, same as always.');
  yield s.say('me', 'Leave it. That is what it is.');
}

function* frame(s: StoryApi): Script {
  if (!s.flag('took_flight')) {
    yield s.say('me', 'Nothing has been asked of the gate yet. The watch officer first.');
    return;
  }
  const how = (yield s.ask('me', 'Fly the sanctioned flight against Holloway?', ['Fly it in the open (FREE ORBIT)', 'Fly it on the plate', 'Not yet'])) as number;
  if (how === 2) return;
  yield s.fade(true, 0.6);
  const result = (yield s.battle({ foe: 'cirrus', difficulty: Difficulty.Normal, mode: how === 0 ? 'orbit' : 'versus' })) as 'win' | 'lose';
  yield s.fade(false, 0.8);
  if (result === 'lose') {
    s.set('lost_once');
    yield s.say('me', 'She found a gap. I will close it. Again.');
    s.objective('Fly the sanctioned flight again when ready.');
    return;
  }
  // The watch officer comes out to the pad with the ruling.
  yield s.walk('watch', pad.x + 5, pad.z - 1.5);
  s.shot('me', 'watch');
  yield s.say('watch', 'The board has ruled. The docking is refused. The route stays closed.');
  yield s.say('me', 'Good.');
  if (s.flag('lost_once')) {
    yield s.say('watch', 'She has asked the board for the record of both flights. She wants to see how you closed the gap.');
    yield s.say('me', 'Let her. She will find another one, and I will close that too.');
  } else {
    yield s.say('watch', 'She sent a message after. She said it was like flying at a wall.');
    yield s.say('me', 'That is the idea.');
  }
  yield s.say('watch', 'That is twelve contested dockings held. The watch sheet will want a braid for it.');
  yield s.say('me', 'The sheet can have it. I will be on the gate.');
  s.release();
  s.unlock('cirrus');
  s.complete();
}

export const OBELISK_1: ChapterDef = {
  id: 'obelisk-1',
  pilot: 'obelisk',
  number: 1,
  title: 'THE ROUTE STAYS CLOSED',
  region: 'gatewatch',
  start: { x: R.spawn.x, z: R.spawn.z, facing: R.spawn.facing },
  objective: 'Talk to the watch officer.',
  actors: [
    { id: 'watch', name: 'WATCH OFFICER', look: 'extra', sex: 'f', seed: 66, suit: 0x3c2a6c, trim: 0xc89cff, x: R.people.watch.x, z: R.people.watch.z, facing: Math.PI },
    { id: 'dockhand', name: 'DOCKHAND', look: 'extra', sex: 'm', seed: 79, suit: 0x342e44, trim: 0xc89cff, x: R.people.dockhand.x, z: R.people.dockhand.z, facing: -Math.PI / 2 },
  ],
  intro,
  talk: { watch, dockhand },
  areas: [{ id: 'frame', x: pad.x, z: pad.z, r: 5.2, prompt: 'BOARD GD-09 OBELISK', run: frame }],
  features: ['cirrus'],
};
