/**
 * The recorded sound set: what exists on disk, and how to load it.
 *
 * `Sfx` synthesises every cue procedurally as well. These samples take over when
 * they load successfully, and the procedural version stays as the fallback for
 * anything missing — so a partial or absent `assets/audio/` never leaves the
 * game silent.
 *
 * Names here must match `docs/AUDIO_CUE_SHEET.md` exactly; the files are loaded
 * by name.
 */

export interface CueDef {
  /** Cue name, matching the cue sheet's Name column. */
  name: string;
  /** How many takes exist. >1 means files are suffixed `_1`, `_2`, … */
  variations: number;
  /** Seamless bed, played with `loop = true` rather than one-shot. */
  loop?: boolean;
  /**
   * Playback gain. The files are not normalised, and relative loudness is a mix
   * decision rather than a property of the recording, so it lives here.
   */
  gain?: number;
}

/**
 * Gains are deliberate, not arbitrary: the two loop beds sit well under the
 * one-shots so a sustained hover never masks combat, and the most frequent cues
 * (`ui_move`, `hit_light`, `footstep`) are trimmed because repetition makes a
 * sound feel louder than its peak suggests.
 */
export const CUES: CueDef[] = [
  // Weapons — firing
  { name: 'fire_vulcan', variations: 4, gain: 0.8 },
  { name: 'fire_autocannon', variations: 4, gain: 0.85 },
  { name: 'fire_heavy', variations: 2 },
  { name: 'fire_beam', variations: 2 },
  { name: 'fire_missile', variations: 3, gain: 0.9 },
  { name: 'fire_scatter', variations: 2, gain: 0.9 },

  // Weapons — impact
  { name: 'hit_light', variations: 4, gain: 0.75 },
  { name: 'hit_heavy', variations: 3 },
  { name: 'hit_guard', variations: 3, gain: 0.85 },
  { name: 'hit_absorb', variations: 2, gain: 0.9 },

  // Melee
  { name: 'melee_swing_light', variations: 2, gain: 0.85 },
  { name: 'melee_swing_mid', variations: 2, gain: 0.9 },
  { name: 'melee_swing_finish', variations: 1 },
  { name: 'melee_ignite', variations: 1, gain: 0.9 },
  { name: 'melee_claw', variations: 2 },

  // Movement
  { name: 'dash', variations: 3, gain: 0.7 },
  { name: 'takeoff', variations: 1, gain: 0.9 },
  { name: 'land', variations: 2 },
  { name: 'footstep', variations: 4, gain: 0.55 },
  { name: 'thruster_loop', variations: 1, loop: true, gain: 0.3 },

  // Defence and meter
  { name: 'barrier_burst', variations: 1 },
  { name: 'guard_break', variations: 1 },
  { name: 'saturation', variations: 1 },
  { name: 'mode_cycle', variations: 1, gain: 0.7 },

  // Supporter drone
  { name: 'assist_order', variations: 1, gain: 0.85 },
  { name: 'assist_denied', variations: 1, gain: 0.85 },
  { name: 'assist_fire', variations: 2, gain: 0.8 },
  { name: 'drone_hover', variations: 1, loop: true, gain: 0.18 },

  // Status elements
  { name: 'status_corrosive', variations: 1, gain: 0.8 },
  { name: 'status_cryo', variations: 1, gain: 0.8 },
  { name: 'status_incendiary', variations: 1, gain: 0.8 },
  { name: 'status_shock', variations: 1, gain: 0.8 },

  // Destruction
  { name: 'explode_small', variations: 3, gain: 0.9 },
  { name: 'explode_big', variations: 1 },
  { name: 'ko', variations: 1 },

  // Interface
  { name: 'ui_move', variations: 1, gain: 0.5 },
  { name: 'ui_confirm', variations: 1, gain: 0.7 },
  { name: 'ui_back', variations: 1, gain: 0.7 },
  // One take each, from the first synthetic voice. Extra channels were tried and
  // dropped — a launch callout is the same machine every time, and varying it
  // read as three different computers rather than one with personality.
  { name: 'match_ready', variations: 1 },
  { name: 'match_fight', variations: 1 },
];

/** Every file a cue owns, in variation order. */
export function cueFiles(cue: CueDef): string[] {
  if (cue.variations <= 1) return [`${cue.name}.mp3`];
  return Array.from({ length: cue.variations }, (_, i) => `${cue.name}_${i + 1}.mp3`);
}

/** Total files the bank expects — used by the loader's progress reporting. */
export function totalFiles(): number {
  return CUES.reduce((n, c) => n + Math.max(1, c.variations), 0);
}

export interface LoadedBank {
  /** Cue name → decoded takes. A cue with no successful takes is absent. */
  buffers: Map<string, AudioBuffer[]>;
  /** Files that failed to fetch or decode. */
  failed: string[];
}

/**
 * Fetches and decodes the whole bank into `ctx`.
 *
 * Decoding into the same context `Sfx` plays through avoids running two audio
 * graphs; Phaser's own sound manager is deliberately not used. A suspended
 * context decodes fine, so this can run during boot, before the first gesture.
 *
 * Individual failures are collected rather than thrown — one missing file must
 * not cost the whole set.
 */
export async function loadSoundBank(
  ctx: AudioContext,
  onProgress?: (done: number, total: number) => void,
): Promise<LoadedBank> {
  const buffers = new Map<string, AudioBuffer[]>();
  const failed: string[] = [];
  const total = totalFiles();
  let done = 0;

  const jobs: Array<Promise<void>> = [];
  for (const cue of CUES) {
    const takes: AudioBuffer[] = [];
    buffers.set(cue.name, takes);
    for (const file of cueFiles(cue)) {
      jobs.push(
        (async () => {
          try {
            // Relative, exactly like Phaser's image loads: `publicDir` is
            // assets/ and Vite's `base` is './', so this resolves the same way
            // in dev, in a production build, and from a subdirectory.
            const res = await fetch(`audio/${file}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const bytes = await res.arrayBuffer();
            // decodeAudioData is callback-style on older Safari; the promise
            // form is standard everywhere this game targets.
            takes.push(await ctx.decodeAudioData(bytes));
          } catch {
            failed.push(file);
          } finally {
            done++;
            onProgress?.(done, total);
          }
        })(),
      );
    }
  }
  await Promise.all(jobs);

  // Drop cues that got nothing, so callers can treat "present" as "playable".
  for (const [name, takes] of [...buffers]) {
    if (takes.length === 0) buffers.delete(name);
  }
  return { buffers, failed };
}
