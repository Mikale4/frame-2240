/**
 * Global, configurable identity + resolution constants.
 *
 * The title is intentionally kept in one place (CLAUDE.md asks for the title to
 * stay configurable).
 *
 * **The game is F.R.A.M.E. 2240, not a Babel Sword rendition.** It was developed
 * under the working title "Babel Sword: Reignition" and takes its combat design
 * from that game, but it is an original work and now carries its own name.
 * References to Babel Sword elsewhere in the tree are either historical record
 * (`docs/DECISIONS.md`) or citations of the reference material, and are correct
 * as they stand.
 *
 * **F.R.A.M.E. is an initialism the world has worn down into a common noun.**
 * It expands to *Field-Rated Aerial Manoeuvre Element* — procurement boilerplate
 * in which nothing admits the machine is a weapon. The Archive writes "frame",
 * "airframe", "service frame", "AV frames" in plain lowercase throughout, and
 * that is the point: nobody says the five words any more, the way nobody expands
 * radar. The lowercase usage is evidence the designation is old, not a
 * contradiction of it.
 *
 * **The expansion is deliberately not a constant, because nothing renders it.**
 * It is in `README.md` and here; the title screen shows the initialism alone, on
 * the grounds that a world where nobody expands it should not have its title
 * screen be the one place that does. An exported string no scene draws is how
 * `wantsDroneToggle` survived two iterations.
 *
 * **2240 is a survivor count, not a year, and the misreading is deliberate.**
 * It is the number of people taken off Stillwake on the lift Halden Rook held
 * open (`src/data/archive.ts`, Rook's entry). A player is *meant* to read it as
 * a date and learn otherwise late — the present is 43 CE. **Nothing player-
 * facing may gloss the number before the story does.** Do not write "2,240"
 * with a comma, do not caption it, and do not let a menu or a README explain it.
 */
export const GAME_TITLE = 'F.R.A.M.E. 2240';
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
