import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../core/GameConfig';
import { sfx } from '../audio/Sfx';
import { keyState } from '../input/KeyState';
import { getBindings, setBindings } from '../input/InputManager';
import {
  ACTION_LABELS,
  ACTION_ORDER,
  assignKey,
  assignPad,
  clearAction,
  cloneBindings,
  defaultBindings,
  describeBinding,
  saveBindings,
  unboundActions,
} from '../input/Bindings';

const FONT = 'ui-monospace, Consolas, monospace';
const ROWS_VISIBLE = 10;
const ROW_H = 26;

/**
 * Interactive control remapping.
 *
 * Navigate with up/down, ENTER to rebind (the next key or gamepad button
 * pressed is captured), BACKSPACE to unbind, R to restore defaults, ESC to
 * close. Assigning a key that is already used elsewhere moves it, so one
 * physical key can never drive two actions.
 */
export class BindingsPanel {
  private readonly root: Phaser.GameObjects.Container;
  private readonly rows: Array<{
    label: Phaser.GameObjects.Text;
    value: Phaser.GameObjects.Text;
  }> = [];
  private readonly hint: Phaser.GameObjects.Text;
  private readonly warn: Phaser.GameObjects.Text;
  private readonly scrollUp: Phaser.GameObjects.Text;
  private readonly scrollDown: Phaser.GameObjects.Text;

  private index = 0;
  private scroll = 0;
  private capturing = false;
  private unsubscribe: (() => void) | null = null;
  /** Ticks to ignore gamepad input after entering capture, so the confirming
   *  press is not immediately captured as the new binding. */
  private padGrace = 0;

  constructor(scene: Phaser.Scene, private readonly onClose: () => void) {
    this.root = scene.add.container(0, 0).setDepth(1400).setScrollFactor(0);

    const panel = scene.add
      .rectangle(VIEW_W / 2, VIEW_H / 2, 760, 452, 0x070b14, 0.97)
      .setStrokeStyle(2, 0x3a4c66, 1);
    this.root.add(panel);

    const title = scene.add
      .text(VIEW_W / 2, VIEW_H / 2 - 196, 'CONTROLS', {
        fontFamily: FONT,
        fontSize: '24px',
        color: '#ffd166',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0.5)
      .setStroke('#070b12', 6);
    this.root.add(title);

    const top = VIEW_H / 2 - 152;
    for (let i = 0; i < ROWS_VISIBLE; i++) {
      const y = top + i * ROW_H;
      const label = scene.add
        .text(VIEW_W / 2 - 344, y, '', { fontFamily: FONT, fontSize: '13px', color: '#9fb4d0' })
        .setOrigin(0, 0.5);
      const value = scene.add
        .text(VIEW_W / 2 + 344, y, '', { fontFamily: FONT, fontSize: '13px', color: '#ffd9a0' })
        .setOrigin(1, 0.5);
      this.rows.push({ label, value });
      this.root.add([label, value]);
    }

    this.scrollUp = scene.add
      .text(VIEW_W / 2, top - 18, '▲', { fontFamily: FONT, fontSize: '11px', color: '#55677f' })
      .setOrigin(0.5);
    this.scrollDown = scene.add
      .text(VIEW_W / 2, top + ROWS_VISIBLE * ROW_H - 4, '▼', {
        fontFamily: FONT,
        fontSize: '11px',
        color: '#55677f',
      })
      .setOrigin(0.5);
    this.root.add([this.scrollUp, this.scrollDown]);

    // Motion inputs are directional grammar, not bindable buttons, so they are
    // documented here rather than listed as remappable rows.
    const motions = scene.add
      .text(
        VIEW_W / 2,
        VIEW_H / 2 + 118,
        'MOTIONS (not rebindable):  DOWN,FORWARD+MAIN = SCATTER   ' +
          'DOWN,BACK+HEAVY = LANCE   DOWN,FORWARD+SUB = SALVO\n' +
          'BOOST is one button: tap+direction = DASH, hold+direction = BOOST, ' +
          'hold with no direction = AIR BRAKE',
        { fontFamily: FONT, fontSize: '11px', color: '#7d8ea8', align: 'center' },
      )
      .setOrigin(0.5)
      .setStroke('#070b12', 4);
    this.root.add(motions);

    this.warn = scene.add
      .text(VIEW_W / 2, VIEW_H / 2 + 156, '', {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#ff9a6a',
      })
      .setOrigin(0.5)
      .setStroke('#070b12', 4);
    this.root.add(this.warn);

    this.hint = scene.add
      .text(
        VIEW_W / 2,
        VIEW_H / 2 + 182,
        'ENTER rebind   BACKSPACE unbind   R defaults   ESC close',
        { fontFamily: FONT, fontSize: '12px', color: '#63748c' },
      )
      .setOrigin(0.5)
      .setStroke('#070b12', 4);
    this.root.add(this.hint);

    // Menu navigation needs key edges, not held state, so subscribe directly
    // rather than polling. Ignored while hidden.
    this.unsubscribe = keyState.onKeyDown((code) => {
      if (this.root.visible) this.handleKey(code);
    });
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());

    this.refresh();
  }

