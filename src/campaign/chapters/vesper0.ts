import { Difficulty } from '../../core/Session';
import type { AreaDef, ChapterDef, StoryApi } from '../Story';
import type { Script } from '../Script';
import { regionById } from '../Regions';

/**
 * KESTREL DOYNE — Prologue: SIGHTLINE.
 *
 * Canon used: Doyne came from yard survey after six years mapping lattice
 * structure for Concord engineering, and is one of nine pilots certified for
 * AV-12. His certification board identified route reading, covered approach
 * selection and long sightline prediction as the basis of his results. Wing
 * reports record no channel speech in the opening minutes of most engagements;
 * he finds four firing positions with a kilometre of clear line before anyone
 * looks for him. He asked for detached duty in 38 CE. Late 20s in 43 CE, so
 * certified here at about 36 CE.
 *
 * The assessment is flown against a recorded profile in Concord's own frame,
 * not a live opponent. Everyone but Doyne is a role.
 */

const R = regionById('meridian')!;
const pad = R.pad;

/** The four lines he reads before anyone asks him to fly. */
const POSITIONS: { id: string; x: number; z: number; line: string }[] = [
  { id: 'pos_east', x: 52, z: -16, line: 'East rail, under the tower\'s shadow. Clear line down the convoy lane, near a kilometre. Covered approach behind the stacks.' },
  { id: 'pos_se', x: 50, z: 36, line: 'South-east corner. The span lands below it: anyone crossing is on a straight line for eight hundred metres.' },
  { id: 'pos_sw', x: -48, z: 36, line: 'South-west. Low, behind the lamp row. Short line, but nobody looks low on a high yard.' },
  { id: 'pos_nw', x: -50, z: 2, line: 'West edge. The hall\'s platform blocks the north. Good. One side I never have to watch.' },
];

const found = (s: StoryApi): number => POSITIONS.filter((p) => s.flag(p.id)).length;

function* intro(s: StoryApi): Script {
  yield s.fade(true, 0);
  s.letterbox(true);
  s.music('calm');
  yield s.caption('MERIDIAN  ·  CONCORD SKYWARD  ·  36 CE', 2.6);
  yield s.pan(
    [{ x: 40, y: 14, z: 40 }, { x: 0, y: 2, z: 0 }],
    [{ x: -10, y: 3, z: 28 }, { x: -20, y: 1.4, z: 20 }],
    3.6,
  );
  yield s.fade(false, 0.4);
  yield s.narrate('Nine candidates for the AV-12. Eight came from squadrons. One came from yard survey.');
  yield s.walk('candA', R.spawn.x + 2, R.spawn.z - 1.5);
  s.shot('me', 'candA');
  yield s.say('candA', 'You are the surveyor.');
  yield s.say('me', 'Six years.');
  yield s.say('candA', 'Of what.');
  yield s.say('me', 'Lattice.');
  s.gesture('candA', 'shrug');
  yield s.say('candA', 'They are certifying maps now.');
  s.release();
  yield s.titleCard('PROLOGUE', 'SIGHTLINE');
  s.letterbox(false);
  s.music('training');
  s.objective('Report to the certification examiner by the pad.');
}

function* examiner(s: StoryApi): Script {
  if (s.flag('certified')) {
    yield s.say('examiner', 'Your frame is fuelled. Fly the patrol. Say nothing on the channel if you like. You will anyway.');
    return;
  }
  if (s.flag('lost_once')) {
    yield s.say('examiner', 'The board allows one more run. Surveyors re-survey. Then fly.');
    return;
  }
  if (found(s) === POSITIONS.length) {
    yield s.say('examiner', 'Four. The squadron candidates found one each, and only after they were shot at from it. Fly when you are ready.');
    return;
  }
  if (s.flag('briefed')) {
    yield s.say('examiner', `You have read ${found(s)} of the yard. The board is in no hurry.`);
    return;
  }
  s.shot('me', 'examiner');
  yield s.say('examiner', 'Doyne. The board is not convinced. The squadron candidates have formation hours. You have maps.');
  yield s.say('me', 'Maps are where the shots are.');
  yield s.say('examiner', 'Then show the board. The assessment is flown over this yard. Walk it first, if that is how you work.');
  yield s.say('me', 'It is.');
  yield s.say('examiner', 'The other candidates are already in the simulator.');
  yield s.say('me', 'Then they will not be looking for me.');
  s.release();
  s.set('briefed');
  s.show('candA', false);
  s.objective('Walk the yard and read the lines: four firing positions.');
}

function* technician(s: StoryApi): Script {
  if (s.flag('certified')) {
    yield s.say('technician', 'Nine certified on the mark. I would put money on you being the one still flying it in ten years.');
    return;
  }
  yield s.say('technician', 'AV-12. Long-sightline rifle, optics you could survey with. The board wants to know if you can find the line. Holding it is the easy part.');
  yield s.say('me', 'Finding it is the whole job.');
}

function* candB(s: StoryApi): Script {
  if (s.flag('certified')) {
    yield s.say('candB', 'I passed too. Seventh of nine. You did not say a word the whole run, did you.');
    yield s.say('me', 'There was nothing to say until I was in position.');
    return;
  }
  yield s.say('candB', 'How do you keep quiet on the channel. I cannot stop talking when I am frightened.');
  yield s.say('me', 'Talk to yourself. Off the channel. Count the stacks.');
  yield s.say('candB', 'That works?');
  yield s.say('me', 'There are a lot of stacks.');
}

