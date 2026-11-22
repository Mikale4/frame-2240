import { describe, expect, it } from 'vitest';
import {
  AccountStore,
  COMMISSION_EVERY,
  MemoryStore,
  PASSWORD_MIN,
  XP_PER_RANK,
  migrateAccount,
  rankOf,
} from '../account/Accounts';
import { ANY_WINS, HARD_WINS, recordFight } from '../account/unlocks';
import { Difficulty } from '../core/Session';

let clock = 1_000_000;
const store = (kv = new MemoryStore()) => new AccountStore(kv, () => ++clock);

describe('accounts', () => {
  it('registers with a starter pilot, and only that pilot is unlocked', async () => {
    const s = store();
    const r = await s.register('Wren', 'hunter2!', 'hunter2!', 'pyre', true);
    expect(r.ok).toBe(true);
    expect(s.user?.callsign).toBe('Wren');
    expect(s.user?.unlocked).toEqual(['pyre']);
    expect(s.isUnlocked('pyre')).toBe(true);
    expect(s.isUnlocked('halcyon')).toBe(false);
  });

  it('refuses bad sign-ups with a reason', async () => {
    const s = store();
    expect((await s.register('W', 'abcdef', 'abcdef', 'pyre', false)).ok).toBe(false);
    expect((await s.register('Wren', 'abc', 'abc', 'pyre', false)).ok).toBe(false);
    const mismatch = await s.register('Wren', 'abcdef', 'abcdeg', 'pyre', false);
    expect(mismatch.ok === false && mismatch.error).toMatch(/match/);
    expect((await s.register('Wren!', 'abcdef', 'abcdef', 'pyre', false)).ok).toBe(false);
    await s.register('Wren', 'abcdef', 'abcdef', 'pyre', false);
    const dup = await s.register('wren', 'abcdef', 'abcdef', 'cirrus', false);
    expect(dup.ok === false && dup.error).toMatch(/already/);
    expect(PASSWORD_MIN).toBe(6);
  });

  it('never stores the password, and checks it on login', async () => {
    const kv = new MemoryStore();
    const s = store(kv);
    await s.register('Wren', 'correct horse', 'correct horse', 'vesper', false);
    expect([...kv.map.values()].join('')).not.toContain('correct horse');
    s.logout();
    expect(s.user).toBeNull();
    expect((await s.login('Wren', 'wrong pass', false)).ok).toBe(false);
    expect((await s.login('WREN', 'correct horse', false)).ok).toBe(true);
    expect(s.user?.starter).toBe('vesper');
  });

  it('remembers a session only when asked, across a reload', async () => {
    const kv = new MemoryStore();
    const a = store(kv);
    await a.register('Wren', 'abcdef', 'abcdef', 'obelisk', true);
    const b = store(kv);
    expect(b.resume()?.callsign).toBe('Wren');
    b.logout();
    expect(store(kv).resume()).toBeNull();
    const c = store(kv);
    await c.login('Wren', 'abcdef', false);
    expect(store(kv).resume()).toBeNull();
  });

  it('keeps several accounts apart', async () => {
    const s = store();
    await s.register('Wren', 'abcdef', 'abcdef', 'pyre', false);
    s.unlock('cirrus', 'story');
    await s.register('Kite', 'abcdef', 'abcdef', 'halcyon', false);
    expect(s.user?.unlocked).toEqual(['halcyon']);
    expect(s.list().map((a) => a.callsign).sort()).toEqual(['Kite', 'Wren']);
  });

  it('fills an old save in from today\'s defaults', () => {
    const a = migrateAccount({ id: 'x', callsign: 'Old', starter: 'nocturne' } as never);
    expect(a.unlocked).toEqual(['nocturne']);
    expect(a.records).toEqual({});
    expect(a.campaigns).toEqual({});
    expect(a.commissions).toBe(0);
  });

  it('with nobody signed in, nothing is locked', () => {
    expect(store().isUnlocked('terramoth')).toBe(true);
  });
});

describe('unlocks', () => {
  it(`beating a machine ${HARD_WINS} times at HARD unlocks its pilot`, async () => {
    const s = store();
    await s.register('Wren', 'abcdef', 'abcdef', 'pyre', false);
    for (let i = 0; i < HARD_WINS - 1; i++) expect(recordFight(s, 'nocturne', Difficulty.Hard, true).unlocked).toEqual([]);
    expect(recordFight(s, 'nocturne', Difficulty.Extreme, true).unlocked).toEqual(['nocturne']);
    expect(s.isUnlocked('nocturne')).toBe(true);
    expect(s.user?.unlockedBy.nocturne).toBe('combat');
  });

  it(`or ${ANY_WINS} times at any skill; losses do not count`, async () => {
    const s = store();
    await s.register('Wren', 'abcdef', 'abcdef', 'pyre', false);
    for (let i = 0; i < 10; i++) recordFight(s, 'vesper', Difficulty.Easy, false);
    expect(s.isUnlocked('vesper')).toBe(false);
    for (let i = 0; i < ANY_WINS; i++) recordFight(s, 'vesper', Difficulty.Easy, true);
    expect(s.isUnlocked('vesper')).toBe(true);
  });

  it('every third rank pays a commission, spent on any pilot', async () => {
    const s = store();
    await s.register('Wren', 'abcdef', 'abcdef', 'pyre', false);
    s.addXp(XP_PER_RANK * (COMMISSION_EVERY - 1));
    expect(s.rank).toBe(COMMISSION_EVERY);
    expect(s.user?.commissions).toBe(1);
    // Ranks are paid once, however the XP arrives.
    s.addXp(1);
    expect(s.user?.commissions).toBe(1);
    expect(s.commission('terramoth')).toBe(true);
    expect(s.isUnlocked('terramoth')).toBe(true);
    expect(s.commission('cirrus')).toBe(false);
    expect(rankOf(0)).toBe(1);
  });

  it('records survive a reload', async () => {
    const kv = new MemoryStore();
    const s = store(kv);
    await s.register('Wren', 'abcdef', 'abcdef', 'pyre', true);
    recordFight(s, 'cirrus', Difficulty.Normal, true);
    const t = store(kv);
    t.resume();
    expect(t.user?.records.cirrus?.wins).toBe(1);
    expect(t.user?.xp).toBeGreaterThan(0);
  });
});
