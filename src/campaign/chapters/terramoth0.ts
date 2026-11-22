import type { ChapterDef, StoryApi } from '../Story';
import type { Script } from '../Script';
import { regionById } from '../Regions';

/**
 * BRUNN OKONKWO — Prologue: FOUR SECONDS.
 *
 * Canon used: thirty-one years on Pattern 3 equipment by 43 CE, twenty-six in
 * ore cutting; foreman of the same seam crew before convoy seizures began and
 * after armed escort reduced them; combat hours entered under equipment
 * operation because no separate pilot grade was created; every member of his
 * crew still paid under the mining trade; his goggles are approved welding
 * equipment; a seam collapse gives about four seconds and few usable
 * responses, an engagement minutes and several routes. Ironwake's first armed
 * frames were excavation walkers already rated for seam collapse; on the HV-03
 * the repeater sits at the old cutting-head mount, mortars in both spoil
 * hoppers, the pile driver left in place. Every current frame was built,
 * converted or selected under requirements produced by the Seven Yards War
 * (27–32 CE), so the walkers are armed here, in 28 CE. Commissions offered in
 * 36, 39 and 42 CE come later. Who seized the convoys is not said. Everyone
 * but Okonkwo is a role.
 */

const R = regionById('coldseam')!;
const pad = R.pad;
/** The east lip, where the deck stops and the raft lanes begin. */
const LIP = { x: 58, z: 0 };

function* intro(s: StoryApi): Script {
  yield s.fade(true, 0);
  s.letterbox(true);
  s.music('calm');
  yield s.caption('COLDSEAM  ·  IRONWAKE COLLIERY  ·  28 CE', 2.6);
  s.cam({ x: pad.x - 14, y: 3, z: pad.z + 10 }, { x: pad.x, y: 4, z: pad.z }, true);
  yield s.fade(false, 1.2);
  yield s.narrate('Before anyone armed them, the Pattern 3 walkers cut ore.');
  yield s.narrate('The Seven Yards War was a year old. It was not Ironwake\'s war. The convoys crossed it anyway.');
  yield s.walk('cutter', R.spawn.x + 2.4, R.spawn.z + 0.8);
  s.shot('me', 'cutter');
  yield s.say('cutter', 'Goggles.');
  yield s.say('me', 'Welding goggles. They are rated.');
  yield s.say('cutter', 'For welding.');
  yield s.say('me', 'For looking at things that are hot and close. Which is the seam, most days.');
  s.gesture('cutter', 'shake');
  s.release();
  yield s.titleCard('PROLOGUE', 'FOUR SECONDS');
  s.letterbox(false);
  s.music('theme');
  s.objective('Sign the crew on with the shift clerk.');
}

function* clerk(s: StoryApi): Script {
  if (s.flag('armed')) {
    yield s.say('clerk', 'Payroll classification: seam crew. All eight. I wrote it in ink.');
    return;
  }
  if (s.flag('signed')) {
    yield s.say('clerk', 'Your crew is on the sheet. Go and cut something.');
    return;
  }
  s.shot('me', 'clerk');
  yield s.say('clerk', 'Pattern 3, seam crew, eight hands. Foreman Okonkwo. Anything to declare.');
  yield s.say('me', 'The apprentice takes the face alone today. First time.');
  yield s.say('clerk', 'Is that wise.');
  yield s.say('me', 'It is the only way anyone has ever learned it.');
  s.release();
  s.set('signed');
  s.objective('Talk to the apprentice before the shift.');
}

function* apprentice(s: StoryApi): Script {
  if (s.flag('collapse')) {
    yield s.say('apprentice', 'Four seconds. I counted them after. I did not count them during.');
    yield s.say('me', 'Nobody does. That is why somebody counts on the channel.');
    return;
  }
  if (!s.flag('signed')) {
    yield s.say('apprentice', 'Is the sheet signed? I do not go out until the sheet is signed. You told me that.');
    return;
  }
  if (s.flag('sent')) return;
  s.shot('me', 'apprentice');
  yield s.say('apprentice', 'Alone. On the face.');
  yield s.say('me', 'Cut slow. If the seam talks, listen. If it shouts, you do what I say before I finish saying it.');
  yield s.say('apprentice', 'How long do you get. When it goes.');
  yield s.say('me', 'About four seconds.');
  yield s.say('apprentice', 'That is not long.');
  yield s.say('me', 'No. So you do not spend any of it thinking.');
  s.release();
  s.set('sent');
  yield s.walk('apprentice', pad.x - 5, pad.z - 1, true);
  s.show('apprentice', false);
  s.music('tension');
  s.letterbox(true);
  yield s.launch('walker');
  s.letterbox(false);
  s.objective('Watch the shift from the east lip.');
}

