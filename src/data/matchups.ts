/**
 * Matchup dialogue: what these two specific pilots say to each other.
 *
 * The reactive banter in `banter.ts` is a pilot talking to nobody — it fires on
 * a combo or a burnout and does not care who is opposite. This is the other
 * half: a short exchange at the top of the round, written for the pair.
 *
 * Every unordered pair has **five** conversations, including the eight mirror
 * matches, so a rematch does not replay the same opening. Two lines each: one
 * pilot opens, the other answers. That is the shape of a fighting-game intro,
 * and it is short enough to finish before the round does.
 *
 * Factions give the writing something to push against — CONCORD SKYWARD pairs
 * VESK with DOYNE, IRONWAKE COLLIERY pairs OKONKWO with TENGKU, FREE LATITUDE
 * pairs HOLLOWAY with SENNA, and ROOK and VOLKOV answer to nobody.
 */

export interface Exchange {
  /** Mech id of whoever is speaking. */
  who: string;
  line: string;
}

export type Conversation = readonly Exchange[];

/** Two mech ids, sorted and joined, so lookup does not care who is player one. */
export function matchupKey(a: string, b: string): string {
  return a <= b ? `${a}|${b}` : `${b}|${a}`;
}

const C = (who: string, line: string): Exchange => ({ who, line });

