import {
  CLOCK_TOWER_ENEMIES,
  CRYPT_ENEMIES,
  CRYSTAL_COLOSSUS,
  type EnemyDef,
  GARDEN_ENEMIES,
  GEAR_COLOSSUS,
  type RoomEnemy,
  SHADOW_COLOSSUS,
} from '../combat/enemies';
import { COLORS } from '../config';
import type { Rng } from '../core/rng';
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
  /** One is rolled per floor. */
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
    bosses: [SHADOW_COLOSSUS],
    music: 'crypt',
  },
  {
    id: 'garden',
    name: 'phase.garden',
    floors: 3,
    palette: { background: 0x050d10, floor: 0x12302f, floorAlt: 0x163936, wall: 0x2c5a63, wallEdge: 0x4fa3a8 },
    enemies: GARDEN_ENEMIES,
    bosses: [CRYSTAL_COLOSSUS],
    music: 'garden',
  },
  {
    id: 'clock-tower',
    name: 'phase.clock-tower',
    floors: 2,
    palette: { background: 0x0e0a06, floor: 0x2b2118, floorAlt: 0x33271c, wall: 0x5a4630, wallEdge: 0x9c7a45 },
    enemies: CLOCK_TOWER_ENEMIES,
    bosses: [GEAR_COLOSSUS],
    music: 'clock-tower',
  },
];

/** Beating the last floor's boss wins the run. */
export const RUN_FLOORS = PHASES.reduce((sum, phase) => sum + phase.floors, 0);

/** Floors past the run's end (debug console, URL) stay in the last phase. */
export function phaseAt(depth: number): PhaseDef {
  let lastFloor = 0;
  for (const phase of PHASES) {
    lastFloor += phase.floors;
    if (depth <= lastFloor) return phase;
  }
  return PHASES[PHASES.length - 1];
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

export function rollFloorBoss(rng: Rng, phase: PhaseDef): EnemyDef {
  return phase.bosses[rng.int(0, phase.bosses.length - 1)];
}

/** Tile textures BootScene bakes from each phase's palette. */
export const floorTexture = (phase: PhaseDef) => `floor:${phase.id}`;
export const wallTexture = (phase: PhaseDef) => `wall:${phase.id}`;
