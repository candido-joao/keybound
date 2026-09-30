import type { PlayerStats } from './stats';

export const BASE_STATS: PlayerStats = {
  speed: 175,
  damage: 3.5,
  fireDelay: 1040,
  shotSpeed: 360,
  range: 200,
  maxHealth: 60,
  shotCount: 1,
  spread: 0,
  homing: 0,
  boltScale: 1,
  hitboxScale: 1,
  slide: 0,
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
} as const;

export const PLAYER_INVULN_MS = 650;

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
