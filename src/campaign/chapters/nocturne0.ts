import type { ChapterDef, StoryApi } from '../Story';
import type { Script } from '../Script';
import { regionById } from '../Regions';

/**
 * HALDEN ROOK — Prologue: THE MANUAL.
 *
 * Canon used: Concord trained Rook for the AV line and kept him twelve years;
 * his transfer packet holds two commendations and one court finding that
 * cleared his conduct while ending his Concord flying career. He crossed to
 * Emberline in 33 CE with his flight manual, and the manual was copied before
 * his first Pact assignment. The burns on his face and hands are old by then.
 * Emberline took 30 AV-13 airframes from Concord under the 30 CE settlement,
 * stripped them within two years and rebuilt them without Concord approval.
 * His method: hold guard, accept the first pressure, make younger pilots spend
 * thrust before he commits. His sections now have the lowest first-year loss
 * rate in the sky. He is late 40s in 43 CE.
 *
 * Hard rule: Rook never comments on the trial, the inquiry's subject or any
 * evacuation figure. People start to ask; he declines. Nothing here names or
 * shows it. Everyone else is a role.
 */

const R = regionById('emberrest')!;
const pad = R.pad;
/** Where the transport sets him down. */
const LAND = { x: 30, z: -20 };
/** Outside the claims office, at the foot of the hall. */
const OFFICE = { x: -34, z: 12 };

function* intro(s: StoryApi): Script {
  yield s.fade(true, 0);
  s.letterbox(true);
  s.music('tension');
  yield s.caption('EMBERREST  ·  EMBERLINE PACT  ·  33 CE', 2.6);
  s.cam({ x: LAND.x - 9, y: 3.2, z: LAND.z + 9 }, { x: LAND.x, y: 1.2, z: LAND.z }, true);
  s.sound('land');
  s.shake(0.06, 0.8);
  yield s.fade(false, 1.0);
  yield s.walk('officer', LAND.x - 2.4, LAND.z + 1.2);
  s.shot('me', 'officer');
  yield s.say('officer', 'Halden Rook. Twelve years Concord. You understand how this looks.');
  yield s.say('me', 'Like a man with a bag.');
  yield s.say('officer', 'What is in the bag.');
  yield s.say('me', 'My flight manual.');
  s.gesture('officer', 'cross');
  yield s.say('officer', 'The claims office has your packet. Take it to them. Then we talk about the manual.');
  s.release();
  yield s.titleCard('PROLOGUE', 'THE MANUAL');
  s.letterbox(false);
  s.music('calm');
  s.objective('Take your transfer packet to the claims office.');
}

function* officer(s: StoryApi): Script {
  if (s.flag('trained')) {
    yield s.say('officer', 'The intake is yours. Do not make me regret the book.');
    return;
  }
  if (s.flag('copied')) {
    yield s.say('officer', 'The intake flies a training hop this morning. Watch it from the pad.');
    return;
  }
  if (!s.flag('packet')) {
    yield s.say('officer', 'Claims office first. The Pact reads before it listens.');
    return;
  }
  s.shot('me', 'officer');
  yield s.say('officer', 'The packet says the court cleared you and grounded you in the same finding.');
  yield s.say('me', 'It does.');
  yield s.say('officer', 'Then why should Emberline put you in the air.');
  yield s.say('me', 'You should not. Not yet. Put the book in the air first.');
  const a = (yield s.ask('me', 'The manual.', ['Hand it over.', 'Ask what happens to it after.'])) as number;
  if (a === 1) {
    yield s.say('me', 'What happens to it after.');
    yield s.say('officer', 'We copy it tonight. Every page. It goes to every section that flies. Is that a problem.');
    yield s.say('me', 'It is the point.');
  }
  s.gesture('me', 'point');
  yield s.say('officer', 'This is Concord doctrine.');
  yield s.say('me', 'It is mine. Concord had it first.');
  yield s.say('officer', 'The copy is made before your first assignment. That is not negotiable.');
  yield s.say('me', 'I would have asked you to.');
  s.release();
  yield night(s);
}

