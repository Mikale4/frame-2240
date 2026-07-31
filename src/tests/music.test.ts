import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  DANGER_LIFE_FRACTION,
  MUSIC_CUES,
  battleCandidates,
  musicAvailable,
  musicFile,
  pickBattleCue,
  type BattleTrackQuery,
} from '../audio/MusicBank';
import { HALCYON, NOCTURNE, ROSTER } from '../data/mechs';
import { session } from '../core/Session';
import { MatchSim } from '../combat/MatchSim';
import { Btn, emptyInput, type InputFrame } from '../combat/types';

/**
 * The soundtrack manifest is a hand-maintained claim about what is on disk, and
 * nothing at runtime can check it: a cue whose file is absent is simply never
 * requested, so the scene goes quiet rather than failing. These tests are what
 * turns "quiet" into "red".
 */
const MUSIC_DIR = path.resolve(process.cwd(), 'assets', 'music');

describe('music manifest', () => {
  it('has no duplicate cue names', () => {
    const names = MUSIC_CUES.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('names every cue in lower_snake_case, matching the cue sheet', () => {
    for (const cue of MUSIC_CUES) expect(cue.name).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  it('declares every screen track the cue sheet lists', () => {
    const screens = [
      'title',
      'menu',
      'select',
      'battle_danger',
      'results_win',
      'results_lose',
      'training',
    ];
    for (const name of screens) expect(MUSIC_CUES.map((c) => c.name)).toContain(name);
  });

  it('declares a theme for every mech on the roster', () => {
    const names = new Set(MUSIC_CUES.map((c) => c.name));
    for (const def of ROSTER) expect(names).toContain(`theme_${def.id}`);
  });

  it('declares a stage theme for the arena the session actually uses', () => {
    const names = new Set(MUSIC_CUES.map((c) => c.name));
    expect(names).toContain(`stage_${session.arena}`);
  });

  it('keeps every gain in a sane range', () => {
    for (const cue of MUSIC_CUES) {
      if (cue.gain === undefined) continue;
      expect(cue.gain).toBeGreaterThan(0);
      expect(cue.gain).toBeLessThanOrEqual(1);
    }
  });

  it('builds a path under music/ for every cue', () => {
    for (const cue of MUSIC_CUES) expect(musicFile(cue.name)).toBe(`music/${cue.name}.mp3`);
  });

  it('reports availability only for cues it declares', () => {
    expect(musicAvailable('theme_halcyon')).toBe(true);
    expect(musicAvailable('theme_nobody')).toBe(false);
    expect(musicAvailable('')).toBe(false);
  });
});

// Skipped when assets/music is absent, so a bare checkout stays green.
const haveMusic = fs.existsSync(MUSIC_DIR);

describe.skipIf(!haveMusic)('music manifest against assets/music', () => {
  const onDisk = (): string[] =>
    fs
      .readdirSync(MUSIC_DIR)
      .filter((f: string) => f.toLowerCase().endsWith('.mp3') && !f.startsWith('_'))
      .sort();

  /**
   * Both directions, and this is the whole point of the `present` column.
   *
   * A track that lands without its flag flipped is silently never played; a flag
   * flipped without the track hands the audio decoder Vite's `index.html`, which
   * it answers with a 200 for any unknown path.
   */
  it('finds a file for every cue marked present', () => {
    const present = new Set(onDisk());
    const missing = MUSIC_CUES.filter((c) => c.present && !present.has(`${c.name}.mp3`)).map(
      (c) => c.name,
    );
    expect(missing).toEqual([]);
  });

  it('marks present every cue whose file exists', () => {
    const declared = new Map(MUSIC_CUES.map((c) => [`${c.name}.mp3`, c]));
    const unflagged = onDisk().filter((f) => declared.get(f)?.present === false);
    expect(unflagged).toEqual([]);
  });

  it('leaves no music file unclaimed by a cue', () => {
    const declared = new Set(MUSIC_CUES.map((c) => `${c.name}.mp3`));
    expect(onDisk().filter((f) => !declared.has(f))).toEqual([]);
  });

  it('has no empty or truncated files', () => {
    const tiny = onDisk().filter((f) => fs.statSync(path.join(MUSIC_DIR, f)).size < 100_000);
    expect(tiny).toEqual([]);
  });
});

describe('the battle roll', () => {
  const q = (over: Partial<BattleTrackQuery> = {}): BattleTrackQuery => ({
    mode: 'vsCpu',
    playerMech: 'halcyon',
    enemyMech: 'nocturne',
    arena: 'cathedral_yard',
    ...over,
  });
  /** Pretend the whole album exists, so the rules are tested rather than today's disk. */
  const all = () => true;
  const none = () => false;

  it('draws from both pilots and the stage', () => {
    expect(battleCandidates(q())).toEqual([
      'theme_halcyon',
      'theme_nocturne',
      'stage_cathedral_yard',
    ]);
  });

  it('collapses a mirror match to two candidates rather than double-weighting one', () => {
    expect(battleCandidates(q({ enemyMech: 'halcyon' }))).toEqual([
      'theme_halcyon',
      'stage_cathedral_yard',
    ]);
  });

  it('can return any of the three, and nothing else', () => {
    const seen = new Set<string | null>();
    for (let i = 0; i < 300; i++) seen.add(pickBattleCue(q(), () => i / 300, all));
    expect([...seen].sort()).toEqual(['stage_cathedral_yard', 'theme_halcyon', 'theme_nocturne']);
  });

  it('never rolls in training, and never leaves it', () => {
    for (let i = 0; i < 50; i++) {
      expect(pickBattleCue(q({ mode: 'training' }), () => i / 50, all)).toBe('training');
    }
  });

  it('gives training silence rather than a wrong track when its file is missing', () => {
    expect(pickBattleCue(q({ mode: 'training' }), Math.random, none)).toBeNull();
  });

  it('never names a cue that does not exist', () => {
    const only = (c: string) => c === 'theme_nocturne';
    for (let i = 0; i < 100; i++) {
      expect(pickBattleCue(q(), () => i / 100, only)).toBe('theme_nocturne');
    }
  });

  it('falls back to `battle` when no candidate exists', () => {
    expect(pickBattleCue(q(), Math.random, (c) => c === 'battle')).toBe('battle');
  });

  it('falls all the way to silence rather than requesting a missing path', () => {
    expect(pickBattleCue(q(), Math.random, none)).toBeNull();
  });

  it('stays in range for the degenerate rand() === 1', () => {
    expect(battleCandidates(q())).toContain(pickBattleCue(q(), () => 1, all));
  });

  it('puts the danger threshold at a quarter life', () => {
    expect(DANGER_LIFE_FRACTION).toBe(0.25);
  });
});

/**
 * The one requirement that cannot be heard.
 *
 * `MatchSim` is seeded, and `match.test.ts` asserts a bit-identical replay for
 * the same seed and inputs. If the battle roll drew from that stream it would
 * shift every subsequent random number and change the fight — the music would be
 * fine and the game would not. `pickBattleCue` takes its generator as an
 * argument for exactly this reason; this proves that rolling as hard as we like,
 * mid-match, moves nothing.
 */
describe('the roll and the simulation', () => {
  const scripted = (i: number): InputFrame => {
    const f = emptyInput();
    f.dx = (i % 13) < 6 ? 1 : -1;
    f.dy = (i % 17) < 8 ? -1 : 1;
    let m = 0;
    if (i % 19 === 0) m |= 1 << Btn.Main;
    if (i % 47 === 0) m |= 1 << Btn.Heavy;
    if (i % 23 === 0) m |= 1 << Btn.Boost;
    f.pressed = m;
    f.held = m;
    return f;
  };
  const run = (rollEveryTick: boolean): number[] => {
    const s = new MatchSim({ playerDef: HALCYON, enemyDef: NOCTURNE, seed: 4242, introTicks: 1 });
    for (let i = 0; i < 600; i++) {
      if (rollEveryTick) {
        pickBattleCue(
          { mode: 'vsCpu', playerMech: 'halcyon', enemyMech: 'nocturne', arena: 'cathedral_yard' },
          Math.random,
          () => true,
        );
      }
      s.step(scripted(i), scripted(i + 5));
    }
    return [
      s.tick,
      s.player.x, s.player.y, s.player.vx, s.player.vy, s.player.life,
      s.player.energy, s.player.boost, s.player.barrier, s.player.sat,
      s.enemy.x, s.enemy.y, s.enemy.vx, s.enemy.vy, s.enemy.life,
      s.projectiles.activeCount,
    ];
  };

  it('leaves the match bit-identical however often music is rolled', () => {
    expect(run(true)).toEqual(run(false));
  });
});
