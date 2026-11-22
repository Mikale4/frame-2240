import Phaser from 'phaser';
import { VIEW_W } from '../core/GameConfig';
import { MECHS } from '../data/mechs';
import { PILOT_IDS, accounts, type PilotId } from '../account/Accounts';
import { sfx } from '../audio/Sfx';

const FONT = 'ui-monospace, Consolas, monospace';
const hex = (c: number): string => '#' + c.toString(16).padStart(6, '0');

type Mode = 'login' | 'create' | 'pilot';

interface Field {
  kind: 'text' | 'password' | 'toggle' | 'button';
  label: string;
  value: string;
  on?: boolean;
  /** Buttons only. */
  action?: () => void;
  max?: number;
  label$?: Phaser.GameObjects.Text;
  value$?: Phaser.GameObjects.Text;
  box$?: Phaser.GameObjects.Rectangle;
}

/**
 * The login, laid over the title.
 *
 * Three panels: **sign in**, **create account**, and **choose your pilot** —
 * the last step of creating an account, because the pilot you start with is
 * the only one you have. Keyboard throughout: arrows or Tab move between rows,
 * typing fills a field, Enter acts, Esc goes back. Rows also take the mouse.
 *
 * Typing is read from raw key events rather than the game's bindings, so a
 * callsign can contain the letters the action row is bound to.
 */