/** Overnight: the book copied page by page, and the section that liked it the old way. */
function* night(s: StoryApi): Script {
  s.letterbox(true);
  yield s.fade(true, 1.2);
  s.music('tension');
  s.place('clerk', OFFICE.x - 3, OFFICE.z - 1, Math.PI / 2);
  s.sit('clerk', true);
  s.place('me', OFFICE.x + 1.5, OFFICE.z - 2, -Math.PI / 2);
  s.place('instructor', OFFICE.x + 4.5, OFFICE.z - 4.5, -Math.PI * 0.75);
  yield s.caption('THAT NIGHT', 2.0);
  s.cam({ x: OFFICE.x + 3, y: 2.4, z: OFFICE.z + 5 }, { x: OFFICE.x - 1, y: 1.0, z: OFFICE.z - 1 }, true);
  yield s.fade(false, 1.2);
  s.gesture('clerk', 'work', 6);
  yield s.say('clerk', 'Page two hundred and six. Guard discipline under sustained pressure. There are diagrams.');
  yield s.say('me', 'Copy the diagrams. The words are for people who do not look.');
  yield s.walk('instructor', OFFICE.x + 3, OFFICE.z - 2.6);
  s.shot('me', 'instructor');
  yield s.say('instructor', 'My section learned on scrap and nerve. Now they learn out of a Concord book.');
  yield s.say('me', 'Scrap and nerve kills them in the first year. The book keeps them for the second.');
  yield s.say('instructor', 'And you know about losing people.');
  s.gesture('me', 'look');
  yield s.wait(1.2);
  yield s.say('me', 'Goodnight.');
  yield s.say('instructor', 'That is all you are going to say.');
  yield s.say('me', 'About that, yes.');
  s.release();
  yield s.fade(true, 1.2);
  s.sit('clerk', false);
  s.place('clerk', R.people.claims.x, R.people.claims.z, 0);
  s.place('me', pad.x + 7, pad.z + 6, -Math.PI * 0.75);
  s.place('instructor', pad.x + 9, pad.z + 3, -Math.PI / 2);
  s.set('copied');
  s.music('calm');
  yield s.caption('NEXT MORNING  ·  THE MANUAL IS COPIED', 2.4);
  yield s.fade(false, 1.0);
  s.letterbox(false);
  s.objective('Watch the intake\'s training hop from the pad.');
}

function* clerk(s: StoryApi): Script {
  if (s.flag('copied')) {
    yield s.say('clerk', 'Every page, in two hands. The second copy is going to the 7th Assault. They asked for it before the ink was dry.');
    return;
  }
  if (s.flag('packet')) {
    yield s.say('clerk', 'The officer is waiting outside. He does not wait well.');
    return;
  }
  s.shot('me', 'clerk');
  yield s.say('clerk', 'Transfer packet. Two commendations. One court finding: conduct cleared, flying career ended.');
  yield s.say('clerk', 'It does not say what happened.');
  yield s.say('me', 'It says what was found.');
  yield s.say('clerk', 'People here will ask you.');
  yield s.say('me', 'People will.');
  s.release();
  s.set('packet');
  yield s.walk('officer', OFFICE.x + 2, OFFICE.z - 3);
  s.objective('Speak to the Pact officer outside the claims office.');
}

function* recruitA(s: StoryApi): Script {
  if (s.flag('trained')) {
    yield s.say('recruitA', 'Hold guard. Take the first pressure. Let them spend it. I wrote it on my hand.');
    return;
  }
  if (s.flag('hop')) {
    yield s.say('recruitA', 'I did what you said. I did not spend anything. It came down.');
    return;
  }
  yield s.say('recruitA', 'You are him. From the inquiry.');
  s.gesture('me', 'shake');
  yield s.say('me', 'I am from Concord. Now I am here.');
  yield s.say('recruitA', 'Your hands. Is that from…');
  yield s.say('me', 'Old.');
}

function* recruitB(s: StoryApi): Script {
  if (s.flag('trained')) {
    yield s.say('recruitB', 'Section drill at the second bell. He says we are going to be bored. He says boredom is cheaper than funerals.');
    return;
  }
  yield s.say('recruitB', 'Did Concord send you.');
  yield s.say('me', 'Concord ended my flying. Nobody sent me.');
  yield s.say('recruitB', 'Then why come here.');
  yield s.say('me', 'You still fly.');
}

function* instructor(s: StoryApi): Script {
  if (s.flag('hop')) {
    yield s.say('instructor', 'He would have punched out under me. He would have been told to.');
    return;
  }
  yield s.say('instructor', 'I trained the intake for three years. I will be watching what you do with them.');
}

/** The training hop: a rebuilt AV-13 with a fault, and a voice on the channel. */
function* hop(s: StoryApi): Script {
  if (s.flag('hop')) {
    yield s.say('me', 'The trainer is down for inspection. Let it rest.');
    return;
  }
  s.letterbox(true);
  yield s.walk('recruitA', pad.x + 4, pad.z + 2.5, true);
  s.shot('me', 'recruitA');
  yield s.say('recruitA', 'Training hop. One circuit and down.');
  yield s.say('me', 'One circuit. Do not show off for me.');
  s.release();
  s.show('recruitA', false);
  s.music('theme');
  yield s.launch('trainer');
  s.cam({ x: pad.x + 10, y: 1.8, z: pad.z + 10 }, { x: pad.x - 20, y: 30, z: pad.z - 40 }, true);
  yield s.wait(1.5);
  // Rebuilt from a stripped airframe; the spar does not like the turn.
  s.alarm(true);
  s.music('danger');
  yield s.say('recruitA', 'Losing trim. Left side. It is fighting me.');
  yield s.say('instructor', 'Punch out. That is the drill. Punch out.');
  const a = (yield s.ask('me', 'On the channel:', ['Hold it level. Do not spend thrust. Let it come to you.', 'Do as your instructor says.'])) as number;
  if (a === 0) {
    yield s.say('me', 'Hold it level. Do not spend thrust. It is going to push. Let it push. Accept it, and wait.');
    yield s.say('recruitA', 'It is pushing.');
    yield s.say('me', 'Good. Now it has spent something. You have not. Bring it round.');
  } else {
    yield s.say('me', 'Your instructor has the drill. But you are level, and that is not nothing. Hold it one more breath.');
    yield s.say('recruitA', 'Holding.');
    yield s.say('me', 'It has spent its push. You have not. Bring it round.');
  }
  s.flash();
  s.showFrame('trainer', true);
  s.boom(pad.x, pad.z, 1, 0.7);
  s.shake(0.14, 0.9);
  s.sound('land');
  s.alarm(false);
  yield s.wait(1.0);
  s.place('recruitA', pad.x + 4, pad.z + 2.5, Math.PI / 4);
  s.show('recruitA', true);
  s.music('calm');
  yield s.walk('recruitA', pad.x + 6, pad.z + 5);
  s.shot('me', 'recruitA');
  yield s.say('recruitA', 'I held it.');
  yield s.say('me', 'You held it. Now learn to do that on purpose.');
  s.release();
  s.set('hop');
  yield s.walk('officer', pad.x + 9, pad.z + 7);
  s.shot('me', 'officer');
  yield s.say('officer', 'Our instructors would have told him to punch out.');
  yield s.say('me', 'Some days that is right. Today the frame was worth keeping, and so was he.');
  yield s.say('officer', 'The intake is yours. Your book, your hours.');
  s.release();
  s.letterbox(false);
  s.objective('Gather the intake on the deck.');
}

