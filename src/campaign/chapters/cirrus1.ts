import { Difficulty } from '../../core/Session';
import type { ChapterDef, StoryApi } from '../Story';
import type { Script } from '../Script';
import { regionById } from '../Regions';

/**
 * MIRA HOLLOWAY — Chapter 1: THREE WRECKS AND A REACTOR.
 *
 * Canon used: Holloway is yard-born at Brightwake and built her first LT-21 at
 * seventeen from three wrecks and a stolen reactor. Her hull-loss account is
 * still open: two reactor removals, more than one replacement spar, and sheets
 * that cannot tell a rebuilt frame from a new one. The eight-hit dagger
 * sequence is her revision; Concord called it impractical, and the margin says
 * they tested it wrong. Her margin calculation: the frame gains nothing by
 * slowing down, because its armour cannot carry an exchange. Free Latitude is
 * "pirates" in Concord's enforcement notices and "authorised visitors" in its
 * docking returns, both current. Convoy seizures have resumed this season.
 * NULLTIDE: STATIC's false silhouette, cold and electrical payloads, a baton
 * once the target is slowed; Senna lets retreating opponents go, and pilots
 * who fight her describe being catalogued. Senna does not appear on foot.
 * Everyone else is a role.
 */

const R = regionById('brightwake')!;
const pad = R.pad;
/** Open deck short of the pad, where the trader waits to watch the ruling come in. */
const watch = { x: 18, z: 18 };

function* intro(s: StoryApi): Script {
  yield s.fade(true, 0);
  yield s.caption('BRIGHTWAKE  ·  FREE LATITUDE  ·  43 CE', 2.6);
  yield s.fade(false, 1.2);
  // The dock steward comes over from the berth office with a charge sheet.
  yield s.walk('steward', R.spawn.x - 2.2, R.spawn.z - 0.6);
  s.shot('me', 'steward');
  yield s.say('steward', 'Holloway. A word, when you have one. It is about your account.');
  yield s.say('me', 'I have lots of words. I do not have an account.');
  yield s.say('steward', 'You have had a hull-loss account open since you were seventeen. It has never once had a total.');
  yield s.say('me', 'Then it is the most consistent thing on Brightwake. Go on, read it to me.');
  s.release();
  s.objective('Talk to the dock steward.');
}

function* steward(s: StoryApi): Script {
  if (s.flag('account_read')) {
    if (s.flag('challenged')) {
      yield s.say('steward', 'Concord\'s docking return calls you an authorised visitor this month. The enforcement notice calls you a pirate.');
      yield s.say('me', 'Both current. It is good to have options.');
    } else {
      yield s.say('steward', 'The trader is on the market deck, by the stalls. She will not sell it to whoever shouts loudest. I asked.');
    }
    return;
  }
  s.shot('me', 'steward');
  yield s.say('steward', 'Two reactor removals. More replacement spars than the sheet has lines for. Repairs on every page.');
  yield s.say('steward', 'And not one entry says whether it is the same frame or a new one.');
  yield s.say('me', 'Same frame. Most of the parts are new, but it is the same frame. WISP would tell you.');
  yield s.say('steward', 'WISP is a drone.');
  yield s.say('me', 'WISP keeps better records than the dock office. No offence.');
  const pick = (yield s.ask('steward', 'The office wants a hull-loss total this season. What do I write?', ['Leave it blank.', 'Write "ongoing".', 'Write "none".'])) as number;
  if (pick === 0) {
    yield s.say('me', 'Leave it blank. Every LT-21 sheet I have seen has a blank in it somewhere. It is practically the pattern.');
    yield s.say('steward', 'It is a field. Fields are for filling.');
    s.set('left_blank');
  } else {
    yield s.say('me', pick === 1 ? 'Ongoing. It is accurate, and nobody can argue with it.' : 'None. Nothing was lost. It was all put back in a different order.');
    yield s.say('steward', 'I will write it. Nobody will believe it.');
  }
  yield s.say('steward', 'One more thing. The reactor the tow crews brought in at first light is on the market deck.');
  yield s.say('me', 'I watched it come in. Clean core. Scorched housing, one side only.');
  yield s.say('steward', 'Two pilots want it, and the trader wants to keep her stall. See her before it turns into a case.');
  yield s.say('me', 'Everything turns into a case this season.');
  s.release();
  s.set('account_read');
  s.objective('Find the trader on the market deck.');
}

function* trader(s: StoryApi): Script {
  if (s.flag('challenged')) {
    if (s.flag('lost_once')) {
      yield s.say('trader', 'Still mine to sell. The board allows a second flight. Fly it when you are ready.');
    } else {
      yield s.say('trader', 'The board has the case and the reactor has a cloth over it. Go and fly.');
    }
    return;
  }
  if (!s.flag('account_read')) {
    yield s.say('trader', 'Holloway. The steward has been at your berth twice with a sheet. See him first, then come and see me.');
    return;
  }
  s.shot('me', 'trader');
  yield s.say('trader', 'There she is. Hauler reactor, off a wreck the tow crews found on the outer spars.');
  yield s.say('trader', 'Convoys are being taken again. Wrecks come in faster than I can price them.');
  yield s.say('me', 'The scorching is on one side only, so it sat beside a fire, not in one. The core will be fine. I will take it.');
  yield s.say('trader', 'Paid for, this time?');
  yield s.say('me', 'Paid for. I was seventeen. I have grown enormously as a person.');
  yield s.say('trader', 'You and one other. Same price, same hour. The other offer came from the end berth.');
  yield s.say('me', 'The EW berth. You can say her name. She is not on the deck.');
  yield s.say('trader', 'Nobody on this deck says that name. It is bad for prices.');
  yield s.say('me', 'Io Senna. NULLTIDE. Prices look fine to me.');
  yield s.say('trader', 'I do not choose between pilots. I would like to keep my stall. So I filed it with the board.');
  yield s.say('trader', 'Standing rules: one sanctioned flight at Cathedral Yard. The winner pays me. The loser buys elsewhere.');
  yield s.say('me', 'Fair. I will go and warm the frame.');
  yield s.say('trader', 'I will come down to your berth for the ruling. I want to see somebody\'s face when it comes in.');
  s.release();
  s.set('challenged');
  s.objective('Go to your frame and fly the sanctioned flight.');
  // She heads down to the berths to watch. Nobody waits for her to get there.
  void s.walk('trader', watch.x, watch.z);
}

