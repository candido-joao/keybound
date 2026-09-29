import type { PlayerStats } from './stats';

export const BASE_STATS: PlayerStats = {
  speed: 175,
  damage: 3.5,
  fireDelay: 1040,
  shotSpeed: 360,
  range: 200,
  maxHealth: 6,
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

export interface ShadowConfig {
  hp: number;
  speed: number;
  scale: number;
  boss?: boolean;
}

export const SHADOW_BASIC: ShadowConfig = { hp: 12, speed: 115, scale: 1 };
export const SHADOW_BOSS: ShadowConfig = { hp: 150, speed: 70, scale: 2.4, boss: true };

export const BOSS_DASH_EVERY_MS = 2000;

const SHADOW_HP_GROWTH = 0.15;
const BOSS_HP_GROWTH = 0.2;

/** Floor 1 uses the base config; each floor after adds a fixed share of base HP. */
export function shadowForDepth(depth: number): ShadowConfig {
  return withHpGrowth(SHADOW_BASIC, SHADOW_HP_GROWTH, depth);
}

export function bossForDepth(depth: number): ShadowConfig {
  return withHpGrowth(SHADOW_BOSS, BOSS_HP_GROWTH, depth);
}

function withHpGrowth(config: ShadowConfig, growth: number, depth: number): ShadowConfig {
  const floorsAfterFirst = Math.max(0, depth - 1);
  return { ...config, hp: Math.round(config.hp * (1 + growth * floorsAfterFirst)) };
}

/** Inclusive range of enemies in a normal room. */
export function enemiesPerRoom(depth: number): { min: number; max: number } {
  return { min: 3, max: 4 + depth };
}
