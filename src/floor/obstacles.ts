import { ALTAR_ROW, DOOR_COL, DOOR_ROW, ROOM_COLS, ROOM_ROWS, ROOM_X, ROOM_Y, TILE } from '../config';
import type { Rng } from '../core/rng';
import type { MessageKey } from '../i18n';

export type ObstacleId = 'rock' | 'cracked' | 'pit' | 'spikes';

export interface ObstacleDef {
  id: ObstacleId;
  name: MessageKey;
  text: MessageKey;
  /** Baked by BootScene; a themed one is baked per phase, in its wall colors. */
  texture: string;
  themed: boolean;
  /** Looks it has art for; cells pick one by where they stand. */
  variants: number;
  /** Stops anyone on foot: the player and ground enemies. */
  blocksWalk: boolean;
  /** Stops fliers and every shot too. */
  solid: boolean;
  /** A key swing or a blast breaks it. */
  breakable: boolean;
  /** HP the player loses stepping on it; enemies walk over it unhurt. */
  damage: number;
  /** Odds of a cluster being this kind. */
  weight: number;
}

export const OBSTACLES: readonly ObstacleDef[] = [
  {
    id: 'rock',
    name: 'obstacle.rock.name',
    text: 'obstacle.rock.text',
    texture: 'obstacle-rock',
    themed: true,
    variants: 2,
    blocksWalk: true,
    solid: true,
    breakable: false,
    damage: 0,
    weight: 4,
  },
  {
    id: 'cracked',
    name: 'obstacle.cracked.name',
    text: 'obstacle.cracked.text',
    texture: 'obstacle-cracked',
    themed: true,
    variants: 2,
    blocksWalk: true,
    solid: true,
    breakable: true,
    damage: 0,
    // Never a whole cluster: single rocks crack instead (`crackedChance`), so a breakable one stands out.
    weight: 0,
  },
  {
    id: 'pit',
    name: 'obstacle.pit.name',
    text: 'obstacle.pit.text',
    texture: 'obstacle-pit',
    themed: false,
    variants: 1,
    blocksWalk: true,
    solid: false,
    breakable: false,
    damage: 0,
    weight: 2,
  },
  {
    id: 'spikes',
    name: 'obstacle.spikes.name',
    text: 'obstacle.spikes.text',
    texture: 'obstacle-spikes',
    themed: false,
    variants: 1,
    blocksWalk: false,
    solid: false,
    breakable: false,
    damage: 6,
    weight: 2,
  },
];

export const OBSTACLE_TUNING = {
  /** Share of common rooms left bare. */
  emptyChance: 0.2,
  /** Clusters rolled per filled quarter of the room. */
  minClusters: 1,
  maxClusters: 3,
  /** Layouts that wall off part of the floor are rerolled this many times before the room goes bare. */
  attempts: 20,
  /** Odds that each rock comes cracked. */
  crackedChance: 0.2,
  /** Odds a broken cracked rock leaves a coin. */
  rubbleCoinChance: 0.25,
} as const;

/** One cell per room tile, walls included, row by row; null is open floor. */
export type ObstacleGrid = (ObstacleId | null)[];

export const CELLS = ROOM_COLS * ROOM_ROWS;

export const cellIndex = (col: number, row: number) => row * ROOM_COLS + col;

// Looked up on every passability check, several times per enemy per frame.
const BY_ID = Object.fromEntries(OBSTACLES.map((o) => [o.id, o])) as Record<ObstacleId, ObstacleDef>;

export function obstacleDef(id: ObstacleId): ObstacleDef {
  return BY_ID[id];
}

/** Texture for this obstacle in this phase; BootScene bakes variant 0 when its art is missing. */
export function obstacleTexture(def: ObstacleDef, phaseId: string, variant = 0): string {
  const base = def.themed ? `${def.texture}:${phaseId}` : def.texture;
  return variant > 0 ? `${base}:${variant}` : base;
}

/**
 * Which look a cell gets. Read from the cell folded into the top-left quarter, so mirrored
 * cells match and the room stays symmetric; neighbors still alternate.
 */
