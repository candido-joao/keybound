import {
  BLOOD_COLOSSUS,
  BONE_KING,
  BRASS_TITAN,
  CLOCKMAKER,
  CLOCK_TOWER_ENEMIES,
  CRYPT_ENEMIES,
  CRYSTAL_COLOSSUS,
  CRYSTAL_HYDRA,
  CRYSTAL_MATRIARCH,
  type EnemyDef,
  GARDEN_ENEMIES,
  GEAR_COLOSSUS,
  PENDULUM_WRAITH,
  type RoomEnemy,
  SHADOW_COLOSSUS,
  SHARD_KING,
  WRAITH,
} from '../combat/enemies';
import { COLORS } from '../config';
import { Rng } from '../core/rng';
import type { MessageKey } from '../i18n';

export interface PhasePalette {
  background: number;
  floor: number;
  floorAlt: number;
  wall: number;
  wallEdge: number;
}

/** A stretch of the run with its own look, enemies and bosses. */
export interface PhaseDef {
  id: string;
  name: MessageKey;
  floors: number;
  palette: PhasePalette;
  enemies: readonly RoomEnemy[];
  /** Shuffled once per run, one per floor: a run meets none twice while the pool lasts. */
  bosses: readonly EnemyDef[];
  /** Track id for when audio lands; nothing plays it yet. */
  music: string;
}

export const PHASES: readonly PhaseDef[] = [
  {
    id: 'crypt',
    name: 'phase.crypt',
    floors: 3,
    palette: {
      background: COLORS.background,
      floor: COLORS.floor,
      floorAlt: COLORS.floorAlt,
      wall: COLORS.wall,
      wallEdge: COLORS.wallEdge,
    },
    enemies: CRYPT_ENEMIES,
    bosses: [SHADOW_COLOSSUS, BLOOD_COLOSSUS, BONE_KING, WRAITH],
    music: 'crypt',
  },
  {
    id: 'garden',
    name: 'phase.garden',
    floors: 3,
    palette: { background: 0x050d10, floor: 0x12302f, floorAlt: 0x163936, wall: 0x2c5a63, wallEdge: 0x4fa3a8 },
    enemies: GARDEN_ENEMIES,
    bosses: [CRYSTAL_COLOSSUS, CRYSTAL_HYDRA, CRYSTAL_MATRIARCH, SHARD_KING],
    music: 'garden',
  },
  {
    id: 'clock-tower',
    name: 'phase.clock-tower',
    floors: 2,
    palette: { background: 0x0e0a06, floor: 0x2b2118, floorAlt: 0x33271c, wall: 0x5a4630, wallEdge: 0x9c7a45 },
    enemies: CLOCK_TOWER_ENEMIES,
    bosses: [GEAR_COLOSSUS, CLOCKMAKER, BRASS_TITAN, PENDULUM_WRAITH],
    music: 'clock-tower',
  },
];

/** Beating the last floor's boss wins the run. */
export const RUN_FLOORS = PHASES.reduce((sum, phase) => sum + phase.floors, 0);

/** Floors past the run's end (debug console, URL) stay in the last phase. */
export function phaseAt(depth: number): PhaseDef {
  return PHASES[phaseIndexAt(depth)];
}

function phaseIndexAt(depth: number): number {
  let lastFloor = 0;
  for (let i = 0; i < PHASES.length; i++) {
    lastFloor += PHASES[i].floors;
    if (depth <= lastFloor) return i;
  }
  return PHASES.length - 1;
}

/** The floor the phase at `depth` starts on. */
function phaseStart(depth: number): number {
  const index = phaseIndexAt(depth);
  return 1 + PHASES.slice(0, index).reduce((sum, phase) => sum + phase.floors, 0);
}

export function isPhaseStart(depth: number): boolean {
  let firstFloor = 1;
  for (const phase of PHASES) {
    if (depth === firstFloor) return true;
    firstFloor += phase.floors;
  }
  return false;
}

export function isFinalFloor(depth: number): boolean {
  return depth >= RUN_FLOORS;
}

/**
 * This floor's boss: the phase's pool shuffled once by the seed, one per floor, so a run meets
 * each at most once until the pool runs out. Floors past that start the order over.
 */
export function floorBoss(seed: string, depth: number): EnemyDef {
  const phase = phaseAt(depth);
  const order = new Rng(`${seed}:bosses:${phase.id}`).shuffle([...phase.bosses]);
  return order[(depth - phaseStart(depth)) % order.length];
}

/** Tile textures BootScene bakes from each phase's palette. */
export const floorTexture = (phase: PhaseDef) => `floor:${phase.id}`;
export const wallTexture = (phase: PhaseDef) => `wall:${phase.id}`;
