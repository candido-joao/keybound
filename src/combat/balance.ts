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
};

/** Items can stack, so multiplicative ones need bounds. */
export const STAT_LIMITS = {
  minFireDelay: 140,
  maxSpeed: 420,
  maxRange: 900,
  maxBoltScale: 2.5,
  maxShotCount: 7,
} as const;

export const PLAYER_INVULN_MS = 650;

/** Inclusive range of enemies in a normal room. */
export function enemiesPerRoom(depth: number): { min: number; max: number } {
  return { min: 3, max: 4 + depth };
}