export function obstacleVariant(def: ObstacleDef, col: number, row: number): number {
  const foldedCol = Math.min(col, ROOM_COLS - 1 - col);
  const foldedRow = Math.min(row, ROOM_ROWS - 1 - row);
  return (foldedCol * 3 + foldedRow * 5) % def.variants;
}

/** Real art under public/: one file per phase for a themed obstacle, else one for all; later variants end in -2, -3... */
export function obstacleArt(def: ObstacleDef, phaseId: string, variant = 0): string {
  const base = def.themed ? `obstacles/${def.id}-${phaseId}` : `obstacles/${def.id}`;
  return variant > 0 ? `${base}-${variant + 1}.png` : `${base}.png`;
}

/** Every obstacle texture key with its art file, each once. */
export function obstacleArtFiles(phaseIds: readonly string[]): Map<string, string> {
  const files = new Map<string, string>();
  const looks = OBSTACLES.flatMap((def) => phaseIds.map((phaseId) => ({ def, phaseId })));
  for (const { def, phaseId } of looks) addVariantArt(files, def, phaseId);
  return files;
}

function addVariantArt(files: Map<string, string>, def: ObstacleDef, phaseId: string) {
  for (let v = 0; v < def.variants; v++) files.set(obstacleTexture(def, phaseId, v), obstacleArt(def, phaseId, v));
}

/** Creates a fresh room-sized grid, including the wall ring, with every cell set to open floor. */
export function emptyGrid(): ObstacleGrid {
  return new Array<ObstacleId | null>(CELLS).fill(null);
}

function interior(col: number, row: number): boolean {
  return col >= 1 && row >= 1 && col <= ROOM_COLS - 2 && row <= ROOM_ROWS - 2;
}

export const cellCol = (cell: number) => cell % ROOM_COLS;
export const cellRow = (cell: number) => Math.floor(cell / ROOM_COLS);

const ALL_CELLS = Array.from({ length: CELLS }, (_, cell) => cell);

/** Every cell inside the walls, row by row: walking the floor is one loop and allocates nothing. */
export const INTERIOR_CELLS: readonly number[] = ALL_CELLS.filter((cell) => interior(cellCol(cell), cellRow(cell)));

/** The wall ring, doors' places included, row by row. */
export const WALL_CELLS: readonly number[] = ALL_CELLS.filter((cell) => !interior(cellCol(cell), cellRow(cell)));

/** Whether a body on foot (or a flier) can stand on this cell. Walls and out of range never. */
export function passable(grid: ObstacleGrid, col: number, row: number, flying: boolean): boolean {
  if (!interior(col, row)) return false;
  const id = grid[cellIndex(col, row)];
  if (id === null) return true;
  const def = obstacleDef(id);
  if (def.solid) return false;
  return flying || !def.blocksWalk;
}

export const colAt = (x: number) => Math.floor((x - ROOM_X) / TILE);
export const rowAt = (y: number) => Math.floor((y - ROOM_Y) / TILE);

/** Cells of a shape, from its top-left corner. */
const SHAPES: readonly (readonly (readonly [number, number])[])[] = [
  [[0, 0]],
  [
    [0, 0],
    [1, 0],
  ],
  [
    [0, 0],
    [0, 1],
  ],
  [
    [0, 0],
    [1, 0],
    [2, 0],
  ],
  [
    [0, 0],
    [0, 1],
    [0, 2],
  ],
  [
    [0, 0],
    [1, 0],
    [0, 1],
  ],
  [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ],
];

/** A quarter of the room between the walls and the open cross through the doors. */
const QUARTER_COLS = DOOR_COL - 1;
const QUARTER_ROWS = DOOR_ROW - 1;

interface Placed {
  col: number;
  row: number;
  id: ObstacleId;
}

/**
 * A common room's obstacles. Clusters are rolled in a quarter of the room and mirrored, so a
 * room reads as built, not scattered; the cross through the doors stays open, so every door
 * and the center are clear. A layout that cuts off any floor is rolled again.
 */
