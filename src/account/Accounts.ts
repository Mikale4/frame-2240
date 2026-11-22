/**
 * Pilot accounts — kept in this browser, the way the owner's other games keep
 * theirs (Wordle n' Friends, BLOCKADE, Red Ring Circuit): a callsign, a
 * password of six characters or more typed twice, salted SHA-256, "remember
 * me", sign out, several accounts per browser.
 *
 * **A local password is not a security boundary.** Anyone at this machine with
 * devtools can read the save; the hash only means a reused password is never
 * stored in the clear. The login screen says as much in its small print.
 *
 * Each account owns its **unlocked pilots**. Creating one means choosing a
 * starter, and that pilot is the only one unlocked; the other seven are earned
 * (see `unlocks.ts`). The account also carries the fight record those unlocks
 * read, experience and rank, and each pilot's campaign save.
 *
 * No Phaser here: storage and the clock are injected, so `accounts.test.ts`
 * runs it headless.
 */

export const PILOT_IDS = ['halcyon', 'nocturne', 'vesper', 'terramoth', 'cirrus', 'obelisk', 'pyre', 'nulltide'] as const;
export type PilotId = (typeof PILOT_IDS)[number];
export const isPilotId = (s: string): s is PilotId => (PILOT_IDS as readonly string[]).includes(s);

export const PASSWORD_MIN = 6;
export const CALLSIGN_MIN = 2;
export const CALLSIGN_MAX = 16;

/** Fights against one machine. */
export interface FightRecord {
  wins: number;
  /** Wins at HARD or EXTREME. */
  hardWins: number;
  losses: number;
}

/** One pilot's campaign progress. Filled in from defaults on load. */
export interface CampaignSave {
  chapter: number;
  /** Chapters finished, by id. */
  done: string[];
  flags: Record<string, boolean>;
  vars: Record<string, number>;
  /** Where the pilot stands in the world: region id and position. */
  region: string;
  x: number;
  z: number;
  facing: number;
  updated: number;
  /** The objective line as the chapter last set it. */
  objective: string;
}

export interface AccountRecord {
  id: string;
  callsign: string;
  salt: string;
  hash: string;
  created: number;
  lastLogin: number;
  starter: PilotId;
  unlocked: PilotId[];
  /** Why each pilot was unlocked, for the roster screen. */
  unlockedBy: Partial<Record<PilotId, string>>;
  xp: number;
  /** Commissions earned by rank and not yet spent. */
  commissions: number;
  /** Ranks that have already paid out a commission. */
  commissionedRanks: number[];
  records: Partial<Record<PilotId, FightRecord>>;
  campaigns: Partial<Record<PilotId, CampaignSave>>;
  archive: string[];
}

/** Where the accounts live. `localStorage` in the browser; a Map in tests. */
export interface KeyValueStore {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

const ACCOUNTS_KEY = 'frame2240.accounts';
const SESSION_KEY = 'frame2240.session';

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
const fail = <T>(error: string): Result<T> => ({ ok: false, error });

export function freshCampaign(): CampaignSave {
  return { chapter: 1, done: [], flags: {}, vars: {}, region: '', x: 0, z: 0, facing: 0, updated: 0, objective: '' };
}

/** Rank from experience: every 300 XP is a rank, starting at 1. */
export const XP_PER_RANK = 300;
export const rankOf = (xp: number): number => Math.floor(Math.max(0, xp) / XP_PER_RANK) + 1;
/** Every third rank grants a commission: unlock any pilot of your choice. */
export const COMMISSION_EVERY = 3;

function hex(bytes: ArrayBuffer | Uint8Array): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const x of b) s += x.toString(16).padStart(2, '0');
  return s;
}

function randomSalt(): string {
  const b = new Uint8Array(16);
  globalThis.crypto.getRandomValues(b);
  return hex(b);
}

