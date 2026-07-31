import { CUES, loadSoundBank, type CueDef } from './SoundBank';
import { DEFAULT_SFX_STEP, stepToGain } from './AudioSettings';

/**
 * Sound effects via the Web Audio API, from recorded samples where available
 * and synthesised on the fly where not.
 *
 * Both paths are original work. The samples in `assets/audio/` are preferred
 * once loaded; every cue also has a procedural version, which is what plays if
 * the bank is missing, still loading, or short a file. That means audio degrades
 * rather than disappearing, and the game still runs from a bare checkout.
 *
 * The context is created lazily and resumed on the first gesture, which browsers
 * require.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  /** Effects bus level; see `AudioSettings`. Restored from storage at boot. */
  private gain = stepToGain(DEFAULT_SFX_STEP);
  muted = false;

  /** Cue name → decoded takes. Empty until `load()` resolves. */
  private bank = new Map<string, AudioBuffer[]>();
  /** Cue name → its definition, for per-cue gain and loop flags. */
  private defs = new Map<string, CueDef>(CUES.map((c) => [c.name, c]));
  /** Currently-playing loop beds, keyed by cue name. */
  private loops = new Map<string, { src: AudioBufferSourceNode; gain: GainNode }>();
  /** Files that failed to load, for the boot report. */
  loadFailures: string[] = [];
  /** True once at least one sample decoded, so callers can report the mode. */
  usingSamples = false;

  /**
   * Fetches and decodes `assets/audio/`. Safe to call before any gesture: a
   * suspended context decodes fine. Never rejects — a failed load simply leaves
   * the procedural path in charge.
   */
  async load(onProgress?: (done: number, total: number) => void): Promise<void> {
    if (!this.ensure() || !this.ctx) return;
    try {
      const { buffers, failed } = await loadSoundBank(this.ctx, onProgress);
      this.bank = buffers;
      this.loadFailures = failed;
      this.usingSamples = buffers.size > 0;
    } catch {
      // Keep the procedural path; nothing else to do.
      this.usingSamples = false;
    }
  }

  /**
   * Plays one take of `cue`, chosen at random when it has variations.
   * Returns false when the cue has no samples, which is the signal for callers
   * to fall through to their synthesised version.
   */
  private play(cue: string, gainScale = 1): boolean {
    const takes = this.bank.get(cue);
    if (!takes || takes.length === 0) return false;
    if (!this.ensure() || !this.ctx || !this.master) return false;
    if (this.muted) return true; // Handled; simply inaudible.
    const buf = takes.length === 1 ? takes[0] : takes[(Math.random() * takes.length) | 0];
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = (this.defs.get(cue)?.gain ?? 1) * gainScale;
    src.connect(g).connect(this.master);
    src.start();
    return true;
  }

  /**
   * Starts or stops a seamless bed (`thruster_loop`, `drone_hover`).
   *
   * These are the only cues that persist across frames, so they are tracked by
   * name and are idempotent: calling with the same state twice does nothing.
   * A missing sample is a silent no-op rather than a fallback, because a
   * synthesised drone would be worse than none.
   */
  setLoop(cue: string, on: boolean, gainScale = 1): void {
    const active = this.loops.get(cue);
    if (on === !!active) {
      if (active) active.gain.gain.value = (this.defs.get(cue)?.gain ?? 1) * gainScale;
      return;
    }
    if (!on) {
      if (active) {
        try {
          active.src.stop();
        } catch {
          // Already stopped; nothing to do.
        }
        this.loops.delete(cue);
      }
      return;
    }
    const takes = this.bank.get(cue);
    if (!takes || takes.length === 0) return;
    if (!this.ensure() || !this.ctx || !this.master) return;
    const src = this.ctx.createBufferSource();
    src.buffer = takes[0];
    src.loop = true;
    const g = this.ctx.createGain();
    g.gain.value = (this.defs.get(cue)?.gain ?? 1) * gainScale;
    src.connect(g).connect(this.master);
    src.start();
    this.loops.set(cue, { src, gain: g });
  }

  /** Stops every loop bed — used on scene teardown so nothing outlives a match. */
  stopLoops(): void {
    for (const cue of [...this.loops.keys()]) this.setLoop(cue, false);
  }

  private ensure(): boolean {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return true;
    }
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return false;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.gain;
      this.master.connect(this.ctx.destination);

      // One second of white noise, reused for every percussive sound.
      const len = Math.floor(this.ctx.sampleRate);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noise = buf;
      return true;
    } catch {
      this.ctx = null;
      return false;
    }
  }

  /** Called from a user gesture so the context is allowed to start. */
  unlock(): void {
    this.ensure();
  }

  /**
   * The shared audio graph, created on demand.
   *
   * `MusicPlayer` mixes into the same context rather than opening a second one:
   * browsers cap how many an origin may hold, and two graphs cannot be ducked
   * against each other with sample accuracy. Music hangs its own bus off
   * `destination`, not off this class's master, so their levels stay independent.
   */
  context(): AudioContext | null {
    return this.ensure() ? this.ctx : null;
  }

  /**
   * Sets the effects bus level.
   *
   * `muted` is derived rather than separate: at zero gain there is nothing to
   * hear, so the synthesised paths skip their work instead of building an
   * oscillator graph nobody will listen to.
   */
  setGain(g: number): void {
    this.gain = Math.max(0, g);
    this.muted = this.gain <= 0;
    if (this.master) this.master.gain.value = this.gain;
  }

  private tone(opts: {
    type: OscillatorType;
    from: number;
    to: number;
    dur: number;
    gain: number;
    delay?: number;
  }): void {
    if (!this.ensure() || !this.ctx || !this.master || this.muted) return;
    const t0 = this.ctx.currentTime + (opts.delay ?? 0);
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = opts.type;
    osc.frequency.setValueAtTime(opts.from, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t0 + opts.dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(opts.gain, t0 + Math.min(0.012, opts.dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + opts.dur + 0.02);
  }

  private burst(opts: {
    dur: number;
    gain: number;
    freq: number;
    q?: number;
    type?: BiquadFilterType;
    sweepTo?: number;
    delay?: number;
  }): void {
    if (!this.ensure() || !this.ctx || !this.master || !this.noise || this.muted) return;
    const t0 = this.ctx.currentTime + (opts.delay ?? 0);
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filt = this.ctx.createBiquadFilter();
    filt.type = opts.type ?? 'bandpass';
    filt.frequency.setValueAtTime(opts.freq, t0);
    if (opts.sweepTo) {
      filt.frequency.exponentialRampToValueAtTime(Math.max(40, opts.sweepTo), t0 + opts.dur);
    }
    filt.Q.value = opts.q ?? 1.2;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(opts.gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    src.connect(filt).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t0 + opts.dur + 0.02);
  }

  /**
   * The main gun. NOCTURNE's rotary cannon and HALCYON's rifle are different
   * cues, so the firing mech is passed through where it is known.
   */
  shootLight(mechId?: string): void {
    if (this.play(mechId === 'nocturne' ? 'fire_autocannon' : 'fire_vulcan')) return;
    this.tone({ type: 'square', from: 900, to: 260, dur: 0.07, gain: 0.14 });
    this.burst({ dur: 0.05, gain: 0.1, freq: 2600, sweepTo: 700 });
  }

  shootHeavy(): void {
    if (this.play('fire_heavy')) return;
    this.tone({ type: 'sawtooth', from: 420, to: 90, dur: 0.2, gain: 0.2 });
    this.burst({ dur: 0.16, gain: 0.16, freq: 1200, sweepTo: 220 });
  }

  beam(): void {
    if (this.play('fire_beam')) return;
    this.tone({ type: 'sawtooth', from: 180, to: 1400, dur: 0.26, gain: 0.16 });
    this.tone({ type: 'sine', from: 1600, to: 400, dur: 0.3, gain: 0.1, delay: 0.04 });
  }

  missile(): void {
    if (this.play('fire_missile')) return;
    this.burst({ dur: 0.3, gain: 0.13, freq: 700, sweepTo: 2200, q: 0.8 });
    this.tone({ type: 'triangle', from: 240, to: 520, dur: 0.28, gain: 0.08 });
  }

  /** The 5-way spread. No distinct sim event yet; wired for when one exists. */
  scatter(): void {
    if (this.play('fire_scatter')) return;
    this.burst({ dur: 0.12, gain: 0.18, freq: 1800, sweepTo: 400, q: 0.6 });
  }

  hit(): void {
    if (this.play('hit_light')) return;
    this.burst({ dur: 0.1, gain: 0.24, freq: 1500, sweepTo: 200, q: 0.7 });
    this.tone({ type: 'square', from: 300, to: 70, dur: 0.1, gain: 0.16 });
  }

  heavyHit(): void {
    if (this.play('hit_heavy')) return;
    this.burst({ dur: 0.24, gain: 0.3, freq: 900, sweepTo: 90, q: 0.6 });
    this.tone({ type: 'sawtooth', from: 200, to: 45, dur: 0.28, gain: 0.22 });
  }

  guard(): void {
    if (this.play('hit_guard')) return;
    this.tone({ type: 'triangle', from: 1300, to: 900, dur: 0.09, gain: 0.15 });
    this.burst({ dur: 0.07, gain: 0.09, freq: 3400, q: 3 });
  }

  absorb(): void {
    if (this.play('hit_absorb')) return;
    this.tone({ type: 'sine', from: 500, to: 1700, dur: 0.16, gain: 0.13 });
  }

  barrier(): void {
    if (this.play('barrier_burst')) return;
    this.tone({ type: 'sine', from: 260, to: 1100, dur: 0.22, gain: 0.16 });
    this.burst({ dur: 0.2, gain: 0.08, freq: 2400, sweepTo: 900, q: 2 });
  }

  guardBreak(): void {
    if (this.play('guard_break')) return;
    this.burst({ dur: 0.4, gain: 0.28, freq: 2200, sweepTo: 120, q: 0.5 });
    this.tone({ type: 'square', from: 500, to: 60, dur: 0.4, gain: 0.18 });
  }

  /**
   * A saturation burst running dry: a reactor spinning down.
   *
   * Borrows the guard-break sample, which is already the right shape — a sharp
   * failure collapsing into nothing — under a synthesised descending tone that
   * plays regardless, so the burnout is distinguishable from an actual guard
   * break by ear even when the sample set is present.
   */
  satBurnout(): void {
    this.tone({ type: 'sawtooth', from: 420, to: 55, dur: 0.55, gain: 0.16 });
    if (this.play('guard_break')) return;
    this.burst({ dur: 0.5, gain: 0.2, freq: 1400, sweepTo: 90, q: 0.7 });
  }

  dash(): void {
    if (this.play('dash')) return;
    this.burst({ dur: 0.16, gain: 0.16, freq: 500, sweepTo: 3200, q: 0.9 });
  }

  /** Leaving the ground into flight mode. */
  takeoff(): void {
    if (this.play('takeoff')) return;
    this.burst({ dur: 0.3, gain: 0.18, freq: 400, sweepTo: 2400, q: 0.8 });
    this.tone({ type: 'triangle', from: 160, to: 420, dur: 0.32, gain: 0.1 });
  }

  /** Feet hitting the deck. Previously had effects but no sound at all. */
  land(): void {
    if (this.play('land')) return;
    this.burst({ dur: 0.26, gain: 0.26, freq: 700, sweepTo: 60, q: 0.5 });
    this.tone({ type: 'sawtooth', from: 180, to: 40, dur: 0.24, gain: 0.18 });
  }

  /** One step of the grounded walk cycle. */
  footstep(): void {
    if (this.play('footstep')) return;
    this.burst({ dur: 0.12, gain: 0.14, freq: 520, sweepTo: 70, q: 0.6 });
  }

  /** Order acknowledged: a short rising two-note chirp from the drone. */
  assist(): void {
    if (this.play('assist_order')) return;
    this.tone({ type: 'square', from: 880, to: 1320, dur: 0.07, gain: 0.09 });
    this.tone({ type: 'sine', from: 1760, to: 2100, dur: 0.10, gain: 0.06 });
  }

  /** Refused: a flat, obviously-negative buzz, so a dead press is never silent. */
  assistDenied(): void {
    if (this.play('assist_denied')) return;
    this.tone({ type: 'square', from: 320, to: 190, dur: 0.13, gain: 0.09 });
  }

  /** The drone's own volley leaving it — lighter than the mech's weapons. */
  assistFire(): void {
    if (this.play('assist_fire')) return;
    this.burst({ dur: 0.18, gain: 0.09, freq: 900, sweepTo: 2400, q: 0.8 });
  }

  /**
   * The drone folding back into the chassis.
   *
   * Borrows the interface "back" cue, which is exactly the shape this wants — a
   * descending chirp answering the rising one the launch plays — and which had
   * no trigger in the battle scene until now.
   */
  droneRecall(): void {
    if (this.play('ui_back')) return;
    this.tone({ type: 'square', from: 1320, to: 760, dur: 0.09, gain: 0.08 });
    this.tone({ type: 'sine', from: 900, to: 520, dur: 0.12, gain: 0.05 });
  }

  /**
   * A status element takes hold. Each element has its own cue so they stay
   * distinguishable by ear during a firefight; the synthesised fallback is a
   * single generic warble, which is the one place samples add real information.
   */
  status(element?: string): void {
    if (element && this.play(`status_${element}`)) return;
    this.tone({ type: 'sawtooth', from: 240, to: 620, dur: 0.20, gain: 0.10 });
    this.burst({ dur: 0.18, gain: 0.06, freq: 1800, sweepTo: 700, q: 2.2 });
  }

  /**
   * A melee swing.
   *
   * `cue` selects the sound family: blades escalate through the swing cues as
   * `stage` climbs, while claws, rams and pile drivers use the mechanical cue.
   * This used to test for `mechId === 'nocturne'`, which silently broke the
   * moment a second chassis stopped carrying a sword.
   */
  melee(stage: number, cue: 'blade' | 'mechanical' = 'blade'): void {
    if (cue === 'mechanical') {
      if (this.play('melee_claw')) return;
    } else {
      const name = stage <= 1 ? 'melee_swing_light' : stage <= 3 ? 'melee_swing_mid' : 'melee_swing_finish';
      if (this.play(name)) return;
    }
    const base = 700 + stage * 260;
    this.tone({ type: 'sawtooth', from: base, to: base * 0.35, dur: 0.13, gain: 0.16 });
    this.burst({ dur: 0.1, gain: 0.12, freq: 4200, sweepTo: 1200, q: 1.6 });
  }

  /** Beam saber igniting as a melee sequence opens. */
  meleeIgnite(): void {
    if (this.play('melee_ignite')) return;
    this.tone({ type: 'sawtooth', from: 200, to: 900, dur: 0.22, gain: 0.12 });
  }

  saturation(): void {
    if (this.play('saturation')) return;
    this.tone({ type: 'sine', from: 180, to: 1500, dur: 0.5, gain: 0.2 });
    this.tone({ type: 'triangle', from: 360, to: 3000, dur: 0.45, gain: 0.12, delay: 0.05 });
  }

  modeCycle(): void {
    if (this.play('mode_cycle')) return;
    this.tone({ type: 'square', from: 1200, to: 1600, dur: 0.05, gain: 0.09 });
  }

  explode(big: boolean): void {
    if (this.play(big ? 'explode_big' : 'explode_small')) return;
    this.burst({ dur: big ? 1.1 : 0.45, gain: big ? 0.4 : 0.26, freq: big ? 700 : 1100, sweepTo: 50, q: 0.4 });
    this.tone({ type: 'sawtooth', from: big ? 160 : 240, to: 28, dur: big ? 1.0 : 0.4, gain: big ? 0.3 : 0.2 });
    if (big) this.burst({ dur: 0.7, gain: 0.2, freq: 300, sweepTo: 40, q: 0.5, delay: 0.12 });
  }

  uiMove(): void {
    if (this.play('ui_move')) return;
    this.tone({ type: 'square', from: 700, to: 900, dur: 0.04, gain: 0.08 });
  }

  uiConfirm(): void {
    if (this.play('ui_confirm')) return;
    this.tone({ type: 'square', from: 700, to: 1500, dur: 0.1, gain: 0.12 });
  }

  /** Cancel / back out of a menu. */
  uiBack(): void {
    if (this.play('ui_back')) return;
    this.tone({ type: 'square', from: 900, to: 480, dur: 0.09, gain: 0.1 });
  }

  /** "READY" banner at match start. */
  matchReady(): void {
    if (this.play('match_ready')) return;
    this.tone({ type: 'square', from: 600, to: 900, dur: 0.3, gain: 0.14 });
  }

  /** "FIGHT" banner as control unlocks. */
  matchFight(): void {
    if (this.play('match_fight')) return;
    this.tone({ type: 'sawtooth', from: 1200, to: 700, dur: 0.26, gain: 0.18 });
  }

  ko(): void {
    if (this.play('ko')) return;
    this.tone({ type: 'sawtooth', from: 700, to: 90, dur: 0.8, gain: 0.24 });
  }
}

/** One shared instance; audio is global to the app. */
export const sfx = new Sfx();
