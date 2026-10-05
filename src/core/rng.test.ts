import { describe, expect, it } from 'vitest';
import { Rng, SEED_MAX_LENGTH, normalizeSeed } from './rng';

const draws = (rng: Rng, count: number) => Array.from({ length: count }, () => rng.next());

describe('Rng', () => {
  it('repeats the same draws from the same seed', () => {
    expect(draws(new Rng('KEY'), 20)).toEqual(draws(new Rng('KEY'), 20));
  });

  it('draws differently from another seed', () => {
    expect(draws(new Rng('KEY'), 20)).not.toEqual(draws(new Rng('KEZ'), 20));
  });

  it('stays in [0, 1)', () => {
    for (const value of draws(new Rng('RANGE'), 2000)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('rolls ints inclusive on both ends', () => {
    const rng = new Rng('INTS');
    const seen = new Set(Array.from({ length: 500 }, () => rng.int(2, 5)));
    expect([...seen].sort()).toEqual([2, 3, 4, 5]);
  });

  it('never or always passes the extreme chances', () => {
    const rng = new Rng('CHANCE');
    const rolls = Array.from({ length: 200 }, () => [rng.chance(0), rng.chance(1)]);
    expect(rolls.every(([never, always]) => !never && always)).toBe(true);
  });

  it('shuffles in place, keeping every item, the same way from the same seed', () => {
    const shuffled = new Rng('MIX').shuffle([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...shuffled].sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(new Rng('MIX').shuffle([1, 2, 3, 4, 5, 6, 7, 8])).toEqual(shuffled);
  });
});

describe('normalizeSeed', () => {
  it('uppercases and keeps letters and digits only', () => {
    expect(normalizeSeed(' ab-c 12! ')).toBe('ABC12');
  });

  it('cuts long seeds', () => {
    expect(normalizeSeed('X'.repeat(40))).toHaveLength(SEED_MAX_LENGTH);
  });
});
