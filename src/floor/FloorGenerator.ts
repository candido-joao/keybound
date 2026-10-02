import { FLOOR_GRID_H, FLOOR_GRID_W } from '../config';
import type { Rng } from '../core/rng';
import type { RoomEventId } from './roomEvents';

export type Dir = 'up' | 'down' | 'left' | 'right';
export type RoomType = 'start' | 'normal' | 'treasure' | 'boss' | 'shop';

export const DIRS: Record<Dir, { dx: number; dy: number; opposite: Dir }> = {
  up: { dx: 0, dy: -1, opposite: 'down' },
  down: { dx: 0, dy: 1, opposite: 'up' },
  left: { dx: -1, dy: 0, opposite: 'right' },
  right: { dx: 1, dy: 0, opposite: 'left' },
};

export interface RoomNode {
  x: number;
  y: number;
  type: RoomType;
  /** BFS steps from the start room. */
  depth: number;
  visited: boolean;
  cleared: boolean;
  /** The room's reward item was taken: treasure, boss, or a paid altar's pedestal. */
  itemTaken: boolean;
  /** Altar rooms: the price was paid and the altar turned into a pedestal. */
  altarPaid?: boolean;
  /** Set when the floor's events are rolled. */
  event?: RoomEventId;
  /** Every door into it stays shut until a key swing unlocks one; see `startsLocked`. */
  locked?: boolean;
}

export class Floor {
  readonly rooms: Map<string, RoomNode>;
  readonly start: RoomNode;

  constructor(rooms: Map<string, RoomNode>, start: RoomNode) {
    this.rooms = rooms;
    this.start = start;
  }

  get(x: number, y: number): RoomNode | undefined {
    return this.rooms.get(key(x, y));
  }

  neighbor(room: RoomNode, dir: Dir): RoomNode | undefined {
    return this.get(room.x + DIRS[dir].dx, room.y + DIRS[dir].dy);
  }

  doors(room: RoomNode): Dir[] {
    return (Object.keys(DIRS) as Dir[]).filter((d) => this.neighbor(room, d));
  }
}

const key = (x: number, y: number) => `${x},${y}`;

const ATTEMPTS_PER_SIZE = 200;
/** Start plus two dead ends: the least that still fits a boss and a treasure room. */
const MIN_ROOMS = 3;

/**
 * Isaac-style layout: grow outward from the center with BFS, refusing cells that
 * would touch 2+ rooms (keeps corridors, avoids blobs). Special rooms go on dead ends.
 */
export function generateFloor(rng: Rng, floorDepth: number): Floor {
  const target = Math.min(20, rng.int(0, 1) + 5 + Math.floor(floorDepth * 2.6));

  // A smaller floor beats a crashed run: shrink the target until one fits.
  for (let size = target; size >= MIN_ROOMS; size--) {
    for (let attempt = 0; attempt < ATTEMPTS_PER_SIZE; attempt++) {
      const floor = tryGenerate(rng, size);
      if (floor) return floor;
    }
  }
  throw new Error(`Floor generation failed (seed ${rng.seed}, depth ${floorDepth})`);
}

function tryGenerate(rng: Rng, target: number): Floor | null {
  const cx = Math.floor(FLOOR_GRID_W / 2);
  const cy = Math.floor(FLOOR_GRID_H / 2);
  const rooms = new Map<string, RoomNode>();
  const deadEnds: RoomNode[] = [];

  const add = (x: number, y: number, depth: number): RoomNode => {
    const room: RoomNode = { x, y, type: 'normal', depth, visited: false, cleared: false, itemTaken: false };
    rooms.set(key(x, y), room);
    return room;
  };
  const occupiedNeighbors = (x: number, y: number) =>
    Object.values(DIRS).filter(({ dx, dy }) => rooms.has(key(x + dx, y + dy))).length;

  const start = add(cx, cy, 0);
  start.type = 'start';
  const queue: RoomNode[] = [start];

  while (queue.length > 0) {
    const room = queue.shift()!;
    const sizeBefore = rooms.size;

    for (const dir of rng.shuffle(Object.keys(DIRS) as Dir[])) {
      const nx = room.x + DIRS[dir].dx;
      const ny = room.y + DIRS[dir].dy;
      if (nx < 0 || ny < 0 || nx >= FLOOR_GRID_W || ny >= FLOOR_GRID_H) continue;
      if (rooms.has(key(nx, ny))) continue;
      if (rooms.size >= target) continue;
      if (occupiedNeighbors(nx, ny) > 1) continue;
      if (rng.chance(0.5)) continue;

      queue.push(add(nx, ny, room.depth + 1));
    }

    if (rooms.size === sizeBefore && room !== start) deadEnds.push(room);
  }

  // A room can be marked dead-end and later gain a neighbor; recheck.
  const realDeadEnds = deadEnds.filter((r) => occupiedNeighbors(r.x, r.y) === 1);
  if (rooms.size < target || realDeadEnds.length < 2) return null;

  realDeadEnds.sort((a, b) => b.depth - a.depth);
  realDeadEnds[0].type = 'boss';
  const treasure = realDeadEnds[realDeadEnds.length - 1];
  treasure.type = 'treasure';
  // A shop only when a third dead end is left over; picking it rolls nothing, so layouts don't change.
  const shop = realDeadEnds.length >= 3 ? realDeadEnds[realDeadEnds.length - 2] : undefined;
  if (shop) shop.type = 'shop';

  // Rooms without combat start open.
  start.visited = true;
  start.cleared = true;
  treasure.cleared = true;
  if (shop) shop.cleared = true;
  return new Floor(rooms, start);
}
