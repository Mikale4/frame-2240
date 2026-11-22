import type { ChapterDef, StoryApi } from '../Story';
import type { Script } from '../Script';
import { regionById } from '../Regions';

/**
 * SAAR TENGKU — Prologue: THE OPENING.
 *
 * Canon used: twenty years on standing watch across the same three yards by
 * 43 CE, so posted about 23 CE; he requested the posting twice and entered from
 * Colliery security, not seam work; his duty sheet defines success as
 * preventing passage through the assigned route until relief or withdrawal is
 * recorded; he does not pursue beyond the defence sector, because pursuit
 * leaves the route without its holder; asked once what he would do under an
 * advance order, he asked who the replacement holding the opening would be.
 * Colliery braid record: eleven, each issued after a contested docking held.
 *
 * Ironwake's first armed frames were excavation walkers and the Guard-pattern
 * machines came later, so in 23 CE the watch is held on foot, with the gate's
 * own guns; the GD-09 arrives after a time-skip. Who the convoy was is not
 * said. Everyone but Tengku is a role.
 */

const R = regionById('gatewatch')!;
const pad = R.pad;
/** The docking opening on the west edge: what the watch exists to keep shut. */
const OPENING = { x: -52, z: -12 };

function* intro(s: StoryApi): Script {
  yield s.fade(true, 0);
  s.letterbox(true);
  s.music('calm');
  yield s.caption('GATEWATCH  ·  KETTLE GATE  ·  23 CE', 2.6);
  yield s.pan(
    [{ x: OPENING.x + 6, y: 6, z: OPENING.z + 14 }, { x: OPENING.x - 20, y: 2, z: OPENING.z }],
    [{ x: R.spawn.x - 5, y: 2.2, z: R.spawn.z + 6 }, { x: R.spawn.x, y: 1.3, z: R.spawn.z }],
    3.4,
  );
  yield s.fade(false, 0.3);
  yield s.narrate('Kettle Gate takes the convoys for three yards. The watch keeps one rule: nothing passes the opening that the watch has not let through.');
  yield s.walk('officer', R.spawn.x + 2.5, R.spawn.z + 1.5);
  s.shot('me', 'officer');
  yield s.say('officer', 'Colliery security. You asked for standing watch.');
  yield s.say('me', 'Twice.');
  yield s.say('officer', 'The first time we said no. Why ask again.');
  yield s.say('me', 'The answer was wrong the first time.');
  s.gesture('officer', 'nod');
  s.release();
  yield s.titleCard('PROLOGUE', 'THE OPENING');
  s.letterbox(false);
  s.music('theme');
  s.objective('Take your duty sheet from the watch officer.');
}

function* officer(s: StoryApi): Script {
  if (s.flag('braid')) {
    yield s.say('officer', 'One braid. People will tell you it is a piece of string. It is a contested docking held.');
    return;
  }
  if (s.flag('posted')) {
    yield s.say('officer', 'The opening is on the west edge. Stand the watch there.');
    return;
  }
  s.shot('me', 'officer');
  yield s.say('officer', 'Second request. Granted. Standing watch, the three-yard rotation, Kettle Gate first.');
  yield s.say('officer', 'Your duty sheet. Read the last line.');
  yield s.say('me', 'Success: preventing passage through the assigned route until relief or withdrawal is recorded.');
  yield s.say('officer', 'That is all of it. Nothing about winning. Nothing about chasing. Do you understand why.');
  yield s.say('me', 'Because the route is the job. Not the people on it.');
  s.release();
  s.set('posted');
  s.objective('Stand the watch at the opening on the west edge.');
}

function* crew(s: StoryApi): Script {
  if (s.flag('braid')) {
    yield s.say('crew', 'I would have chased them. I am glad it was not my sheet.');
    return;
  }
  yield s.say('crew', 'Quiet rotation, mostly. Convoys in, ore out, the occasional captain who thinks his papers are optional.');
}

