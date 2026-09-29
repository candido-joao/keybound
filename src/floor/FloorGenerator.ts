import { FLOOR_GRID_H, FLOOR_GRID_W } from '../config';
import type { Rng } from '../core/rng';

export type Dir = 'up' | 'down' | 'left' | 'right';
export type RoomType = 'start' | 'normal' | 'treasure' | 'boss';

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
  itemTaken: boolean;
}

export class Floor {
  readonly depth: number;
  readonly rooms: Map<string, RoomNode>;
  readonly start: RoomNode;

  constructor(depth: number, rooms: Map<string, RoomNode>, start: RoomNode) {
    this.depth = depth;
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

/**
 * Isaac-style layout: grow outward from the center with BFS, refusing cells that
 * would touch 2+ rooms (keeps corridors, avoids blobs). Special rooms go on dead ends.
 */
export function generateFloor(rng: Rng, floorDepth: number): Floor {
  const target = Math.min(20, rng.int(0, 1) + 5 + Math.floor(floorDepth * 2.6));

  for (let attempt = 0; attempt < 200; attempt++) {
    const floor = tryGenerate(rng, floorDepth, target);
    if (floor) return floor;
  }
  throw new Error(`Floor generation failed (seed ${rng.seed}, depth ${floorDepth})`);
}

function tryGenerate(rng: Rng, floorDepth: number, target: number): Floor | null {
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
    let grew = false;

    for (const dir of rng.shuffle(Object.keys(DIRS) as Dir[])) {
      const nx = room.x + DIRS[dir].dx;
      const ny = room.y + DIRS[dir].dy;
      if (nx < 0 || ny < 0 || nx >= FLOOR_GRID_W || ny >= FLOOR_GRID_H) continue;
      if (rooms.has(key(nx, ny))) continue;
      if (rooms.size >= target) continue;
      if (occupiedNeighbors(nx, ny) > 1) continue;
      if (rng.chance(0.5)) continue;

      queue.push(add(nx, ny, room.depth + 1));
      grew = true;
    }

    if (!grew && room !== start) deadEnds.push(room);
  }

  // A room can be marked dead-end and later gain a neighbor; recheck.
  const realDeadEnds = deadEnds.filter((r) => occupiedNeighbors(r.x, r.y) === 1);
  if (rooms.size < target || realDeadEnds.length < 2) return null;

  realDeadEnds.sort((a, b) => b.depth - a.depth);
  realDeadEnds[0].type = 'boss';
  const treasure = realDeadEnds[realDeadEnds.length - 1];
  treasure.type = 'treasure';

  // Rooms without combat start open.
  start.visited = true;
  start.cleared = true;
  treasure.cleared = true;
  return new Floor(floorDepth, rooms, start);
}
