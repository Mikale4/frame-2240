import type { ChapterDef, StoryApi } from '../Story';
import type { Script } from '../Script';
import { regionById } from '../Regions';

/**
 * IO SENNA — Prologue: SALVAGE.
 *
 * Canon rule for this campaign: **no interior voice**. Senna says three things
 * in this prologue, one of them the locked phrase; the narrator says only what
 * could be seen or what was written down.
 *
 * Canon used: Free Latitude dock records first place Senna and the fourteenth
 * airframe together in 33 CE; later entries identify the frame as EW-14
 * NULLTIDE; Concord traffic contains no recovery order, interception request
 * or notice of pursuit; Free Latitude has continued to enter the machine as
 * salvage. Her archive tagline is "Data point." Nothing here says where she or
 * the frame came from, or why: nobody asks and gets an answer. Everyone else
 * is a role.
 */

const R = regionById('brightwake')!;
const pad = R.pad;
/** Beside the frame, where she stays. */
const BY = { x: pad.x - 6, z: pad.z - 2 };

function* intro(s: StoryApi): Script {
  yield s.fade(true, 0);
  s.letterbox(true);
  s.show('me', false);
  s.music('tension');
  yield s.caption('BRIGHTWAKE  ·  FREE LATITUDE  ·  33 CE', 2.6);
  s.cam({ x: 0, y: 2.0, z: 12 }, { x: 8, y: 1.4, z: 20 }, true);
  yield s.fade(false, 1.2);
  s.shot('watch', 'mechanic');
  yield s.say('watch', 'Running lights. South-west. No transponder.');
  yield s.say('mechanic', 'Lifter?');
  yield s.say('watch', 'Too small. Too quiet.');
  s.alarm(true);
  s.cam({ x: pad.x - 18, y: 1.6, z: pad.z - 16 }, { x: pad.x, y: 14, z: pad.z }, false);
  yield s.wait(1.6);
  s.flash();
  s.showFrame('ew14', true);
  s.boom(pad.x, pad.z, 0.5, 0.5);
  s.shake(0.14, 1.0);
  s.sound('land');
  yield s.wait(1.0);
  s.alarm(false);
  s.music(null);
  yield s.pan(
    [{ x: pad.x - 14, y: 2.0, z: pad.z - 12 }, { x: pad.x, y: 5, z: pad.z }],
    [{ x: pad.x - 10, y: 1.8, z: pad.z - 8 }, { x: BY.x, y: 1.4, z: BY.z }],
    2.6,
  );
  s.place('me', pad.x - 3.5, pad.z - 1, -Math.PI * 0.75);
  s.show('me', true);
  yield s.walk('me', BY.x, BY.z);
  yield s.narrate('The pilot climbs down and stands beside the frame.');
  yield s.walk('watch', BY.x - 4, BY.z - 2);
  s.shot('me', 'watch');
  yield s.say('watch', 'Name and port of origin.');
  yield s.narrate('No answer.');
  yield s.say('watch', 'The dock clerk will want both. He is at the market end.');
  s.release();
  yield s.titleCard('PROLOGUE', 'SALVAGE');
  s.letterbox(false);
  s.music('calm');
  s.objective('The dock clerk wants an entry.');
}

function* mechanic(s: StoryApi): Script {
  if (s.flag('morning')) {
    yield s.say('mechanic', 'Berth fee is weekly. I will show you where the good coupling is. The left one sticks.');
    return;
  }
  if (s.flag('entered')) {
    yield s.say('mechanic', 'There is tea in the shed. If you want it. Nobody here is going to ask you anything you do not want to answer.');
    return;
  }
  s.shot('me', 'mechanic');
  yield s.say('mechanic', 'No maker\'s plate. I count fourteen access panels where every pattern sheet I know has twelve.');
  yield s.say('mechanic', 'I have never seen this pattern. Is it yours?');
  yield s.narrate('No answer.');
  yield s.say('mechanic', 'All right. It is yours until somebody says otherwise.');
  s.release();
}

function* watch(s: StoryApi): Script {
  if (s.flag('morning')) {
    yield s.say('watch', 'No traffic all night. I checked the board twice. I checked it a third time to be sure I was not asleep.');
    return;
  }
  yield s.say('watch', 'No transponder, no flight plan. If that is a Concord pattern, and I think it is, Concord comes here for it. Tonight, if they are quick.');
}

function* trader(s: StoryApi): Script {
  if (s.flag('refused')) {
    yield s.say('trader', 'The offer stands. Offers on Brightwake always stand. Mostly they lean.');
    return;
  }
  yield s.say('trader', 'Fourteen panels. I will give you a good price for the two nobody else has.');
  yield s.say('me', 'No.');
  s.set('refused');
}

function* clerk(s: StoryApi): Script {
  if (s.flag('morning')) {
    yield s.say('clerk', 'Entered. Salvage. If anyone ever comes asking, that is what the book says.');
    return;
  }
  if (s.flag('entered')) {
    yield s.say('clerk', 'Entered. Wait by your frame if you like. Most people do, the first night.');
    return;
  }
  s.shot('me', 'clerk');
  yield s.say('clerk', 'Dock book. Name.');
  yield s.say('me', 'Senna.');
  yield s.say('clerk', 'Port of origin.');
  yield s.narrate('No answer.');
  yield s.say('clerk', 'The machine. Pattern, maker, owner.');
  yield s.narrate('No answer.');
  yield s.say('clerk', 'Then I enter it as salvage, until somebody claims it. That is the rule for anything that comes in without papers.');
  const a = (yield s.ask('me', 'Salvage.', ['Nod.', 'Say nothing.'])) as number;
  if (a === 0) s.gesture('me', 'nod');
  yield s.say('clerk', 'Salvage, then.');
  s.release();
  s.set('entered');
  s.objective('Wait by the frame.');
}

