import { describe, expect, it } from 'vitest';
import { Rng } from '../core/rng';
import { groupByBase, pickWeighted, rollRewards } from './itemPool';
import type { Item } from './stats';

const item = (id: string, weight: number, base?: string): Item => ({
  id,
  base,
  weight,
  name: 'item.quickcast.name',
  description: 'item.quickcast.description',
  hint: 'item.quickcast.hint',
  color: 0,
  apply: (s) => s,
});

const A = item('a', 1);
const A_SUBTLE = item('a:subtle', 2, 'a');
const A_EXTREME = item('a:extreme', 1, 'a');
const B = item('b', 1);
const C = item('c', 1);
const ITEMS = [A, A_SUBTLE, A_EXTREME, B, C];

describe('groupByBase', () => {
  it('puts variants with their base', () => {
    const groups = groupByBase(ITEMS);
    expect([...groups.keys()]).toEqual(['a', 'b', 'c']);
    expect(groups.get('a')).toEqual([A, A_SUBTLE, A_EXTREME]);
  });
});

describe('pickWeighted', () => {
  it('follows the weights', () => {
    const rng = new Rng('weights');
    const counts = new Map<Item, number>();
    for (let i = 0; i < 8000; i++) {
      const picked = pickWeighted(rng, [A, A_SUBTLE, A_EXTREME]);
      counts.set(picked, (counts.get(picked) ?? 0) + 1);
    }
    expect(counts.get(A_SUBTLE)! / 8000).toBeCloseTo(0.5, 1);
    expect(counts.get(A)! / 8000).toBeCloseTo(0.25, 1);
    expect(counts.get(A_EXTREME)! / 8000).toBeCloseTo(0.25, 1);
  });

  it('returns the only option', () => {
    expect(pickWeighted(new Rng('x'), [B])).toBe(B);
  });
});

describe('rollRewards', () => {
  it('is the same for the same seed', () => {
    const ids = (seed: string) => rollRewards(new Rng(seed), ITEMS, [], 3).map((i) => i.id);
    expect(ids('S1')).toEqual(ids('S1'));
  });

  it('offers bases not held first', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const rewards = rollRewards(new Rng(seed), ITEMS, [A_EXTREME], 2);
      expect(rewards.map((i) => i.base ?? i.id).sort()).toEqual(['b', 'c']);
    }
  });

  it('repeats once every base is held', () => {
    const rewards = rollRewards(new Rng('full'), ITEMS, [A, B, C], 5);
    expect(rewards).toHaveLength(5);
  });

  it('returns nothing from an empty registry', () => {
    expect(rollRewards(new Rng('none'), [], [], 2)).toEqual([]);
  });
});
