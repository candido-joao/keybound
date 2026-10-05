import { describe, expect, it } from 'vitest';
import { ALTAR_ROW, DOOR_COL, DOOR_ROW, ROOM_COLS, ROOM_ROWS, tileX, tileY } from '../config';
import { Rng } from '../core/rng';
import {
  FlowField,
  type ObstacleGrid,
  allFloorReachable,
  cellCol,
  cellIndex,
  cellRow,
  emptyGrid,
  nearestOpen,
  obstacleArt,
  obstacleDef,
  obstacleVariant,
  passable,
  pitPiece,
  rollObstacles,
  straightPath,
} from './obstacles';

const SEEDS = Array.from({ length: 300 }, (_, i) => `ROCK${i}`);
const roll = (seed: string) => rollObstacles(new Rng(seed));
const ALL_CELLS = emptyGrid().map((_, cell) => cell);
/** Cells in `cells` that hold an obstacle. */
const taken = (grid: ObstacleGrid, cells: number[]) => cells.filter((cell) => grid[cell] !== null);

/** A grid from rows of text: '.' open, '#' rock, 'o' pit, '^' spikes; walls around it are implied. */
function gridOf(rows: string[]): ObstacleGrid {
  const grid = emptyGrid();
  const kinds = { '#': 'rock', o: 'pit', '^': 'spikes', c: 'cracked' } as const;
  rows.forEach((line, r) => {
    [...line].forEach((ch, c) => {
      if (ch in kinds) grid[cellIndex(c + 1, r + 1)] = kinds[ch as keyof typeof kinds];
    });
  });
  return grid;
}

describe('rollObstacles', () => {
  it('rolls the same room from the same seed', () => {
    expect(roll('SAME')).toEqual(roll('SAME'));
  });

  it('keeps the cross through the doors open', () => {
    for (const seed of SEEDS) {
      const cross = ALL_CELLS.filter((cell) => cellCol(cell) === DOOR_COL || cellRow(cell) === DOOR_ROW);
      expect(taken(roll(seed), cross)).toEqual([]);
    }
  });

  it('keeps the altar off the way: the top door is reached without it or spikes', () => {
    for (const seed of SEEDS) {
      // A walker that may only use open cells, never the altar's.
      const grid = roll(seed).map((id) => (id === 'spikes' ? 'rock' : id));
      const field = new FlowField();
      grid[cellIndex(DOOR_COL, ALTAR_ROW)] = 'rock';
      field.build(grid, false, DOOR_COL, 1);
      expect(field.distance(DOOR_COL, DOOR_ROW)).toBeGreaterThan(0);
    }
  });

  it('never cuts off any floor', () => {
    for (const seed of SEEDS) expect(allFloorReachable(roll(seed))).toBe(true);
  });

  it('leaves the wall ring alone', () => {
    for (const seed of SEEDS) {
      const ends = ALL_CELLS.filter((cell) => cellRow(cell) === 0 || cellRow(cell) === ROOM_ROWS - 1);
      expect(taken(roll(seed), ends)).toEqual([]);
    }
  });

  it('fills most rooms and leaves some bare', () => {
    const filled = SEEDS.filter((seed) => roll(seed).some((id) => id !== null)).length;
    expect(filled).toBeGreaterThan(SEEDS.length * 0.6);
    expect(filled).toBeLessThan(SEEDS.length);
  });

  it('mirrors every layout across at least one axis', () => {
    for (const seed of SEEDS) {
      const grid = roll(seed);
      // Cracks are rolled per rock after mirroring; the layout under them is what's mirrored.
      const at = (c: number, r: number) => (grid[cellIndex(c, r)] === 'cracked' ? 'rock' : grid[cellIndex(c, r)]);
      const acrossX = ALL_CELLS.every((cell) => {
        const [c, r] = [cellCol(cell), cellRow(cell)];
        return at(c, r) === at(ROOM_COLS - 1 - c, r);
      });
      const acrossY = ALL_CELLS.every((cell) => {
        const [c, r] = [cellCol(cell), cellRow(cell)];
        return at(c, r) === at(c, ROOM_ROWS - 1 - r);
      });
      expect(acrossX || acrossY).toBe(true);
    }
  });

  it('cracks about one rock in five', () => {
    const cells = SEEDS.flatMap((seed) => roll(seed));
    const cracked = cells.filter((id) => id === 'cracked').length;
    const share = cracked / (cracked + cells.filter((id) => id === 'rock').length);
    expect(share).toBeGreaterThan(0.12);
    expect(share).toBeLessThan(0.28);
  });

  it('rolls every kind somewhere', () => {
    const seen = new Set(SEEDS.flatMap((seed) => roll(seed)).filter((id) => id !== null));
    expect(seen).toEqual(new Set(['rock', 'cracked', 'pit', 'spikes']));
  });
});

describe('passable', () => {
  const grid = gridOf(['#o^c']);

  it('lets walkers over spikes only', () => {
    expect([1, 2, 3, 4, 5].map((c) => passable(grid, c, 1, false))).toEqual([false, false, true, false, true]);
  });

  it('lets fliers over pits too, never through rock', () => {
    expect([1, 2, 3, 4].map((c) => passable(grid, c, 1, true))).toEqual([false, true, true, false]);
  });

  it('treats the walls as blocked', () => {
    expect(passable(grid, 0, 3, true)).toBe(false);
    expect(passable(grid, 5, 0, true)).toBe(false);
  });
});

