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

/** Match rules. */
export const ROUND_TIME_TICKS = 99 * TICK_HZ;

/**
 * Arena floor.
 *
 * The 2005 reference is not purely aerial: `var(20)` is a flight flag, statedef
 * 40 is take-off and 55 is landing, and `howto-en.html` lists FlyingMode ON/OFF
 * as a player toggle. Machines walk when grounded and fly when airborne.
 */
export const GROUND_Y = ARENA_H - 96;