export function rollObstacles(rng: Rng): ObstacleGrid {
  if (rng.chance(OBSTACLE_TUNING.emptyChance)) return emptyGrid();
  for (let attempt = 0; attempt < OBSTACLE_TUNING.attempts; attempt++) {
    const grid = mirrored(rng);
    if (allFloorReachable(grid)) return crackSome(rng, grid);
  }
  return emptyGrid();
}

/** Cracks rocks one by one, after mirroring: a cracked rock has no twin across the room. */
function crackSome(rng: Rng, grid: ObstacleGrid): ObstacleGrid {
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === 'rock' && rng.chance(OBSTACLE_TUNING.crackedChance)) grid[i] = 'cracked';
  }
  return grid;
}

/** Mirrored both ways, or left to right, or top to bottom with two quarters of their own. */
function mirrored(rng: Rng): ObstacleGrid {
  const grid = emptyGrid();
  const mode = rng.int(0, 2);
  const a = rollQuarter(rng);
  if (mode === 0) {
    stamp(grid, a, false, false);
    stamp(grid, a, true, false);
    stamp(grid, a, false, true);
    stamp(grid, a, true, true);
    return grid;
  }
  const b = rollQuarter(rng);
  if (mode === 1) {
    stamp(grid, a, false, false);
    stamp(grid, a, true, false);
    stamp(grid, b, false, true);
    stamp(grid, b, true, true);
    return grid;
  }
  stamp(grid, a, false, false);
  stamp(grid, a, false, true);
  stamp(grid, b, true, false);
  stamp(grid, b, true, true);
  return grid;
}

/** Puts a quarter's cells in the room, flipped across the cross as asked. */
function stamp(grid: ObstacleGrid, quarter: readonly Placed[], flipX: boolean, flipY: boolean) {
  for (const { col, row, id } of quarter) {
    const c = flipX ? ROOM_COLS - 2 - col : 1 + col;
    const r = flipY ? ROOM_ROWS - 2 - row : 1 + row;
    grid[cellIndex(c, r)] = id;
  }
}

function rollQuarter(rng: Rng): Placed[] {
  const placed: Placed[] = [];
  const clusters = rng.int(OBSTACLE_TUNING.minClusters, OBSTACLE_TUNING.maxClusters);
  for (let i = 0; i < clusters; i++) {
    const shape = SHAPES[rng.int(0, SHAPES.length - 1)];
    const width = Math.max(...shape.map(([x]) => x)) + 1;
    const height = Math.max(...shape.map(([, y]) => y)) + 1;
    const col = rng.int(0, QUARTER_COLS - width);
    const row = rng.int(0, QUARTER_ROWS - height);
    const id = pickKind(rng);
    const overlaps = shape.some(([x, y]) => placed.some((p) => p.col === col + x && p.row === row + y));
    if (overlaps) continue;
    placed.push(...shape.map(([x, y]) => ({ col: col + x, row: row + y, id })));
  }
  return placed;
}

function pickKind(rng: Rng): ObstacleId {
  const total = OBSTACLES.reduce((sum, o) => sum + o.weight, 0);
  let roll = rng.next() * total;
  for (const o of OBSTACLES) {
    roll -= o.weight;
    if (roll < 0) return o.id;
  }
  return OBSTACLES[0].id;
}

/**
 * Every open cell can be reached from the center over open cells alone: no door or corner
 * costs a step on spikes. The altar's cell counts as taken, since touching it pays for it.
 */
export function allFloorReachable(grid: ObstacleGrid): boolean {
  const clear = (col: number, row: number) =>
    interior(col, row) && grid[cellIndex(col, row)] === null && !(col === DOOR_COL && row === ALTAR_ROW);
  const seen = new Set<number>([cellIndex(DOOR_COL, DOOR_ROW)]);
  const queue = [cellIndex(DOOR_COL, DOOR_ROW)];
  const visit = (col: number, row: number) => {
    if (!clear(col, row) || seen.has(cellIndex(col, row))) return;
    seen.add(cellIndex(col, row));
    queue.push(cellIndex(col, row));
  };
  while (queue.length > 0) {
    const cell = queue.pop()!;
    const col = cellCol(cell);
    const row = cellRow(cell);
    visit(col + 1, row);
    visit(col - 1, row);
    visit(col, row + 1);
    visit(col, row - 1);
  }
  return INTERIOR_CELLS.every((cell) => !clear(cellCol(cell), cellRow(cell)) || seen.has(cell));
}