function* cutter(s: StoryApi): Script {
  if (s.flag('armed')) {
    yield s.say('cutter', 'A repeater where the cutting head was. I spent nine years keeping that mount true.');
    yield s.say('me', 'Keep it true for the repeater, then. Same mount.');
    return;
  }
  yield s.say('cutter', 'Shift is shift. Raft, face, cut, haul, home. Nothing has changed in twenty years except the war on the charts.');
}

function* hauler(s: StoryApi): Script {
  if (s.flag('armed')) {
    yield s.say('hauler', 'Seam crew with guns. My mother is going to ask what I do now. I am going to say the same thing.');
    return;
  }
  yield s.say('hauler', 'Second convoy this season, gone on the east lane. They took the ore and put the crew off on a raft.');
  yield s.say('me', 'Alive?');
  yield s.say('hauler', 'Alive. Cold. Angry.');
}

function* officer(s: StoryApi): Script {
  yield s.say('officer', s.flag('armed') ? 'The fitters work through the night. First escort leaves at the bell.' : 'Not now, foreman.');
}

/** The collapse: watched from the lip, counted on the channel. */
function* lip(s: StoryApi): Script {
  if (s.flag('collapse')) {
    yield s.say('me', 'Quiet out there now. The seam has said what it had to say.');
    return;
  }
  s.letterbox(true);
  s.cam({ x: LIP.x - 6, y: 2.0, z: LIP.z + 6 }, { x: LIP.x + 60, y: -20, z: LIP.z - 30 }, false);
  yield s.wait(1.4);
  yield s.say('apprentice', 'On the face. Cutting. It is… it is fine. It is a good seam.');
  yield s.wait(1.0);
  s.shake(0.05, 2.5);
  s.sound('hit');
  yield s.say('apprentice', 'It is moving. The face is moving.');
  s.alarm(true);
  s.music('danger');
  const a = (yield s.ask('me', 'Four seconds.', ['Drop the head. Back out on the left track.', 'Hold still and let it settle.'])) as number;
  if (a === 1) yield s.say('me', 'No. Not still. Drop the head and back out on the left track. Now.');
  else yield s.say('me', 'Drop the head. Back out on the left track. Now.');
  yield s.say('me', 'One.');
  yield s.wait(0.5);
  s.boom(LIP.x + 50, LIP.z - 24, -16, 1.4);
  yield s.say('me', 'Two.');
  s.shake(0.16, 1.4);
  s.sound('bigboom');
  yield s.say('me', 'Three.');
  yield s.wait(0.8);
  yield s.say('me', 'Four.');
  yield s.wait(1.2);
  s.alarm(false);
  yield s.say('apprentice', 'I am out. I am out. The head is gone. The head is under it.');
  yield s.say('me', 'Heads are cheap. Bring the rest home.');
  s.music('calm');
  // The walker comes home without its cutting head.
  s.flash();
  s.showFrame('walker', true);
  s.sound('land');
  s.place('apprentice', pad.x - 5, pad.z - 1, -Math.PI / 2);
  s.show('apprentice', true);
  yield s.fade(true, 0.6);
  s.place('me', pad.x - 9, pad.z - 3, Math.PI / 2);
  yield s.fade(false, 0.6);
  s.shot('me', 'apprentice');
  yield s.say('apprentice', 'I did not think. I just did what you said.');
  yield s.say('me', 'Good. Four seconds and nothing to think with. A fight gives you minutes. Remember that, if they ever make you carry a gun.');
  s.release();
  s.set('collapse');
  yield convoy(s);
}