function* dockhand(s: StoryApi): Script {
  if (s.flag('braid')) {
    yield s.say('dockhand', 'The gate guns had them. Everyone saw it. And you let them go.');
    yield s.say('me', 'They left. That was the point.');
    return;
  }
  yield s.say('dockhand', 'The gate guns are older than me. They still go bang. That is usually enough.');
}

function* relief(s: StoryApi): Script {
  yield s.say('relief', s.flag('gd09') ? 'Guard pattern 09. They say it was designed around a doorway. Around you, then.' : 'Relief, as recorded.');
}

/** The watch: a convoy that wants in, a gate that will not open, and an order not taken. */
function* watch(s: StoryApi): Script {
  if (s.flag('braid')) {
    yield s.say('me', 'Shut, and nobody on the other side of it.');
    return;
  }
  s.letterbox(true);
  yield s.fade(true, 0.8);
  s.place('me', OPENING.x + 3, OPENING.z, -Math.PI / 2);
  s.place('officer', OPENING.x + 8, OPENING.z + 4, -Math.PI / 2);
  s.place('dockhand', OPENING.x + 6, OPENING.z - 4, -Math.PI / 2);
  s.music('tension');
  yield s.caption('THIRD NIGHT OF THE ROTATION', 2.2);
  s.cam({ x: OPENING.x + 9, y: 2.2, z: OPENING.z + 5 }, { x: OPENING.x - 30, y: 6, z: OPENING.z - 6 }, true);
  yield s.fade(false, 0.8);
  yield s.say('dockhand', 'Running lights. Four hulls, close together. No convoy on the board for tonight.');
  s.alarm(true);
  yield s.say('master', 'Kettle Gate, we are docking. Clear the opening.');
  yield s.say('me', 'The opening is closed. Show papers or turn.');
  yield s.say('master', 'We have guns.');
  yield s.say('me', 'So does the gate.');
  s.music('danger');
  const a = (yield s.ask('me', 'They are not turning.', ['Hold the opening. Warning shots.', 'Call for orders.'])) as number;
  if (a === 1) {
    yield s.say('me', 'Orders.');
    yield s.say('officer', 'Your sheet says it. Read the last line again.');
    yield s.say('me', 'Holding. Warning shots.');
  } else {
    yield s.say('me', 'Holding. Gate guns, warning shots across the approach. Not into them.');
  }
  s.boom(OPENING.x - 26, OPENING.z - 4, 4, 0.9);
  s.shake(0.1, 0.8);
  yield s.wait(0.7);
  s.boom(OPENING.x - 32, OPENING.z + 6, 6, 0.9);
  s.shake(0.1, 0.8);
  yield s.say('master', 'You will not fire into us.');
  yield s.say('me', 'You will not find out tonight. Turn.');
  yield s.wait(1.4);
  yield s.say('master', 'Turning.');
  s.alarm(false);
  yield s.say('dockhand', 'They are running. The gate guns can still reach them. We could have them.');
  s.shot('me', 'officer');
  yield s.say('officer', 'Your call, watch. Pursue?');
  yield s.say('me', 'Who holds the opening while we chase them?');
  yield s.say('officer', 'Nobody.');
  yield s.say('me', 'Then nobody chases.');
  s.release();
  s.music('calm');
  yield s.fade(true, 1.2);
  s.place('me', R.spawn.x, R.spawn.z + 4, Math.PI);
  s.place('officer', R.spawn.x, R.spawn.z + 7, 0);
  s.place('dockhand', R.people.dockhand.x, R.people.dockhand.z, 0);
  yield s.caption('DAWN  ·  RELIEF RECORDED', 2.2);
  s.cam({ x: R.spawn.x + 5, y: 1.9, z: R.spawn.z + 9 }, { x: R.spawn.x, y: 1.2, z: R.spawn.z + 5.5 }, true);
  yield s.fade(false, 1.0);
  yield s.say('officer', 'Contested docking. Held. No pursuit, no hulls lost, the route closed until relief.');
  s.gesture('officer', 'salute');
  yield s.say('officer', 'Colliery braid. The first one on your sheet.');
  yield s.say('me', 'The first one.');
  yield s.say('officer', 'You say that as if you expect more.');
  yield s.say('me', 'There are three yards. And a lot of nights.');
  s.release();
  s.set('braid');
  yield yearsLater(s);
}

