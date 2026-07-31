/**
 * Global, configurable identity + resolution constants.
 *
 * The working title is intentionally kept in one place (CLAUDE.md asks for the
 * title to stay configurable).
 */
export const GAME_TITLE = 'BABEL SWORD';
export const GAME_SUBTITLE = 'REIGNITION';
export const GAME_VERSION = '0.1.0';

/**
 * Logical (design) resolution. All simulation units are logical pixels; the
 * renderer scales this up to the window. Chosen so a mech chassis is ~96px
 * tall, matching the readable silhouette scale of the 2005 reference at 16:9.
 */
export const VIEW_W = 960;
export const VIEW_H = 540;

/** Fixed simulation rate. Combat timings in this project are authored in ticks. */
export const TICK_HZ = 60;
export const TICK_MS = 1000 / TICK_HZ;

/** Arena is wider and taller than the view; the camera follows the action. */
export const ARENA_W = 2400;
export const ARENA_H = 1200;

/**
 * Match rules.
 *
 * 180 seconds, not the arcade-traditional 99. The roster's life pools were
 * raised by 1.75× because matches were finishing in 10–15 seconds against the
 * lower tiers — measured, and it matched what playtesting felt like — and at
 * that scale a 99-second clock stops being a fail-safe and starts being the
 * thing that decides the fight: 30% of EXTREME matches ended in a draw on time.
 * At 180 seconds no tier draws more than 4% of the time, so the clock is back to
 * being the fail-safe it is meant to be.
 */
export const ROUND_TIME_TICKS = 180 * TICK_HZ;

/**
 * World y of the deck surface — the line a landed machine's **feet** rest on.
 *
 * This is the single source of truth for where the floor is. A machine's own
 * resting height is derived from it by subtracting that chassis's `footOffset`,
 * so every mech's feet touch the same line no matter how tall its legs are.
 * Previously the floor was expressed as a body-centre height with no drawn
 * surface, which is why it was impossible to see where the ground actually was.
 *
 * The 2005 reference is not purely aerial: `var(20)` is a flight flag, statedef
 * 40 is take-off and 55 is landing, and `howto-en.html` lists FlyingMode ON/OFF
 * as a player toggle. Machines walk when grounded and fly when airborne.
 */
export const DECK_Y = ARENA_H - 30;
