import { Difficulty } from '../../core/Session';
import type { ChapterDef, StoryApi } from '../Story';
import type { Script } from '../Script';
import { regionById } from '../Regions';

/**
 * NAIA VESK — Chapter 1: INSTRUCTOR'S HOURS.
 *
 * Canon used: Vesk is a Concord 2nd Interceptor now instructing, eleven years
 * without losing a hull, and has twice sent Vantor's successor frame back with
 * notes. She does not treat a fault deferred to committee as a safe one (her
 * mother's AV-04 is not named here; the cadet's deferred fault is the echo).
 * Disputes go to Cathedral Yard under the standing rules, case by case.
 * Emberline presses its claim to the thirteen and has nominated Halden Rook:
 * twelve years in Concord, now 7th Assault in AV-13 NOCTURNE, impossible to
 * impress. Vesk has read his testimony; nobody here explains it. The Archive
 * speaks with Concord's voice. Everyone on foot is a role, not a name; Rook is
 * met only in the flight.
 */

const R = regionById('meridian')!;
const pad = R.pad;

/**
 * The region's `archivist` spot is up on the hall's raised platform, which
 * cannot be stood on from deck height; the archivist waits at the foot of the
 * ramp up to the hall instead.
 */
const ARCHIVIST = { x: -38, z: -3 };

function* intro(s: StoryApi): Script {
  yield s.fade(true, 0);
  yield s.caption('MERIDIAN  ·  CONCORD SKYWARD  ·  43 CE', 2.6);
  yield s.fade(false, 1.2);
  // The range officer comes across from the kiosk with the day's sheet.
  yield s.walk('officer', R.spawn.x + 2.2, R.spawn.z + 0.4);
  s.shot('me', 'officer');
  yield s.say('officer', 'Instructor. Your cadet\'s frame is on the line for certification.');
  yield s.say('officer', 'And the standing-rules board sent a packet. Sealed, your name on it.');
  yield s.say('me', 'The cadet first. A case keeps. A frame signed in a hurry does not.');
  yield s.say('officer', 'She has been by the hangar since the range opened.');
  yield s.say('me', 'Then she has read the checklist twice. Good.');
  s.release();
  s.objective('Certify the cadet\'s frame.');
}

function* cadet(s: StoryApi): Script {
  if (s.flag('certified')) {
    if (s.flag('posted')) {
      yield s.say('cadet', 'The hangar says you are flying a case at Cathedral Yard.');
      yield s.say('me', 'The hangar has sheets of its own to read.');
    } else {
      yield s.say('cadet', 'The range officer has your packet, Instructor. He keeps looking at it.');
    }
    return;
  }
  s.shot('me', 'cadet');
  yield s.say('cadet', 'Pre-flight complete, Instructor. Reactor, drone link, thrusters. All within tolerance.');
  yield s.say('me', 'Your left thruster log says otherwise.');
  yield s.say('cadet', 'A trim fault at full burn. Maintenance logged it for the next mark.');
  yield s.say('me', 'A fault logged for the next mark is a fault in this one.');
  const pick = (yield s.ask('cadet', 'Will you sign it, Instructor?', ['Not until it is fixed.', 'Sign it. Note the fault myself.', 'Tell me why I should.'])) as number;
  if (pick === 0) {
    yield s.say('me', 'Not until it is fixed. Today, not next mark.');
    yield s.say('cadet', 'Maintenance will say it is within tolerance.');
    yield s.say('me', 'Then maintenance may sign it. They will not.');
    yield s.say('cadet', 'The bay says an hour.');
    yield s.say('me', 'Then I sign in an hour.');
  } else if (pick === 1) {
    yield s.say('me', 'I will sign it with the fault on the sheet in my own hand. Then it is mine as well as theirs.');
    yield s.say('cadet', 'Thank you, Instructor.');
    yield s.say('me', 'Do not thank me. Read that line before every flight until it is gone.');
  } else {
    yield s.say('cadet', 'Because it is within tolerance.');
    yield s.say('me', 'Tolerance is what a committee writes when it means later. Get it fixed.');
  }
  s.release();
  s.set('certified');
  s.objective('Collect the board\'s packet from the range officer.');
}