/** The night: lights in the north, and a cup of tea. */
function* wait(s: StoryApi): Script {
  if (s.flag('morning')) {
    yield s.narrate('The frame ticks as it cools.');
    return;
  }
  s.letterbox(true);
  yield s.fade(true, 1.0);
  s.place('me', BY.x, BY.z, -Math.PI / 2);
  s.sit('me', true);
  s.place('mechanic', BY.x - 1.2, BY.z - 0.6, -Math.PI / 2);
  s.place('watch', BY.x - 8, BY.z - 6, Math.PI);
  s.music('tension');
  yield s.caption('TWO IN THE MORNING', 2.2);
  s.cam({ x: BY.x - 5, y: 1.4, z: BY.z + 4 }, { x: BY.x, y: 1.0, z: BY.z }, true);
  yield s.fade(false, 1.0);
  yield s.say('watch', 'Lights. North. Three of them. In formation.');
  s.alarm(true);
  s.music('danger');
  s.sit('me', false);
  yield s.walk('me', pad.x - 3.5, pad.z - 1.5);
  yield s.say('mechanic', 'If she goes, she goes. Leave her be.');
  s.cam({ x: BY.x - 2, y: 1.6, z: BY.z + 3 }, { x: BY.x + 30, y: 40, z: BY.z - 80 }, false);
  yield s.wait(2.0);
  yield s.say('watch', 'Hold on. Hold on.');
  yield s.wait(1.2);
  yield s.say('watch', 'Cargo lifter. Three running lights, one lifter. Late, and lit like a festival.');
  s.alarm(false);
  s.music('calm');
  yield s.walk('me', BY.x, BY.z);
  s.sit('me', true);
  s.sit('mechanic', true);
  s.shot('me', 'mechanic');
  yield s.say('mechanic', 'Tea. It is hot. That is all I am promising.');
  yield s.say('mechanic', 'Whoever you were waiting for, they are slow.');
  yield s.wait(1.0);
  yield s.say('mechanic', 'Does it bother you. That nobody came.');
  yield s.say('me', 'Data point.');
  s.release();
  yield s.narrate('She stays by the frame until morning.');
  yield s.fade(true, 1.4);
  s.sit('mechanic', false);
  s.sit('me', false);
  s.place('clerk', BY.x - 6, BY.z - 4, Math.PI / 2);
  s.set('morning');
  s.music('hope');
  yield s.caption('MORNING', 2.0);
  s.cam({ x: BY.x - 9, y: 2.2, z: BY.z - 7 }, { x: BY.x, y: 1.4, z: BY.z }, true);
  yield s.fade(false, 1.2);
  yield s.walk('clerk', BY.x - 2.5, BY.z - 1.5);
  s.shot('me', 'clerk');
  yield s.say('clerk', 'No Concord traffic all night. No recovery order. No interception request. No notice of pursuit.');
  yield s.say('watch', 'Nobody is coming for it.');
  yield s.say('clerk', 'Then it stays what the book says.');
  s.release();
  yield s.narrate('Brightwake dock book, 33 CE. One airframe, pattern unknown, no maker\'s plate. Pilot: Senna. Entered as salvage.');
  yield s.say('mechanic', 'She can berth here.');
  s.gesture('me', 'nod');
  yield s.narrate('Later entries identify the frame as EW-14 NULLTIDE. Free Latitude has entered it as salvage ever since.');
  yield s.nextTime(
    [
      'Forty-three CE. Ten years of dock records, and the same frame in all of them.',
      'A survey claim under the standing rules, and Concord\'s nominee to fly it: an AV-12 off Survey Post 4. Not a recovery. Not a hunt.',
    ],
    'CHAPTER 1 · DATA POINT',
  );
  s.letterbox(false);
  s.complete();
}

export const NULLTIDE_0: ChapterDef = {
  id: 'nulltide-0',
  pilot: 'nulltide',
  number: 0,
  title: 'SALVAGE',
  region: 'brightwake',
  start: { x: BY.x, z: BY.z, facing: -Math.PI / 2 },
  objective: 'The dock clerk wants an entry.',
  noFrame: true,
  music: 'calm',
  actors: [
    { id: 'mechanic', name: 'NIGHT MECHANIC', look: 'extra', sex: 'f', seed: 46, suit: 0x5a5048, trim: 0x3ee0ff, x: R.people.mechanic.x, z: R.people.mechanic.z, facing: Math.PI },
    { id: 'watch', name: 'HARBOUR WATCH', look: 'extra', sex: 'f', seed: 18, suit: 0x2a8a8a, trim: 0x3ee0ff, x: 4, z: 16, facing: Math.PI / 4 },
    { id: 'clerk', name: 'DOCK CLERK', look: 'extra', sex: 'm', seed: 33, suit: 0x3a7ad8, trim: 0x3ee0ff, x: R.people.steward.x, z: R.people.steward.z },
    { id: 'trader', name: 'TRADER', look: 'extra', sex: 'm', seed: 62, suit: 0x8a3ab0, trim: 0xffc070, x: R.people.trader.x, z: R.people.trader.z },
  ],
  frames: [{ id: 'ew14', mech: 'nulltide', x: pad.x, z: pad.z, facing: -Math.PI / 2, hidden: true }],
  intro,
  talk: { mechanic, watch, trader, clerk },
  areas: [{ id: 'wait', x: BY.x, z: BY.z, r: 3.4, prompt: 'WAIT BY THE FRAME', when: 'entered', run: wait }],
};
