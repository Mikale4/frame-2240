import type { ChapterDef, StoryApi } from '../Story';
import type { Script } from '../Script';
import { regionById } from '../Regions';

/**
 * NAIA VESK — Prologue: THE FOLLOWING MARK.
 *
 * Canon used: Vesk is third-generation Concord. Her grandmother signed
 * acceptance work on AV-01 and held no flight qualification. Her mother flew
 * AV-04 and was killed in a spar-root failure when Vesk was nine; the fault had
 * been raised three years earlier and scheduled for correction in the
 * following mark, and eleven other AV-04 airframes were grounded the same
 * week. She received AV-07 at nineteen. She does not treat pending committee
 * action as evidence that a fault is safe. Vantor has twice sent her a
 * successor frame; both went back with notes. Early 30s in 43 CE, so nine in
 * about 20 CE and nineteen in about 30 CE.
 *
 * Everyone but Vesk is a role: her mother, her grandmother, the officer and
 * the technician have no names.
 */

const R = regionById('meridian')!;
const pad = R.pad;
/** The east rail, where a child watches the morning circuit. */
const RAIL = { x: 48, z: 10 };
/** The refit shed's door, where the flight crews go in. */
const SHED = { x: 22, z: -21 };

function* intro(s: StoryApi): Script {
  yield s.fade(true, 0);
  s.letterbox(true);
  s.music('calm');
  yield s.caption('MERIDIAN  ·  CONCORD SKYWARD  ·  20 CE', 2.6);
  s.cam({ x: -6, y: 2.2, z: 24 }, { x: -13, y: 1.1, z: 17 }, true);
  yield s.fade(false, 1.2);
  // Cold open: a mother and a nine-year-old at the maintenance board.
  s.shot('me', 'mother');
  yield s.say('me', 'It says fault raised, 17 CE. Spar root. Correction scheduled for the following mark.');
  yield s.say('mother', 'You read the whole board again.');
  yield s.say('me', 'What is the following mark?');
  yield s.say('mother', 'The next version of the airframe. They fix it on the next one.');
  yield s.say('me', 'And this one?');
  s.gesture('mother', 'shrug');
  yield s.say('mother', 'This one flies until then. Everyone signed it off. Your grandmother would tell you signing is the important part.');
  yield s.say('me', 'Signing is not fixing.');
  yield s.say('mother', 'No. It is not.');
  s.gesture('mother', 'nod');
  s.release();
  yield s.titleCard('PROLOGUE', 'THE FOLLOWING MARK');
  s.letterbox(false);
  s.music('theme');
  yield s.say('mother', 'Morning circuit, then I am back for lunch. Go and find your grandmother. Tell her I took the fruit.');
  s.objective('Find your grandmother by the records hall.');
}

function* mother(s: StoryApi): Script {
  if (s.flag('gone')) return;
  if (s.flag('saw_gran')) {
    s.shot('me', 'mother');
    yield s.say('mother', 'Watch from the east rail if you like. You will not see much. A light going round.');
    yield s.say('me', 'I will see you.');
    s.gesture('mother', 'wave');
    yield s.say('mother', 'You will see a light going round. That is me.');
    s.release();
    // She goes in to the shed, and does not come back out.
    yield s.walk('mother', SHED.x, SHED.z);
    s.show('mother', false);
    s.set('gone');
    s.objective('Watch the morning circuit from the east rail.');
    return;
  }
  yield s.say('mother', 'Grandmother first. She worries if she has not seen you by the bell.');
}

function* grandmother(s: StoryApi): Script {
  if (s.flag('notice')) {
    yield s.say('grandmother', 'Sit with me a while. We do not have to talk.');
    return;
  }
  if (s.flag('saw_gran')) {
    yield s.say('grandmother', 'Go on. The circuit only takes a quarter of an hour.');
    return;
  }
  s.shot('me', 'grandmother');
  yield s.say('grandmother', 'There you are. Did she take the fruit?');
  yield s.say('me', 'She took the fruit. Did you sign the first one? The AV-01?');
  yield s.say('grandmother', 'I signed the acceptance work. I never flew. I could not have flown a kite.');
  const q = (yield s.ask('me', 'Ask her…', ['What does signing mean?', 'Were you ever afraid?'])) as number;
  if (q === 0) {
    yield s.say('grandmother', 'It means you say it will hold. You read everything, you test what you can, and then you put your name to it.');
    yield s.say('me', 'And if there is something on the board?');
    yield s.say('grandmother', 'Then somebody decides it can wait. That is a different signature. Not mine.');
  } else {
    yield s.say('grandmother', 'Every time. Afraid is what reading everything feels like.');
  }
  s.release();
  s.set('saw_gran');
  s.objective('Your mother is at the board. Go and see her off.');
}

