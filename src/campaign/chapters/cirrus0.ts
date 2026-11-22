import type { AreaDef, ChapterDef, StoryApi } from '../Story';
import type { Script } from '../Script';
import { regionById } from '../Regions';

/**
 * MIRA HOLLOWAY — Prologue: SEVENTEEN.
 *
 * Canon used: yard-born at Brightwake; her first LT-21 assembled at seventeen
 * from three wrecks and a stolen reactor; the first year of dock notes calls
 * the flying poor, then stops using the word; no rank entered, no signed
 * contract. Free Latitude keeps no central service register, only dock
 * records. Her method later: the frame gains nothing by slowing down. Early
 * 20s in 43 CE, so seventeen in about 38 CE. Whose reactor it was is not
 * canon and is not said. Everyone but Holloway is a role.
 */

const R = regionById('brightwake')!;
const pad = R.pad;
/** In the lee of the refit shed, where its spare reactor sits in a cradle. */
const SHED = { x: 22, z: -10 };

const WRECKS: { id: string; x: number; z: number; prompt: string }[] = [
  { id: 'spar', x: -20, z: -26, prompt: 'HAGGLE FOR THE SPAR' },
  { id: 'limbs', x: -44, z: 16, prompt: 'STRIP THE LIMBS' },
  { id: 'pods', x: 44, z: 36, prompt: 'CUT THE THRUSTER PODS' },
];
const have = (s: StoryApi): number => WRECKS.filter((w) => s.flag(w.id)).length;

function* intro(s: StoryApi): Script {
  yield s.fade(true, 0);
  s.letterbox(true);
  s.music('calm');
  yield s.caption('BRIGHTWAKE  ·  FREE LATITUDE  ·  38 CE', 2.6);
  s.cam({ x: pad.x - 10, y: 2.2, z: pad.z - 9 }, { x: pad.x - 3, y: 1.2, z: pad.z - 4 }, true);
  yield s.fade(false, 1.0);
  s.shot('me', 'mechanic');
  yield s.say('mechanic', 'You cannot build a frame out of three wrecks.');
  yield s.say('me', 'Four would be greedy.');
  yield s.say('mechanic', 'The LT pattern sheet wants a spar, four limbs, two thruster pods and a reactor.');
  yield s.say('me', 'I have a list. A spar off the stall, limbs off the north berth, pods off the old hulk in the south-east corner.');
  yield s.say('mechanic', 'And a reactor.');
  s.gesture('me', 'shrug');
  yield s.say('me', 'The list is in order of difficulty.');
  s.release();
  yield s.titleCard('PROLOGUE', 'SEVENTEEN');
  s.letterbox(false);
  s.music('theme');
  s.objective('Find three wrecks: the spar, the limbs, the thruster pods.');
}

function* mechanic(s: StoryApi): Script {
  if (s.flag('flown')) {
    yield s.say('mechanic', 'Poor. I will put poor in the notes. It is the kindest word I have.');
    return;
  }
  if (s.flag('reactor')) {
    yield s.say('mechanic', 'It is ugly. It is also running. Go on, then.');
    return;
  }
  if (s.flag('night')) {
    yield s.say('mechanic', 'I am asleep. I have been asleep for an hour. Ask anyone.');
    return;
  }
  const n = have(s);
  if (n < WRECKS.length) {
    yield s.say('mechanic', n === 0 ? 'Nothing yet? The list is in order of difficulty, you said.' : `${n} of three. Your pile is starting to look like a frame, if you squint.`);
    return;
  }
  s.shot('me', 'mechanic');
  yield s.say('mechanic', 'Three wrecks on my pad. No reactor. A frame without a reactor is a sculpture.');
  yield s.say('me', 'I know where there is one.');
  yield s.say('mechanic', 'I did not hear that.');
  yield s.say('me', 'Sitting in a cradle behind the refit shed. Nobody has looked at it in a month.');
  yield s.say('mechanic', 'I did not hear that either. I am going to bed.');
  s.release();
  yield s.fade(true, 1.2);
  s.set('night');
  s.music('tension');
  s.show('watch', true);
  s.place('kid', -6, 24, 0);
  yield s.caption('THAT NIGHT', 2.0);
  yield s.fade(false, 1.2);
  s.objective('Lift the reactor from behind the refit shed. Do not get seen.');
}

function* clerk(s: StoryApi): Script {
  if (s.flag('flown')) return;
  yield s.say('clerk', 'Dock book. If you are building something on our pad, I write it down.');
  yield s.say('me', 'Write LT-21.');
  yield s.say('clerk', 'There is no LT-21 under your name.');
  yield s.say('me', 'There will be.');
}

