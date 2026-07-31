import { musicAvailable, musicCue, musicFile } from './MusicBank';
import { DEFAULT_MUSIC_STEP, stepToGain } from './AudioSettings';
import { sfx } from './Sfx';

/**
 * The soundtrack player.
 *
 * **Streamed, not decoded.** `SoundBank` pulls every effect into memory as an
 * `AudioBuffer`, which is right for 71 files averaging a fifth of a second and
 * catastrophic for sixteen three-minute tracks: decoded PCM runs about 23 MB per
 * stereo minute, so the same approach would cost roughly a gigabyte of resident
 * memory for the album. Each track is therefore an `HTMLAudioElement` routed
 * through a `MediaElementAudioSourceNode` — the browser streams and decodes it
 * incrementally, and it still lands in the same audio graph as the effects, so
 * gain, ducking and muting are ordinary Web Audio.
 *
 * The bus is `voice.gain → duck → master → destination`:
 *
 * - **voice.gain** is per-track, and is where cross-fades happen.
 * - **duck** is the whole soundtrack stepping aside for the saturation cutscene
 *   and the pause menu.
 * - **master** is the mix level and the mute switch.
 *
 * Every level change is an `AudioParam` ramp, so nothing here needs a per-frame
 * update call and fades survive a scene transition mid-flight.
 */

/** How far the soundtrack drops when something needs to be heard over it. */
const DUCK_LEVEL = 0.3;
/** Seconds to fall into a duck, and to climb back out of one. */
const DUCK_IN = 0.12;
const DUCK_OUT = 0.4;
/** Default cross-fade between two different tracks. */
const XFADE = 0.9;
/**
 * Cross-fade at the loop seam.
 *
 * The cue sheet deliberately does not ask Suno for seamless loops, because
 * asking would cost length and these tracks are long precisely so a match does
 * not hear the same bar twice. Instead the track is faded into a second copy of
 * itself before the file runs out, which turns any ending into an acceptable
 * one. Longer than a scene cross-fade: the two sides are the same music, so
 * there is nothing to resolve quickly.
 */
const LOOP_XFADE = 2.5;
/** How often the seam is checked. Cheap, and 100ms is far inside LOOP_XFADE. */
const SEAM_POLL_MS = 100;

interface Voice {
  cue: string;
  el: HTMLAudioElement;
  gain: GainNode;
  /** True once this voice has spawned its successor, so it only does it once. */
  looped: boolean;
  /** Set when the voice is on its way out; the seam check skips these. */
  retiring: boolean;
}