function* officer(s: StoryApi): Script {
  if (s.flag('notice')) {
    yield s.say('officer', 'I am sorry. I cannot say more than the notice.');
    return;
  }
  yield s.say('officer', 'Morning circuit is routine. Stand behind the line, little one.');
}

function* technician(s: StoryApi): Script {
  if (!s.flag('grown')) {
    yield s.say('technician', 'Not now. Flight line.');
    return;
  }
  if (s.flag('read_items')) {
    yield s.say('technician', 'She is fuelled and the items are on your board. Whenever you are ready.');
    return;
  }
  s.shot('me', 'technician');
  yield s.say('technician', 'AV-07, airframe one of the mark. She is yours on signature.');
  yield s.say('me', 'The open fault list first.');
  yield s.say('technician', 'Four items. All minor. All scheduled for the following mark.');
  yield s.say('me', 'Read them to me.');
  yield s.say('technician', 'Canopy seal creep. A trim lag in the left actuator above eighty per cent. A sensor that reads warm. A spar-root inspection interval.');
  s.gesture('me', 'cross');
  yield s.say('me', 'The spar root.');
  yield s.say('technician', 'An interval, not a fault. Inspection every forty hours instead of every hundred.');
  const a = (yield s.ask('me', 'What do you do about it?', ['Inspect it now, in front of me.', 'Sign, and log it on my own board.'])) as number;
  if (a === 0) {
    yield s.say('technician', 'Now. Right. It will take an hour.');
    yield s.say('me', 'I have an hour.');
  } else {
    yield s.say('me', 'Forty hours. I will count them myself, and I will not fly the forty-first.');
  }
  yield s.say('technician', 'Most pilots sign the sheet and ask about the paint.');
  yield s.say('me', 'Most pilots did not read the board at nine.');
  s.release();
  s.set('read_items');
  s.objective('Board AV-07 HALCYON.');
}

/** The east rail: a light going round, and then not. */
function* rail(s: StoryApi): Script {
  s.letterbox(true);
  s.cam({ x: RAIL.x - 6, y: 1.4, z: RAIL.z + 5 }, { x: RAIL.x + 40, y: 40, z: RAIL.z - 60 }, false);
  s.music(null);
  yield s.wait(1.2);
  yield s.say('me', 'There. Going round.');
  yield s.wait(1.4);
  s.flash();
  s.boom(RAIL.x + 70, RAIL.z - 110, 62, 1.6);
  yield s.wait(0.6);
  s.sound('bigboom');
  s.shake(0.12, 1.2);
  yield s.wait(1.0);
  s.alarm(true);
  s.music('danger');
  s.show('runner', true);
  yield s.walk('runner', RAIL.x - 4, RAIL.z - 2, true);
  yield s.say('runner', 'Off the rail. Inside. Now.');
  yield s.say('me', 'That was her circuit.');
  yield s.say('runner', 'Inside.');
  s.alarm(false);
  yield s.fade(true, 1.4);
  // The same evening: the notice.
  s.place('me', -27, 5, -Math.PI / 2);
  s.place('grandmother', -30, 6, Math.PI / 2);
  s.place('officer', -26, 9, Math.PI);
  s.show('runner', false);
  s.sit('grandmother', true);
  s.music('sorrow');
  yield s.caption('THE SAME EVENING', 2.2);
  s.cam({ x: -22, y: 2.0, z: 13 }, { x: -28.5, y: 1.0, z: 6.5 }, true);
  yield s.fade(false, 1.4);
  yield s.say('officer', 'AV-04, on the morning circuit. A spar-root failure. The pilot was killed. I am sorry.');
  yield s.say('grandmother', 'Was it the fault on the board.');
  yield s.say('officer', 'The finding is pending.');
  yield s.say('me', 'It was raised three years ago. I read it this morning. Fault raised, 17 CE.');
  yield s.say('officer', 'The correction was scheduled for the following mark.');
  yield s.say('me', 'Then it was not safe. It was waiting.');
  s.gesture('officer', 'slump');
  yield s.say('officer', 'Yes.');
  yield s.narrate('Eleven other AV-04 airframes were grounded the same week.');
  s.set('notice');
  yield s.fade(true, 1.6);

  // Ten years: the girl at the board is nineteen, and Vantor has a frame for her.
  s.sit('grandmother', false);
  s.young('me', false);
  s.place('me', pad.x - 7, pad.z + 6, Math.PI * 0.75);
  s.place('grandmother', pad.x - 10, pad.z + 8, Math.PI / 2);
  s.place('technician', pad.x - 4, pad.z + 7, -Math.PI / 2);
  s.show('technician', true);
  s.showFrame('av07', true);
  s.set('grown');
  s.music('hope');
  yield s.caption('MERIDIAN  ·  30 CE', 2.4);
  yield s.pan(
    [{ x: pad.x - 16, y: 1.6, z: pad.z + 16 }, { x: pad.x, y: 6, z: pad.z }],
    [{ x: pad.x - 12, y: 2.4, z: pad.z + 12 }, { x: pad.x - 5, y: 1.6, z: pad.z + 7 }],
    3.2,
  );
  yield s.fade(false, 0);
  s.shot('me', 'grandmother');
  yield s.say('grandmother', 'Nineteen. Your mother was twenty-two when they gave her one.');
  yield s.say('me', 'They are giving me AV-07. Airframe one of the mark.');
  yield s.say('grandmother', 'Read everything.');
  yield s.say('me', 'I always do.');
  s.release();
  s.letterbox(false);
  s.objective('Go through the open fault list with the Vantor technician.');
}

