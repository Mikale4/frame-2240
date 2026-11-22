import { Difficulty } from '../../core/Session';
import type { ChapterDef, StoryApi } from '../Story';
import type { Script } from '../Script';
import { regionById } from '../Regions';

/**
 * IO SENNA — Chapter 1: DATA POINT.
 *
 * Canon rule for this campaign: **no interior voice**. Senna says almost
 * nothing — three words across the chapter, one of them the locked phrase —
 * and the story is told from outside: her dock record read aloud, what other
 * people say to her and about her, and what she does.
 *
 * Canon used: Free Latitude dock records first place Senna and the fourteenth
 * airframe together in 33 CE; the frame is entered as salvage and carries no
 * maker's plate. Her age is assessed, thirty-six. Concord's threat rating has
 * been provisional since 37 CE and no pursuit order was ever issued. She lets
 * retreating opponents go and stops firing once a target cannot resist;
 * opponents describe being catalogued. One remark survives in a Brightwake
 * mechanic's statement, whose reading the witness later asked to amend — it is
 * referred to here, not quoted. Doyne: AV-12, detached duty, four firing
 * positions found before anyone looks, silent on the channel at the start.
 * The case is a standing-rules survey claim with Doyne as Concord's nominee:
 * not a recovery, not a hunt. Nothing here explains Stillwake, the number in
 * the title, or who removed her record. Everyone else is a role.
 */

const R = regionById('brightwake')!;
const pad = R.pad;
/** The clerk's desk at the market-deck end of the berths, clear of the stall. */
const desk = { x: R.people.trader.x + 4, z: R.people.trader.z };
/** Open deck short of the pad, where the clerk waits for the ruling. */
const berthside = { x: 18, z: 18 };

function* intro(s: StoryApi): Script {
  yield s.fade(true, 0);
  yield s.caption('BRIGHTWAKE  ·  FREE LATITUDE  ·  43 CE', 2.6);
  yield s.fade(false, 1.2);
  // The dock steward comes over from the berth office.
  yield s.walk('steward', R.spawn.x - 2.2, R.spawn.z - 0.6);
  s.shot('me', 'steward');
  yield s.say('steward', 'Senna. The board sent a case down this morning. It touches your berth.');
  yield s.say('steward', 'Concord has nominated a pilot. Not a notice. Not a letter. A pilot.');
  yield s.wait(1.4);
  yield s.say('steward', 'The berth clerk has the paper. She reads it better than I would.');
  // She goes. He is still talking.
  yield s.walk('me', R.spawn.x + 4, R.spawn.z - 6);
  yield s.say('steward', 'Right. I will take that as thank you.');
  s.release();
  s.objective('See the berth clerk.');
}

function* clerk(s: StoryApi): Script {
  if (s.flag('contested')) {
    if (s.flag('lost_once')) {
      yield s.say('clerk', 'The board allows a second flight. Doyne is still on the plate, they say. Nobody has seen him. That is how they know.');
    } else {
      yield s.say('clerk', 'Your answer is filed. The flight is yours when you want it. I will be at your berth for the ruling.');
    }
    return;
  }
  s.shot('me', 'clerk');
  yield s.say('clerk', 'Board rules say I read you your own record before a case goes up. Stop me whenever you like.');
  yield s.say('clerk', 'You never have.');
  yield s.say('clerk', '"Thirty-three CE. EW airframe, no maker\'s plate. Entered as salvage. Pilot: Senna, Io." First page with both of you on it.');
  yield s.say('clerk', '"Age, assessed: thirty-six." Assessed, because nobody has ever produced a document. I have stopped asking.');
  yield s.say('clerk', '"Concord threat rating: provisional, since thirty-seven." Six years provisional. I have seen permanent things last less.');
  yield s.say('clerk', '"Concord pursuit orders received: none." I check that one twice. Every time.');
  yield s.say('clerk', 'Now the case. Concord claims a survey of your frame in its berth, under the standing rules.');
  yield s.say('clerk', 'A survey. Not a recovery. It says "recovery not sought" three times, which is twice more than it needed.');
  yield s.say('clerk', 'Their nominated pilot is Doyne. AV-12, detached duty. His survey route was changed to take in Brightwake.');
  yield s.say('clerk', 'Concord does not explain route changes. It did not explain this one.');
  const pick = (yield s.ask('clerk', 'How do you answer the claim?', ['Contest.', 'Say nothing.'])) as number;
  if (pick === 0) {
    yield s.say('me', 'Contest.');
    yield s.say('clerk', 'One word. I will make it look longer on the form.');
  } else {
    yield s.say('clerk', 'Silence on a claim is entered as a contest. Board rules. I will write it down as one.');
    s.set('said_nothing');
  }
  yield s.say('clerk', 'Then it goes to Cathedral Yard. One sanctioned flight. If he wins, they survey. If you win, the record stands.');
  yield s.say('clerk', 'I will be at your berth when the ruling comes in. It has to be read to you in person. Board rules.');
  s.release();
  s.set('contested');
  s.objective('Go to your frame and fly the sanctioned flight.');
  // She heads down to the berths with her papers. Nobody waits for her to get there.
  void s.walk('clerk', berthside.x, berthside.z);
}