async function hashPassword(pw: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}|${pw}`);
  const subtle = globalThis.crypto?.subtle;
  if (subtle) return hex(await subtle.digest('SHA-256', data));
  // No WebCrypto (a page served over plain http on a LAN address): a weak hash,
  // marked as such, rather than refusing to make an account at all.
  let h = 0;
  for (const c of `${salt}|${pw}`) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0;
  return `weak:${(h >>> 0).toString(16)}`;
}

const norm = (s: string): string => s.trim().toLowerCase();

/** Fills a stored account in from today's defaults, so old saves survive new fields. */
export function migrateAccount(raw: Partial<AccountRecord> & { id: string }): AccountRecord {
  const starter = raw.starter && isPilotId(raw.starter) ? raw.starter : 'halcyon';
  const unlocked = (raw.unlocked ?? [starter]).filter(isPilotId);
  if (!unlocked.includes(starter)) unlocked.unshift(starter);
  const campaigns: Partial<Record<PilotId, CampaignSave>> = {};
  for (const [k, v] of Object.entries(raw.campaigns ?? {})) {
    if (isPilotId(k) && v) campaigns[k] = { ...freshCampaign(), ...v };
  }
  return {
    id: raw.id,
    callsign: raw.callsign ?? 'PILOT',
    salt: raw.salt ?? '',
    hash: raw.hash ?? '',
    created: raw.created ?? 0,
    lastLogin: raw.lastLogin ?? 0,
    starter,
    unlocked,
    unlockedBy: raw.unlockedBy ?? { [starter]: 'starter' },
    xp: raw.xp ?? 0,
    commissions: raw.commissions ?? 0,
    commissionedRanks: raw.commissionedRanks ?? [],
    records: raw.records ?? {},
    campaigns,
    archive: raw.archive ?? [],
  };
}

export class AccountStore {
  private accounts: Record<string, AccountRecord> = {};
  /** The signed-in account, or null on the login screen. */
  user: AccountRecord | null = null;
  private listeners: (() => void)[] = [];

  constructor(
    private readonly store: KeyValueStore,
    private readonly now: () => number = () => Date.now(),
  ) {
    this.load();
  }

  private load(): void {
    let raw: Record<string, Partial<AccountRecord> & { id: string }> = {};
    try {
      raw = JSON.parse(this.store.getItem(ACCOUNTS_KEY) ?? '{}') ?? {};
    } catch {
      raw = {};
    }
    this.accounts = {};
    for (const [id, a] of Object.entries(raw)) {
      if (a && typeof a === 'object') this.accounts[id] = migrateAccount({ ...a, id });
    }
  }

  /** Writes every account back. Called after any change. */
  save(): void {
    try {
      this.store.setItem(ACCOUNTS_KEY, JSON.stringify(this.accounts));
    } catch {
      // Storage full or blocked: the session carries on in memory.
    }
    for (const f of this.listeners) f();
  }

  onChange(f: () => void): () => void {
    this.listeners.push(f);
    return () => {
      this.listeners = this.listeners.filter((g) => g !== f);
    };
  }

  /** Accounts on this browser, most recently used first. */
  list(): AccountRecord[] {
    return Object.values(this.accounts).sort((a, b) => b.lastLogin - a.lastLogin);
  }

  private byCallsign(callsign: string): AccountRecord | undefined {
    const n = norm(callsign);
    return Object.values(this.accounts).find((a) => norm(a.callsign) === n);
  }

  /** Why a callsign cannot be used, or null if it can. */
  checkCallsign(callsign: string): string | null {
    const c = callsign.trim();
    if (c.length < CALLSIGN_MIN) return `A callsign needs at least ${CALLSIGN_MIN} characters.`;
    if (c.length > CALLSIGN_MAX) return `A callsign is at most ${CALLSIGN_MAX} characters.`;
    if (!/^[A-Za-z0-9 _.-]+$/.test(c)) return 'Letters, numbers, spaces, _ . and - only.';
    if (this.byCallsign(c)) return 'That callsign is already registered on this machine.';
    return null;
  }

  async register(callsign: string, pw: string, pw2: string, starter: PilotId, remember: boolean): Promise<Result<AccountRecord>> {
    const bad = this.checkCallsign(callsign);
    if (bad) return fail(bad);
    if (pw.length < PASSWORD_MIN) return fail(`The password needs at least ${PASSWORD_MIN} characters.`);
    if (pw !== pw2) return fail("The two passwords don't match.");
    if (!isPilotId(starter)) return fail('Choose a pilot to start with.');
    const salt = randomSalt();
    const t = this.now();
    const id = `${t.toString(36)}${salt.slice(0, 6)}`;
    const a = migrateAccount({
      id,
      callsign: callsign.trim(),
      salt,
      hash: await hashPassword(pw, salt),
      created: t,
      lastLogin: t,
      starter,
      unlocked: [starter],
      unlockedBy: { [starter]: 'starter' },
    });
    this.accounts[id] = a;
    this.user = a;
    this.remember(remember);
    this.save();
    return { ok: true, value: a };
  }

  async login(callsign: string, pw: string, remember: boolean): Promise<Result<AccountRecord>> {
    const a = this.byCallsign(callsign);
    if (!a) return fail('No account with that callsign on this machine.');
    if ((await hashPassword(pw, a.salt)) !== a.hash) return fail('Wrong password.');
    a.lastLogin = this.now();
    this.user = a;
    this.remember(remember);
    this.save();
    return { ok: true, value: a };
  }

  /** Signs back in to a remembered account, if there is one. */
  resume(): AccountRecord | null {
    try {
      const s = JSON.parse(this.store.getItem(SESSION_KEY) ?? 'null') as { id?: string } | null;
      const a = s?.id ? this.accounts[s.id] : undefined;
      if (a) {
        a.lastLogin = this.now();
        this.user = a;
        this.save();
        return a;
      }
    } catch {
      // A corrupt session note is the same as none.
    }
    return null;
  }

  private remember(on: boolean): void {
    try {
      if (on && this.user) this.store.setItem(SESSION_KEY, JSON.stringify({ id: this.user.id }));
      else this.store.removeItem(SESSION_KEY);
    } catch {
      // Ignored, as in `save`.
    }
  }

  logout(): void {
    this.user = null;
    try {
      this.store.removeItem(SESSION_KEY);
    } catch {
      // Ignored.
    }
    this.save();
  }

  /** Deletes an account, after its password is given. */
  async remove(callsign: string, pw: string): Promise<Result<true>> {
    const a = this.byCallsign(callsign);
    if (!a) return fail('No account with that callsign on this machine.');
    if ((await hashPassword(pw, a.salt)) !== a.hash) return fail('Wrong password.');
    delete this.accounts[a.id];
    if (this.user?.id === a.id) this.logout();
    else this.save();
    return { ok: true, value: true };
  }

  // ------------------------------------------------------------- pilots

  isUnlocked(id: string): boolean {
    // With nobody signed in (tests, the title's background fight) nothing is locked.
    if (!this.user) return true;
    return isPilotId(id) && this.user.unlocked.includes(id);
  }

  /** Unlocks a pilot for the signed-in account; returns true if it was new. */
  unlock(id: PilotId, why: string): boolean {
    const a = this.user;
    if (!a || a.unlocked.includes(id)) return false;
    a.unlocked.push(id);
    a.unlockedBy[id] = why;
    this.save();
    return true;
  }

  /** Spends a commission on a pilot of the player's choice. */
  commission(id: PilotId): boolean {
    const a = this.user;
    if (!a || a.commissions <= 0 || a.unlocked.includes(id)) return false;
    a.commissions--;
    return this.unlock(id, 'commission');
  }

  get rank(): number {
    return rankOf(this.user?.xp ?? 0);
  }

  /** Adds experience; pays a commission for every third rank reached. Returns ranks gained. */
  addXp(n: number): number {
    const a = this.user;
    if (!a || n <= 0) return 0;
    const before = rankOf(a.xp);
    a.xp += Math.round(n);
    const after = rankOf(a.xp);
    for (let r = before + 1; r <= after; r++) {
      if (r % COMMISSION_EVERY === 0 && !a.commissionedRanks.includes(r)) {
        a.commissionedRanks.push(r);
        a.commissions++;
      }
    }
    this.save();
    return after - before;
  }

  /** One pilot's campaign save, created on first use. */
  campaign(id: PilotId): CampaignSave {
    const a = this.user;
    if (!a) return freshCampaign();
    if (!a.campaigns[id]) a.campaigns[id] = freshCampaign();
    return a.campaigns[id]!;
  }
}

/** A `KeyValueStore` over a Map, for tests and for browsers that block storage. */
export class MemoryStore implements KeyValueStore {
  readonly map = new Map<string, string>();
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v);
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
}

let STORE: AccountStore | null = null;

/** The session's account store, over `localStorage` when it is usable. */
export function accounts(): AccountStore {
  if (!STORE) {
    let kv: KeyValueStore = new MemoryStore();
    try {
      const ls = globalThis.localStorage;
      if (ls) {
        ls.setItem('frame2240.probe', '1');
        ls.removeItem('frame2240.probe');
        kv = ls;
      }
    } catch {
      // Private mode or blocked storage: accounts last as long as the tab.
    }
    STORE = new AccountStore(kv);
  }
  return STORE;
}