function* mechanic(s: StoryApi): Script {
  if (!s.flag('challenged')) {
    yield s.say('mechanic', 'Daggers are fitted to your revision. Eight hits, not four. Concord still calls it impractical.');
    yield s.say('me', 'Concord tested it wrong. I put that in the margin of every copy.');
    return;
  }
  if (s.flag('briefed')) {
    yield s.say('mechanic', 'WISP is charged. String the line, put her between you, pull it through.');
    yield s.say('me', 'Cross once, pull through. If it turns into a tether, break away. Some of us read the sheet.');
    return;
  }
  s.shot('me', 'mechanic');
  yield s.say('mechanic', 'NULLTIDE, then. Her drone throws a second silhouette. You will see two of her.');
  yield s.say('me', 'Three, with STATIC itself. Only one turns like it has a reactor behind it. That is the one I cut.');
  yield s.say('mechanic', 'And the cold rounds? They slow you down, then the baton comes out.');
  yield s.say('me', 'Cold only works on something that stays still. Commit early, go through, leave on boost before it settles.');
  yield s.say('mechanic', 'You have armour for about one mistake.');
  yield s.say('me', 'So I do the sums before, not after. The armour cannot carry an exchange, so I do not have exchanges.');
  s.release();
  s.set('briefed');
}

function* frame(s: StoryApi): Script {
  if (!s.flag('challenged')) {
    yield s.say('me', 'Nothing to fly for yet. The steward first, then the market deck.');
    return;
  }
  const how = (yield s.ask('me', 'Fly the sanctioned flight against Senna?', ['Fly it in the open (FREE ORBIT)', 'Fly it on the plate', 'Not yet'])) as number;
  if (how === 2) return;
  yield s.fade(true, 0.6);
  const result = (yield s.battle({ foe: 'nulltide', difficulty: Difficulty.Normal, mode: how === 0 ? 'orbit' : 'versus' })) as 'win' | 'lose';
  yield s.fade(false, 0.8);
  if (result === 'lose') {
    s.set('lost_once');
    yield s.say('me', 'She stopped firing the second I had nothing left to answer with. Polite. Annoying.');
    yield s.say('me', 'Shorter run-in, earlier commit. Again.');
    s.objective('Fly the sanctioned flight again when ready.');
    return;
  }
  // The trader comes over to the pad with the ruling.
  yield s.walk('trader', pad.x + 5, pad.z - 1.5);
  s.shot('me', 'trader');
  yield s.say('trader', 'The board has ruled. The reactor is yours, once you have paid for it.');
  yield s.say('me', 'Once I have paid for it. Yes. Obviously.');
  yield s.say('trader', 'The board record says NULLTIDE withdrew within the rules once the count went against her. No last pass.');
  yield s.say('me', 'I turned away once to reset and she let me go. Did not chase. I would have chased me.');
  yield s.say('me', 'Flying against her is like being written down. Every hit, in order. I would like to read what she wrote.');
  if (s.flag('left_blank')) {
    yield s.say('trader', 'The steward says your account is still blank at the bottom. He has stopped sighing about it.');
  } else {
    yield s.say('trader', 'The steward has put what you told him on your account. Nobody believes it.');
  }
  yield s.say('me', 'Put the reactor on it. The account stays open. He likes having something to write.');
  s.release();
  s.unlock('nulltide');
  s.complete();
}

export const CIRRUS_1: ChapterDef = {
  id: 'cirrus-1',
  pilot: 'cirrus',
  number: 1,
  title: 'THREE WRECKS AND A REACTOR',
  region: 'brightwake',
  start: { x: R.spawn.x, z: R.spawn.z, facing: R.spawn.facing },
  objective: 'Talk to the dock steward.',
  actors: [
    { id: 'steward', name: 'DOCK STEWARD', look: 'extra', sex: 'm', seed: 23, suit: 0x3a4250, trim: 0x3ee0ff, x: R.people.steward.x, z: R.people.steward.z, facing: -Math.PI / 2 },
    { id: 'trader', name: 'TRADER', look: 'extra', sex: 'f', seed: 31, suit: 0x6a5e52, trim: 0xffc070, x: R.people.trader.x, z: R.people.trader.z, facing: 0 },
    {
      id: 'mechanic', name: 'MECHANIC', look: 'extra', sex: 'm', seed: 47, suit: 0x6a5e52, trim: 0xff5a8a,
      x: R.people.mechanic.x, z: R.people.mechanic.z, facing: Math.atan2(pad.x - R.people.mechanic.x, pad.z - R.people.mechanic.z),
    },
  ],
  intro,
  talk: { steward, trader, mechanic },
  areas: [{ id: 'frame', x: pad.x, z: pad.z, r: 5.2, prompt: 'BOARD LT-21 CIRRUS', run: frame }],
  features: ['nulltide'],
};
