import Phaser from 'phaser';
import { Btn, emptyInput, type InputFrame } from '../combat/types';

/**
 * Turns keyboard and gamepad state into the simulation's `InputFrame`.
 *
 * Notes
 * -----
 * * Directions are snapped to 8 ways, so keyboard and stick play identically.
 * * Gamepad support is optional and hot-pluggable: every gamepad read is guarded
 *   so unplugging a pad mid-match cannot throw (a definition-of-done item).
 * * The Boost button is deliberately overloaded, mirroring the reference's
 *   direction+button "SpeedUp": tap with a direction = dash, hold with a
 *   direction = boost, hold with no direction = air brake.
 */

export interface UiEdges {
  pause: boolean;
  confirm: boolean;
  cancel: boolean;
  toggleDebug: boolean;
  toggleHitboxes: boolean;
  up: boolean;
  down: boolean;
}

const AXIS_DEADZONE = 0.35;

export class InputManager {
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private prevHeld = 0;
  private prevUi: Record<keyof UiEdges, boolean> = {
    pause: false,
    confirm: false,
    cancel: false,
    toggleDebug: false,
    toggleHitboxes: false,
    up: false,
    down: false,
  };

  /** Set true whenever a gamepad has been seen; purely informational for the HUD. */
  padConnected = false;
  padId = '';

  constructor(private readonly scene: Phaser.Scene) {
    const kb = scene.input.keyboard;
    if (!kb) {
      this.keys = {} as Record<string, Phaser.Input.Keyboard.Key>;
      return;
    }
    this.keys = kb.addKeys(
      'W,A,S,D,UP,DOWN,LEFT,RIGHT,J,K,L,F,E,Q,TAB,SHIFT,SPACE,ESC,P,ENTER,ONE,F1,F2',
    ) as Record<string, Phaser.Input.Keyboard.Key>;
    // Stop Tab/Space/arrows from scrolling or moving focus out of the canvas.
    kb.addCapture(['TAB', 'SPACE', 'UP', 'DOWN', 'LEFT', 'RIGHT']);
  }

  private down(name: string): boolean {
    const k = this.keys[name];
    return k ? k.isDown : false;
  }

  /** First connected pad, or null. Never throws when the pad vanishes. */
  private pad(): Phaser.Input.Gamepad.Gamepad | null {
    try {
      const gp = this.scene.input.gamepad;
      if (!gp || gp.total === 0) return null;
      const pad = gp.pad1 ?? gp.getPad(0) ?? null;
      if (pad && pad.connected) {
        this.padConnected = true;
        this.padId = pad.id ?? '';
        return pad;
      }
      return null;
    } catch {
      return null;
    }
  }

  private padButton(pad: Phaser.Input.Gamepad.Gamepad | null, index: number): boolean {
    if (!pad) return false;
    try {
      const b = pad.buttons[index];
      return !!b && b.pressed;
    } catch {
      return false;
    }
  }

  private padAxis(pad: Phaser.Input.Gamepad.Gamepad | null, index: number): number {
    if (!pad) return 0;
    try {
      const a = pad.axes[index];
      if (!a) return 0;
      const v = a.getValue();
      return Math.abs(v) < AXIS_DEADZONE ? 0 : v;
    } catch {
      return 0;
    }
  }

  /** Builds this tick's simulation input. */
  read(): InputFrame {
    const f = emptyInput();
    const pad = this.pad();

    // ---- direction -------------------------------------------------------
    let dx = 0;
    let dy = 0;
    if (this.down('A') || this.down('LEFT')) dx -= 1;
    if (this.down('D') || this.down('RIGHT')) dx += 1;
    if (this.down('W') || this.down('UP')) dy -= 1;
    if (this.down('S') || this.down('DOWN')) dy += 1;

    if (pad) {
      const ax = this.padAxis(pad, 0);
      const ay = this.padAxis(pad, 1);
      if (ax !== 0) dx += Math.sign(ax);
      if (ay !== 0) dy += Math.sign(ay);
      // D-pad, when the pad reports it as buttons 12..15.
      if (this.padButton(pad, 12)) dy -= 1;
      if (this.padButton(pad, 13)) dy += 1;
      if (this.padButton(pad, 14)) dx -= 1;
      if (this.padButton(pad, 15)) dx += 1;
    }

    f.dx = Math.sign(dx);
    f.dy = Math.sign(dy);

    // ---- buttons ---------------------------------------------------------
    let held = 0;
    const set = (b: Btn, on: boolean) => {
      if (on) held |= 1 << b;
    };

    set(Btn.Main, this.down('J') || this.padButton(pad, 0));
    set(Btn.Heavy, this.down('K') || this.padButton(pad, 2) || this.padButton(pad, 3));
    set(Btn.Sub, this.down('L') || this.padButton(pad, 1));
    set(
      Btn.Boost,
      this.down('SHIFT') || this.down('SPACE') || this.padButton(pad, 5) || this.padButton(pad, 7),
    );
    set(Btn.Barrier, this.down('F') || this.padButton(pad, 4) || this.padButton(pad, 6));
    set(Btn.ModeCycle, this.down('Q') || this.down('TAB') || this.padButton(pad, 8));
    set(Btn.Lock, this.down('E') || this.padButton(pad, 10));

    f.held = held;
    f.pressed = held & ~this.prevHeld;
    this.prevHeld = held;

    // ---- manual aim (right stick) ---------------------------------------
    const rx = this.padAxis(pad, 2);
    const ry = this.padAxis(pad, 3);
    if (rx !== 0 || ry !== 0) {
      f.aimX = rx;
      f.aimY = ry;
    }

    return f;
  }

  /** One-shot UI edges (menus, pause, debug toggles). */
  readUi(): UiEdges {
    const pad = this.pad();
    const now: Record<keyof UiEdges, boolean> = {
      pause: this.down('ESC') || this.down('P') || this.padButton(pad, 9),
      confirm: this.down('ENTER') || this.down('J') || this.padButton(pad, 0),
      cancel: this.down('ESC') || this.padButton(pad, 1),
      toggleDebug: this.down('F1'),
      toggleHitboxes: this.down('F2'),
      up: this.down('W') || this.down('UP') || this.padButton(pad, 12),
      down: this.down('S') || this.down('DOWN') || this.padButton(pad, 13),
    };

    const edges = {} as UiEdges;
    for (const k of Object.keys(now) as (keyof UiEdges)[]) {
      edges[k] = now[k] && !this.prevUi[k];
      this.prevUi[k] = now[k];
    }
    return edges;
  }

  /** Clears edge tracking, so a scene change does not inherit a stale press. */
  reset(): void {
    this.prevHeld = 0;
    for (const k of Object.keys(this.prevUi) as (keyof UiEdges)[]) this.prevUi[k] = true;
  }
}
