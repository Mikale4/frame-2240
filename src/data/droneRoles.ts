import type { SupporterRole } from '../mechs/MechDef';

/**
 * What each escort actually *does*, in a sentence a player can read.
 *
 * The select screen printed a drone's hit points and its **passive**, and
 * nothing else — so the one thing that distinguishes eight otherwise similar
 * machines, the role, was undocumented anywhere in the game. A player could
 * learn that WISP refills boost at double rate and still have no idea it strings
 * a live wire across the arena.
 *
 * Kept here rather than on `SupporterDef` so all eight read as one set and can
 * be compared at a glance; a description written eight separate times next to
 * eight separate stat blocks drifts, and this text is a promise about mechanics.
 *
 * Every line is written against the implementation in `MatchSim.stepDroneRoles`
 * and `Supporter.stepRole`. If a role's behaviour changes, this changes with it.
 */
export const ROLE_BRIEF: Record<SupporterRole, { name: string; text: string }> = {
  shooter: {
    name: 'GUNNERY',
    text: 'Fires on its own initiative, spending the same sub-weapon charges you do.',
  },
  designator: {
    name: 'TARGET PAINT',
    text: 'Marks the enemy: they take 20% more damage and your rounds steer onto them.',
  },
  tether: {
    name: 'REPAIR BEAM',
    text: 'Runs a cable home, refilling your barrier fast and your hull slowly.',
  },
  interceptor: {
    // Deliberately says "around you". The radius is measured from the pilot, not
    // from the drone — see `stepDroneRoles` — and a player who assumes otherwise
    // will position the escort to protect something it is not protecting.
    name: 'POINT DEFENCE',
    text: 'Shoots one incoming round out of the air at a time, within 320px around you.',
  },
  dome: {
    name: 'AEGIS FIELD',
    text: 'Holds a bubble that erases every non-piercing shot that enters it.',
  },
  decoy: {
    name: 'FALSE ECHO',
    text: 'Projects a drifting copy of your machine that draws the enemy onto empty air.',
  },
  miner: {
    name: 'MINELAYER',
    text: 'Seeds the ground between you with mines that hold the space you are not in.',
  },
  hazard: {
    name: 'SCORCHED GROUND',
    text: 'Lays burning patches that deny the ground rather than the pilot standing on it.',
  },
  arcTether: {
    name: 'ARC LINE',
    text: 'Strings a live wire back to you. Anything caught across it takes shock damage.',
  },
};
