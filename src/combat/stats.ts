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
  /** Hit points. */
  maxHealth: number;
  /** Bolts per shot, fanned out by `spread`. */
  shotCount: number;
  /** Total fan angle in degrees. */
  spread: number;
  /** 0 = straight; higher = bolts steer harder toward the nearest enemy. */
  homing: number;
  boltScale: number;
  /** Player sprite and body scale together; a bigger body is easier to hit. */
  hitboxScale: number;
  /** 0 = the default grip; higher = the player keeps sliding longer after letting go. */
  slide: number;
}

/**
 * Items never mutate the player directly. Each one is a pure step in a pipeline
 * from the base stats, so stacking order is explicit and stats can always be recomputed.
 */
export interface Item {
  /** `base:variant` for variants, e.g. `vital-shard:heavy`. */
  id: string;
  /** Id of the pure item a variant belongs to; unset on pure items. */
  base?: string;
  /** Odds against the other versions of the same base item. */
  weight: number;
  name: MessageKey;
  /** Exact effect, shown only once the item is taken. */
  description: MessageKey;
  /** Shown near the pedestal: suggests the effect without giving it away. */
  hint: MessageKey;
  color: number;
  apply(stats: PlayerStats): PlayerStats;
}

/** The pure item's id; variants share their base's icon and count as that item in the pool. */
export function baseId(item: Item): string {
  return item.base ?? item.id;
}

export function computeStats(base: PlayerStats, items: readonly Item[]): PlayerStats {
  const stats = items.reduce((s, item) => item.apply({ ...s }), { ...base });
  const L = STAT_LIMITS;
  stats.fireDelay = clamp(stats.fireDelay, L.minFireDelay, L.maxFireDelay);
  stats.speed = clamp(stats.speed, L.minSpeed, L.maxSpeed);
  stats.range = clamp(stats.range, L.minRange, L.maxRange);
  stats.boltScale = Math.min(L.maxBoltScale, stats.boltScale);
  stats.shotCount = Math.min(L.maxShotCount, stats.shotCount);
  stats.hitboxScale = Math.min(L.maxHitboxScale, stats.hitboxScale);
  stats.slide = Math.min(L.maxSlide, stats.slide);
  return stats;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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
