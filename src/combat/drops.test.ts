import { describe, expect, it } from 'vitest';
import { Rng } from '../core/rng';
import { DROP_ODDS } from './balance';
import { FRESH_LUCK, healChance, rollDrops } from './drops';

describe('healChance', () => {
  it('starts at the base odds', () => {
    expect(healChance(FRESH_LUCK)).toBe(DROP_ODDS.heal);
  });

  it('grows with each miss, up to certain', () => {
    expect(healChance({ healMisses: 2 })).toBeCloseTo(DROP_ODDS.heal + 2 * DROP_ODDS.healPerMiss);
    expect(healChance({ healMisses: 1000 })).toBe(1);
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
