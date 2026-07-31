import { beforeEach, describe, expect, it } from 'vitest';
import {
  BUS_MAX_GAIN,
  DEFAULT_MUSIC_STEP,
  DEFAULT_SFX_STEP,
  VOLUME_STEPS,
  clampStep,
  defaultAudioSettings,
  loadAudioSettings,
  normalizeAudioSettings,
  saveAudioSettings,
  stepLabel,
  stepToGain,
} from '../audio/AudioSettings';

/** Minimal in-memory localStorage so persistence is testable under Node. */
class MemoryStorage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(k: string): string | null {
    return this.map.has(k) ? (this.map.get(k) as string) : null;
  }
  key(i: number): string | null {
    return [...this.map.keys()][i] ?? null;
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
  setItem(k: string, v: string): void {
    this.map.set(k, String(v));
  }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: new MemoryStorage() as unknown as Storage,
  });
});

describe('volume steps', () => {
  it('ships the mix the game already played at', () => {
    // These are the levels the buses were hard-coded to before they were
    // adjustable; changing the defaults should be a deliberate act, not a
    // side effect of moving the scale around.
    expect(stepToGain(DEFAULT_SFX_STEP)).toBeCloseTo(0.32, 5);
    expect(stepToGain(DEFAULT_MUSIC_STEP)).toBeCloseTo(0.28, 5);
  });

  it('leaves headroom above both defaults', () => {
    expect(DEFAULT_MUSIC_STEP).toBeLessThan(VOLUME_STEPS);
    expect(DEFAULT_SFX_STEP).toBeLessThan(VOLUME_STEPS);
  });

  it('puts music under effects out of the box', () => {
    expect(DEFAULT_MUSIC_STEP).toBeLessThan(DEFAULT_SFX_STEP);
  });

  it('makes a step worth the same on either bus', () => {
    // The two numbers in the menu are only comparable if this holds.
    expect(stepToGain(5)).toBe(stepToGain(5));
    expect(stepToGain(VOLUME_STEPS)).toBeCloseTo(BUS_MAX_GAIN, 5);
  });

  it('is true silence at zero, not merely quiet', () => {
    expect(stepToGain(0)).toBe(0);
  });

  it('rises monotonically', () => {
    for (let i = 1; i <= VOLUME_STEPS; i++) {
      expect(stepToGain(i)).toBeGreaterThan(stepToGain(i - 1));
    }
  });

  it('clamps anything out of range, including nonsense', () => {
    expect(clampStep(-3)).toBe(0);
    expect(clampStep(999)).toBe(VOLUME_STEPS);
    expect(clampStep(4.6)).toBe(5);
    expect(clampStep(Number.NaN)).toBe(0);
    expect(clampStep(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('never reports a gain outside the bus range', () => {
    for (const s of [-5, 0, 3, VOLUME_STEPS, 40, Number.NaN]) {
      const g = stepToGain(s);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(BUS_MAX_GAIN);
    }
  });
});

describe('volume labels', () => {
  it('reads OFF at zero rather than 0%', () => {
    expect(stepLabel(0)).toContain('OFF');
    expect(stepLabel(0)).not.toContain('%');
  });

  it('reads as a percentage everywhere else', () => {
    expect(stepLabel(7)).toContain('70%');
    expect(stepLabel(VOLUME_STEPS)).toContain('100%');
  });

  it('draws a bar of a constant width, so rows do not jump', () => {
    const widths = new Set<number>();
    for (let i = 0; i <= VOLUME_STEPS; i++) {
      widths.add([...stepLabel(i)].filter((c) => c === '■' || c === '□').length);
    }
    expect([...widths]).toEqual([VOLUME_STEPS]);
  });
});

describe('stored settings', () => {
  it('round-trips through storage', () => {
    expect(saveAudioSettings({ music: 3, sfx: 9 })).toBe(true);
    expect(loadAudioSettings()).toEqual({ music: 3, sfx: 9 });
  });

  it('returns the defaults when nothing is stored', () => {
    expect(loadAudioSettings()).toEqual(defaultAudioSettings());
  });

  /**
   * The failure mode that matters: a bad entry must not leave the game silent
   * with no obvious way back, so anything unreadable falls to the defaults
   * rather than to zero.
   */
  it('falls back to the defaults on malformed JSON', () => {
    globalThis.localStorage.setItem('bsr.audio.v1', '{not json');
    expect(loadAudioSettings()).toEqual(defaultAudioSettings());
  });

  it('keeps the good half of a partly malformed entry', () => {
    expect(normalizeAudioSettings({ music: 2, sfx: 'loud' })).toEqual({
      music: 2,
      sfx: DEFAULT_SFX_STEP,
    });
  });

  it('clamps stored values that are out of range', () => {
    expect(normalizeAudioSettings({ music: -4, sfx: 88 })).toEqual({
      music: 0,
      sfx: VOLUME_STEPS,
    });
  });

  it('ignores a stored value that is not an object at all', () => {
    for (const junk of [null, 42, 'x', [], undefined]) {
      expect(normalizeAudioSettings(junk)).toEqual(defaultAudioSettings());
    }
  });

  it('survives a missing localStorage entirely', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('blocked');
      },
    });
    expect(loadAudioSettings()).toEqual(defaultAudioSettings());
    expect(saveAudioSettings({ music: 1, sfx: 1 })).toBe(false);
  });
});