function* trader(s: StoryApi): Script {
  if (s.flag('spar')) {
    yield s.say('trader', 'Pleasure doing business. I think.');
    return;
  }
  yield s.say('trader', 'The spar? It is a good spar. Bent in one place. Straight everywhere else.');
}

function* kid(s: StoryApi): Script {
  if (s.flag('reactor')) {
    yield s.say('kid', 'I dropped the bucket on purpose. Can I fly it now.');
    yield s.say('me', 'You can hand me things for a year. Then we will see.');
    return;
  }
  yield s.say('kid', 'Are you building a frame? Can I fly it.');
  yield s.say('me', 'You can hand me things.');
  yield s.say('kid', 'That is nearly flying.');
}

function* watch(s: StoryApi): Script {
  yield s.say('watch', 'Late for you, isn\'t it. Go home.');
}

function wreck(w: (typeof WRECKS)[number]): AreaDef {
  return {
    id: w.id,
    x: w.x,
    z: w.z,
    r: 3.2,
    prompt: w.prompt,
    run: function* (s: StoryApi): Script {
      if (s.flag(w.id)) {
        yield s.say('me', 'Got that one. Next.');
        return;
      }
      if (w.id === 'spar') {
        const a = (yield s.ask('trader', 'You want the spar. What have you got.', ['Promise him a ride.', 'Trade the radio.', 'Pay later.'])) as number;
        if (a === 0) {
          yield s.say('me', 'The first ride in it. When it flies.');
          yield s.say('trader', 'If it flies.');
          yield s.say('me', 'When.');
        } else if (a === 1) {
          yield s.say('trader', 'The radio. It works?');
          yield s.say('me', 'It works if you hit it.');
        } else {
          yield s.say('trader', 'Later is a long time on Brightwake.');
          yield s.say('me', 'So is a spar sitting on a stall.');
        }
        yield s.say('trader', 'Fine. Take it. Bend and all.');
      } else if (w.id === 'limbs') {
        s.boom(w.x - 2, w.z - 2, 1, 0.25);
        s.sound('hit');
        yield s.say('me', 'Four limbs. One of them has a hand that does not close. That is fine. It only has to hold a knife.');
      } else {
        s.music('sorrow');
        yield s.say('me', 'Somebody flew this. The pods are still good.');
        yield s.say('me', 'Whoever they were, their account is still open somewhere. Thank you.');
        s.music('theme');
      }
      s.set(w.id);
      const n = have(s);
      s.objective(n < WRECKS.length ? `Find three wrecks: ${n} of three on the pad.` : 'Show the mechanic your three wrecks.');
    },
  };
}

/** The reactor: a cradle in the dark, a watchman, and a yard kid with a bucket. */
function* reactor(s: StoryApi): Script {
  if (s.flag('reactor')) return;
  s.letterbox(true);
  s.cam({ x: SHED.x - 7, y: 1.2, z: SHED.z + 6 }, { x: SHED.x + 2, y: 1.0, z: SHED.z - 2 }, false);
  yield s.say('me', 'Cradle. Coupling. Eight bolts. Four minutes if nothing goes wrong.');
  s.gesture('me', 'work', 3);
  yield s.wait(2.0);
  s.sound('hit');
  s.shake(0.05, 0.4);
  yield s.walk('watch', SHED.x - 5, SHED.z + 4);
  yield s.say('watch', 'Who is there.');
  const a = (yield s.ask('me', 'The watch is coming round the shed.', ['Hide behind the crates.', 'Say you are on night shift.'])) as number;
  if (a === 1) {
    yield s.say('me', 'Night shift.');
    yield s.say('watch', 'Night shift does not have a seventeen-year-old on it.');
  } else {
    yield s.say('watch', 'I can see your boots.');
  }
  s.alarm(true);
  yield s.wait(0.6);
  s.show('kid', true);
  s.place('kid', SHED.x - 8, SHED.z + 7, Math.PI);
  s.sound('hit');
  yield s.say('kid', 'Sorry. Sorry. I dropped the bucket. It went everywhere.');
  s.shot('watch', 'kid');
  yield s.say('watch', 'What are you doing out. Go to bed. Both of you. Whoever you are.');
  s.alarm(false);
  s.release();
  yield s.walk('watch', 14, -14);
  s.show('watch', false);
  yield s.say('me', 'Seven bolts. Eight.');
  yield s.fade(true, 1.0);
  s.set('reactor');
  s.showFrame('lt21', true);
  s.place('me', pad.x - 6, pad.z - 4, Math.PI / 2);
  s.place('mechanic', pad.x - 8, pad.z - 1, Math.PI / 2);
  s.music('hope');
  yield s.caption('BEFORE DAWN', 2.0);
  s.cam({ x: pad.x - 14, y: 2.0, z: pad.z - 12 }, { x: pad.x, y: 4.5, z: pad.z }, true);
  yield s.fade(false, 1.0);
  s.flash();
  s.shake(0.08, 1.0);
  s.sound('launch');
  yield s.wait(1.2);
  s.shot('me', 'mechanic');
  yield s.say('mechanic', 'It is ugly.');
  yield s.say('me', 'It is light.');
  yield s.say('mechanic', 'Whose reactor is that.');
  yield s.say('me', 'Mine now.');
  yield s.say('mechanic', 'I did not hear that either.');
  s.release();
  s.letterbox(false);
  s.objective('Fly it.');
}

