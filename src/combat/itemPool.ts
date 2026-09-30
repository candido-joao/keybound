import type { Rng } from '../core/rng';
import { type Item, baseId } from './stats';

/**
 * Items for `count` reward rooms, in room order. Base items not yet held come first,
 * then repeats, since items stack; each base then rolls one of its versions by weight.
 */
export function rollRewards(rng: Rng, items: readonly Item[], held: readonly Item[], count: number): Item[] {
  const versions = groupByBase(items);
  const heldBases = new Set(held.map(baseId));
  const bases = [...versions.keys()];
  const order = [
    ...rng.shuffle(bases.filter((b) => !heldBases.has(b))),
    ...rng.shuffle(bases.filter((b) => heldBases.has(b))),
  ];
  if (order.length === 0) return [];

  const rewards: Item[] = [];
  for (let i = 0; i < count; i++) rewards.push(pickWeighted(rng, versions.get(order[i % order.length])!));
  return rewards;
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