/** Keyed by `matchupKey`. */
export const MATCHUPS: Record<string, readonly Conversation[]> = {
  // ---------------------------------------------------------------- cirrus
  'cirrus|cirrus': [
    [C('cirrus', 'Wait, are you me? That is so cool.'), C('cirrus', 'I am the faster one, obviously.')],
    [C('cirrus', 'Whoever is slower buys the drinks.'), C('cirrus', 'Then you are already paying.')],
    [C('cirrus', 'Two of us. The sky is not ready.'), C('cirrus', 'It really is not.')],
    [C('cirrus', 'Do not scratch the paint!'), C('cirrus', 'It is MY paint too, you know.')],
    [C('cirrus', 'This is going to be so fast.'), C('cirrus', 'Try to keep up with yourself.')],
  ],
  'cirrus|halcyon': [
    [C('halcyon', 'Free Latitude. You are a long way out.'), C('cirrus', 'That is sort of the point!')],
    [C('cirrus', 'Ooh, a Concord ace. Fancy.'), C('halcyon', 'Fancy, and considerably older than you.')],
    [C('halcyon', 'Your frame has no armour on it at all.'), C('cirrus', 'Armour is for people who get hit.')],
    [C('cirrus', 'Bet I can get behind you twice.'), C('halcyon', 'You may try once.')],
    [C('halcyon', 'Discipline beats enthusiasm.'), C('cirrus', 'Not if enthusiasm is quicker!')],
  ],
  'cirrus|nocturne': [
    [C('nocturne', 'You are half my age and a third my weight.'), C('cirrus', 'And twice your speed, grandpa!')],
    [C('cirrus', 'That thing is enormous.'), C('nocturne', 'So is the hole it makes.')],
    [C('nocturne', 'Hold still and this is quick.'), C('cirrus', 'Counter-offer: no.')],
    [C('cirrus', 'How do you even turn in that?'), C('nocturne', 'I do not. I wait.')],
    [C('nocturne', 'Emberline against Free Latitude. Again.'), C('cirrus', 'You lot always look so tired.')],
  ],
  'cirrus|nulltide': [
    [C('cirrus', 'Io! Go easy on me, we are on the same side.'), C('nulltide', 'Today we are not. Beginning.')],
    [C('nulltide', 'Your telemetry is unusually erratic.'), C('cirrus', 'That is called improvising!')],
    [C('cirrus', 'Say something encouraging.'), C('nulltide', 'You have a nonzero chance.')],
    [C('nulltide', 'I have modelled you eleven thousand times.'), C('cirrus', 'Model this!')],
    [C('cirrus', 'Free Latitude versus Free Latitude. Weird.'), C('nulltide', 'Instructive. Hold still.')],
  ],
  'cirrus|obelisk': [
    [C('obelisk', 'You will tire before I move.'), C('cirrus', 'Then I will tire happy!')],
    [C('cirrus', 'It is a wall. A big purple wall.'), C('obelisk', 'Walls have their uses.')],
    [C('obelisk', 'Patience, child.'), C('cirrus', 'Never heard of her!')],
    [C('cirrus', 'Something in there has to be soft.'), C('obelisk', 'Find it, then.')],
    [C('obelisk', 'Ironwake does not chase.'), C('cirrus', 'Lucky, because you could not.')],
  ],
  'cirrus|pyre': [
    [C('pyre', 'Little silver one! Come closer!'), C('cirrus', 'Absolutely not, you are on fire.')],
    [C('cirrus', 'Is that smoke supposed to happen?'), C('pyre', 'It is my favourite part!')],
    [C('pyre', 'You are so shiny. I want to fix that.'), C('cirrus', 'Please do not fix me.')],
    [C('cirrus', 'You are the fun kind of scary.'), C('pyre', 'Thank you! Hold still!')],
    [C('pyre', 'Let us see if silver melts.'), C('cirrus', 'Let us see if you can catch me!')],
  ],
  'cirrus|terramoth': [
    [C('terramoth', 'Mind the site. Heavy plant moving.'), C('cirrus', 'I will go around! And over!')],
    [C('cirrus', 'You brought a building to a dogfight.'), C('terramoth', 'The building usually wins.')],
    [C('terramoth', 'Do not get under the feet.'), C('cirrus', 'Where else is there?')],
    [C('cirrus', 'Does it come in small?'), C('terramoth', 'No. That is the idea.')],
    [C('terramoth', 'Steady hands beat quick ones.'), C('cirrus', 'Not today they do not!')],
  ],
  'cirrus|vesper': [
    [C('vesper', 'Range. Hold range.'), C('cirrus', 'No! Closing! Closing now!')],
    [C('cirrus', 'You have not blinked once.'), C('vesper', 'I am working.')],
    [C('vesper', 'Erratic. Difficult.'), C('cirrus', 'That is the nicest thing anyone said today.')],
    [C('cirrus', 'Say more than four words. Go on.'), C('vesper', 'No.')],
    [C('vesper', 'You will come to me eventually.'), C('cirrus', 'Yes, but very fast!')],
  ],

  // --------------------------------------------------------------- halcyon
  'halcyon|halcyon': [
    [C('halcyon', 'A mirror. How instructive.'), C('halcyon', 'For one of us.')],
    [C('halcyon', 'You have my bad habits too, then.'), C('halcyon', 'I have fewer.')],
    [C('halcyon', 'We both know the opening.'), C('halcyon', 'Then it comes down to nerve.')],
    [C('halcyon', 'Concord protocol says stand down.'), C('halcyon', 'Concord protocol is not here.')],
    [C('halcyon', 'This will be tidy.'), C('halcyon', 'Or very ugly. Begin.')],
  ],
  'halcyon|nocturne': [
    [C('nocturne', 'Concord sent their best. Flattering.'), C('halcyon', 'They sent someone adequate. Me.')],
    [C('halcyon', 'You are slower than the file said.'), C('nocturne', 'The file is old. So am I.')],
    [C('nocturne', 'I fought your instructors, girl.'), C('halcyon', 'And here you are, still fighting.')],
    [C('halcyon', 'Emberline colours. This is overdue.'), C('nocturne', 'Long overdue. Come on.')],
    [C('nocturne', 'Do not lecture me mid-fight.'), C('halcyon', 'Then do not make it so easy.')],
  ],
  'halcyon|nulltide': [
    [C('nulltide', 'Concord Skyward. Predictable doctrine.'), C('halcyon', 'Effective doctrine.')],
    [C('halcyon', 'My instruments are already lying.'), C('nulltide', 'Yes. That is me.')],
    [C('nulltide', 'You rely on your sensors.'), C('halcyon', 'I rely on my eyes. Watch.')],
    [C('halcyon', 'Say something human. Anything.'), C('nulltide', 'Engagement begins in three.')],
    [C('nulltide', 'I would like a clean data set.'), C('halcyon', 'You will get a clean loss.')],
  ],
  'halcyon|obelisk': [
    [C('obelisk', 'You will have to come to me.'), C('halcyon', 'I intended to.')],
    [C('halcyon', 'Ironwake builds them stubborn.'), C('obelisk', 'Ironwake builds them lasting.')],
    [C('obelisk', 'I have out-waited better pilots.'), C('halcyon', 'You have not out-waited me.')],
    [C('halcyon', 'That shield has a seam. I will find it.'), C('obelisk', 'Many have looked.')],
    [C('obelisk', 'Take your time. I am not going anywhere.'), C('halcyon', 'Neither, shortly, are you.')],
  ],
  'halcyon|pyre': [
    [C('pyre', 'Ooh, a clean one. Let us fix that.'), C('halcyon', 'Stay downwind of me.')],
    [C('halcyon', 'Ashfall Irregulars. Emphasis on irregular.'), C('pyre', 'Emphasis on ash!')],
    [C('pyre', 'Do you ever set anything on fire?'), C('halcyon', 'Only when it is necessary.')],
    [C('halcyon', 'Your frame is barely airworthy.'), C('pyre', 'It only has to last the fight!')],
    [C('pyre', 'You look expensive. I love that.'), C('halcyon', 'Do not touch it.')],
  ],
  'halcyon|terramoth': [
    [C('terramoth', 'I have no quarrel with Concord.'), C('halcyon', 'Then step aside.')],
    [C('halcyon', 'That is a mining rig with guns on it.'), C('terramoth', 'It is. It still works.')],
    [C('terramoth', 'You fly well. Truly.'), C('halcyon', 'Thank you. That changes nothing.')],
    [C('halcyon', 'You cannot catch me.'), C('terramoth', 'I do not need to catch you.')],
    [C('terramoth', 'Mind the debris. It is heavy.'), C('halcyon', 'So is the point you are making.')],
  ],
  'halcyon|vesper': [
    [C('halcyon', 'Kestrel. Concord against Concord.'), C('vesper', 'Orders are orders.')],
    [C('vesper', 'I know your habits, Naia.'), C('halcyon', 'And I know your firing line.')],
    [C('halcyon', 'You will hold at range. You always do.'), C('vesper', 'It always works.')],
    [C('vesper', 'Do not make me do this.'), C('halcyon', 'Then miss on purpose.')],
    [C('halcyon', 'Same colours. Same drills.'), C('vesper', 'Different outcome.')],
  ],

  // -------------------------------------------------------------- nocturne
  'nocturne|nocturne': [
    [C('nocturne', 'You look like a bad morning.'), C('nocturne', 'You look like the mirror agrees.')],
    [C('nocturne', 'Two old frames. This will be slow.'), C('nocturne', 'And loud.')],
    [C('nocturne', 'I know every trick you have.'), C('nocturne', 'Then we will need new ones.')],
    [C('nocturne', 'Emberline against Emberline. Ugly.'), C('nocturne', 'It always was.')],
    [C('nocturne', 'One of us should have retired.'), C('nocturne', 'Both of us should have.')],
  ],
  'nocturne|nulltide': [
    [C('nulltide', 'Your reaction time is documented.'), C('nocturne', 'So is my right hook.')],
    [C('nocturne', 'You are jamming me already.'), C('nulltide', 'Yes. Continue anyway.')],
    [C('nulltide', 'Age has cost you two tenths.'), C('nocturne', 'Experience bought them back.')],
    [C('nocturne', 'Do you ever get angry?'), C('nulltide', 'No. It is inefficient.')],
    [C('nulltide', 'You are a very large target.'), C('nocturne', 'And a very hard one.')],
  ],
  'nocturne|obelisk': [
    [C('obelisk', 'Two heavy frames. Nobody moves.'), C('nocturne', 'Then nobody leaves.')],
    [C('nocturne', 'Put the shield down and fight.'), C('obelisk', 'The shield is how I fight.')],
    [C('obelisk', 'This will take a while.'), C('nocturne', 'I have nowhere to be.')],
    [C('nocturne', 'Ironwake makes good armour.'), C('obelisk', 'Emberline makes good scars.')],
    [C('obelisk', 'I can stand here all day.'), C('nocturne', 'I can hit you all day.')],
  ],
  'nocturne|pyre': [
    [C('pyre', 'Big red one! You are already my favourite!'), C('nocturne', 'Do not get attached.')],
    [C('nocturne', 'You are going to hurt yourself.'), C('pyre', 'Probably! Worth it!')],
    [C('pyre', 'Does the armour cook nicely?'), C('nocturne', 'Try it and find out.')],
    [C('nocturne', 'Ashfall. Bandits with a flag.'), C('pyre', 'Bandits with a very good flag!')],
    [C('pyre', 'Grumpy suits you!'), C('nocturne', 'It has had years of practice.')],
  ],
  'nocturne|terramoth': [
    [C('terramoth', 'Emberline. I hauled ore past your lines.'), C('nocturne', 'And I let you.')],
    [C('nocturne', 'A working man. I respect that.'), C('terramoth', 'Respect me from further away.')],
    [C('terramoth', 'Neither of us is quick.'), C('nocturne', 'Neither of us needs to be.')],
    [C('nocturne', 'That rig was not built for this.'), C('terramoth', 'Neither was I. Here we are.')],
    [C('terramoth', 'Make it clean. I have a shift after.'), C('nocturne', 'No promises.')],
  ],
  'nocturne|vesper': [
    [C('vesper', 'Large. Slow. Ideal.'), C('nocturne', 'Come closer and say that.')],
    [C('nocturne', 'Snipers. Cowards with good eyes.'), C('vesper', 'Cowards who go home.')],
    [C('vesper', 'I have your range already.'), C('nocturne', 'You will need it twice.')],
    [C('nocturne', 'One good hit ends you.'), C('vesper', 'Then do not miss.')],
    [C('vesper', 'Holding.'), C('nocturne', 'Hold longer. I am coming.')],
  ],

  // -------------------------------------------------------------- nulltide
  'nulltide|nulltide': [
    [C('nulltide', 'A perfect control group.'), C('nulltide', 'Then the result is meaningless.')],
    [C('nulltide', 'You will do exactly what I would.'), C('nulltide', 'Which is why I will not.')],
    [C('nulltide', 'Both jamming. Both blind.'), C('nulltide', 'Instructive.')],
    [C('nulltide', 'I dislike this.'), C('nulltide', 'You are not supposed to feel that.')],
    [C('nulltide', 'Beginning the observation.'), C('nulltide', 'Beginning the observation.')],
  ],
  'nulltide|obelisk': [
    [C('obelisk', 'You will unpick my barrier.'), C('nulltide', 'Yes. Slowly.')],
    [C('nulltide', 'Your defence is admirably dull.'), C('obelisk', 'Thank you.')],
    [C('obelisk', 'I do not need sensors to hold ground.'), C('nulltide', 'A relevant advantage. Noted.')],
    [C('nulltide', 'This will take longer than I would like.'), C('obelisk', 'Good.')],
    [C('obelisk', 'Patience against patience.'), C('nulltide', 'I have more processing.')],
  ],
  'nulltide|pyre': [
    [C('pyre', 'You are so quiet! Say something!'), C('nulltide', 'Something.')],
    [C('nulltide', 'Your behaviour resists modelling.'), C('pyre', 'That means I am winning!')],
    [C('pyre', 'Do you ever smile?'), C('nulltide', 'Not usefully.')],
    [C('nulltide', 'Fire suppression, please.'), C('pyre', 'Denied! Denied forever!')],
    [C('pyre', 'I am going to warm you up!'), C('nulltide', 'I would rather you did not.')],
  ],
  'nulltide|terramoth': [
    [C('terramoth', 'You will scramble my instruments.'), C('nulltide', 'Already done.')],
    [C('nulltide', 'Your frame is loud on every band.'), C('terramoth', 'It is loud on every band by design.')],
    [C('terramoth', 'I do not need to see you to hit you.'), C('nulltide', 'That is the difficulty. Yes.')],
    [C('nulltide', 'Mass over subtlety. Crude.'), C('terramoth', 'Effective, though.')],
    [C('terramoth', 'Say when.'), C('nulltide', 'When.')],
  ],
  'nulltide|vesper': [
    [C('vesper', 'You will blind me.'), C('nulltide', 'That is the plan, yes.')],
    [C('nulltide', 'A marksman without optics is a rifle.'), C('vesper', 'A rifle still works.')],
    [C('vesper', 'Quiet suits us both.'), C('nulltide', 'Then we need not speak again.')],
    [C('nulltide', 'Your breathing is on my telemetry.'), C('vesper', 'Then you are too close.')],
    [C('vesper', 'Holding. Watching.'), C('nulltide', 'Watching back.')],
  ],

  // --------------------------------------------------------------- obelisk
  'obelisk|obelisk': [
    [C('obelisk', 'Neither of us will move first.'), C('obelisk', 'Then we will be here a while.')],
    [C('obelisk', 'Two shields. One doorway.'), C('obelisk', 'Someone has to give.')],
    [C('obelisk', 'You know this is unwinnable.'), C('obelisk', 'So does the clock.')],
    [C('obelisk', 'Ironwake trained us the same.'), C('obelisk', 'Then patience decides it.')],
    [C('obelisk', 'After you.'), C('obelisk', 'No. After you.')],
  ],
  'obelisk|pyre': [
    [C('pyre', 'A big purple door! I have a key!'), C('obelisk', 'It is not that kind of door.')],
    [C('obelisk', 'You will burn yourself out on me.'), C('pyre', 'What a way to go!')],
    [C('pyre', 'Everything burns eventually!'), C('obelisk', 'Eventually is a long time.')],
    [C('obelisk', 'Calm down.'), C('pyre', 'Absolutely not!')],
    [C('pyre', 'I will get through. Watch.'), C('obelisk', 'I will. Closely.')],
  ],
  'obelisk|terramoth': [
    [C('terramoth', 'Saar. They put us against each other.'), C('obelisk', 'They usually do.')],
    [C('obelisk', 'Same colliery. Same stubbornness.'), C('terramoth', 'Aye. This will be dull.')],
    [C('terramoth', 'Do not hold back for my sake.'), C('obelisk', 'I would not insult you.')],
    [C('obelisk', 'Whoever wins buys.'), C('terramoth', 'Then I will need a bigger wage.')],
    [C('terramoth', 'Ironwake against Ironwake.'), C('obelisk', 'The company will be delighted.')],
  ],
  'obelisk|vesper': [
    [C('vesper', 'A stationary target. Unusual.'), C('obelisk', 'A patient one. Different thing.')],
    [C('obelisk', 'You cannot shoot through this.'), C('vesper', 'I can wait for you to lower it.')],
    [C('vesper', 'Range holds.'), C('obelisk', 'So does the shield.')],
    [C('obelisk', 'One of us must approach.'), C('vesper', 'It will not be me.')],
    [C('vesper', 'This may take all round.'), C('obelisk', 'I am comfortable.')],
  ],

  // ------------------------------------------------------------------ pyre
  'pyre|pyre': [
    [C('pyre', 'ANOTHER ME! This is the best day!'), C('pyre', 'We are going to break everything!')],
    [C('pyre', 'You are on fire!'), C('pyre', 'So are you! Wonderful!')],
    [C('pyre', 'Who burns out first?'), C('pyre', 'Not me! Definitely me!')],
    [C('pyre', 'Do not steal my lines.'), C('pyre', 'Do not steal MY lines!')],
    [C('pyre', 'Ashfall forever!'), C('pyre', 'Ashfall louder!')],
  ],
  'pyre|terramoth': [
    [C('terramoth', 'No open flame on my site.'), C('pyre', 'Then close your eyes!')],
    [C('pyre', 'You are a big pile of things to burn!'), C('terramoth', 'I am a big pile of steel.')],
    [C('terramoth', 'You will hurt someone. Probably you.'), C('pyre', 'Probably!')],
    [C('pyre', 'Does the ochre scorch nicely?'), C('terramoth', 'Find out and I will bill you.')],
    [C('terramoth', 'Settle down, girl.'), C('pyre', 'Never! Not once!')],
  ],
  'pyre|vesper': [
    [C('vesper', 'Loud. Easy to track.'), C('pyre', 'Easy to CATCH, though?')],
    [C('pyre', 'You are so far away! Come here!'), C('vesper', 'No.')],
    [C('vesper', 'I will end this at range.'), C('pyre', 'I will end this on fire!')],
    [C('pyre', 'One eye? I will take the other.'), C('vesper', 'It is a monocle. And no.')],
    [C('vesper', 'Contain her.'), C('pyre', 'Nobody has managed yet!')],
  ],

  // ------------------------------------------------------------- terramoth
  'terramoth|terramoth': [
    [C('terramoth', 'Two rigs. One floor.'), C('terramoth', 'The floor will lose.')],
    [C('terramoth', 'Mind the plating on the left.'), C('terramoth', 'I know. It is my plating.')],
    [C('terramoth', 'This will take a while.'), C('terramoth', 'Bring water.')],
    [C('terramoth', 'No hard feelings after.'), C('terramoth', 'None. Before, either.')],
    [C('terramoth', 'Steady.'), C('terramoth', 'Steady.')],
  ],
  'terramoth|vesper': [
    [C('vesper', 'Large. Slow. Predictable.'), C('terramoth', 'And still standing.')],
    [C('terramoth', 'You will keep your distance.'), C('vesper', 'Naturally.')],
    [C('vesper', 'Armour that thick has seams.'), C('terramoth', 'Find them before I reach you.')],
    [C('terramoth', 'A rifle does not hold ground.'), C('vesper', 'It does not need to.')],
    [C('vesper', 'Solution in thirty seconds.'), C('terramoth', 'I will be there in twenty.')],
  ],

  // ---------------------------------------------------------------- vesper
  'vesper|vesper': [
    [C('vesper', 'We will both hold.'), C('vesper', 'Yes.')],
    [C('vesper', 'Whoever moves first, loses.'), C('vesper', 'Then neither of us moves.')],
    [C('vesper', 'Same rifle. Same drill.'), C('vesper', 'Same patience.')],
    [C('vesper', 'This is a staring contest.'), C('vesper', 'I am good at those.')],
    [C('vesper', '...'), C('vesper', '...Understood.')],
  ],
};

/**
 * Picks one of the pair's conversations, or null when the pair has none.
 *
 * `roll` comes from the caller's seeded generator, so a replayed match opens
 * with the same exchange.
 */
export function pickConversation(a: string, b: string, roll: number): Conversation | null {
  const set = MATCHUPS[matchupKey(a, b)];
  if (!set || set.length === 0) return null;
  const i = Math.min(set.length - 1, Math.max(0, Math.floor(roll * set.length)));
  return set[i];
}
