import type { ChapterDef, StoryApi } from '../Story';
import type { Script } from '../Script';
import { regionById } from '../Regions';

/**
 * RASA VOLKOV — Prologue: WRITTEN OFF.
 *
 * Canon used: Ashfall registers as a contract force and prices deployment,
 * ammunition, hull loss and mission failure separately; its IN frames are
 * built for short engagements and replacement from contract revenue. Volkov's
 * main gun is effective to 300 metres and the rest of her loadout wants the
 * same close approach; channel recordings show her talking through final
 * entry; her stated position is that delay adds no useful reach. Four PYRE
 * assignments, four hulls written off, the Irregulars' records for hull loss
 * and for completed contracts. Cleaning requisitions stop after the second
 * written-off hull, so here, at the first, her kit is still clean. Mid 20s in
 * 43 CE, so about twenty here. Who the first client was is not said.
 * Everyone but Volkov is a role.
 */

const R = regionById('cinder')!;
const pad = R.pad;
/** The broker's desk, where the channel comes in. */
const DESK = { x: 6, z: -10 };

function* intro(s: StoryApi): Script {
  yield s.fade(true, 0);
  s.letterbox(true);
  s.music('calm');
  yield s.caption('CINDER BERTH  ·  ASHFALL IRREGULARS  ·  38 CE', 2.6);
  s.cam({ x: R.spawn.x - 7, y: 2.0, z: R.spawn.z + 5 }, { x: R.spawn.x, y: 1.2, z: R.spawn.z }, true);
  yield s.fade(false, 1.0);
  yield s.walk('crewA', R.spawn.x - 2.6, R.spawn.z + 0.6);
  s.shot('me', 'crewA');
  yield s.say('crewA', 'Contract pilot? Broker\'s desk, by the hangar. She prices everything. Including you.');
  yield s.say('me', 'Good. Then we will agree.');
  yield s.say('crewA', 'Nice kit. Clean.');
  yield s.say('me', 'It is new.');
  yield s.say('crewA', 'It will not be.');
  s.release();
  yield s.titleCard('PROLOGUE', 'WRITTEN OFF');
  s.letterbox(false);
  s.music('theme');
  s.objective('Sign on with the broker.');
}

function* broker(s: StoryApi): Script {
  if (s.flag('done')) {
    yield s.say('broker', 'Both lines closed. The next contract is already on my desk. There is always a next one.');
    return;
  }
  if (s.flag('signed')) {
    yield s.say('broker', s.flag('margins') ? 'Your first contract is fuelled and waiting. Board when you like.' : 'The hangar chief has your hull. Accounts want you after.');
    return;
  }
  s.shot('me', 'broker');
  yield s.say('broker', 'Ashfall prices every risk separately. Deployment. Ammunition. Hull loss. Mission failure. Each is a line.');
  yield s.say('me', 'And the pilot?');
  yield s.say('broker', 'The pilot is the line that does not come back cheaper.');
  const a = (yield s.ask('broker', 'Sign, or ask.', ['Ask about hull loss first.', 'Sign.'])) as number;
  if (a === 0) {
    yield s.say('me', 'Hull loss.');
    yield s.say('broker', 'Priced on its own. You can lose a hull and still complete the contract. The ledger keeps both.');
    yield s.say('me', 'Then I will try to keep both lines short.');
  }
  yield s.say('broker', 'Signed. Welcome to the Irregulars. We have no uniform allowance.');
  yield s.say('me', 'I brought my own.');
  s.release();
  s.set('signed');
  s.objective('See the hangar chief about your hull.');
}

