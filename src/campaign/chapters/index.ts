import type { PilotId } from '../../account/Accounts';
import type { ChapterDef } from '../Story';

/**
 * Every chapter of every campaign, collected from the files beside this one.
 *
 * A chapter is one file exporting a `ChapterDef` (see `pyre1.ts`); adding the
 * file is all it takes to register it. Collected by Vite's glob import, which
 * works the same in the game and under Vitest, so `chapters.test.ts` dry-runs
 * every chapter that exists without anyone keeping a list in step.
 */
const modules = import.meta.glob<Record<string, unknown>>(['./*.ts', '!./index.ts'], { eager: true });

const isChapter = (v: unknown): v is ChapterDef =>
  !!v && typeof v === 'object' && 'pilot' in v && 'number' in v && 'talk' in v && 'region' in v;

export const CHAPTERS: ChapterDef[] = Object.keys(modules)
  .sort()
  .flatMap((k) => Object.values(modules[k]).filter(isChapter));

export function chaptersOf(pilot: PilotId): ChapterDef[] {
  return CHAPTERS.filter((c) => c.pilot === pilot).sort((a, b) => a.number - b.number);
}

/** The chapter a pilot is on, or null when there is no more written yet. */
export function chapterFor(pilot: PilotId, number: number): ChapterDef | null {
  return chaptersOf(pilot).find((c) => c.number === number) ?? null;
}
