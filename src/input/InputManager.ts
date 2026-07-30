import Phaser from 'phaser';
import { Btn, emptyInput, type InputFrame } from '../combat/types';
import { keyState } from './KeyState';
import { loadBindings, type ActionId, type BindingMap } from './Bindings';

/**
 * Turns keyboard and gamepad state into the simulation's `InputFrame`.
 *
 * Notes
 * -----
 * * Every control is user-remappable; this reads whatever `Bindings` says.
 *   Keyboard state comes from the global physical-key tracker rather than
 *   Phaser's pre-registered keys, because any key may be bound at runtime.
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

/** Bindings are global to the app; scenes share one live copy. */
let bindings: BindingMap = loadBindings();

export function getBindings(): BindingMap {
  return bindings;
}

export function setBindings(next: BindingMap): void {
  bindings = next;
}

export class InputManager {
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

  padConnected = false;
  padId = '';

  constructor(private readonly scene: Phaser.Scene) {
    keyState.start();
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

  /** True when any input bound to `action` is currently active. */
  private active(action: ActionId, pad: Phaser.Input.Gamepad.Gamepad | null): boolean {
    const b = bindings[action];
    if (!b) return false;
    if (keyState.anyDown(b.keys)) return true;
    for (const p of b.pads) {
      if (this.padButton(pad, p)) return true;
    }
    return false;
  }

  /** Builds this tick's simulation input. */
  read(): InputFrame {
    const f = emptyInput();
    const pad = this.pad();

    // ---- direction -------------------------------------------------------
    let dx = 0;
    let dy = 0;
    if (this.active('left', pad)) dx -= 1;
    if (this.active('right', pad)) dx += 1;
    if (this.active('up', pad)) dy -= 1;
    if (this.active('down', pad)) dy += 1;

    // Analogue stick always contributes, independently of bindings.
    const ax = this.padAxis(pad, 0);
    const ay = this.padAxis(pad, 1);
    if (ax !== 0) dx += Math.sign(ax);
    if (ay !== 0) dy += Math.sign(ay);

    f.dx = Math.sign(dx);
    f.dy = Math.sign(dy);

    // ---- buttons ---------------------------------------------------------
    let held = 0;
    const set = (b: Btn, on: boolean) => {
      if (on) held |= 1 << b;
    };

    set(Btn.Main, this.active('main', pad));
    set(Btn.Heavy, this.active('heavy', pad));
    set(Btn.Sub, this.active('sub', pad));
    set(Btn.Boost, this.active('boost', pad));
    set(Btn.Barrier, this.active('barrier', pad));
    set(Btn.ModeCycle, this.active('modeCycle', pad));
    set(Btn.Lock, this.active('lock', pad));

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
      pause: this.active('pause', pad),
      // Menu confirm/cancel keep fixed keys in addition to the bound ones, so a
      // player who unbinds something can always still navigate out.
      confirm: keyState.isDown('Enter') || this.active('main', pad),
      cancel: keyState.isDown('Escape') || this.padButton(pad, 1),
      toggleDebug: this.active('debugText', pad),
      toggleHitboxes: this.active('debugHitboxes', pad),
      up: this.active('up', pad),
      down: this.active('down', pad),
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