function* yearsLater(s: StoryApi): Script {
  yield s.fade(true, 1.4);
  s.showFrame('gd09', true);
  s.show('relief', true);
  s.place('me', pad.x + 7, pad.z - 3, -Math.PI / 2);
  s.place('relief', pad.x + 9, pad.z + 1, -Math.PI / 2);
  s.set('gd09');
  s.music('hope');
  yield s.caption('KETTLE GATE  ·  YEARS LATER', 2.4);
  yield s.pan(
    [{ x: pad.x + 16, y: 1.4, z: pad.z + 12 }, { x: pad.x, y: 7, z: pad.z }],
    [{ x: pad.x + 12, y: 2.4, z: pad.z + 6 }, { x: pad.x + 4, y: 3.2, z: pad.z }],
    3.0,
  );
  yield s.fade(false, 0);
  s.shot('me', 'relief');
  yield s.say('relief', 'Guard pattern 09, for yard defence. Your sheet goes with it. The last line has not changed.');
  yield s.say('me', 'Then neither have I.');
  s.release();
  s.letterbox(false);
  s.objective('Board GD-09 OBELISK and take the watch.');
}

function* board(s: StoryApi): Script {
  s.letterbox(true);
  s.music('theme');
  yield s.say('me', 'Kettle Gate, watch. The opening is mine until relief.');
  yield s.launch('gd09');
  yield s.narrate('Twenty years on the same three yards. He does not pursue beyond the defence sector.');
  yield s.narrate('The Colliery braid record stands at eleven, each one issued after a contested docking held.');
  yield s.nextTime(
    [
      'Forty-three CE. A Free Latitude frame that never slows down wants through Kettle Gate.',
      'The standing rules allow one flight. The success condition has not changed: the route stays closed.',
    ],
    'CHAPTER 1 · THE ROUTE STAYS CLOSED',
  );
  s.letterbox(false);
  s.complete();
}

export const OBELISK_0: ChapterDef = {
  id: 'obelisk-0',
  pilot: 'obelisk',
  number: 0,
  title: 'THE OPENING',
  region: 'gatewatch',
  start: { x: R.spawn.x, z: R.spawn.z, facing: R.spawn.facing },
  objective: 'Take your duty sheet from the watch officer.',
  noFrame: true,
  music: 'theme',
  actors: [
    { id: 'officer', name: 'WATCH OFFICER', look: 'extra', sex: 'm', seed: 24, suit: 0x3c2a6c, trim: 0xc89cff, x: R.people.watch.x, z: R.people.watch.z, facing: Math.PI },
    { id: 'crew', name: 'WATCH CREW', look: 'extra', sex: 'f', seed: 12, suit: 0x5a5070, trim: 0xc89cff, x: -6, z: -4 },
    { id: 'dockhand', name: 'DOCKHAND', look: 'extra', sex: 'm', seed: 37, suit: 0x5a5070, trim: 0xd8c0ff, x: R.people.dockhand.x, z: R.people.dockhand.z },
    { id: 'relief', name: 'RELIEF PILOT', look: 'extra', sex: 'f', seed: 53, suit: 0x4c4658, trim: 0xc89cff, x: -18, z: -10, hidden: true },
    // Heard on the channel, never seen.
    { id: 'master', name: 'CONVOY MASTER', look: 'extra', sex: 'm', seed: 66, x: -40, z: -30, hidden: true },
  ],
  frames: [{ id: 'gd09', mech: 'obelisk', x: pad.x, z: pad.z, facing: Math.PI / 2, hidden: true }],
  intro,
  talk: { officer, crew, dockhand, relief },
  areas: [
    { id: 'opening', x: OPENING.x, z: OPENING.z, r: 4, prompt: 'STAND THE WATCH', when: 'posted', run: watch },
    { id: 'board', x: pad.x, z: pad.z, r: 5.2, prompt: 'BOARD GD-09 OBELISK', when: 'gd09', run: board },
  ],
};
