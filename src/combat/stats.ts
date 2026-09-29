import { type MessageKey, t } from '../i18n';
import { STAT_LIMITS } from './balance';

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

/**
 * Items never mutate the player directly. Each one is a pure step in a pipeline
 * from the base stats, so stacking order is explicit and stats can always be recomputed.
 */
export interface Item {
  id: string;
  name: MessageKey;
  description: MessageKey;
  color: number;
  apply(stats: PlayerStats): PlayerStats;
}

export function computeStats(base: PlayerStats, items: readonly Item[]): PlayerStats {
  const stats = items.reduce((s, item) => item.apply({ ...s }), { ...base });
  stats.fireDelay = Math.max(STAT_LIMITS.minFireDelay, stats.fireDelay);
  stats.speed = Math.min(STAT_LIMITS.maxSpeed, stats.speed);
  stats.range = Math.min(STAT_LIMITS.maxRange, stats.range);
  stats.boltScale = Math.min(STAT_LIMITS.maxBoltScale, stats.boltScale);
  stats.shotCount = Math.min(STAT_LIMITS.maxShotCount, stats.shotCount);
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
  return [...countItems(items)].map(([item, n]) => (n > 1 ? `${t(item.name)} ×${n}` : t(item.name))).join(' · ');
}
