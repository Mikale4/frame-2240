import type { PilotId } from '../account/Accounts';
import type { Difficulty } from '../core/Session';
import type { Gesture } from '../voxel/PilotFigure';
import type { Script, Waitable } from './Script';

/** A point in the chapter's region: region-local metres, `y` up from its deck. */
export interface Spot3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Music by what the moment is, not by file: the scene picks the track.
 * `theme` is the pilot's own.
 */
export type Mood = 'calm' | 'tension' | 'danger' | 'sorrow' | 'hope' | 'theme' | 'yard' | 'training' | 'title';

export type Sound = 'alarm' | 'boom' | 'bigboom' | 'hit' | 'launch' | 'land' | 'step' | 'beep' | 'door';

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

  // ---- the cutscene kit: an episode's presentation ----------------------

  /** Cinema bars in (true) or out. Scripts take them in for drama and out for play. */
  letterbox(on: boolean): void;
  /**
   * The episode's title card, as the show opens: the episode number and its
   * title over the picture. Holds for `seconds`.
   */
  titleCard(episode: string, title: string, seconds?: number): Waitable;
  /** The narrator: a line centred over the picture, no speaker; waits for the player. */
  narrate(text: string): Waitable;
  /**
   * The "next time" card at an episode's end: a few lines of what is coming,
   * and the next episode's title. Waits for the player.
   */
  nextTime(lines: string[], title: string): Waitable;
  /** The camera: from `eye` at `at`. `cut` jumps there; otherwise it eases. */
  cam(eye: Spot3, at: Spot3, cut?: boolean): void;
  /** A camera move from one framing to another over `seconds`. */
  pan(from: [Spot3, Spot3], to: [Spot3, Spot3], seconds: number): Waitable;
  /** Body language: a nod, a salute, arms crossed, hands at work. */
  gesture(actor: string, kind: Gesture, seconds?: number): void;
  /** Sits an actor down where they stand (on a bench, a crate, a step), or stands them up. */
  sit(actor: string, on: boolean): void;
  /** Puts an actor somewhere at once, region-local. */
  place(actor: string, x: number, z: number, facing?: number): void;
  /** Music by mood; `null` is silence. */
  music(mood: Mood | null): void;
  sound(name: Sound): void;
  /** Shakes the camera: `strength` in metres, easing out over `seconds`. */
  shake(strength: number, seconds: number): void;
  /** The alarm: red light pulsing over everything, and the klaxon. */
  alarm(on: boolean): void;
  /** An explosion at a region-local spot, `y` metres up; `size` 1 is a frame's worth. */
  boom(x: number, z: number, y?: number, size?: number): void;
  /** A white flash over the picture. */
  flash(): void;
  /**
   * A sortie: a frame lifts off its pad and flies, the camera with it. `'frame'`
   * is the pilot's own on their home pad; any other id is one of the chapter's
   * `frames`. Resolves when it is away; it stays gone until shown.
   */
  launch(frame?: string): Waitable;
  /** Shows or hides one of the chapter's frames (or `'frame'`, the pilot's own). */
  showFrame(frame: string, visible: boolean): void;
  /**
   * Draws an actor as a child, or grown: for a prologue's time-skip. `'me'`
   * grown gets the pilot's portrait back in the dialogue box.
   */
  young(actor: string, on: boolean): void;
}

/** A frame standing in the chapter's region: in a bay, on a pad, a wreck. */
export interface FrameDef {
  id: string;
  /** Whose machine it is drawn as. */
  mech: PilotId;
  x: number;
  z: number;
  /** Which way it faces, radians (0 is +z). */
  facing?: number;
  hidden?: boolean;
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
  /** A child: drawn smaller. */
  young?: boolean;
  /** Seated where they stand when the chapter opens. */
  sitting?: boolean;
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
  /** The pilot as a child, for a prologue set in their childhood. */
  young?: boolean;
  /** No frame on the home pad: before they had one. */
  noFrame?: boolean;
  /** Frames standing in this chapter's region. */
  frames?: FrameDef[];
  /** The chapter's music when nothing else is asked for. */
  music?: Mood;
}
