import { describe, expect, it } from 'vitest';
import { Rng } from '../core/rng';
import { DROP_ODDS, HEAL_ORB_HP } from './balance';
import { FRESH_LUCK, applyDrop, canCollect, healChance, rollDrops, withBossHeal } from './drops';

describe('healChance', () => {
  it('starts at the base odds', () => {
    expect(healChance(FRESH_LUCK)).toBe(DROP_ODDS.heal);
  });

  it('grows with each miss, up to certain', () => {
    expect(healChance({ healMisses: 2 })).toBeCloseTo(DROP_ODDS.heal + 2 * DROP_ODDS.healPerMiss);
    expect(healChance({ healMisses: 1000 })).toBe(1);
  });

  it('adds item bonuses, never below zero', () => {
    expect(healChance(FRESH_LUCK, 0.04)).toBeCloseTo(DROP_ODDS.heal + 0.04);
    expect(healChance(FRESH_LUCK, -1)).toBe(0);
  });
});

describe('withBossHeal', () => {
  it('adds a heal orb and resets the dry streak when none dropped', () => {
    expect(withBossHeal(['currency'], { healMisses: 4 })).toEqual({ drops: ['currency', 'heal'], luck: FRESH_LUCK });
  });

  it('adds nothing when one already dropped', () => {
    const luck = { healMisses: 0 };
    expect(withBossHeal(['heal'], luck)).toEqual({ drops: ['heal'], luck });
  });
});

describe('canCollect', () => {
  it('leaves heal orbs on the floor at full HP', () => {
    expect(canCollect('heal', true)).toBe(false);
    expect(canCollect('heal', false)).toBe(true);
  });

  it('always takes currency', () => {
    expect(canCollect('currency', true)).toBe(true);
  });
});

describe('applyDrop', () => {
  const state = { health: 30, maxHealth: 60, currency: 4 };

  it('adds one currency', () => {
    expect(applyDrop(state, 'currency')).toEqual({ ...state, currency: 5 });
  });

  it('counts each coin at its value', () => {
    expect(applyDrop(state, 'currency', 2).currency).toBe(6);
  });

  it('heals by the orb amount', () => {
    expect(applyDrop(state, 'heal').health).toBe(30 + HEAL_ORB_HP);
  });

  it('never heals past max HP', () => {
    expect(applyDrop({ ...state, health: 58 }, 'heal').health).toBe(60);
  });
});

describe('rollDrops', () => {
  it('is the same for the same seed', () => {
    const roll = () => rollDrops(new Rng('same'), { healMisses: 3 });
    expect(roll()).toEqual(roll());
  });

  it('counts a miss when no heal orb drops, and resets when one does', () => {
    const rng = new Rng('luck');
    let luck = FRESH_LUCK;
    for (let i = 0; i < 200; i++) {
      const before = luck.healMisses;
      const result = rollDrops(rng, luck);
      luck = result.luck;
      const expected = result.drops.includes('heal') ? 0 : before + 1;
      expect(luck.healMisses).toBe(expected);
    }
  });

  it('always drops a heal orb once the odds are certain', () => {
    expect(rollDrops(new Rng('sure'), { healMisses: 1000 }).drops).toContain('heal');
  });
});