function* chief(s: StoryApi): Script {
  if (s.flag('done')) {
    yield s.say('chief', 'The spar is cracked through. I will put the hull number on the wall. People here like to count.');
    return;
  }
  if (!s.flag('signed')) {
    yield s.say('chief', 'Signed on yet? Broker first. I do not hand frames to strangers. Only to people with a contract.');
    return;
  }
  if (s.flag('hull')) {
    yield s.say('chief', 'She is yours. Bring her back. Or bring back enough of her to write off properly.');
    return;
  }
  s.shot('me', 'chief');
  yield s.say('chief', 'IN-05. Built for short engagements and replacement from contract revenue. She is not built to last. She is built to be paid for.');
  yield s.say('chief', 'Main gun is effective to three hundred metres. Everything else on her wants you closer.');
  yield s.say('me', 'Then I fly closer.');
  yield s.say('chief', 'Everybody says that until they get there.');
  s.release();
  s.set('hull');
  s.objective('Accounts want a word about margins.');
}

function* accounts(s: StoryApi): Script {
  if (s.flag('done')) {
    yield s.say('accounts', 'Requisition for kit cleaning, logged. You will be the only pilot on the berth with one in.');
    return;
  }
  if (!s.flag('hull')) {
    yield s.say('accounts', 'Margins after hulls. That is the order things go in.');
    return;
  }
  if (s.flag('margins')) {
    yield s.say('accounts', 'Fly the contract. The numbers will tell me what you are.');
    return;
  }
  s.shot('me', 'accounts');
  yield s.say('accounts', 'Every hundred metres closer costs us armour and earns us hit rate. Most pilots stop at four hundred.');
  yield s.say('me', 'Why.');
  yield s.say('accounts', 'Because four hundred feels safe.');
  yield s.say('me', 'Delay adds no useful reach.');
  yield s.say('accounts', 'We do not have a column for that.');
  yield s.say('me', 'You will.');
  s.release();
  s.set('margins');
  s.objective('Board IN-05 PYRE for your first contract.');
}

function* crewA(s: StoryApi): Script {
  yield s.say('crewA', s.flag('done') ? 'First hull. Everyone remembers their first hull. Most people remember it because it was their last.' : 'Broker. Hangar. Accounts. In that order. Then the fun part.');
}

function* crewB(s: StoryApi): Script {
  if (s.flag('done')) {
    yield s.say('crewB', 'You walked out of that talking. The recording has you talking the whole way in.');
    yield s.say('me', 'The client paid for a complete record.');
    return;
  }
  yield s.say('crewB', 'They say you asked accounts what four hundred metres is for.');
}

