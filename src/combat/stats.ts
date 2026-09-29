export interface PlayerStats {
  /** Max movement speed, px/s. */
  speed: number;
  damage: number;
  /** Milliseconds between shots. */
  fireDelay: number;
  /** Bolt speed, px/s. */
  shotSpeed: number;
  /** Distance a bolt travels before fading, px. */
  range: number;
  /** In half-hearts. */
  maxHealth: number;
  /** Bolts per shot, fanned out by `spread`. */
  shotCount: number;
  /** Total fan angle in degrees. */
  spread: number;
  /** 0 = straight; higher = bolts steer harder toward the nearest enemy. */
  homing: number;
  boltScale: number;
}

export const BASE_STATS: PlayerStats = {
  speed: 210,
  damage: 3.5,
  fireDelay: 360,
  shotSpeed: 420,
  range: 330,
  maxHealth: 6,
  shotCount: 1,
  spread: 0,
  homing: 0,
  boltScale: 1,
};

/**
 * Items never mutate the player directly. Each one is a pure step in a pipeline
 * from BASE_STATS, so stacking order is explicit and stats can always be recomputed.
 */
export interface Item {
  id: string;
  name: string;
  description: string;
  color: number;
  apply(stats: PlayerStats): PlayerStats;
}

export function computeStats(base: PlayerStats, items: readonly Item[]): PlayerStats {
  const stats = items.reduce((s, item) => item.apply({ ...s }), { ...base });
  stats.fireDelay = Math.max(80, stats.fireDelay);
  stats.speed = Math.min(420, stats.speed);
  // Items can stack, so multiplicative ones need a ceiling.
  stats.range = Math.min(900, stats.range);
  stats.boltScale = Math.min(2.5, stats.boltScale);
  stats.shotCount = Math.min(7, stats.shotCount);
  return stats;
}

/** Copies held per distinct item, in pickup order. */
export function countItems(items: readonly Item[]): Map<Item, number> {
  const counts = new Map<Item, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return counts;
}

/** "Name ×2 · Other" — one entry per distinct item, in pickup order. */
export function summarizeItems(items: readonly Item[]): string {
  return [...countItems(items)].map(([item, n]) => (n > 1 ? `${item.name} ×${n}` : item.name)).join(' · ');
}