function* frame(s: StoryApi): Script {
  if (!s.flag('read_items')) {
    yield s.say('me', 'Not before the fault list.');
    return;
  }
  s.letterbox(true);
  yield s.say('me', 'Halcyon, first flight. Every item on the list is on my board.');
  s.music('theme');
  yield s.launch('av07');
  yield s.narrate('She has flown AV-07 since she was nineteen.');
  yield s.narrate('In the years after, Vantor twice supplied a successor frame for evaluation. Both went back with written notes.');
  yield s.nextTime(
    [
      'Forty-three CE. The girl who read the fault board teaches cadets to read it.',
      'A cadet with a deferred fault, a claim on the thirteen, and Emberline\'s nominee for the standing rules: Halden Rook.',
    ],
    'CHAPTER 1 · INSTRUCTOR\'S HOURS',
  );
  s.release();
  s.letterbox(false);
  s.complete();
}

export const HALCYON_0: ChapterDef = {
  id: 'halcyon-0',
  pilot: 'halcyon',
  number: 0,
  title: 'THE FOLLOWING MARK',
  region: 'meridian',
  start: { x: -13, z: 16, facing: Math.PI / 2 },
  objective: 'Find your grandmother by the records hall.',
  young: true,
  noFrame: true,
  music: 'calm',
  actors: [
    { id: 'mother', name: 'YOUR MOTHER', look: 'extra', sex: 'f', seed: 31, suit: 0x2a4f88, trim: 0x3d8cff, x: -11, z: 17.5, facing: -Math.PI / 2 },
    { id: 'grandmother', name: 'YOUR GRANDMOTHER', look: 'extra', sex: 'f', seed: 58, suit: 0x3a4250, trim: 0xcfe8ff, x: -30, z: 6, facing: Math.PI / 2 },
    { id: 'officer', name: 'CONCORD OFFICER', look: 'extra', sex: 'm', seed: 14, suit: 0x22447a, trim: 0x3d8cff, x: 18, z: 4, facing: Math.PI },
    { id: 'runner', name: 'FLIGHT LINE CREW', look: 'extra', sex: 'm', seed: 22, suit: 0x9aa6b6, trim: 0xffb020, x: 40, z: 4, hidden: true },
    { id: 'technician', name: 'VANTOR TECHNICIAN', look: 'extra', sex: 'f', seed: 67, suit: 0x9aa6b6, trim: 0xffb020, x: 30, z: 2, hidden: true },
  ],
  frames: [{ id: 'av07', mech: 'halcyon', x: pad.x, z: pad.z, facing: -Math.PI / 2, hidden: true }],
  intro,
  talk: { mother, grandmother, officer, technician },
  areas: [
    { id: 'rail', x: RAIL.x, z: RAIL.z, r: 3.2, prompt: 'WATCH THE MORNING CIRCUIT', when: 'gone', run: (s) => (s.flag('notice') ? quiet(s) : rail(s)) },
    { id: 'frame', x: pad.x, z: pad.z, r: 5.2, prompt: 'BOARD AV-07 HALCYON', when: 'grown', run: frame },
  ],
};

function* quiet(s: StoryApi): Script {
  yield s.say('me', 'Nothing going round.');
}