/** The first contract, heard on the channel at the desk; then the hull comes home burning. */
function* contract(s: StoryApi): Script {
  if (!s.flag('margins')) {
    yield s.say('me', 'Broker, hangar, accounts. Then the fun part.');
    return;
  }
  if (s.flag('done')) {
    yield s.say('me', 'Written off. She did the job.');
    return;
  }
  s.letterbox(true);
  s.show('me', false);
  s.music('theme');
  yield s.launch();
  // The berth hears it on the desk channel.
  s.place('broker', DESK.x, DESK.z, Math.PI);
  s.place('accounts', DESK.x + 2.2, DESK.z + 1, -Math.PI * 0.75);
  s.cam({ x: DESK.x + 5, y: 2.0, z: DESK.z + 5 }, { x: DESK.x, y: 1.2, z: DESK.z }, true);
  s.music('danger');
  yield s.wait(1.0);
  yield s.say('me', 'Four hundred. Three fifty. Closing.');
  s.sound('boom');
  yield s.say('broker', 'Volkov, you are taking fire.');
  yield s.say('me', 'I know. It is cheaper at this range.');
  yield s.say('me', 'Three hundred. Two hundred. I am talking you through it so the recording is complete.');
  yield s.say('broker', 'The client asked for the target. Not the commentary.');
  s.sound('bigboom');
  s.shake(0.05, 0.8);
  yield s.say('me', 'You are getting both. Target is down.');
  yield s.wait(0.8);
  yield s.say('me', 'Left side is gone. Coming home on what is left.');
  s.alarm(true);
  // The hull comes in low over the berth, burning.
  s.cam({ x: pad.x + 14, y: 2.4, z: pad.z - 10 }, { x: pad.x, y: 3, z: pad.z }, true);
  yield s.wait(0.8);
  s.flash();
  s.showFrame('frame', true);
  s.boom(pad.x, pad.z, 2, 1.1);
  s.shake(0.2, 1.4);
  yield s.wait(0.7);
  s.boom(pad.x - 2, pad.z + 2, 4, 0.6);
  yield [s.walk('crewA', pad.x + 5, pad.z - 3, true), s.walk('crewB', pad.x + 6, pad.z + 2, true), s.walk('chief', pad.x + 6.5, pad.z - 0.5, true)];
  s.boom(pad.x + 1, pad.z - 1, 3, 0.4);
  s.place('me', pad.x + 3.5, pad.z - 1, Math.PI / 2);
  s.show('me', true);
  yield s.walk('me', pad.x + 8.5, pad.z - 1.5);
  s.alarm(false);
  s.music('calm');
  s.shot('me', 'chief');
  yield s.say('chief', 'Spar is cracked through. Reactor housing is open. She is gone.');
  yield s.say('me', 'She did the job.');
  s.release();
  yield [s.walk('broker', pad.x + 11, pad.z - 4), s.walk('accounts', pad.x + 12, pad.z - 1)];
  s.shot('me', 'accounts');
  yield s.say('accounts', 'Hull written off. Contract complete. Both in the same ledger.');
  yield s.say('broker', 'Both lines.');
  yield s.say('me', 'Then the ledger balances.');
  s.gesture('me', 'look');
  yield s.say('me', 'And put in a cleaning requisition for the kit. Soot does not come out on its own.');
  yield s.say('accounts', 'Logged.');
  s.release();
  s.set('done');
  yield s.narrate('Cleaning requisitions stop after her second written-off hull.');
  yield s.narrate('Four PYRE assignments are entered against her name now, and four hulls written off: the Irregulars\' record for hull loss, and their record for completed contracts.');
  yield s.nextTime(
    [
      'Forty-three CE. Two envelopes on one desk. Emberline wants a convoy escorted to one of the thirteen; Ironwake wants the same lane shut for the season.',
      'Ironwake has already put a walker on it.',
    ],
    'CHAPTER 1 · WITHIN TERMS',
  );
  s.letterbox(false);
  s.complete();
}

export const PYRE_0: ChapterDef = {
  id: 'pyre-0',
  pilot: 'pyre',
  number: 0,
  title: 'WRITTEN OFF',
  region: 'cinder',
  start: { x: R.spawn.x, z: R.spawn.z, facing: R.spawn.facing },
  objective: 'Sign on with the broker.',
  music: 'theme',
  actors: [
    { id: 'broker', name: 'THE BROKER', look: 'extra', sex: 'f', seed: 11, suit: 0x2a2020, trim: 0xff7a2a, x: R.people.broker.x, z: R.people.broker.z, facing: Math.PI / 2 },
    { id: 'chief', name: 'HANGAR CHIEF', look: 'extra', sex: 'm', seed: 49, suit: 0x38302c, trim: 0xff9a3a, x: pad.x + 7, z: pad.z - 4, facing: -Math.PI / 2 },
    { id: 'accounts', name: 'ACCOUNTS CLERK', look: 'extra', sex: 'm', seed: 27, suit: 0x1e1a18, trim: 0xff7a2a, x: 14, z: 2, facing: Math.PI / 2 },
    { id: 'crewA', name: 'ASHFALL CREW', look: 'extra', sex: 'm', seed: 4, suit: 0x5a3020, trim: 0xff9a3a, x: R.people.crewA.x, z: R.people.crewA.z },
    { id: 'crewB', name: 'ASHFALL CREW', look: 'extra', sex: 'f', seed: 9, suit: 0x4a2a1c, trim: 0xff7a2a, x: R.people.crewB.x, z: R.people.crewB.z, facing: Math.PI },
  ],
  intro,
  talk: { broker, chief, accounts, crewA, crewB },
  areas: [{ id: 'frame', x: pad.x, z: pad.z, r: 5.2, prompt: 'BOARD IN-05 PYRE', run: contract }],
};