  get container(): Phaser.GameObjects.Container {
    return this.root;
  }

  private refresh(): void {
    const b = getBindings();

    // Keep the cursor inside the visible window.
    if (this.index < this.scroll) this.scroll = this.index;
    if (this.index >= this.scroll + ROWS_VISIBLE) this.scroll = this.index - ROWS_VISIBLE + 1;

    for (let i = 0; i < ROWS_VISIBLE; i++) {
      const actionIdx = this.scroll + i;
      const row = this.rows[i];
      if (actionIdx >= ACTION_ORDER.length) {
        row.label.setText('');
        row.value.setText('');
        continue;
      }
      const action = ACTION_ORDER[actionIdx];
      const selected = actionIdx === this.index;
      row.label.setText(`${selected ? '▸ ' : '  '}${ACTION_LABELS[action]}`);
      row.label.setColor(selected ? '#ffd166' : '#9fb4d0');

      if (selected && this.capturing) {
        row.value.setText('PRESS A KEY OR PAD BUTTON…');
        row.value.setColor('#8effc0');
      } else {
        row.value.setText(describeBinding(b[action]));
        row.value.setColor(
          b[action].keys.length === 0 && b[action].pads.length === 0 ? '#ff7a7a' : '#ffd9a0',
        );
      }
    }

    this.scrollUp.setAlpha(this.scroll > 0 ? 1 : 0.15);
    this.scrollDown.setAlpha(this.scroll + ROWS_VISIBLE < ACTION_ORDER.length ? 1 : 0.15);

    const unbound = unboundActions(b);
    this.warn.setText(
      unbound.length > 0
        ? `UNBOUND: ${unbound.map((a) => ACTION_LABELS[a]).join(', ')}`
        : '',
    );
  }

  private beginCapture(): void {
    this.capturing = true;
    this.padGrace = 18;
    keyState.clear();
    const action = ACTION_ORDER[this.index];
    keyState.captureNext((code) => {
      if (code === 'Escape') {
        this.capturing = false;
        this.refresh();
        return;
      }
      const next = assignKey(getBindings(), action, code);
      this.commit(next);
    });
    this.refresh();
  }

  private commit(next: ReturnType<typeof cloneBindings>): void {
    setBindings(next);
    saveBindings(next);
    this.capturing = false;
    sfx.uiConfirm();
    this.refresh();
  }

  /**
   * Driven every frame by the owning scene. Reads raw state rather than the
   * UiEdges struct, because while capturing we must not let bound actions fire.
   */
  update(pad: Phaser.Input.Gamepad.Gamepad | null): boolean {
    if (this.capturing) {
      if (this.padGrace > 0) {
        this.padGrace--;
      } else if (pad) {
        // A gamepad press finishes the capture too.
        try {
          for (let i = 0; i < pad.buttons.length && i < 24; i++) {
            if (pad.buttons[i]?.pressed) {
              keyState.cancelCapture();
              this.commit(assignPad(getBindings(), ACTION_ORDER[this.index], i));
              return true;
            }
          }
        } catch {
          /* pad vanished mid-capture; keyboard capture stays armed */
        }
      }
      return true;
    }
    return true;
  }

  /** Handles a discrete key press while the panel is open. Returns true if consumed. */
  handleKey(code: string): boolean {
    if (this.capturing) return true;

    switch (code) {
      case 'ArrowUp':
      case 'KeyW':
        this.index = (this.index - 1 + ACTION_ORDER.length) % ACTION_ORDER.length;
        sfx.uiMove();
        this.refresh();
        return true;
      case 'ArrowDown':
      case 'KeyS':
        this.index = (this.index + 1) % ACTION_ORDER.length;
        sfx.uiMove();
        this.refresh();
        return true;
      case 'Enter':
        this.beginCapture();
        return true;
      case 'Backspace':
      case 'Delete':
        this.commit(clearAction(getBindings(), ACTION_ORDER[this.index]));
        return true;
      case 'KeyR':
        this.commit(defaultBindings());
        return true;
      case 'Escape':
        sfx.uiConfirm();
        this.onClose();
        return true;
      default:
        return false;
    }
  }

  setVisible(v: boolean): void {
    this.root.setVisible(v);
    if (!v) {
      keyState.cancelCapture();
      this.capturing = false;
    }
  }

  get isOpen(): boolean {
    return this.root.visible;
  }

  destroy(): void {
    keyState.cancelCapture();
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.root.destroy(true);
  }
}