function* first(s: StoryApi): Script {
  if (!s.flag('reactor')) {
    yield s.say('me', 'A spar, limbs and pods. Needs a heart.');
    return;
  }
  s.letterbox(true);
  s.show('me', false);
  s.music('theme');
  yield s.launch('lt21');
  s.cam({ x: pad.x - 18, y: 3, z: pad.z - 14 }, { x: pad.x + 30, y: 30, z: pad.z + 30 }, true);
  yield s.wait(0.8);
  s.boom(pad.x + 40, pad.z + 30, 22, 0.5);
  s.shake(0.06, 0.6);
  yield s.say('me', 'Fine. That was fine. That mast was not on my list.');
  yield s.narrate('The first year of Brightwake dock notes calls the flying poor.');
  s.flash();
  s.showFrame('lt21', true);
  s.sound('land');
  s.shake(0.12, 0.8);
  s.place('me', pad.x - 6, pad.z - 4, Math.PI / 2);
  s.show('me', true);
  yield s.walk('clerk', pad.x - 9, pad.z - 7);
  s.shot('me', 'mechanic');
  yield s.say('mechanic', 'Poor.');
  yield s.say('me', 'Fast, though.');
  s.shot('me', 'clerk');
  yield s.say('clerk', 'Dock book. What do I write.');
  yield s.say('me', 'LT-21.');
  yield s.say('clerk', 'No rank. No contract.');
  yield s.say('me', 'Write that too.');
  s.set('flown');
  s.release();
  yield s.narrate('Then the notes stopped using the word.');
  yield s.nextTime(
    [
      'Forty-three CE. The account is still open under the same LT-21 identification: two reactor removals, more than one spar, and sheets that cannot tell a rebuilt frame from a new one.',
      'Convoy seizures have resumed. Concord calls her crews pirates and authorised visitors in the same week.',
    ],
    'CHAPTER 1 · THREE WRECKS AND A REACTOR',
  );
  s.letterbox(false);
  s.complete();
}

export const CIRRUS_0: ChapterDef = {
  id: 'cirrus-0',
  pilot: 'cirrus',
  number: 0,
  title: 'SEVENTEEN',
  region: 'brightwake',
  start: { x: pad.x - 6, z: pad.z - 4, facing: Math.PI / 2 },
  objective: 'Find three wrecks: the spar, the limbs, the thruster pods.',
  noFrame: true,
  music: 'theme',
  actors: [
    { id: 'mechanic', name: 'MECHANIC', look: 'extra', sex: 'm', seed: 70, suit: 0x4a4a52, trim: 0xffc070, x: pad.x - 8, z: pad.z - 1, facing: -Math.PI / 2 },
    { id: 'clerk', name: 'DOCK CLERK', look: 'extra', sex: 'f', seed: 15, suit: 0x3a7ad8, trim: 0x3ee0ff, x: R.people.steward.x, z: R.people.steward.z },
    { id: 'trader', name: 'TRADER', look: 'extra', sex: 'm', seed: 28, suit: 0x8a4a3a, trim: 0xffc070, x: R.people.trader.x, z: R.people.trader.z },
    { id: 'kid', name: 'YARD KID', look: 'extra', sex: 'f', seed: 5, suit: 0xc0582a, trim: 0xffffff, x: -26, z: 14, young: true },
    { id: 'watch', name: 'HARBOUR WATCH', look: 'extra', sex: 'm', seed: 39, suit: 0x2a8a8a, trim: 0x3ee0ff, x: 14, z: -14, hidden: true },
  ],
  frames: [{ id: 'lt21', mech: 'cirrus', x: pad.x, z: pad.z, facing: -Math.PI / 2, hidden: true }],
  intro,
  talk: { mechanic, clerk, trader, kid, watch },
  areas: [
    ...WRECKS.map(wreck),
    { id: 'reactor', x: SHED.x, z: SHED.z, r: 3.4, prompt: 'LIFT THE REACTOR', when: 'night', run: reactor },
    { id: 'first', x: pad.x, z: pad.z, r: 5.2, prompt: 'BOARD THE LT-21', when: 'reactor', run: first },
  ],
};