export interface Spot {
  x: number;
  y: number;
}

/** Sample spacing along a line of sight; well under a tile, so no corner is skipped. */
const SIGHT_STEP = TILE / 4;

/**
 * Whether a body of `radius` can go straight from one point to the other: its center and both
 * of its sides stay on cells it can cross.
 */
export function straightPath(
  grid: ObstacleGrid,
  flying: boolean,
  from: Readonly<Spot>,
  to: Readonly<Spot>,
  radius: number,
): boolean {
  const x0 = from.x;
  const y0 = from.y;
  const dx = to.x - x0;
  const dy = to.y - y0;
  const length = Math.hypot(dx, dy);
  if (length === 0) return true;
  const nx = (-dy / length) * radius;
  const ny = (dx / length) * radius;
  const steps = Math.ceil(length / SIGHT_STEP);
  for (let i = 0; i <= steps; i++) {
    const x = x0 + (dx * i) / steps;
    const y = y0 + (dy * i) / steps;
    if (!passable(grid, colAt(x), rowAt(y), flying)) return false;
    if (!passable(grid, colAt(x + nx), rowAt(y + ny), flying)) return false;
    if (!passable(grid, colAt(x - nx), rowAt(y - ny), flying)) return false;
  }
  return true;
}

/** The open floor cell nearest to this one, by steps; the center when nothing is open. */
export function nearestOpen(grid: ObstacleGrid, col: number, row: number): { col: number; row: number } {
  let best = { col: DOOR_COL, row: DOOR_ROW };
  let bestD = Infinity;
  for (const cell of INTERIOR_CELLS) {
    if (grid[cell] !== null) continue;
    const c = cellCol(cell);
    const r = cellRow(cell);
    const d = Math.abs(c - col) + Math.abs(r - row);
    if (d >= bestD) continue;
    best = { col: c, row: r };
    bestD = d;
  }
  return best;
}

/**
 * What a quarter of a pit tile shows, so touching pits read as one hole: the rim only on
 * sides facing floor. `dx`/`dy` (-1 or 1) pick the quarter: left or right, top or bottom.
 */
export type PitPiece = 'outer' | 'rimX' | 'rimY' | 'inner' | 'fill';

export const PIT_PIECES: readonly PitPiece[] = ['outer', 'rimX', 'rimY', 'inner', 'fill'];

/** A tile's four quarters, as the sides they lean to: `[dx, dy]`, top row first. */
export const PIT_QUARTERS: readonly (readonly [number, number])[] = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];

/** Texture BootScene cuts the pit art into, one frame per piece and quarter. */
export const PIT_PARTS = 'obstacle-pit-parts';

export const pitFrame = (piece: PitPiece, dx: number, dy: number) => `${piece}:${dx}:${dy}`;

export function pitPiece(grid: ObstacleGrid, col: number, row: number, dx: number, dy: number): PitPiece {
  const pit = (c: number, r: number) => interior(c, r) && grid[cellIndex(c, r)] === 'pit';
  const side = pit(col + dx, row);
  const end = pit(col, row + dy);
  if (!side && !end) return 'outer';
  // Rim along the floor that's left: across the side, or across the end.
  if (!side) return 'rimX';
  if (!end) return 'rimY';
  return pit(col + dx, row + dy) ? 'fill' : 'inner';
}

/** Whether the room has anything that changes how enemies get around. */
export function blocksAnyone(grid: ObstacleGrid): boolean {
  return grid.some((id) => id !== null && obstacleDef(id).blocksWalk);
}
