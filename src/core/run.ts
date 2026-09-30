import { type DropLuck, FRESH_LUCK } from '../combat/drops';
import type { PlayerStats } from '../combat/stats';
import { normalizeSeed, randomSeed } from './rng';

export interface RunStats {
  kills: number;
  roomsCleared: number;
  /** Gameplay time of the floors already finished, in ms. */
  timeMs: number;
}

/** Everything a run carries from one floor to the next. */
export interface RunData {
  seed: string;
  /** Chosen, not rolled (typed, URL or replay), or touched by the debug console: the run counts for nothing. */
  seeded: boolean;
  depth: number;
  itemIds: string[];
  /** Undefined starts at full health. */
  health?: number;
  currency: number;
  luck: DropLuck;
  /** Max HP traded away at blood altars, taken off the computed max for the rest of the run. */
  maxHealthLost: number;
  stats: RunStats;
  /** Debug console changes, kept across floors. */
  cheats?: RunCheats;
}

export interface RunCheats {
  god: boolean;
  /** Applied over the computed stats, past STAT_LIMITS. */
  stats: Partial<PlayerStats>;
}

export interface LaunchParams {
  seed?: string;
  depth?: number;
  itemIds?: string[];
}

/** Deepest floor a launch or the debug console can jump to. */
export const MAX_DEPTH = 99;

export function newRun(seed?: string): RunData {
  return {
    seed: seed ?? randomSeed(),
    seeded: seed !== undefined,
    depth: 1,
    itemIds: [],
    currency: 0,
    luck: FRESH_LUCK,
    maxHealthLost: 0,
    stats: { kills: 0, roomsCleared: 0, timeMs: 0 },
  };
}

/** URL launches are for testing and sharing, so they're always seeded. */
export function runFromParams(params: LaunchParams): RunData {
  return {
    ...newRun(params.seed ?? randomSeed()),
    depth: params.depth ?? 1,
    itemIds: params.itemIds ?? [],
  };
}

/** `?seed=ABC&depth=3&items=quickcast,quickcast`. Invalid values are dropped, never thrown. */
export function parseLaunchParams(search: string, knownItemIds: readonly string[]): LaunchParams {
  const query = new URLSearchParams(search);
  const params: LaunchParams = {};

  const seed = normalizeSeed(query.get('seed') ?? '');
  if (seed) params.seed = seed;

  const depth = Number(query.get('depth'));
  if (Number.isInteger(depth) && depth >= 1) params.depth = Math.min(depth, MAX_DEPTH);

  const items = (query.get('items') ?? '').split(',').filter((id) => knownItemIds.includes(id));
  if (items.length > 0) params.itemIds = items;

  return params;
}

export function hasLaunchParams(params: LaunchParams): boolean {
  return Object.keys(params).length > 0;
}

/** 83000 -> "1:23"; an hour or more -> "1:02:03". */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${s}`;
  return `${m}:${s}`;
}
