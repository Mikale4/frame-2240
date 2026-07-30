/**
 * Procedural sound effects via the Web Audio API.
 *
 * Every sound is synthesised at runtime, so the game ships with no audio files
 * and all audio is original. The context is created lazily and resumed on the
 * first gesture, which browsers require.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  muted = false;

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
      this.master.gain.value = 0.32;
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

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.32;
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

  shootLight(): void {
    this.tone({ type: 'square', from: 900, to: 260, dur: 0.07, gain: 0.14 });
    this.burst({ dur: 0.05, gain: 0.1, freq: 2600, sweepTo: 700 });
  }

  shootHeavy(): void {
    this.tone({ type: 'sawtooth', from: 420, to: 90, dur: 0.2, gain: 0.2 });
    this.burst({ dur: 0.16, gain: 0.16, freq: 1200, sweepTo: 220 });
  }

  beam(): void {
    this.tone({ type: 'sawtooth', from: 180, to: 1400, dur: 0.26, gain: 0.16 });
    this.tone({ type: 'sine', from: 1600, to: 400, dur: 0.3, gain: 0.1, delay: 0.04 });
  }

  missile(): void {
    this.burst({ dur: 0.3, gain: 0.13, freq: 700, sweepTo: 2200, q: 0.8 });
    this.tone({ type: 'triangle', from: 240, to: 520, dur: 0.28, gain: 0.08 });
  }

  hit(): void {
    this.burst({ dur: 0.1, gain: 0.24, freq: 1500, sweepTo: 200, q: 0.7 });
    this.tone({ type: 'square', from: 300, to: 70, dur: 0.1, gain: 0.16 });
  }

  heavyHit(): void {
    this.burst({ dur: 0.24, gain: 0.3, freq: 900, sweepTo: 90, q: 0.6 });
    this.tone({ type: 'sawtooth', from: 200, to: 45, dur: 0.28, gain: 0.22 });
  }

  guard(): void {
    this.tone({ type: 'triangle', from: 1300, to: 900, dur: 0.09, gain: 0.15 });
    this.burst({ dur: 0.07, gain: 0.09, freq: 3400, q: 3 });
  }

  absorb(): void {
    this.tone({ type: 'sine', from: 500, to: 1700, dur: 0.16, gain: 0.13 });
  }

  barrier(): void {
    this.tone({ type: 'sine', from: 260, to: 1100, dur: 0.22, gain: 0.16 });
    this.burst({ dur: 0.2, gain: 0.08, freq: 2400, sweepTo: 900, q: 2 });
  }

  guardBreak(): void {
    this.burst({ dur: 0.4, gain: 0.28, freq: 2200, sweepTo: 120, q: 0.5 });
    this.tone({ type: 'square', from: 500, to: 60, dur: 0.4, gain: 0.18 });
  }

  dash(): void {
    this.burst({ dur: 0.16, gain: 0.16, freq: 500, sweepTo: 3200, q: 0.9 });
  }

  /** Order acknowledged: a short rising two-note chirp from the drone. */
  assist(): void {
    this.tone({ type: 'square', from: 880, to: 1320, dur: 0.07, gain: 0.09 });
    this.tone({ type: 'sine', from: 1760, to: 2100, dur: 0.10, gain: 0.06 });
  }

  /** Refused: a flat, obviously-negative buzz, so a dead press is never silent. */
  assistDenied(): void {
    this.tone({ type: 'square', from: 320, to: 190, dur: 0.13, gain: 0.09 });
  }

  melee(stage: number): void {
    const base = 700 + stage * 260;
    this.tone({ type: 'sawtooth', from: base, to: base * 0.35, dur: 0.13, gain: 0.16 });
    this.burst({ dur: 0.1, gain: 0.12, freq: 4200, sweepTo: 1200, q: 1.6 });
  }

  saturation(): void {
    this.tone({ type: 'sine', from: 180, to: 1500, dur: 0.5, gain: 0.2 });
    this.tone({ type: 'triangle', from: 360, to: 3000, dur: 0.45, gain: 0.12, delay: 0.05 });
  }

  modeCycle(): void {
    this.tone({ type: 'square', from: 1200, to: 1600, dur: 0.05, gain: 0.09 });
  }

  explode(big: boolean): void {
    this.burst({ dur: big ? 1.1 : 0.45, gain: big ? 0.4 : 0.26, freq: big ? 700 : 1100, sweepTo: 50, q: 0.4 });
    this.tone({ type: 'sawtooth', from: big ? 160 : 240, to: 28, dur: big ? 1.0 : 0.4, gain: big ? 0.3 : 0.2 });
    if (big) this.burst({ dur: 0.7, gain: 0.2, freq: 300, sweepTo: 40, q: 0.5, delay: 0.12 });
  }

  uiMove(): void {
    this.tone({ type: 'square', from: 700, to: 900, dur: 0.04, gain: 0.08 });
  }

  uiConfirm(): void {
    this.tone({ type: 'square', from: 700, to: 1500, dur: 0.1, gain: 0.12 });
  }

  ko(): void {
    this.tone({ type: 'sawtooth', from: 700, to: 90, dur: 0.8, gain: 0.24 });
  }
}

/** One shared instance; audio is global to the app. */
export const sfx = new Sfx();