function* steward(s: StoryApi): Script {
  if (!s.flag('contested')) {
    yield s.say('steward', 'The clerk is at her desk by the market deck. She has your record out. All of it, which is not much.');
    return;
  }
  yield s.say('steward', 'All the years you have berthed here, Concord never sent so much as a pursuit order. Now it sends a surveyor.');
  yield s.say('steward', 'The stalls are taking bets on the flight. I told them you would not like that. They asked how I knew.');
  yield s.say('steward', 'Fair question, I suppose.');
}

function* mechanic(s: StoryApi): Script {
  if (!s.flag('contested')) {
    yield s.say('mechanic', 'Years on this frame and I still go looking for the maker\'s plate. Habit. There is not one. There never was.');
    yield s.say('mechanic', 'Every other frame on this deck tells you who built it. This one tells you nothing at all.');
    yield s.say('mechanic', 'STATIC is rebuilt and the emitters are clean. Not that you asked. You never ask.');
    return;
  }
  if (s.flag('briefed')) {
    yield s.say('mechanic', 'I gave a statement about you once, years back. Later I asked them to amend it. I had read you wrong.');
    yield s.wait(1);
    yield s.say('mechanic', 'Just so you know. Back to the emitters.');
    return;
  }
  s.shot('me', 'mechanic');
  yield s.say('mechanic', 'Doyne, then. He will have found four places to shoot from before you have cleared the berth.');
  yield s.say('mechanic', 'And he says nothing on the channel until he is ready. Two quiet pilots on one plate. The board will think the line is down.');
  yield s.say('mechanic', 'Everyone who has flown against you comes back saying the same thing. That it felt like being catalogued.');
  s.release();
  s.set('briefed');
}

function* frame(s: StoryApi): Script {
  if (!s.flag('contested')) {
    yield s.say('mechanic', 'Not cleared to fly yet. The clerk has paper for you first.');
    return;
  }
  const how = (yield s.ask('mechanic', 'Board wants the flight against Doyne. Open air, or the plate?', ['Fly it in the open (FREE ORBIT)', 'Fly it on the plate', 'Not yet'])) as number;
  if (how === 2) return;
  yield s.fade(true, 0.6);
  const result = (yield s.battle({ foe: 'vesper', difficulty: Difficulty.Normal, mode: how === 0 ? 'orbit' : 'versus' })) as 'win' | 'lose';
  yield s.fade(false, 0.8);
  if (result === 'lose') {
    s.set('lost_once');
    yield s.say('me', 'Data point.');
    yield s.say('mechanic', 'That is all we get, then. Turning the frame round. Second flight whenever you want it.');
    s.objective('Fly the sanctioned flight again when ready.');
    return;
  }
  // The clerk comes over to the pad with the ruling.
  yield s.walk('clerk', pad.x + 5, pad.z - 1.5);
  s.shot('me', 'clerk');
  yield s.say('clerk', 'The board has ruled. Concord\'s claim fails. No survey of the frame or the berth.');
  yield s.say('clerk', 'The board\'s record of the flight, for the file. "EW-14 ceased fire when AV-12 could no longer resist."');
  yield s.say('clerk', '"AV-12 withdrew under its own power. Not pursued."');
  yield s.say('clerk', 'Concord\'s pilot filed his result without comment. They tell me that is normal for him.');
  if (s.flag('said_nothing')) {
    yield s.say('clerk', 'Your answer is on the file as a contest. It was a very quiet one.');
  } else {
    yield s.say('clerk', 'Your answer is on the file. One word. Still the most you have said to me this year.');
  }
  yield s.say('clerk', 'Anything you want entered beside it?');
  yield s.say('me', 'No.');
  yield s.say('clerk', 'Then I file it as it stands. Salvage, again. Provisional, again.');
  s.release();
  s.unlock('vesper');
  s.complete();
}

export const NULLTIDE_1: ChapterDef = {
  id: 'nulltide-1',
  pilot: 'nulltide',
  number: 1,
  title: 'DATA POINT',
  region: 'brightwake',
  start: { x: R.spawn.x, z: R.spawn.z, facing: R.spawn.facing },
  objective: 'See the berth clerk.',
  actors: [
    { id: 'steward', name: 'DOCK STEWARD', look: 'extra', sex: 'm', seed: 23, suit: 0x3a4250, trim: 0x3ee0ff, x: R.people.steward.x, z: R.people.steward.z, facing: -Math.PI / 2 },
    { id: 'clerk', name: 'BERTH CLERK', look: 'extra', sex: 'f', seed: 58, suit: 0x3a4250, trim: 0xffc070, x: desk.x, z: desk.z, facing: 0 },
    {
      id: 'mechanic', name: 'MECHANIC', look: 'extra', sex: 'f', seed: 66, suit: 0x6a5e52, trim: 0xff5a8a,
      x: R.people.mechanic.x, z: R.people.mechanic.z, facing: Math.atan2(pad.x - R.people.mechanic.x, pad.z - R.people.mechanic.z),
    },
  ],
  intro,
  talk: { clerk, steward, mechanic },
  areas: [{ id: 'frame', x: pad.x, z: pad.z, r: 5.2, prompt: 'BOARD EW-14 NULLTIDE', run: frame }],
  features: ['vesper'],
};
