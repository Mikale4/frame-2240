import Phaser from 'phaser';
import { MECHS } from '../data/mechs';
import { createEffectTextures, createPixel } from '../render/Textures';
import { VIEW_H, VIEW_W } from '../core/GameConfig';
import { sfx } from '../audio/Sfx';
import { loadAudioSettings } from '../audio/AudioSettings';
import { applyAudioSettings } from '../ui/AudioOptions';
import { session } from '../core/Session';

/**
 * Loads mech part sprites, arena layers and the sound bank, builds the
 * procedural effect textures, then hands off to the title screen.
 *
 * Missing files are tolerated throughout: art gets a magenta placeholder, audio
 * falls back to its synthesised version, and the console lists what failed. The
 * game boots from a bare checkout with no assets at all.
 */
/**
 * Chassis with exported Blender art.
 *
 * The roster is defined ahead of the art pass on purpose — a design change
 * should cost a data edit, not a day of modelling — so this list is how the
 * loader knows what actually exists. Add an id here when its sprites land.
 */
const MODELLED = new Set([
  'halcyon',
  'nocturne',
  'vesper',
  'terramoth',
  'cirrus',
  'obelisk',
  'pyre',
  'nulltide',
]);

/**
 * Chassis whose pilot portrait art exists in `assets/sprites/pilots/`.
 *
 * Empty until the portraits are delivered — see docs/PILOT_PORTRAIT_SPEC.md.
 * Add an id here when `<id>.png` and `<id>_thumb.png` land, and the loader picks
 * them up in place of the generated placeholder.
 */
const PORTRAITS = new Set<string>([
  'halcyon',
  'nocturne',
  'vesper',
  'terramoth',
  'cirrus',
  'obelisk',
  'pyre',
  'nulltide',
]);

export class BootScene extends Phaser.Scene {
  private failed: string[] = [];
  /**
   * Audio loads outside Phaser's loader, because `Sfx` owns its own
   * AudioContext and running a second graph through Phaser's sound manager
   * would only complicate mixing. Kicked off in preload, awaited in create.
   */
  private audioReady: Promise<void> = Promise.resolve();

  constructor() {
    super('Boot');
  }

