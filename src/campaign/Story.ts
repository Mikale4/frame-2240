import type { PilotId } from '../account/Accounts';
import type { Difficulty } from '../core/Session';
import type { Script, Waitable } from './Script';

/**
 * What a chapter script can do. The campaign scene implements it for real;
 * `campaign.test.ts` implements it as a mock and dry-runs every chapter, the
 * way the owner's FF7 game validates every map script before it ships.
 *
 * Positions are **region-local metres** in the chapter's own region unless
 * stated. Speakers and actors are named by actor id; `'me'` is the pilot
 * whose campaign this is.
 */
export interface StoryApi {
  /** The pilot whose campaign this is. */
  readonly me: PilotId;
  /** A line of dialogue in the box; resolves when the player moves it on. */
  say(who: string, text: string): Waitable;
  /** A question with answers; resolves to the chosen index. */
  ask(who: string, text: string, options: string[]): Waitable<number>;
  /** A centred caption card — a place, a time. */
  caption(text: string, seconds?: number): Waitable;
  /** Sets the objective line in the corner. */
  objective(text: string): void;
  /** Walks (or runs) an actor to a spot; resolves on arrival. */
  walk(actor: string, x: number, z: number, run?: boolean): Waitable;
  /** Turns an actor to face another actor. */
  face(actor: string, target: string): void;
  /** Frames two actors for a conversation; `release` hands the camera back. */
  shot(a: string, b?: string): void;
  release(): void;
  /** Fades to black (`true`) or back from it. */
  fade(out: boolean, seconds?: number): Waitable;
  /** Waits a number of seconds. */
  wait(seconds: number): Waitable;
  /** Shows or hides an actor. */
  show(actor: string, visible: boolean): void;
  /**
   * A sanctioned flight. The walking world waits, the fight runs, and the
   * script resumes with the result.
   */
  battle(o: { foe: PilotId; difficulty?: Difficulty; mode?: 'versus' | 'orbit' }): Waitable<'win' | 'lose'>;
  flag(name: string): boolean;
  set(name: string, on?: boolean): void;
  /** Unlocks a pilot for the account (story route). */
  unlock(pilot: PilotId): void;
  /** Finishes the chapter: saves, pays experience, opens the next. */
  complete(): void;
}

export interface ActorDef {
  id: string;
  /** Shown over the dialogue box. Roles, not names, for anyone not canon. */
  name: string;
  /**
   * A canon pilot's look, or `'extra'` for anyone else — an extra gets a face
   * of its own from `seed`, never a pilot's, so nobody in the background is
   * mistaken for one of the eight.
   */
  look: PilotId | 'extra';
  sex?: 'f' | 'm';
  seed?: number;
  suit?: number;
  trim?: number;
  /** Region-local spot in the chapter's region. */
  x: number;
  z: number;
  facing?: number;
  /** Hidden until a script shows them. */
  hidden?: boolean;
}

export interface AreaDef {
  id: string;
  x: number;
  z: number;
  r: number;
  /** Fires once per chapter unless `repeat`. */
  repeat?: boolean;
  /**
   * With a prompt, the area is something you use ("BOARD IN-05 PYRE") rather
   * than walk into: it fires on the interact button, every time.
   */
  prompt?: string;
  /** Only while this flag is set. */
  when?: string;
  run: (s: StoryApi) => Script;
}

export interface ChapterDef {
  id: string;
  pilot: PilotId;
  number: number;
  title: string;
  region: string;
  /** Where the pilot stands when the chapter opens, region-local. */
  start: { x: number; z: number; facing?: number };
  objective: string;
  actors: ActorDef[];
  intro?: (s: StoryApi) => Script;
  /** Conversations, by actor id: what happens when the player talks to them. */
  talk: Record<string, (s: StoryApi) => Script>;
  areas?: AreaDef[];
  /** Pilots featured here, unlocked when the chapter is finished. */
  features?: PilotId[];
}