export class LoginPanel {
  readonly container: Phaser.GameObjects.Container;
  private mode: Mode = 'login';
  private fields: Field[] = [];
  private focus = 0;
  private message!: Phaser.GameObjects.Text;
  private busy = false;
  private caret = 0;
  private pilotIndex = 0;
  private cards: Phaser.GameObjects.Container[] = [];
  private pilotInfo!: Phaser.GameObjects.Text;
  private draft = { callsign: '', pw: '', pw2: '', remember: true };
  private readonly onKey: (e: KeyboardEvent) => void;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly onDone: () => void,
    private readonly onBack: () => void,
  ) {
    this.container = scene.add.container(0, 0).setDepth(1300);
    this.onKey = (e) => this.key(e);
    scene.input.keyboard?.on('keydown', this.onKey);
    const last = accounts().list()[0];
    if (last) this.draft.callsign = last.callsign;
    this.show(accounts().list().length ? 'login' : 'create');
  }

  // ------------------------------------------------------------- layout

  private clear(): void {
    this.container.removeAll(true);
    this.cards = [];
  }

  private text(x: number, y: number, s: string, size: number, color: string, origin: [number, number] = [0, 0.5]): Phaser.GameObjects.Text {
    const t = this.scene.add
      .text(x, y, s, { fontFamily: FONT, fontSize: `${size}px`, color })
      .setOrigin(origin[0], origin[1])
      .setStroke('#070b12', 4);
    this.container.add(t);
    return t;
  }

  private show(mode: Mode): void {
    this.mode = mode;
    this.clear();
    if (mode === 'pilot') {
      this.buildPilotPicker();
      return;
    }
    const top = 212;
    const w = 470;
    const x0 = VIEW_W / 2 - w / 2;
    const rows = 6;
    const h = 64 + rows * 30 + 62;
    const bg = this.scene.add.rectangle(VIEW_W / 2, top + h / 2, w, h, 0x0b1424, 0.86).setStrokeStyle(1, 0x2f4a6e, 1);
    this.container.add(bg);
    this.text(VIEW_W / 2, top + 22, mode === 'login' ? 'SIGN IN' : 'CREATE AN ACCOUNT', 18, '#eaf2ff', [0.5, 0.5]).setFontStyle('bold');

    const d = this.draft;
    if (mode === 'login') {
      this.fields = [
        { kind: 'text', label: 'CALLSIGN', value: d.callsign, max: 16 },
        { kind: 'password', label: 'PASSWORD', value: '', max: 64 },
        { kind: 'toggle', label: 'REMEMBER ME', value: '', on: d.remember },
        { kind: 'button', label: 'SIGN IN', value: '', action: () => void this.submitLogin() },
        { kind: 'button', label: 'CREATE AN ACCOUNT', value: '', action: () => this.show('create') },
        { kind: 'button', label: 'BACK', value: '', action: () => this.onBack() },
      ];
    } else {
      this.fields = [
        { kind: 'text', label: 'CALLSIGN', value: d.callsign && !accounts().list().some((a) => a.callsign === d.callsign) ? d.callsign : '', max: 16 },
        { kind: 'password', label: 'PASSWORD', value: '', max: 64 },
        { kind: 'password', label: 'AGAIN', value: '', max: 64 },
        { kind: 'toggle', label: 'REMEMBER ME', value: '', on: d.remember },
        { kind: 'button', label: 'CHOOSE YOUR PILOT  ▸', value: '', action: () => this.toPilots() },
        {
          kind: 'button',
          label: accounts().list().length ? 'I HAVE AN ACCOUNT' : 'BACK',
          value: '',
          action: () => (accounts().list().length ? this.show('login') : this.onBack()),
        },
      ];
    }
    let y = top + 62;
    this.fields.forEach((f, i) => {
      const isInput = f.kind === 'text' || f.kind === 'password';
      if (isInput) {
        f.label$ = this.text(x0 + 30, y, f.label, 13, '#8fa6c6');
        f.box$ = this.scene.add.rectangle(x0 + 150, y, w - 180, 24, 0x050a14, 0.9).setOrigin(0, 0.5).setStrokeStyle(1, 0x2b3a54, 1);
        this.container.add(f.box$);
        f.value$ = this.text(x0 + 160, y, '', 15, '#eaf2ff');
      } else if (f.kind === 'toggle') {
        f.label$ = this.text(x0 + 150, y, '', 14, '#cfe2ff');
      } else {
        f.label$ = this.text(VIEW_W / 2, y + 4, f.label, 16, '#cfe2ff', [0.5, 0.5]);
      }
      const hit = this.scene.add.rectangle(VIEW_W / 2, y, w - 20, 28, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => {
        this.focus = i;
        if (!isInput) this.activate();
        this.refresh();
      });
      this.container.add(hit);
      y += f.kind === 'button' && this.fields[i - 1]?.kind !== 'button' ? 36 : 30;
    });
    this.message = this.text(VIEW_W / 2, y + 8, '', 12, '#ff8a8a', [0.5, 0.5]);
    const others = accounts().list().map((a) => a.callsign);
    const note =
      mode === 'login' && others.length
        ? `ON THIS MACHINE: ${others.slice(0, 5).join(' · ')}${others.length > 5 ? ' …' : ''}   (←/→ ON CALLSIGN)`
        : 'Accounts are kept in this browser. The password keeps others out of your save; it is not security.';
    this.text(VIEW_W / 2, top + h - 14, note, 10, '#5d6f8a', [0.5, 0.5]);
    this.focus = mode === 'login' && this.fields[0].value ? 1 : 0;
    this.refresh();
  }

  private refresh(): void {
    if (this.mode === 'pilot') return this.refreshPilots();
    this.fields.forEach((f, i) => {
      const on = i === this.focus;
      if (f.kind === 'text' || f.kind === 'password') {
        const shown = f.kind === 'password' ? '•'.repeat(f.value.length) : f.value;
        const caret = on && Math.floor(this.caret * 2) % 2 === 0 ? '▌' : '';
        f.value$?.setText(shown + caret);
        f.box$?.setStrokeStyle(1, on ? 0xffd166 : 0x2b3a54, 1);
        f.label$?.setColor(on ? '#ffd166' : '#8fa6c6');
      } else if (f.kind === 'toggle') {
        f.label$?.setText(`${f.on ? '[■]' : '[ ]'}  ${f.label}`).setColor(on ? '#ffd166' : '#cfe2ff');
      } else {
        f.label$?.setText(on ? `▸ ${f.label}` : f.label).setColor(on ? '#ffd166' : '#cfe2ff');
      }
    });
  }

  // ------------------------------------------------------------- pilots

  private toPilots(): void {
    const [cs, pw, pw2, rem] = this.fields;
    this.draft = { callsign: cs.value.trim(), pw: pw.value, pw2: pw2.value, remember: !!rem.on };
    const bad = accounts().checkCallsign(this.draft.callsign);
    if (bad) return this.say(bad, 0);
    if (this.draft.pw.length < 6) return this.say('The password needs at least 6 characters.', 1);
    if (this.draft.pw !== this.draft.pw2) return this.say("The two passwords don't match.", 2);
    sfx.uiConfirm();
    this.show('pilot');
  }

  private buildPilotPicker(): void {
    const bg = this.scene.add.rectangle(VIEW_W / 2, 372, VIEW_W - 40, 300, 0x0b1424, 0.88).setStrokeStyle(1, 0x2f4a6e, 1);
    this.container.add(bg);
    this.text(VIEW_W / 2, 238, 'CHOOSE YOUR PILOT', 20, '#eaf2ff', [0.5, 0.5]).setFontStyle('bold');
    this.text(VIEW_W / 2, 262, 'They will be the only pilot you have. The other seven are earned.', 12, '#8fa6c6', [0.5, 0.5]);
    const cw = 104;
    const gap = 8;
    const x0 = VIEW_W / 2 - (PILOT_IDS.length * (cw + gap) - gap) / 2 + cw / 2;
    PILOT_IDS.forEach((id, i) => {
      const def = MECHS[id];
      const c = this.scene.add.container(x0 + i * (cw + gap), 340);
      const plate = this.scene.add.rectangle(0, 0, cw, 120, 0x050a14, 1).setStrokeStyle(2, 0x2b3a54, 1);
      const img = this.scene.add.image(0, -8, `pilot_${id}_card`).setDisplaySize(cw - 4, 86);
      const name = this.scene.add
        .text(0, 48, def.pilot, { fontFamily: FONT, fontSize: '10px', color: '#eaf2ff', align: 'center' })
        .setOrigin(0.5, 0.5)
        .setStroke('#070b12', 3);
      c.add([plate, img, name]);
      c.setData('plate', plate);
      c.setSize(cw, 120);
      c.setInteractive({ useHandCursor: true });
      c.on('pointerdown', () => {
        if (this.pilotIndex === i) void this.submitCreate();
        this.pilotIndex = i;
        this.refreshPilots();
      });
      this.container.add(c);
      this.cards.push(c);
    });
    this.pilotInfo = this.text(VIEW_W / 2, 436, '', 13, '#cfe2ff', [0.5, 0.5]).setAlign('center');
    this.message = this.text(VIEW_W / 2, 486, '', 12, '#ff8a8a', [0.5, 0.5]);
    this.text(VIEW_W / 2, 506, '←/→ CHOOSE · ENTER CONFIRM · ESC BACK', 11, '#5d6f8a', [0.5, 0.5]);
    this.refreshPilots();
  }

  private refreshPilots(): void {
    this.cards.forEach((c, i) => {
      const on = i === this.pilotIndex;
      const def = MECHS[PILOT_IDS[i]];
      (c.getData('plate') as Phaser.GameObjects.Rectangle).setStrokeStyle(on ? 3 : 2, on ? def.tint.primary : 0x2b3a54, 1);
      c.setScale(on ? 1.08 : 1);
      c.setAlpha(on ? 1 : 0.7);
    });
    const def = MECHS[PILOT_IDS[this.pilotIndex]];
    this.pilotInfo
      .setText(`${def.pilot} — ${def.codeName} ${def.name} · ${def.faction}\n${def.blurb}`)
      .setColor(hex(def.tint.primary));
  }

  // ------------------------------------------------------------- actions

  private say(msg: string, focus?: number): void {
    sfx.uiBack();
    this.message?.setText(msg);
    if (focus !== undefined) this.focus = focus;
    this.refresh();
  }

  private async submitLogin(): Promise<void> {
    if (this.busy) return;
    const [cs, pw, rem] = this.fields;
    this.busy = true;
    const r = await accounts().login(cs.value, pw.value, !!rem.on);
    this.busy = false;
    if (!r.ok) {
      pw.value = '';
      return this.say(r.error, r.error.startsWith('Wrong') ? 1 : 0);
    }
    sfx.uiConfirm();
    this.onDone();
  }

  private async submitCreate(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    const d = this.draft;
    const r = await accounts().register(d.callsign, d.pw, d.pw2, PILOT_IDS[this.pilotIndex] as PilotId, d.remember);
    this.busy = false;
    if (!r.ok) return this.say(r.error);
    sfx.uiConfirm();
    this.onDone();
  }

  private activate(): void {
    const f = this.fields[this.focus];
    if (!f) return;
    if (f.kind === 'toggle') {
      f.on = !f.on;
      sfx.uiMove();
    } else if (f.kind === 'button') {
      f.action?.();
    } else {
      // Enter in a field moves on; on the last field it submits.
      const next = this.fields.findIndex((g, i) => i > this.focus && (g.kind === 'text' || g.kind === 'password'));
      if (next >= 0) this.focus = next;
      else this.fields.find((g) => g.kind === 'button')?.action?.();
    }
    this.refresh();
  }

  private key(e: KeyboardEvent): void {
    if (!this.container.visible) return;
    if (this.mode === 'pilot') {
      if (e.key === 'ArrowLeft') this.pilotIndex = (this.pilotIndex + PILOT_IDS.length - 1) % PILOT_IDS.length;
      else if (e.key === 'ArrowRight') this.pilotIndex = (this.pilotIndex + 1) % PILOT_IDS.length;
      else if (e.key === 'Enter') return void this.submitCreate();
      else if (e.key === 'Escape') return this.show('create');
      else return;
      sfx.uiMove();
      this.refreshPilots();
      return;
    }
    const f = this.fields[this.focus];
    const input = f && (f.kind === 'text' || f.kind === 'password');
    if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) {
      this.focus = (this.focus + 1) % this.fields.length;
      sfx.uiMove();
      e.preventDefault?.();
    } else if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
      this.focus = (this.focus + this.fields.length - 1) % this.fields.length;
      sfx.uiMove();
      e.preventDefault?.();
    } else if (e.key === 'Enter') {
      this.activate();
    } else if (e.key === 'Escape') {
      if (this.mode === 'create' && accounts().list().length) this.show('login');
      else this.onBack();
      return;
    } else if (input && e.key === 'Backspace') {
      f.value = f.value.slice(0, -1);
    } else if (input && this.focus === 0 && this.mode === 'login' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      // Step through the accounts on this machine.
      const list = accounts().list().map((a) => a.callsign);
      if (list.length) {
        const i = list.indexOf(f.value);
        f.value = list[(i + (e.key === 'ArrowRight' ? 1 : list.length - 1) + (i < 0 ? 1 : 0)) % list.length];
        sfx.uiMove();
      }
    } else if (f?.kind === 'toggle' && (e.key === ' ' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      f.on = !f.on;
      sfx.uiMove();
    } else if (input && e.key.length === 1 && !e.ctrlKey && !e.metaKey && f.value.length < (f.max ?? 32)) {
      f.value += e.key;
    } else {
      return;
    }
    this.message?.setText('');
    this.refresh();
  }

  update(dt: number): void {
    this.caret += dt;
    if (this.mode !== 'pilot') this.refresh();
  }

  destroy(): void {
    this.scene.input.keyboard?.off('keydown', this.onKey);
    this.container.destroy(true);
  }
}