function* candA(s: StoryApi): Script {
  if (s.flag('washed')) {
    yield s.say('candA', 'Board says I was found before I fired. By a recorded profile. It was not even a person.');
    yield s.say('me', 'It was a person once. Somebody flew it to be recorded.');
    return;
  }
  yield s.say('candA', 'Formation hours, surveyor. That is what wins. You will see.');
}

function survey(p: (typeof POSITIONS)[number]): AreaDef {
  return {
    id: p.id,
    x: p.x,
    z: p.z,
    r: 3.2,
    prompt: 'READ THE LINE',
    when: 'briefed',
    run: function* (s: StoryApi): Script {
      if (s.flag(p.id)) {
        yield s.say('me', 'Read. Next.');
        return;
      }
      s.cam({ x: p.x * 0.92, y: 2.0, z: p.z * 0.92 }, { x: p.x * 3, y: 6, z: p.z * 3 }, false);
      yield s.say('me', p.line);
      s.release();
      s.set(p.id);
      const n = found(s);
      if (n < POSITIONS.length) {
        s.objective(`Read the lines: ${n} of four firing positions.`);
        return;
      }
      // The last one read, the first candidate comes back down.
      s.show('candA', true);
      s.place('candA', 14, 2, Math.PI / 2);
      s.set('washed');
      s.objective('Fly the assessment from the pad.');
    },
  };
}

function* assessment(s: StoryApi): Script {
  if (s.flag('certified')) {
    yield sortie(s);
    return;
  }
  const go = (yield s.ask('me', 'The assessment loads a recorded profile: an AV-07, a 2nd Interceptor sortie flown by the book.', ['Fly it.', 'Not yet.'])) as number;
  if (go === 1) return;
  yield s.fade(true, 0.6);
  const r = (yield s.battle({ foe: 'halcyon', difficulty: Difficulty.Normal, mode: 'versus' })) as 'win' | 'lose';
  yield s.fade(false, 0.8);
  if (r === 'lose') {
    s.set('lost_once');
    yield s.say('me', 'It found me first. I picked a line it already knew.');
    s.objective('Fly the assessment again when ready.');
    return;
  }
  s.letterbox(true);
  yield s.walk('examiner', pad.x - 6, pad.z + 6);
  s.shot('me', 'examiner');
  s.music('hope');
  yield s.say('examiner', 'The board finds route reading, covered approach selection and long sightline prediction as the basis of the result.');
  yield s.say('examiner', 'Certified for AV-12. One of nine.');
  s.gesture('me', 'nod');
  yield s.say('me', 'Thank you.');
  yield s.say('examiner', 'That is the most you have said all day.');
  s.release();
  s.letterbox(false);
  s.set('certified');
  s.objective('Fly your first patrol in the AV-12.');
}

function* sortie(s: StoryApi): Script {
  s.letterbox(true);
  s.music('theme');
  yield s.launch('av12');
  yield s.narrate('Wing reports would record no channel speech during the opening minutes of most engagements.');
  yield s.narrate('In 38 CE he asked for detached duty. It has been renewed on the results ever since.');
  yield s.nextTime(
    [
      'Forty-three CE. Survey Post 4, on the span out of Meridian. A relief across the catwalk, and a claim for the standing rules.',
      'Four positions found before anyone looks. Nobody has asked him for a fifth.',
    ],
    'CHAPTER 1 · FOUR POSITIONS',
  );
  s.letterbox(false);
  s.complete();
}

export const VESPER_0: ChapterDef = {
  id: 'vesper-0',
  pilot: 'vesper',
  number: 0,
  title: 'SIGHTLINE',
  region: 'meridian',
  start: { x: R.spawn.x, z: R.spawn.z, facing: R.spawn.facing },
  objective: 'Report to the certification examiner by the pad.',
  noFrame: true,
  music: 'training',
  actors: [
    { id: 'examiner', name: 'CERTIFICATION EXAMINER', look: 'extra', sex: 'f', seed: 44, suit: 0x22447a, trim: 0x3d8cff, x: 18, z: 4, facing: -Math.PI / 2 },
    { id: 'technician', name: 'VANTOR TECHNICIAN', look: 'extra', sex: 'm', seed: 26, suit: 0x9aa6b6, trim: 0xffb020, x: 30, z: -1, facing: -Math.PI / 2 },
    { id: 'candA', name: 'CANDIDATE', look: 'extra', sex: 'm', seed: 9, suit: 0xdde4ec, trim: 0x3d8cff, x: -6, z: 18 },
    { id: 'candB', name: 'CANDIDATE', look: 'extra', sex: 'f', seed: 61, suit: 0xdde4ec, trim: 0x3d8cff, x: -2, z: 12, facing: Math.PI },
  ],
  frames: [{ id: 'av12', mech: 'vesper', x: pad.x, z: pad.z, facing: Math.PI / 2 }],
  intro,
  talk: { examiner, technician, candB, candA },
  areas: [
    ...POSITIONS.map(survey),
    { id: 'assess', x: pad.x, z: pad.z, r: 5.2, prompt: 'BOARD AV-12 VESPER', when: 'washed', run: assessment },
  ],
};