function* officer(s: StoryApi): Script {
  if (!s.flag('certified')) {
    yield s.say('officer', 'The cadet first, you said. She is by the hangar. The packet will keep.');
    return;
  }
  if (s.flag('posted')) {
    if (s.flag('lost_once')) {
      yield s.say('officer', 'Rook is still on the plate. The board does not hurry, and neither does he.');
    } else {
      yield s.say('officer', 'Your frame is fuelled and signed off. By you, I assume.');
      yield s.say('me', 'Always.');
    }
    return;
  }
  s.shot('me', 'officer');
  yield s.say('officer', 'The board\'s packet. You are posted to a case as Concord\'s pilot.');
  yield s.say('officer', 'Emberline has filed a claim to one of the thirteen and nominated its pilot.');
  yield s.say('me', 'Who?');
  yield s.say('officer', 'Halden Rook. 7th Assault, AV-13 NOCTURNE.');
  yield s.say('me', 'Twelve years in Concord before that. It is on the first page of his file.');
  yield s.say('officer', 'You have read it, then.');
  yield s.say('me', 'I have read his testimony. Most of the hall read the summary.');
  yield s.say('officer', 'One sanctioned flight at Cathedral Yard, under the standing rules. The board rules on the result.');
  yield s.say('me', 'Tell the board I accept the posting.');
  yield s.say('officer', 'They assumed you would.');
  yield s.say('me', 'Then they can stop assuming and write it down.');
  s.release();
  s.set('posted');
  s.objective('Board your frame and fly the sanctioned flight.');
}

function* archivist(s: StoryApi): Script {
  if (s.flag('archive_asked')) {
    yield s.say('archivist', 'The entries are still there, Instructor. They are very patient.');
    return;
  }
  s.shot('me', 'archivist');
  yield s.say('archivist', 'Instructor. The board copies every case to the Archive. Yours came through this morning.');
  yield s.say('archivist', 'Your clearance opens the case file. Not the entries filed under it.');
  yield s.say('me', 'Which entries?');
  yield s.say('archivist', 'The ones you are not cleared for yet. I may tell you they exist. Nothing else.');
  yield s.say('me', 'The Archive, speaking for Concord again.');
  yield s.say('archivist', 'It always has, Instructor. We only print it neatly.');
  s.release();
  s.set('archive_asked');
}

function* frame(s: StoryApi): Script {
  if (!s.flag('posted')) {
    yield s.say('me', s.flag('certified') ? 'The board\'s packet first. I do not fly a case I have not read.' : 'The cadet first. Then the board. Then the frame.');
    return;
  }
  const how = (yield s.ask('me', 'Fly the sanctioned flight against Rook?', ['Fly it in the open (FREE ORBIT)', 'Fly it on the plate', 'Not yet'])) as number;
  if (how === 2) return;
  yield s.fade(true, 0.6);
  const result = (yield s.battle({ foe: 'nocturne', difficulty: Difficulty.Normal, mode: how === 0 ? 'orbit' : 'versus' })) as 'win' | 'lose';
  yield s.fade(false, 0.8);
  if (result === 'lose') {
    s.set('lost_once');
    yield s.say('me', 'He took the first pressure and waited for me to spend thrust. Noted. Again.');
    s.objective('Fly the sanctioned flight again when ready.');
    return;
  }
  // The range officer comes out to the pad with the ruling.
  yield s.walk('officer', pad.x - 4, pad.z + 2, true);
  s.shot('me', 'officer');
  yield s.say('officer', 'The board has ruled. Emberline\'s claim is not upheld this season.');
  if (s.flag('lost_once')) {
    yield s.say('officer', 'The hall noticed it took two flights.');
    yield s.say('me', 'The hall will also notice the hull came back both times.');
  }
  yield s.say('officer', 'Rook filed his flight time with the board, and one word for you. "Adequate."');
  yield s.say('me', 'From him, I am told, that is a commendation.');
  yield s.say('officer', 'Vantor called while you were up. They asked again about the successor frame.');
  yield s.say('me', 'Send it back with notes. Same as the last two.');
  s.release();
  s.unlock('nocturne');
  s.complete();
}

export const HALCYON_1: ChapterDef = {
  id: 'halcyon-1',
  pilot: 'halcyon',
  number: 1,
  title: 'INSTRUCTOR\'S HOURS',
  region: 'meridian',
  start: { x: R.spawn.x, z: R.spawn.z, facing: R.spawn.facing },
  objective: 'Certify the cadet\'s frame.',
  actors: [
    { id: 'officer', name: 'RANGE OFFICER', look: 'extra', sex: 'm', seed: 21, suit: 0x22447a, trim: 0x3d8cff, x: R.people.officer.x, z: R.people.officer.z, facing: -Math.PI / 2 },
    { id: 'cadet', name: 'CADET', look: 'extra', sex: 'f', seed: 27, suit: 0xdde4ec, trim: 0x3d8cff, x: R.people.cadet.x, z: R.people.cadet.z, facing: Math.PI },
    { id: 'archivist', name: 'ARCHIVIST', look: 'extra', sex: 'm', seed: 33, suit: 0xc8d2de, trim: 0x22447a, x: ARCHIVIST.x, z: ARCHIVIST.z, facing: 0 },
  ],
  intro,
  talk: { officer, cadet, archivist },
  areas: [{ id: 'frame', x: pad.x, z: pad.z, r: 5.2, prompt: 'BOARD AV-07 HALCYON', run: frame }],
  features: ['nocturne'],
};