/** The first drill: his method, said out loud for the first time on Emberline deck. */
function* drill(s: StoryApi): Script {
  if (!s.flag('hop')) {
    yield s.say('me', 'Nothing to teach yet. They have not seen anything go wrong.');
    return;
  }
  s.letterbox(true);
  yield [s.walk('recruitA', -3, 2), s.walk('recruitB', 1.5, 2.5)];
  s.shot('me', 'recruitA');
  yield s.say('me', 'Hold guard. Take the first pressure. Make them spend their thrust before you commit.');
  yield s.say('recruitB', 'That is all?');
  yield s.say('me', 'That is the first year. The rest of the book is for the second year, and you will be alive for it.');
  s.gesture('me', 'cross');
  yield s.say('recruitA', 'Is it hard?');
  yield s.say('me', 'It is boring. Boring is cheaper.');
  s.set('trained');
  s.release();
  yield s.narrate('The manual was copied before his first Pact assignment, and went to every section that flies.');
  yield s.narrate('Ten years later his sections have the lowest first-year pilot loss rate in the sky. Trainee reports call him impossible to impress, and do not record it as a complaint.');
  yield s.nextTime(
    [
      'Forty-three CE. Emberline holds nine yards and presses for the thirteen.',
      'At Kettle Gate an Ironwake watch has held the same route for twenty years. The standing rules allow one flight.',
    ],
    'CHAPTER 1 · IMPOSSIBLE TO IMPRESS',
  );
  s.letterbox(false);
  s.complete();
}

export const NOCTURNE_0: ChapterDef = {
  id: 'nocturne-0',
  pilot: 'nocturne',
  number: 0,
  title: 'THE MANUAL',
  region: 'emberrest',
  start: { x: LAND.x, z: LAND.z, facing: Math.PI },
  objective: 'Take your transfer packet to the claims office.',
  noFrame: true,
  music: 'calm',
  actors: [
    { id: 'officer', name: 'PACT OFFICER', look: 'extra', sex: 'm', seed: 41, suit: 0x4a2c2e, trim: 0x36e2ea, x: 22, z: -14, facing: Math.PI / 2 },
    { id: 'clerk', name: 'CLAIMS CLERK', look: 'extra', sex: 'f', seed: 13, suit: 0x2a1a1c, trim: 0xff8a6a, x: R.people.claims.x, z: R.people.claims.z },
    { id: 'recruitA', name: 'RECRUIT', look: 'extra', sex: 'm', seed: 7, suit: 0x781c22, trim: 0x36e2ea, x: R.people.recruitA.x, z: R.people.recruitA.z },
    { id: 'recruitB', name: 'RECRUIT', look: 'extra', sex: 'f', seed: 19, suit: 0x781c22, trim: 0x36e2ea, x: R.people.recruitB.x, z: R.people.recruitB.z, facing: Math.PI },
    { id: 'instructor', name: 'SECTION INSTRUCTOR', look: 'extra', sex: 'f', seed: 52, suit: 0x3a3436, trim: 0xb0202a, x: -14, z: -8, facing: Math.PI / 2 },
  ],
  frames: [{ id: 'trainer', mech: 'nocturne', x: pad.x, z: pad.z, facing: Math.PI / 2 }],
  intro,
  talk: { officer, clerk, recruitA, recruitB, instructor },
  areas: [
    { id: 'hop', x: pad.x + 6, z: pad.z + 5, r: 3.4, prompt: 'WATCH THE TRAINING HOP', when: 'copied', run: hop },
    { id: 'drill', x: 0, z: 0, r: 4, prompt: 'GATHER THE INTAKE', when: 'hop', run: drill },
  ],
};
