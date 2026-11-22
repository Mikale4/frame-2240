import { Difficulty } from '../../core/Session';
import type { ChapterDef, StoryApi } from '../Story';
import type { Script } from '../Script';
import { regionById } from '../Regions';

/**
 * BRUNN OKONKWO — Chapter 1: SEAM SHIFT.
 *
 * The other side of Volkov's WITHIN TERMS (`pyre1.ts`): the Emberline claims
 * office wants a survey convoy through to one of the thirteen, Ironwake wants
 * the same lane closed for the season and puts Okonkwo's walker on it, the
 * board gives one sanctioned flight at Cathedral Yard, and the lane is ruled
 * Ironwake's for the season. His message to her is the one the broker passes
 * on there.
 *
 * Canon used: Ironwake cuts the mineral rafts, runs convoy protection, and has
 * crew grades and shifts rather than ranks. Pattern 3 walkers cut ore long
 * before they were armed; on the HV-03 the repeater sits at the old
 * cutting-head mount, mortars in both spoil hoppers, and the pile driver was
 * left in place. Okonkwo has thirty-one years on the class, declined a
 * commission in 36, 39 and 42 CE because he already had a job, and thinks a
 * seam collapse is worse than a fight. Volkov burned two yards she was hired to
 * defend, both ruled "within terms". Convoy seizures have resumed; who is
 * taking them is not said. Nobody is named who is not canon: the foreman, the
 * cutter and the clerk are roles.
 */

const R = regionById('coldseam')!;
const pad = R.pad;

function* intro(s: StoryApi): Script {
  yield s.fade(true, 0);
  yield s.caption('COLDSEAM  ·  IRONWAKE COLLIERY  ·  43 CE', 2.6);
  yield s.fade(false, 1.2);
  // The foreman walks over from the platform edge before the shift goes down.
  yield s.walk('foreman', R.spawn.x + 2.2, R.spawn.z + 0.6);
  s.shot('me', 'foreman');
  yield s.say('foreman', 'Okonkwo. Before you go down to the raft, the clerk has a sheet for you.');
  yield s.say('me', 'I have a sheet. It says cutting, second shift.');
  yield s.say('foreman', 'We lost a convoy on the lane last night. Seized. The crew came back. The ore did not.');
  yield s.say('me', 'Who took it?');
  yield s.say('foreman', 'Nobody has said. The company wants your walker on the lane.');
  yield s.say('me', 'Then I will read the sheet. Who has the seam?');
  yield s.say('foreman', 'I do, until you are back.');
  s.release();
  s.objective('Talk to the shift clerk.');
}

function* clerk(s: StoryApi): Script {
  if (s.flag('took_flight')) {
    if (s.flag('lost_once')) {
      yield s.say('clerk', 'The board will hear it again. The lane stays shut until it rules.');
    } else {
      yield s.say('clerk', 'Your walker is on the pad. The lane is yours until the board says otherwise.');
    }
    return;
  }
  s.shot('me', 'clerk');
  yield s.say('clerk', 'Sheet from the company. HV-03, Okonkwo, off the seam and onto the convoy lane. Effective this shift.');
  yield s.say('me', 'For how long?');
  yield s.say('clerk', 'The season. The company wants the lane closed until the seizures stop.');
  yield s.say('me', 'And who wants it open?');
  yield s.say('clerk', 'The Emberline claims office. They want a survey convoy through to one of the thirteen.');
  yield s.say('clerk', 'The standing-rules board has sent it to Cathedral Yard. One sanctioned flight settles who holds the lane.');
  yield s.say('me', 'Who flies for Emberline?');
  yield s.say('clerk', 'Nobody from Emberline. They have hired Ashfall. Volkov, in the IN-05.');
  yield s.say('me', 'She burned two yards she was paid to defend.');
  yield s.say('clerk', 'Both ruled within terms.');
  yield s.say('me', 'Most things are, on paper.');
  yield s.say('clerk', 'Accounts sent Ashfall an envelope for the lane as well. Nobody knows if she signed it.');
  yield s.say('me', 'Then she is paid either way. Ashfall usually is.');
  const pick = (yield s.ask('clerk', 'Will you take the lane?', ['I will take it.', 'Put someone else on it.', 'Who holds the seam?'])) as number;
  if (pick === 1) {
    yield s.say('me', 'Put someone else on it. I am on second shift.');
    yield s.say('clerk', 'The company asked for you by name. It said you would say that.');
    yield s.say('me', 'Then the company knows me. I will take it.');
  } else if (pick === 2) {
    yield s.say('me', 'Who holds the seam while I am on the lane?');
    yield s.say('clerk', 'The foreman, with the spare walker.');
    yield s.say('me', 'Then I will take it, and I will be quick.');
  } else {
    yield s.say('me', 'I will take it. The walker is rated for falling ore. It can take a contractor.');
  }
  yield s.say('clerk', 'The cutter is taking the cutting head off now. It will be armed again by the time you board.');
  s.release();
  s.set('took_flight');
  s.objective('Go to your frame and fly the sanctioned flight.');
}

