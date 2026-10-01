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
  /** Distance a bolt travels before fading, px; the beam's reach follows it too. */
  range: number;
  /** Multiplies `range` for bolts only, so a cost aimed at bolts leaves the beam alone. */
  boltRange: number;
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
  /** Multiplies the push a hit gives a normal enemy. */
  knockback: number;
  /** Share of a hit's damage a pushed enemy takes again on slamming into a wall; 0 = none. */
  wallSlam: number;
  /** Above 0, a beam splits in two at the first enemy it hits. */
  refract: number;
  /** Extra enemies a bolt passes through before it bursts. */
  pierce: number;
  /** Added to every kill's heal orb odds. */
  healOdds: number;
  /** Currency each coin is worth. */
  currencyValue: number;
  /** Extra bolts away from the aim: 1 backward, 3 backward and to both sides. */
  echoShots: number;
  /** Share of the shot's damage each extra bolt deals. */
  echoDamage: number;
  /** Invulnerability after taking a hit, ms. */
  invulnMs: number;
  /** Multiplies how fast enemies walk and dash. */
  enemySpeed: number;
  /** Multiplies how fast enemy orbs fly. */
  orbSpeed: number;
  /** 0 shoots bolts; above 0 fires a charged beam, and scales its damage. */
  beam: number;
  /** Beam items held, all versions together. */
  beamCopies: number;
  /** Multiplies the beam's charge time. */
  beamCharge: number;
  /** Multiplies how long a released beam lasts. */
  beamTime: number;
  /** Jumps an arc makes from the enemy a hit lands on; 0 = no arcs. */
  chain: number;
  /** Odds a hit starts an arc chain. */
  chainChance: number;
  /** Share of the previous hit's damage each jump deals. */
  chainRatio: number;
  /** Above 0, a hit shocks every enemy around at once for this share of its damage, instead of chaining. */
  chainNova: number;
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
  /** Floors it can be found on: 1 from the start, higher pools unlock deeper; variants follow their base. */
  pool?: ItemPool;
  /** Refills HP when taken, after the new max HP applies. */
  fullHeal?: boolean;
  /** Copies held, all versions together, after which rewards stop offering it; unset = no limit. Set on the pure item. */
  maxCopies?: number;
  name: MessageKey;
  /** Exact effect, shown only once the item is taken. */
  description: MessageKey;
  /** Shown near the pedestal: suggests the effect without giving it away. */
  hint: MessageKey;
  color: number;
  apply(stats: PlayerStats): PlayerStats;
}

export type ItemPool = 1 | 2 | 3;

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
  stats.knockback = Math.min(L.maxKnockback, stats.knockback);
  stats.healOdds = clamp(stats.healOdds, L.minHealOdds, L.maxHealOdds);
  stats.echoShots = Math.min(L.maxEchoShots, stats.echoShots);
  stats.invulnMs = Math.max(L.minInvulnMs, stats.invulnMs);
  stats.enemySpeed = Math.max(L.minEnemySpeed, stats.enemySpeed);
  stats.orbSpeed = Math.max(L.minOrbSpeed, stats.orbSpeed);
  stats.chain = Math.min(L.maxChain, stats.chain);
  return stats;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** How far a bolt flies: `range` with the bolt-only cut, kept within the range limits. */
export function boltRangeOf(stats: Pick<PlayerStats, 'range' | 'boltRange'>): number {
  return clamp(stats.range * stats.boltRange, STAT_LIMITS.minRange, STAT_LIMITS.maxRange);
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