  preload(): void {
    const bar = this.add.graphics();
    const label = this.add
      .text(VIEW_W / 2, VIEW_H / 2 + 34, 'LOADING', {
        fontFamily: 'ui-monospace, Consolas, monospace',
        fontSize: '14px',
        color: '#8fa3bd',
      })
      .setOrigin(0.5);

    this.load.on('progress', (p: number) => {
      bar.clear();
      bar.fillStyle(0x1a2233, 1);
      bar.fillRect(VIEW_W / 2 - 160, VIEW_H / 2, 320, 8);
      bar.fillStyle(0x4fc7ff, 1);
      bar.fillRect(VIEW_W / 2 - 160, VIEW_H / 2, 320 * p, 8);
    });
    this.load.on('complete', () => {
      bar.destroy();
      label.destroy();
    });
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      this.failed.push(file.key);
    });

    // Mech parts: assets/sprites/mechs/<mech>_<part>.png (publicDir is assets/).
    //
    // Only modelled chassis are requested. Asking for art that does not exist is
    // not merely wasteful: Vite's dev server answers an unknown path with
    // index.html and a 200, so the loader receives HTML where it expected a PNG,
    // fails to *process* rather than fails to *load*, and never fires `complete`
    // — which hangs boot entirely. The unmodelled mechs get generated
    // placeholders in create() instead.
    // One atlas per chassis rather than 14 files each: 8 requests instead of
    // 112, and Phaser can draw a whole mech from a single texture bind. The
    // drone rides in the same atlas — it is one sprite, not a rig, but it
    // belongs to the same machine.
    for (const def of Object.values(MECHS)) {
      if (!MODELLED.has(def.id)) continue;
      this.load.atlas(
        `mech_${def.id}`,
        `sprites/mechs/${def.id}.atlas.png`,
        `sprites/mechs/${def.id}.atlas.json`,
      );
    }

    // Title medallion: the faded semi-silhouette of Stillwake Yard behind the
    // title mark.
    //
    // **Hand-gated, and it must stay that way.** The dev server answers a
    // missing path with `index.html` and a 200, so a `load.image` for a file
    // that is not there hands the decoder an HTML document instead of failing —
    // the loader then waits on it forever and the game never boots. Flip this
    // to `true` in the same commit that adds the file, never before.
    // `TitleMark` draws its own placeholder while this is off.
    // Brief: `docs/TITLE_MEDALLION_BRIEF.md`.
    const TITLE_MEDALLION_ART = true;
    if (TITLE_MEDALLION_ART) this.load.image('title_stillwake', 'ui/title_stillwake.png');

    // Title screen backdrop: a mountain summit above the cloud sea.
    //
    // The title used to borrow CATHEDRAL YARD's arena layers, which spent the
    // game's only stage before the player had seen it and made a dockyard
    // interior the first impression of a game about flight. It has its own vista
    // now. Same hand-gating rule as the medallion above, for the same reason.
    // Brief: `docs/TITLE_STAGE_ART_BRIEF.md`.
    const TITLE_STAGE_ART = true;
    if (TITLE_STAGE_ART) {
      // `yards` is absent on purpose — see TitleScene's TITLE_LAYERS. Add it
      // here and to that list in the same commit as the file, never before.
      for (const l of ['sky', 'sea', 'structure', 'deck']) {
        this.load.image(`title_${l}`, `ui/title_${l}.png`);
      }
    }

    // Arena parallax layers.
    // `fore` is the fast foreground: free-standing girder columns that sweep
    // past in front of the machines. Added in D124 with the hand-authored art.
    for (const layer of ['sky', 'far', 'haze', 'mid', 'near', 'fore']) {
      this.load.image(`arena_${layer}`, `arenas/arena_${layer}.png`);
    }

    // Pilot portraits, for the mechs that have them.
    for (const id of PORTRAITS) {
      this.load.image(`pilot_${id}`, `sprites/pilots/${id}.png`);
      this.load.image(`pilot_${id}_thumb`, `sprites/pilots/${id}_thumb.png`);
    }

    // Volume levels, before anything can make a sound. A stored mix has to be in
    // force by the first menu blip, not applied once a settings screen is opened.
    session.audio = loadAudioSettings();
    applyAudioSettings();

    // Sound bank. Runs alongside Phaser's loader rather than inside it.
    this.audioReady = sfx.load();
  }

  /**
   * Draws a stand-in part for a chassis that has not been modelled yet.
   *
   * Deliberately not the magenta "missing asset" marker: these are not mistakes,
   * they are scheduled work. Each mech gets plates in its own palette so the
   * roster is legible and playable — you can tell CIRRUS from TERRAMOTH at a
   * glance — while still reading as unfinished.
   */
  private placeholderPart(key: string, w: number, h: number, fill: number, edge: number): void {
    if (this.textures.exists(key)) return;
    const c = this.textures.createCanvas(key, w, h);
    if (!c) return;
    const ctx = c.getContext();
    const hex = (v: number) => '#' + v.toString(16).padStart(6, '0');
    ctx.fillStyle = hex(fill);
    ctx.fillRect(2, 2, w - 4, h - 4);
    ctx.strokeStyle = hex(edge);
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, w - 4, h - 4);
    // A diagonal marks it as provisional without obscuring the silhouette.
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.moveTo(2, h - 2);
    ctx.lineTo(w - 2, 2);
    ctx.stroke();
    c.refresh();
  }

  /**
   * Draws a stand-in pilot portrait.
   *
   * The portraits are hand-authored art (see docs/PILOT_PORTRAIT_SPEC.md) and do
   * not exist yet, so every mech gets a panel in its own colours carrying the
   * pilot's initials. Deliberately flat and obviously unfinished — it must not
   * be mistaken for the real thing — but coloured per mech so the select screen
   * is still navigable and testable.
   */
  private placeholderPortrait(key: string, px: number, def: { pilot: string; tint: { primary: number; accent: number; secondary: number } }): void {
    if (this.textures.exists(key)) return;
    const c = this.textures.createCanvas(key, px, px);
    if (!c) return;
    const ctx = c.getContext();
    const hex = (v: number) => '#' + v.toString(16).padStart(6, '0');
    ctx.fillStyle = hex(def.tint.secondary);
    ctx.fillRect(0, 0, px, px);
    ctx.fillStyle = hex(def.tint.primary);
    ctx.fillRect(px * 0.12, px * 0.12, px * 0.76, px * 0.76);
    ctx.strokeStyle = hex(def.tint.accent);
    ctx.lineWidth = Math.max(2, px * 0.02);
    ctx.strokeRect(px * 0.12, px * 0.12, px * 0.76, px * 0.76);
    // Pilot initials, so the eight placeholders are still distinguishable.
    const initials = def.pilot
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .slice(0, 2);
    ctx.fillStyle = hex(def.tint.accent);
    ctx.font = `bold ${Math.floor(px * 0.34)}px ui-monospace, Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials, px / 2, px * 0.47);
    ctx.font = `${Math.floor(px * 0.075)}px ui-monospace, Consolas, monospace`;
    ctx.fillText('NO PORTRAIT', px / 2, px * 0.78);
    c.refresh();
  }

  /** Part footprints, in logical px, so a placeholder rig reads as a machine. */
  private static readonly PART_SIZE: Record<string, [number, number]> = {
    core: [58, 52],
    head: [24, 20],
    backpack: [42, 40],
    lowerBody: [44, 30],
    legFar: [26, 62],
    legNear: [26, 62],
    leftArm: [30, 44],
    rightArm: [34, 26],
    mainWeapon: [56, 18],
    subWeapon: [26, 30],
    meleeWeapon: [46, 12],
    leftThruster: [30, 22],
    rightThruster: [30, 22],
    drone: [34, 26],
  };

  create(): void {
    createEffectTextures(this);
    createPixel(this);

    // Stand-ins for every chassis still awaiting its Blender pass.
    for (const def of Object.values(MECHS)) {
      if (MODELLED.has(def.id)) continue;
      for (const part of def.rig.parts) {
        const [w, h] = BootScene.PART_SIZE[part.name] ?? [30, 30];
        this.placeholderPart(`mech_${def.id}_${part.name}`, w, h, def.tint.primary, def.tint.accent);
      }
      const [dw, dh] = BootScene.PART_SIZE.drone;
      this.placeholderPart(`mech_${def.id}_drone`, dw, dh, def.tint.secondary, def.tint.glow);
    }

    // Pilot portraits. None are authored yet, so every mech gets a placeholder;
    // as real art lands, add its id to PORTRAITS and it is loaded in preload()
    // instead. Requesting files that do not exist would hang boot — Vite's dev
    // server answers unknown paths with index.html and a 200.
    for (const def of Object.values(MECHS)) {
      if (PORTRAITS.has(def.id)) continue;
      this.placeholderPortrait(`pilot_${def.id}`, 256, def);
      this.placeholderPortrait(`pilot_${def.id}_thumb`, 96, def);
    }

    if (this.failed.length > 0) {
      console.warn(
        `[Boot] ${this.failed.length} asset(s) failed to load; substituting placeholders:`,
        this.failed,
      );
      // Make a visible magenta placeholder so a missing export is obvious
      // rather than silently invisible.
      const key = '__missing';
      if (!this.textures.exists(key)) {
        const c = this.textures.createCanvas(key, 64, 64);
        if (c) {
          const ctx = c.getContext();
          ctx.fillStyle = '#ff00aa';
          ctx.fillRect(0, 0, 64, 64);
          ctx.fillStyle = '#220011';
          ctx.fillRect(0, 0, 32, 32);
          ctx.fillRect(32, 32, 32, 32);
          c.refresh();
        }
      }
      for (const k of this.failed) {
        if (!this.textures.exists(k)) {
          this.textures.addImage(k, this.textures.get(key).getSourceImage() as HTMLImageElement);
        }
      }
    }

    // Wait for audio before the title, so the first menu blip is already the
    // real sample rather than the fallback. This never rejects: a failed load
    // simply leaves the procedural path in charge.
    void this.audioReady.then(() => {
      if (sfx.loadFailures.length > 0) {
        console.warn(
          `[Boot] ${sfx.loadFailures.length} audio file(s) failed to load; using the synthesised fallback for those cues:`,
          sfx.loadFailures,
        );
      }
      if (!sfx.usingSamples) {
        console.info('[Boot] no audio samples loaded; all sound is synthesised.');
      }
      this.scene.start('Title');
    });
  }
}
