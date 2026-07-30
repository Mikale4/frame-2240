/**
 * Status effects.
 *
 * The 2005 reference carries these in `var(54)`, documented in its own legend as
 * `状態B (酸/毒:1 氷:2 火:3 電:4)` — acid/poison, ice, fire, electric — stored in
 * thousands so an element and a countdown share one variable. Both the body
 * helper and the arm helper react to it, tinting the machine with a
 * palette-shifted afterimage per element:
 *
 * ```text
 * [State 0] ; 酸/毒(緑)
 * type = Afterimage
 * trigger1 = Parent,var(54) && Parent,var(54)/1000 = 0
 * palbright = 0, 128, 0
 * ```
 *
 * The reference gives the elements a visual identity but leaves their gameplay
 * effect inside its own state machine; the behaviours below are this project's
 * own tuning, chosen so each element does something a pilot can feel and play
 * around rather than being a recolour.
 *
 * No Phaser here — this is simulation state, so it stays testable and
 * deterministic.
 */

export const enum Element {
  None = 0,
  /** Acid/poison: steady chip damage. Punishes turtling. */
  Corrosive = 1,
  /** Ice: slows movement and blunts acceleration. */
  Cryo = 2,
  /** Fire: heavier damage over a shorter burn. */
  Incendiary = 3,
  /** Electric: bleeds energy and stalls regeneration. */
  Shock = 4,
}

export const ELEMENT_COUNT = 5;

export interface ElementDef {
  name: string;
  /** Ticks the effect lasts when freshly applied. */
  duration: number;
  /** Life lost per tick while active. */
  damagePerTick: number;
  /** Multiplier on movement speed and acceleration. 1 = unaffected. */
  speedScale: number;
  /** Energy drained per tick. */
  energyDrain: number;
  /** True to suppress energy regeneration entirely. */
  blocksEnergyRegen: boolean;
  /** Tint used for the afterimage flicker, mirroring the reference's palettes. */
  tint: number;
}

/**
 * Per-element tuning. Deliberately mild: these are meant to tilt a fight, not
 * decide it, and several can be running at once across a match.
 */
export const ELEMENTS: Record<Element, ElementDef | null> = {
  [Element.None]: null,
  [Element.Corrosive]: {
    name: 'CORROSIVE',
    duration: 210,
    damagePerTick: 0.42,
    speedScale: 1,
    energyDrain: 0,
    blocksEnergyRegen: false,
    tint: 0x63e26a,
  },
  [Element.Cryo]: {
    name: 'CRYO',
    duration: 150,
    damagePerTick: 0,
    speedScale: 0.66,
    energyDrain: 0,
    blocksEnergyRegen: false,
    tint: 0x7ec6ff,
  },
  [Element.Incendiary]: {
    name: 'INCENDIARY',
    duration: 120,
    damagePerTick: 0.95,
    speedScale: 0.94,
    energyDrain: 0,
    blocksEnergyRegen: false,
    tint: 0xff8a3c,
  },
  [Element.Shock]: {
    name: 'SHOCK',
    duration: 165,
    damagePerTick: 0,
    speedScale: 0.9,
    energyDrain: 1.9,
    blocksEnergyRegen: true,
    tint: 0xffe066,
  },
};

/**
 * A machine's current affliction.
 *
 * Only one element is carried at a time, as in the reference's single `var(54)`.
 * A fresh application of the *same* element refreshes its timer; a *different*
 * element replaces it outright, so switching damage types is a real tactic
 * rather than a way to stack every debuff at once.
 */
export class StatusState {
  element: Element = Element.None;
  ticks = 0;

  get active(): boolean {
    return this.element !== Element.None && this.ticks > 0;
  }

  get def(): ElementDef | null {
    return this.active ? ELEMENTS[this.element] : null;
  }

  /** 0..1 remaining, for the HUD. */
  get fraction(): number {
    const d = this.def;
    if (!d) return 0;
    return Math.max(0, Math.min(1, this.ticks / d.duration));
  }

  /** Returns true when this application changed the active element. */
  apply(element: Element): boolean {
    if (element === Element.None) return false;
    const d = ELEMENTS[element];
    if (!d) return false;
    const changed = this.element !== element;
    this.element = element;
    this.ticks = d.duration;
    return changed;
  }

  clear(): void {
    this.element = Element.None;
    this.ticks = 0;
  }

  /**
   * Advances one tick.
   *
   * Returns the life to remove this tick, so the caller applies damage through
   * its own defence and death handling rather than this class reaching into a
   * combatant.
   */
  step(): number {
    if (!this.active) {
      this.element = Element.None;
      return 0;
    }
    const d = ELEMENTS[this.element]!;
    this.ticks--;
    if (this.ticks <= 0) {
      this.ticks = 0;
      this.element = Element.None;
    }
    return d.damagePerTick;
  }

  /** Movement multiplier, 1 when unafflicted. */
  get speedScale(): number {
    return this.def?.speedScale ?? 1;
  }
}