/** The third convoy, and the order that bolts guns to the walkers. */
function* convoy(s: StoryApi): Script {
  s.show('officer', true);
  s.music('tension');
  yield s.walk('officer', pad.x - 12, pad.z - 5, true);
  s.shot('me', 'officer');
  yield s.say('officer', 'Foreman. Convoy seized on the east lane. Third this season. Crew put off on a raft, alive. Ore gone.');
  yield s.say('me', 'Who.');
  yield s.say('officer', 'Nobody flies a flag in the storm layer.');
  yield s.say('officer', 'From the next shift the Pattern 3s carry guns. A repeater on the cutting-head mount. Mortars in both spoil hoppers.');
  yield s.say('me', 'And the pile driver.');
  yield s.say('officer', 'Stays. Nobody could get it off.');
  yield s.walk('cutter', pad.x - 10, pad.z - 7);
  yield s.say('cutter', 'What does that make us.');
  const a = (yield s.ask('me', 'What does that make us?', ['Ask the officer.', 'Seam crew.'])) as number;
  if (a === 0) {
    yield s.say('me', 'You heard her. What does that make us.');
    yield s.say('officer', 'No separate pilot grade has been created. Combat hours are entered under equipment operation.');
  }
  yield s.say('me', 'Seam crew, then. With a repeater.');
  yield s.say('officer', 'Ironwake will want somebody to command the escorts. Somebody with a rank.');
  yield s.say('me', 'I already have a job.');
  s.release();
  s.set('armed');
  s.objective('Board the armed walker and take the first escort out.');
}

function* escort(s: StoryApi): Script {
  if (!s.flag('armed')) {
    yield s.say('me', 'She is the apprentice\'s today.');
    return;
  }
  s.letterbox(true);
  s.music('theme');
  yield s.say('me', 'Pattern 3, seam crew, outbound with the convoy. Repeater on the head mount. Pile driver where it always was.');
  yield s.launch('walker');
  yield s.narrate('Armed escort reduced the seizures. He stayed foreman of the same crew.');
  yield s.narrate('Ironwake offered him a commission in 36 CE, 39 CE and 42 CE. He declined each one. He already had a job.');
  yield s.nextTime(
    [
      'Forty-three CE. The seizures are back on the lanes.',
      'A lane one client wants closed and another wants open, a sanctioned flight at the standing rules, and an Ashfall pilot on the other side of it.',
    ],
    'CHAPTER 1 · SEAM SHIFT',
  );
  s.letterbox(false);
  s.complete();
}

export const TERRAMOTH_0: ChapterDef = {
  id: 'terramoth-0',
  pilot: 'terramoth',
  number: 0,
  title: 'FOUR SECONDS',
  region: 'coldseam',
  start: { x: R.spawn.x, z: R.spawn.z, facing: R.spawn.facing },
  objective: 'Sign the crew on with the shift clerk.',
  noFrame: true,
  music: 'theme',
  actors: [
    { id: 'cutter', name: 'SEAM CUTTER', look: 'extra', sex: 'f', seed: 21, suit: 0xa8721f, trim: 0xffb020, x: R.people.cutter.x, z: R.people.cutter.z },
    { id: 'apprentice', name: 'APPRENTICE CUTTER', look: 'extra', sex: 'm', seed: 3, suit: 0x8a5e1a, trim: 0xffb020, x: 14, z: 8, facing: -Math.PI / 2 },
    { id: 'hauler', name: 'HAULER', look: 'extra', sex: 'm', seed: 35, suit: 0x6e5a40, trim: 0xffb020, x: -14, z: 6 },
    { id: 'clerk', name: 'SHIFT CLERK', look: 'extra', sex: 'f', seed: 48, suit: 0x40321f, trim: 0xffc060, x: R.people.clerk.x, z: R.people.clerk.z },
    { id: 'officer', name: 'IRONWAKE OFFICER', look: 'extra', sex: 'f', seed: 57, suit: 0x5b4a2c, trim: 0xffd060, x: R.people.foreman.x, z: R.people.foreman.z, hidden: true },
  ],
  frames: [{ id: 'walker', mech: 'terramoth', x: pad.x, z: pad.z, facing: -Math.PI / 2 }],
  intro,
  talk: { clerk, apprentice, cutter, hauler, officer },
  areas: [
    { id: 'lip', x: LIP.x, z: LIP.z, r: 3.4, prompt: 'WATCH THE SHIFT', when: 'sent', run: lip },
    { id: 'escort', x: pad.x, z: pad.z, r: 5.2, prompt: 'BOARD THE ARMED WALKER', when: 'armed', run: escort },
  ],
};
