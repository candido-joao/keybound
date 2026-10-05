import { describe, expect, it } from 'vitest';
import { Rng } from '../core/rng';
import { groupByBase, newestPool, pickWeighted, rollRewards } from './itemPool';
import type { Item, ItemPool } from './stats';

const item = (id: string, weight: number, base?: string, pool?: ItemPool): Item => ({
  id,
  base,
  weight,
  pool,
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
    const ids = (seed: string) => rollRewards(new Rng(seed), ITEMS, [], 3, 1).map((i) => i.id);
    expect(ids('S1')).toEqual(ids('S1'));
  });

  it('offers bases not held first', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const rewards = rollRewards(new Rng(seed), ITEMS, [A_EXTREME], 2, 1);
      expect(rewards.map((i) => i.base ?? i.id).sort()).toEqual(['b', 'c']);
    }
  });

  it('repeats once every base is held', () => {
    const rewards = rollRewards(new Rng('full'), ITEMS, [A, B, C], 5, 1);
    expect(rewards).toHaveLength(5);
  });

  it('returns nothing from an empty registry', () => {
    expect(rollRewards(new Rng('none'), [], [], 2, 1)).toEqual([]);
  });

  const DEEP = item('deep', 1, undefined, 2);
  const DEEP_VARIANT = item('deep:x', 1, 'deep');
  const DEEPER = item('deeper', 1, undefined, 3);
  const POOLED = [A, B, DEEP, DEEP_VARIANT, DEEPER];
  const bases = (rewards: Item[]) => new Set(rewards.map((i) => i.base ?? i.id));

  it('keeps locked pools out, variants included', () => {
    for (const seed of ['p1', 'p2', 'p3']) {
      const found = bases(rollRewards(new Rng(seed), POOLED, [], 6, 3));
      expect(found).toEqual(new Set(['a', 'b']));
    }
  });

  it('adds unlocked pools to the earlier ones', () => {
    expect(bases(rollRewards(new Rng('all'), POOLED, [], 4, 7))).toEqual(new Set(['a', 'b', 'deep', 'deeper']));
  });

  it('offers the newest pool first more often', () => {
    let firsts = 0;
    for (let i = 0; i < 2000; i++) {
      const [first] = rollRewards(new Rng(`w${i}`), [A, B, DEEP], [], 1, 4);
      if (first === DEEP || first === DEEP_VARIANT) firsts++;
    }
    // Weight 2 against two bases of weight 1.
    expect(firsts / 2000).toBeCloseTo(0.5, 1);
  });
});

describe('rollRewards copy limits', () => {
  const CAPPED: Item = { ...item('capped', 1), maxCopies: 2 };
  const CAPPED_VARIANT = item('capped:x', 1, 'capped');

  it('stops offering an item once enough copies are held, variants counted together', () => {
    for (const seed of ['c1', 'c2', 'c3']) {
      const rewards = rollRewards(new Rng(seed), [A, CAPPED, CAPPED_VARIANT], [CAPPED, CAPPED_VARIANT], 4, 1);
      expect(rewards.every((i) => i === A)).toBe(true);
    }
  });

  it('keeps offering it below the limit', () => {
    const rolls = Array.from({ length: 50 }, (_, i) =>
      rollRewards(new Rng(`l${i}`), [A, CAPPED, CAPPED_VARIANT], [CAPPED], 2, 1),
    );
    const offered = new Set(rolls.flat().map((r) => r.base ?? r.id));
    expect(offered.has('capped')).toBe(true);
  });
});

describe('newestPool', () => {
  it('unlocks pools by floor', () => {
    expect([1, 3, 4, 6, 7, 20].map(newestPool)).toEqual([1, 1, 2, 2, 3, 3]);
  });
});
