import { ROOM_COLS, ROOM_ROWS } from '../config';
import { CELLS, type ObstacleGrid, cellIndex, passable } from './obstacles';

/**
 * Extra steps a cell counts per enemy standing on it: a short way around beats shoving through
 * a pack, a lap of the room doesn't. Capped, so a crowd never walls a cell off for good.
 */
export const CROWD_STEPS = 4;
const CROWD_CAP = 3;

/**
 * Steps to a target cell from every cell over what a walker (or a flier) can cross, counting
 * cells others stand on as longer (`CROWD_STEPS`). Built once per target cell or crowd change
 * into fixed arrays, so following it allocates nothing.
 */
export class FlowField {
  private readonly dist = new Int16Array(CELLS);
  /** What stepping onto each cell costs, as built. */
  private readonly cost = new Uint8Array(CELLS);
  /** Ring of cells waiting to pass their distance on; `queued` keeps each in it once. */
  private readonly queue = new Int16Array(CELLS);
  private readonly queued = new Uint8Array(CELLS);
  private head = 0;
  private size = 0;

  /** `crowd` counts the enemies on each cell; without it, every step costs 1. */
  build(grid: ObstacleGrid, flying: boolean, targetCol: number, targetRow: number, crowd?: Readonly<Uint8Array>) {
    this.dist.fill(-1);
    for (let cell = 0; cell < CELLS; cell++)
      this.cost[cell] = 1 + CROWD_STEPS * Math.min(CROWD_CAP, crowd?.[cell] ?? 0);
    if (!passable(grid, targetCol, targetRow, flying)) return;
    const start = cellIndex(targetCol, targetRow);
    this.dist[start] = 0;
    this.head = 0;
    this.size = 0;
    this.push(start);
    while (this.size > 0) this.spread(grid, flying, this.pop());
  }

  /** Offers each neighbor the way through this cell; a neighbor that gets shorter goes back in line. */
  private spread(grid: ObstacleGrid, flying: boolean, cell: number) {
    const col = cell % ROOM_COLS;
    const row = (cell - col) / ROOM_COLS;
    const d = this.dist[cell] + this.cost[cell];
    this.offer(grid, flying, col + 1, row, d);
    this.offer(grid, flying, col - 1, row, d);
    this.offer(grid, flying, col, row + 1, d);
    this.offer(grid, flying, col, row - 1, d);
  }

  private offer(grid: ObstacleGrid, flying: boolean, col: number, row: number, d: number) {
    if (!passable(grid, col, row, flying)) return;
    const cell = cellIndex(col, row);
    const known = this.dist[cell];
    if (known >= 0 && known <= d) return;
    this.dist[cell] = d;
    if (this.queued[cell] === 0) this.push(cell);
  }

  private push(cell: number) {
    this.queue[(this.head + this.size) % CELLS] = cell;
    this.queued[cell] = 1;
    this.size++;
  }

  private pop(): number {
    const cell = this.queue[this.head];
    this.head = (this.head + 1) % CELLS;
    this.size--;
    this.queued[cell] = 0;
    return cell;
  }

  /** Steps to the target, crowds counted; -1 when it can't be reached or the cell is out of the room. */
  distance(col: number, row: number): number {
    if (col < 0 || row < 0 || col >= ROOM_COLS || row >= ROOM_ROWS) return -1;
    return this.dist[cellIndex(col, row)];
  }

  /** The neighbor on the shortest way to the target, as a cell index; -1 when there is none. */
  next(col: number, row: number): number {
    const here = this.distance(col, row);
    if (here <= 0) return -1;
    if (this.leads(col + 1, row, here)) return cellIndex(col + 1, row);
    if (this.leads(col - 1, row, here)) return cellIndex(col - 1, row);
    if (this.leads(col, row + 1, here)) return cellIndex(col, row + 1);
    if (this.leads(col, row - 1, here)) return cellIndex(col, row - 1);
    return -1;
  }

  private leads(col: number, row: number, here: number): boolean {
    const d = this.distance(col, row);
    return d >= 0 && d + this.cost[cellIndex(col, row)] === here;
  }
}