export class MusicPlayer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private duckNode: GainNode | null = null;

  private voices: Voice[] = [];
  /** The cue the player is *meant* to be on, whether or not it has started. */
  private wanted: string | null = null;
  /**
   * Set when playback was refused for want of a user gesture.
   *
   * The title screen is reached without anyone necessarily having pressed
   * anything, and browsers will not start audio unprompted. Rather than treat
   * that as a failure, the cue is remembered and `unlock()` starts it on the
   * first press — which is also the moment `Sfx` resumes its context.
   */
  private blocked = false;
  private ducked = false;
  /** Music bus level; see `AudioSettings`. Restored from storage at boot. */
  private level = stepToGain(DEFAULT_MUSIC_STEP);

  private timer: ReturnType<typeof setInterval> | null = null;

  /** False in Node, where there is no media element to stream through. */
  private get supported(): boolean {
    return typeof document !== 'undefined' && typeof Audio !== 'undefined';
  }

  /** The cue currently wanted, for tests and the debug overlay. */
  get current(): string | null {
    return this.wanted;
  }

  /** True when a track is actually audible, as opposed to merely requested. */
  get playing(): boolean {
    return this.voices.some((v) => !v.retiring && !v.el.paused);
  }

  private ensure(): boolean {
    if (!this.supported) return false;
    if (this.ctx) return true;
    // Shares the effects graph; see Sfx.context().
    const ctx = sfx.context();
    if (!ctx) return false;
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.level;
    this.duckNode = ctx.createGain();
    this.duckNode.gain.value = this.ducked ? DUCK_LEVEL : 1;
    this.duckNode.connect(this.master);
    this.master.connect(ctx.destination);
    if (this.timer === null) this.timer = setInterval(() => this.tick(), SEAM_POLL_MS);
    return true;
  }

  /**
   * Switches to `cue`, cross-fading out whatever is playing.
   *
   * Idempotent: asking for the track already playing does nothing at all. That
   * is what stops a rematch from restarting the music when the roll lands on the
   * same track, and what lets every scene state its own cue in `create()`
   * without having to know where it was entered from.
   *
   * `null`, an unknown name, or a track that has not been generated yet all mean
   * the same thing — fade to silence. Never a request for a path that does not
   * exist.
   */
  play(cue: string | null, fade = XFADE): void {
    const target = cue && musicAvailable(cue) ? cue : null;
    if (target === this.wanted && (this.playing || this.blocked || target === null)) return;
    this.wanted = target;

    if (!this.ensure() || !this.ctx || !this.duckNode) return;

    for (const v of this.voices) this.retire(v, fade);
    if (target === null) return;

    const v = this.spawn(target);
    if (!v) return;
    this.rampTo(v, 1, fade);
  }

  /** Fades the soundtrack out entirely. */
  stop(fade = XFADE): void {
    this.play(null, fade);
  }

  /**
   * Steps the soundtrack aside — the saturation cutscene's spoken line, and the
   * pause menu. Idempotent, so a caller can simply mirror a boolean at it.
   */
  duck(on: boolean): void {
    if (on === this.ducked) return;
    this.ducked = on;
    if (!this.ensure() || !this.ctx || !this.duckNode) return;
    const g = this.duckNode.gain;
    const now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(on ? DUCK_LEVEL : 1, now + (on ? DUCK_IN : DUCK_OUT));
  }

  /**
   * Sets the music bus level. Ramped rather than stepped, so holding the arrow
   * key through the menu slider sweeps instead of clicking.
   */
  setGain(g: number): void {
    this.level = Math.max(0, g);
    if (!this.master || !this.ctx) return;
    const p = this.master.gain;
    const now = this.ctx.currentTime;
    p.cancelScheduledValues(now);
    p.setValueAtTime(p.value, now);
    p.linearRampToValueAtTime(this.level, now + 0.12);
  }

  /**
   * Called from a user gesture. Starts whatever was blocked by autoplay policy.
   */
  unlock(): void {
    if (!this.blocked || this.wanted === null) return;
    this.blocked = false;
    const cue = this.wanted;
    this.wanted = null; // force play() past its idempotence check
    this.play(cue, 0.35);
  }

  // ------------------------------------------------------------------ voices

  private spawn(cue: string, startAt = 0): Voice | null {
    if (!this.ctx || !this.duckNode) return null;
    let el: HTMLAudioElement;
    try {
      el = new Audio(musicFile(cue));
    } catch {
      return null;
    }
    el.preload = 'auto';
    // Looping is handled here, not by the element: the native loop is a hard cut
    // at the seam, and these files are not seamless.
    el.loop = false;
    el.currentTime = startAt;

    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    let node: MediaElementAudioSourceNode;
    try {
      node = this.ctx.createMediaElementSource(el);
    } catch {
      return null;
    }
    node.connect(gain).connect(this.duckNode);

    const voice: Voice = { cue, el, gain, looped: false, retiring: false };
    this.voices.push(voice);

    void el.play().catch(() => {
      // Autoplay policy, almost always. Remember the intent and wait for a press.
      this.blocked = true;
      this.drop(voice);
    });
    // A voice that ends despite the seam handling (a short file, a stall) must
    // not linger as a silent element holding a decoder open.
    el.addEventListener('ended', () => this.drop(voice));
    return voice;
  }

  /** Ramps one voice to `to` over `secs`, honouring its per-cue gain. */
  private rampTo(v: Voice, to: number, secs: number): void {
    if (!this.ctx) return;
    const peak = to * (musicCue(v.cue)?.gain ?? 1);
    const g = v.gain.gain;
    const now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    if (secs <= 0) g.setValueAtTime(peak, now);
    else g.linearRampToValueAtTime(peak, now + secs);
  }

  private retire(v: Voice, fade: number): void {
    if (v.retiring) return;
    v.retiring = true;
    this.rampTo(v, 0, fade);
    setTimeout(() => this.drop(v), Math.max(0, fade * 1000) + 60);
  }

  private drop(v: Voice): void {
    const i = this.voices.indexOf(v);
    if (i >= 0) this.voices.splice(i, 1);
    try {
      v.el.pause();
      // Releases the network request and the decoder. Without this a rematch
      // leaks one streaming element per track change.
      v.el.removeAttribute('src');
      v.el.load();
    } catch {
      // Already torn down; nothing to do.
    }
    try {
      v.gain.disconnect();
    } catch {
      // Already disconnected.
    }
  }

  /**
   * The loop seam.
   *
   * When the playing voice comes within `LOOP_XFADE` of the end of its file, a
   * second copy of the same track starts from the top and the two cross-fade.
   * `duration` is NaN until metadata arrives, which is exactly when there is
   * nothing to do yet.
   */
  private tick(): void {
    for (const v of this.voices) {
      if (v.retiring || v.looped || v.cue !== this.wanted) continue;
      const dur = v.el.duration;
      if (!Number.isFinite(dur) || dur <= LOOP_XFADE * 2) continue;
      if (v.el.currentTime < dur - LOOP_XFADE) continue;
      v.looped = true;
      const next = this.spawn(v.cue);
      if (!next) continue;
      this.rampTo(next, 1, LOOP_XFADE);
      this.retire(v, LOOP_XFADE);
    }
  }
}

/** One shared instance; the soundtrack is global to the app. */
export const music = new MusicPlayer();