describe('allFloorReachable', () => {
  it('fails when a corner is walled in', () => {
    expect(allFloorReachable(gridOf(['.#', '##']))).toBe(false);
  });

  it('fails when the only way in is over spikes', () => {
    expect(allFloorReachable(gridOf(['.^', '^#']))).toBe(false);
  });

  it('fails when the altar is the only way to the top door', () => {
    // Spikes left of the altar's column and pits right of it, from the top wall down past the altar.
    const grid = gridOf(['.....^.o.....', '.....^.o.....', '.....^.......']);
    expect(allFloorReachable(grid)).toBe(false);
  });

  it('passes when the top door can be reached around the altar', () => {
    const grid = gridOf(['.....^.......', '.....^.o.....']);
    expect(allFloorReachable(grid)).toBe(true);
  });
});

describe('FlowField', () => {
  // A wall of rock from the top down to row 3, between column 2 and the target at column 4.
  const grid = gridOf(['..#', '..#', '..#']);

  it('counts steps around the rock', () => {
    const field = new FlowField();
    field.build(grid, false, 4, 1);
    // Down to row 4, across and back up: 3 + 2 + 3.
    expect(field.distance(2, 1)).toBe(8);
    expect(field.distance(3, 1)).toBe(-1);
  });

  it('points the next step toward the target', () => {
    const field = new FlowField();
    field.build(grid, false, 4, 1);
    expect(field.next(2, 1)).toBe(cellIndex(2, 2));
    expect(field.next(4, 1)).toBe(-1);
  });

  it('lets fliers cross pits', () => {
    const pits = gridOf(['.o.']);
    const walker = new FlowField();
    walker.build(pits, false, 3, 1);
    const flier = new FlowField();
    flier.build(pits, true, 3, 1);
    expect(walker.distance(1, 1)).toBe(4);
    expect(flier.distance(1, 1)).toBe(2);
  });
});

describe('straightPath', () => {
  const at = (col: number, row: number) => ({ x: tileX(col), y: tileY(row) });
  const grid = gridOf(['...', '.#.', '...']);

  it('is blocked by rock in the way', () => {
    expect(straightPath(grid, false, at(1, 2), at(3, 2), 0)).toBe(false);
  });

  it('is clear beside it, unless the body is too wide', () => {
    expect(straightPath(grid, false, at(1, 1), at(3, 1), 10)).toBe(true);
    expect(straightPath(grid, false, at(1, 1), at(3, 1), 30)).toBe(false);
  });
});

describe('nearestOpen', () => {
  it('returns the cell itself when open', () => {
    expect(nearestOpen(emptyGrid(), 3, 3)).toEqual({ col: 3, row: 3 });
  });

  it('steps off an obstacle to the closest open cell', () => {
    const grid = gridOf(['##', '#.']);
    expect(nearestOpen(grid, 1, 1)).toEqual({ col: 3, row: 1 });
  });
});

describe('obstacle looks', () => {
  const rock = obstacleDef('rock');

  it('names variant files after the first', () => {
    expect(obstacleArt(rock, 'crypt')).toBe('obstacles/rock-crypt.png');
    expect(obstacleArt(rock, 'crypt', 1)).toBe('obstacles/rock-crypt-2.png');
    expect(obstacleArt(obstacleDef('pit'), 'crypt')).toBe('obstacles/pit.png');
  });

  it('gives mirrored cells the same look and neighbors different ones', () => {
    expect(obstacleVariant(rock, 2, 1)).toBe(obstacleVariant(rock, ROOM_COLS - 3, ROOM_ROWS - 2));
    expect(obstacleVariant(rock, 2, 1)).not.toBe(obstacleVariant(rock, 3, 1));
  });

  it('keeps single-look obstacles on their only look', () => {
    expect(obstacleVariant(obstacleDef('spikes'), 3, 2)).toBe(0);
  });
});

describe('pitPiece', () => {
  // An L of pits: (1,1), (2,1) and (1,2).
  const grid = gridOf(['oo', 'o.']);

  it('rims a lone corner on both sides', () => {
    expect(pitPiece(grid, 1, 1, -1, -1)).toBe('outer');
  });

  it('runs the rim across a side that meets another pit', () => {
    // Top right quarter of (1,1): the pit to the right continues it, floor above.
    expect(pitPiece(grid, 1, 1, 1, -1)).toBe('rimY');
    // Bottom left quarter of (1,1): the pit below continues it, the wall's side is floor.
    expect(pitPiece(grid, 1, 1, -1, 1)).toBe('rimX');
  });

  it('leaves a nub where the L turns around floor', () => {
    expect(pitPiece(grid, 1, 1, 1, 1)).toBe('inner');
  });

  it('is all hole inside a block of pits', () => {
    expect(pitPiece(gridOf(['oo', 'oo']), 1, 1, 1, 1)).toBe('fill');
  });
});
