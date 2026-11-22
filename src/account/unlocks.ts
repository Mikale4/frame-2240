import { Difficulty } from '../core/Session';
import { isPilotId, type AccountStore, type PilotId } from './Accounts';

/**
 * How the seven pilots an account did not start with are earned. Any one
 * route is enough, so nobody is forced down a single path:
 *
 * 1. **Story** — finishing a campaign chapter that features a pilot unlocks
 *    them (the campaign calls `store.unlock(id, 'story')` itself).
 * 2. **Combat record** — beat that pilot's machine `HARD_WINS` times at HARD
 *    or EXTREME, or `ANY_WINS` times at any skill, in VERSUS CPU or FREE ORBIT.
 * 3. **Rank** — every third rank pays a commission, spent on any pilot.
 *
 * Training, the tutorial and CPU vs CPU record nothing: nobody is flying.
 */
export const ANY_WINS = 5;
export const HARD_WINS = 3;

export const XP_WIN = 60;
export const XP_WIN_PER_TIER = 20;
export const XP_LOSS = 20;
export const XP_CHAPTER = 250;

export interface FightOutcome {
  /** Pilots unlocked by this result. */
  unlocked: PilotId[];
  /** Ranks gained. */
  ranks: number;
  xp: number;
}

/** Records a finished fight for the signed-in account. */
export function recordFight(store: AccountStore, opponent: string, difficulty: Difficulty, won: boolean): FightOutcome {
  const a = store.user;
  const none: FightOutcome = { unlocked: [], ranks: 0, xp: 0 };
  if (!a || !isPilotId(opponent)) return none;
  const r = a.records[opponent] ?? { wins: 0, hardWins: 0, losses: 0 };
  if (won) {
    r.wins++;
    if (difficulty >= Difficulty.Hard) r.hardWins++;
  } else {
    r.losses++;
  }
  a.records[opponent] = r;
  const unlocked: PilotId[] = [];
  if (won && !a.unlocked.includes(opponent) && (r.hardWins >= HARD_WINS || r.wins >= ANY_WINS)) {
    if (store.unlock(opponent, 'combat')) unlocked.push(opponent);
  }
  const xp = won ? XP_WIN + XP_WIN_PER_TIER * difficulty : XP_LOSS;
  const ranks = store.addXp(xp);
  store.save();
  return { unlocked, ranks, xp };
}

/**
 * Records a finished match if it counts — VERSUS CPU in either view, with
 * someone signed in — and returns what it earned, for the results screen.
 */
export function recordMatch(
  store: AccountStore,
  mode: string,
  enemyMech: string,
  difficulty: Difficulty,
  outcome: 'none' | 'playerWin' | 'enemyWin' | 'draw',
): { unlocked: string[]; xp: number; ranks: number; rank: number; commissions: number } | null {
  if (!store.user || mode !== 'vsCpu' || outcome === 'none') return null;
  const r = recordFight(store, enemyMech, difficulty, outcome === 'playerWin');
  return { unlocked: r.unlocked, xp: r.xp, ranks: r.ranks, rank: store.rank, commissions: store.user.commissions };
}

/** One line for the roster: how a locked pilot can still be earned. */
export function unlockHint(store: AccountStore, id: PilotId): string {
  const r = store.user?.records[id] ?? { wins: 0, hardWins: 0, losses: 0 };
  const parts = [
    `BEAT THEM ${Math.max(0, HARD_WINS - r.hardWins)} MORE AT HARD+ OR ${Math.max(0, ANY_WINS - r.wins)} MORE AT ANY SKILL`,
    'MEET THEM IN A CAMPAIGN',
  ];
  if ((store.user?.commissions ?? 0) > 0) parts.push('OR SPEND A COMMISSION');
  return parts.join(' · ');
}