function* foreman(s: StoryApi): Script {
  if (!s.flag('took_flight')) {
    yield s.say('foreman', 'Clerk is outside the office. Read the sheet and get it over with.');
    return;
  }
  if (s.flag('lost_once')) {
    yield s.say('foreman', 'Lane is still contested. The seam is quiet, if that helps.');
    yield s.say('me', 'It does.');
    return;
  }
  yield s.say('foreman', 'I will keep the seam. Go and close the lane.');
  yield s.say('me', 'Watch the east shelf. If it starts talking, pull everyone off. Do not wait for me.');
  yield s.say('foreman', 'You think it is that bad?');
  yield s.say('me', 'A seam collapse is worse than any fight. A fight at least ends.');
}

function* cutter(s: StoryApi): Script {
  if (!s.flag('took_flight')) {
    yield s.say('cutter', 'They say you turned down a commission three times.');
    yield s.say('me', 'Thirty-six, thirty-nine and forty-two.');
    yield s.say('cutter', 'Why?');
    yield s.say('me', 'I already had a job.');
    return;
  }
  if (s.flag('lost_once')) {
    yield s.say('cutter', 'She left soot all over the rock-fall plate.');
    yield s.say('me', 'It has had worse on it. Leave it.');
    return;
  }
  yield s.say('cutter', 'Cutting head is off. Repeater is back on the mount, and the mortars are in both spoil hoppers.');
  yield s.say('me', 'And the pile driver?');
  yield s.say('cutter', 'Never came off.');
  yield s.say('me', 'Good. It is the part I trust.');
}

function* frame(s: StoryApi): Script {
  if (!s.flag('took_flight')) {
    yield s.say('me', 'The sheet says cutting until somebody tells me otherwise. The clerk first.');
    return;
  }
  const how = (yield s.ask('me', 'Fly the sanctioned flight against Volkov?', ['Fly it in the open (FREE ORBIT)', 'Fly it on the plate', 'Not yet'])) as number;
  if (how === 2) return;
  yield s.fade(true, 0.6);
  const result = (yield s.battle({ foe: 'pyre', difficulty: Difficulty.Normal, mode: how === 0 ? 'orbit' : 'versus' })) as 'win' | 'lose';
  yield s.fade(false, 0.8);
  if (result === 'lose') {
    s.set('lost_once');
    yield s.say('me', 'She burned through. I have seen worse in a seam. Again.');
    s.objective('Fly the sanctioned flight again when ready.');
    return;
  }
  // The clerk comes over from the office with the ruling.
  yield s.walk('clerk', pad.x - 5, pad.z - 1.5);
  s.shot('me', 'clerk');
  yield s.say('clerk', 'The board has ruled. The lane is ours for the season.');
  yield s.say('me', 'Good. Is the seam still standing?');
  yield s.say('clerk', 'Foreman says it is quiet.');
  if (s.flag('lost_once')) {
    yield s.say('clerk', 'Accounts wants to know why it took two flights.');
    yield s.say('me', 'Tell accounts the first one was a survey.');
  } else {
    yield s.say('clerk', 'Accounts is pleased. They had budgeted for a longer day.');
    yield s.say('me', 'So had I.');
  }
  yield s.say('clerk', 'The Ashfall broker is asking for a word to take back to her.');
  yield s.say('me', "Tell her she flies like a seam fire. Fast, and somebody else's problem.");
  yield s.say('clerk', 'Is that a compliment?');
  yield s.say('me', 'It is a description. I am going back to the seam.');
  s.release();
  s.unlock('pyre');
  s.complete();
}

export const TERRAMOTH_1: ChapterDef = {
  id: 'terramoth-1',
  pilot: 'terramoth',
  number: 1,
  title: 'SEAM SHIFT',
  region: 'coldseam',
  start: { x: R.spawn.x, z: R.spawn.z, facing: R.spawn.facing },
  objective: 'Talk to the shift clerk.',
  actors: [
    { id: 'clerk', name: 'SHIFT CLERK', look: 'extra', sex: 'm', seed: 92, suit: 0x6e4630, trim: 0xffb020, x: R.people.clerk.x, z: R.people.clerk.z, facing: 0 },
    { id: 'foreman', name: 'SEAM FOREMAN', look: 'extra', sex: 'f', seed: 31, suit: 0xa8721f, trim: 0xffb020, x: R.people.foreman.x, z: R.people.foreman.z, facing: -Math.PI / 2 },
    { id: 'cutter', name: 'CUTTER', look: 'extra', sex: 'm', seed: 44, suit: 0x5b4a2c, trim: 0xffb020, x: R.people.cutter.x, z: R.people.cutter.z, facing: 1 },
  ],
  intro,
  talk: { clerk, foreman, cutter },
  areas: [{ id: 'frame', x: pad.x, z: pad.z, r: 5.2, prompt: 'BOARD HV-03 TERRAMOTH', run: frame }],
  features: ['pyre'],
};
