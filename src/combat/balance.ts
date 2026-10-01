import type { PlayerStats } from './stats';

export const BASE_STATS: PlayerStats = {
  speed: 175,
  damage: 3.5,
  fireDelay: 1040,
  shotSpeed: 360,
  range: 200,
  boltRange: 1,
  maxHealth: 60,
  shotCount: 1,
  spread: 0,
  homing: 0,
  boltScale: 1,
  hitboxScale: 1,
  slide: 0,
  knockback: 1,
  wallSlam: 0,
  refract: 0,
  pierce: 0,
  healOdds: 0,
  currencyValue: 1,
  echoShots: 0,
  echoDamage: 0.5,
  invulnMs: 650,
  enemySpeed: 1,
  orbSpeed: 1,
  beam: 0,
  beamCopies: 0,
  beamCharge: 1,
  beamTime: 1,
  chain: 0,
  chainChance: 1,
  chainRatio: 0.4,
  chainNova: 0,
};

/** Items can stack, so multiplicative ones need bounds, both ways since variants carry costs. */
export const STAT_LIMITS = {
  minFireDelay: 140,
  maxFireDelay: 3000,
  minSpeed: 100,
  maxSpeed: 420,
  minRange: 60,
  maxRange: 900,
  maxBoltScale: 2.5,
  maxShotCount: 7,
  // The player body is 22 px across and doors are one 48 px tile wide.
  maxHitboxScale: 2,
  maxSlide: 6,
  maxKnockback: 5,
  minHealOdds: -0.05,
  maxHealOdds: 0.2,
  maxEchoShots: 3,
  minInvulnMs: 250,
  minEnemySpeed: 0.5,
  minOrbSpeed: 0.5,
  maxChain: 4,
} as const;

/** Floor where each item pool starts showing up; pools add up, and the newest one weighs `NEWEST_POOL_WEIGHT`. */
export const POOL_DEPTH = { 1: 1, 2: 4, 3: 7 } as const;
export const NEWEST_POOL_WEIGHT = 2;

/** How a normal enemy is pushed by a hit before `knockback` scales it. */
export const KNOCKBACK = { speed: 220, ms: 110 } as const;

/** Arcs reach enemies within this distance of the one they jump from. */
export const CHAIN_RADIUS = 90;
/** A bolt hit lets each enemy start an arc chain only this often, so fast, piercing fans don't chain the room away. */
export const CHAIN_COOLDOWN_MS = 250;

/** Chances per kill. The heal orb odds rise by `healPerMiss` for each kill without one. */
export const DROP_ODDS = {
  currency: 0.35,
  heal: 0.06,
  healPerMiss: 0.03,
} as const;

export const HEAL_ORB_HP = 5;

/** Inclusive range of enemies in a normal room. */
export function enemiesPerRoom(depth: number): { min: number; max: number } {
  return { min: 3, max: 4 + depth };
}
