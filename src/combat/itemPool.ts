import type { Rng } from '../core/rng';
import { NEWEST_POOL_WEIGHT, POOL_DEPTH } from './balance';
import { type Item, type ItemPool, baseId } from './stats';

/**
 * Items for `count` reward rooms on floor `depth`, in room order. Only pools unlocked by that
 * floor take part. Base items not yet held come first, then repeats, since items stack; within
 * each group the newest pool weighs more. Each base then rolls one of its versions by weight.
 */
export function rollRewards(
  rng: Rng,
  items: readonly Item[],
  held: readonly Item[],
  count: number,
  depth: number,
): Item[] {
  const versions = groupByBase(items);
  const newest = newestPool(depth);
  const heldBases = new Set(held.map(baseId));
  const copies = countByBase(held);
  const bases = [...versions.keys()].filter((b) => {
    const group = versions.get(b)!;
    return groupPool(group) <= newest && (copies.get(b) ?? 0) < groupMaxCopies(group);
  });
  const weight = (b: string) => (newest > 1 && groupPool(versions.get(b)!) === newest ? NEWEST_POOL_WEIGHT : 1);
  const order = [
    ...weightedOrder(
      rng,
      bases.filter((b) => !heldBases.has(b)),
      weight,
    ),
    ...weightedOrder(
      rng,
      bases.filter((b) => heldBases.has(b)),
      weight,
    ),
  ];
  if (order.length === 0) return [];

  const rewards: Item[] = [];
  for (let i = 0; i < count; i++) rewards.push(pickWeighted(rng, versions.get(order[i % order.length])!));
  return rewards;
}

/** Deepest pool unlocked on floor `depth`. */
export function newestPool(depth: number): ItemPool {
  if (depth >= POOL_DEPTH[3]) return 3;
  if (depth >= POOL_DEPTH[2]) return 2;
  return 1;
}

/** A base item's pool; its variants share it. */
function groupPool(group: readonly Item[]): ItemPool {
  return group.find((i) => !i.base)?.pool ?? 1;
}

/** A base item's copy limit; its variants share it. */
function groupMaxCopies(group: readonly Item[]): number {
  return group.find((i) => !i.base)?.maxCopies ?? Infinity;
}

function countByBase(items: readonly Item[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(baseId(item), (counts.get(baseId(item)) ?? 0) + 1);
  return counts;
}

/** Every option once, heavier ones more likely to come early. */
function weightedOrder<T>(rng: Rng, options: readonly T[], weight: (option: T) => number): T[] {
  const left = options.map((value) => ({ value, weight: weight(value) }));
  const order: T[] = [];
  while (left.length > 0) {
    const picked = pickWeighted(rng, left);
    order.push(picked.value);
    left.splice(left.indexOf(picked), 1);
  }
  return order;
}

/** Pure item and its variants, by base id, in registry order. */
export function groupByBase(items: readonly Item[]): Map<string, Item[]> {
  const groups = new Map<string, Item[]>();
  for (const item of items) {
    const group = groups.get(baseId(item)) ?? [];
    group.push(item);
    groups.set(baseId(item), group);
  }
  return groups;
}

export function pickWeighted<T extends { weight: number }>(rng: Rng, options: readonly T[]): T {
  const total = options.reduce((sum, o) => sum + o.weight, 0);
  let roll = rng.next() * total;
  for (const option of options) {
    roll -= option.weight;
    if (roll < 0) return option;
  }
  // Only reached through float rounding at the very top of the range.
  return options[options.length - 1];
}
