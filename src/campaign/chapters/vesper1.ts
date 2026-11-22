import { Difficulty } from '../../core/Session';
import type { ChapterDef, StoryApi } from '../Story';
import type { Script } from '../Script';
import { regionById } from '../Regions';

/**
 * KESTREL DOYNE — Chapter 1: FOUR POSITIONS.
 *
 * Canon used: Doyne is Concord on detached duty since 38 CE after six years of
 * yard survey; he finds four firing positions, with a kilometre of clear line,
 * before anyone looks for him, and says nothing on the channel at the start of
 * a fight. Annual reviews find no demonstrated close-quarters capability
 * because no qualifying engagement has occurred. Sanctioned flights are flown
 * at Cathedral Yard under the standing rules. He calls Vesk "Naia". Everyone on
 * foot is a role, not a name; Vesk is met only in the flight, and her remark
 * reaches him second-hand.
 */

const R = regionById('surveypost')!;
const pad = R.pad;

/** By the span landing on the east edge, clear of the deck's edge. */
const TRAM_HAND = { x: 21, z: -11.5 };

function* intro(s: StoryApi): Script {
  yield s.fade(true, 0);
  yield s.caption('THE SPANS  ·  SURVEY POST 4  ·  43 CE', 2.6);
  yield s.fade(false, 1.2);
  // The relief has come across the span from Meridian and finds him on open deck.
  yield s.walk('relief', R.spawn.x + 0.8, R.spawn.z + 2.2);
  s.shot('me', 'relief');
  yield s.say('relief', 'Relief for Survey Post 4. They said you would be hard to find.');
  yield s.say('relief', 'You were standing in the middle of the deck.');
  yield s.say('me', 'Logging the fourth position.');
  yield s.say('relief', 'From here? The lane is a kilometre off.');
  yield s.say('me', 'Yes.');
  yield s.say('relief', 'Right. There is a sealed order from Meridian for you. Handover first.');
  s.release();
  s.objective('Hand the post over to the relief surveyor.');
}

function* relief(s: StoryApi): Script {
  if (s.flag('ordered')) {
    if (s.flag('lost_once')) {
      yield s.say('relief', 'The plate is still booked. The review office will hold the hour as long as it takes.');
    } else {
      yield s.say('relief', 'Your frame is on the pad. The plate is booked for the hour.');
    }
    return;
  }
  s.shot('me', 'relief');
  yield s.say('relief', 'Handover. Your log has four firing positions on the convoy lane.');
  yield s.say('relief', 'The last relief found two. I have found one, and I am not sure of it.');
  const pick = (yield s.ask('relief', 'Will you walk me through them?', ['They are in the log.', 'You are standing on the fourth.', '(Say nothing.)'])) as number;
  if (pick === 0) {
    yield s.say('me', 'They are in the log.');
    yield s.say('relief', 'Sightline, approach and time for each. You write more than you talk.');
    yield s.say('me', 'Writing keeps.');
  } else if (pick === 1) {
    yield s.say('me', 'You are standing on the fourth.');
    yield s.say('relief', 'This is the post. It is not on the lane.');
    yield s.say('me', 'It sees the lane.');
  } else {
    yield s.say('me', '...');
    yield s.say('relief', 'The log, then. Fine.');
  }
  yield s.say('relief', 'Post handed over. Now Meridian.');
  yield s.say('relief', 'Your annual review. Still no qualifying close-quarters engagement on record.');
  yield s.say('relief', 'Concord has booked a sanctioned flight at Cathedral Yard to settle it. Against an instructor.');
  yield s.say('me', 'Which one.');
  yield s.say('relief', 'Naia Vesk. AV-07 HALCYON.');
  yield s.say('me', 'Naia.');
  yield s.say('relief', 'You know her?');
  yield s.say('me', 'She knows my firing line.');
  yield s.say('relief', 'The order says close quarters, in writing. Nobody has set you that before.');
  yield s.say('me', 'No.');
  yield s.say('relief', 'Somebody has now.');
  s.release();
  s.set('ordered');
  s.objective('Board your frame and fly the sanctioned flight.');
}

function* tram(s: StoryApi): Script {
  if (s.flag('ordered')) {
    yield s.say('tram', 'Cathedral Yard. Open plate, they say. Nothing to hide behind.');
    yield s.say('me', 'There is always something.');
    return;
  }
  yield s.say('tram', 'Brought your relief across on the first run. She held that envelope like it was live.');
  yield s.say('tram', 'Convoy crews say you go quiet on the channel when a fight starts.');
  yield s.say('me', 'I am working.');
}

function* frame(s: StoryApi): Script {
  if (!s.flag('ordered')) {
    yield s.say('me', 'The post is not handed over.');
    return;
  }
  const how = (yield s.ask('me', 'Fly the sanctioned flight against Naia?', ['Fly it in the open (FREE ORBIT)', 'Fly it on the plate', 'Not yet'])) as number;
  if (how === 2) return;
  yield s.fade(true, 0.6);
  const result = (yield s.battle({ foe: 'halcyon', difficulty: Difficulty.Normal, mode: how === 0 ? 'orbit' : 'versus' })) as 'win' | 'lose';
  yield s.fade(false, 0.8);
  if (result === 'lose') {
    s.set('lost_once');
    yield s.say('me', 'She closed before I was set. Again.');
    s.objective('Fly the sanctioned flight again when ready.');
    return;
  }
  // The relief comes over to the pad with the signal from the plate.
  yield s.walk('relief', pad.x + 4, pad.z + 1.5);
  s.shot('me', 'relief');
  yield s.say('relief', 'Signal from the plate. Sanctioned, flown and won. The review office has its engagement.');
  if (s.flag('lost_once')) {
    yield s.say('relief', 'Second flight. The office wrote that down as well.');
    yield s.say('me', 'It writes everything down.');
  }
  yield s.say('relief', 'Instructor Vesk sent a line for your file. I am to read it exactly.');
  yield s.say('relief', '"He had four positions before I lifted. I found three. Set him the close work again."');
  yield s.say('me', 'Naia found three.');
  yield s.say('relief', 'Is that good?');
  yield s.say('me', 'Nobody finds three.');
  s.release();
  s.unlock('halcyon');
  s.complete();
}

export const VESPER_1: ChapterDef = {
  id: 'vesper-1',
  pilot: 'vesper',
  number: 1,
  title: 'FOUR POSITIONS',
  region: 'surveypost',
  start: { x: R.spawn.x, z: R.spawn.z, facing: R.spawn.facing },
  objective: 'Hand the post over to the relief surveyor.',
  actors: [
    { id: 'relief', name: 'RELIEF SURVEYOR', look: 'extra', sex: 'f', seed: 41, suit: 0xdde4ec, trim: 0x3d8cff, x: R.people.relief.x, z: R.people.relief.z, facing: -Math.PI / 2 },
    { id: 'tram', name: 'TRAM HAND', look: 'extra', sex: 'm', seed: 46, suit: 0x22447a, trim: 0x3d8cff, x: TRAM_HAND.x, z: TRAM_HAND.z, facing: -Math.PI / 2 },
  ],
  intro,
  talk: { relief, tram },
  areas: [{ id: 'frame', x: pad.x, z: pad.z, r: 5.2, prompt: 'BOARD AV-12 VESPER', run: frame }],
  features: ['halcyon'],
};
