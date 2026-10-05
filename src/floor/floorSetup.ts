import { ITEMS } from '../combat/items';
import { rollRewards } from '../combat/itemPool';
import type { EnemyDef } from '../combat/enemies';
import type { Item } from '../combat/stats';
import { Rng } from '../core/rng';
import { type Floor, type RoomNode, generateFloor } from './FloorGenerator';
import { startsLocked } from './locks';
import { rollObstacles } from './obstacles';
import { phaseAt, rollFloorBoss } from './phases';
import { rollRoomEvents } from './roomEvents';

/** Everything rolled for a floor before the player sets foot on it. */
export interface FloorSetup {
  floor: Floor;
  boss: EnemyDef;
  /** Item each reward room and shop holds, fixed per floor so revisits and route don't change it. */
  roomItems: Map<RoomNode, Item>;
}

/**
 * Rolls floor `depth` of the run seeded `seed`, for a player who holds `owned`. Each part has its
 * own stream, so changing one never reshuffles another: same seed, same floor.
 */
export function setUpFloor(seed: string, depth: number, owned: readonly Item[]): FloorSetup {
  const boss = rollFloorBoss(new Rng(`${seed}:boss:${depth}`), phaseAt(depth));
  const floor = generateFloor(new Rng(`${seed}:floor:${depth}`), depth);
  const rooms = [...floor.rooms.values()];
  for (const [room, id] of rollRoomEvents(new Rng(`${seed}:events:${depth}`), rooms)) room.event = id;
  const lockRng = new Rng(`${seed}:locks:${depth}`);
  for (const room of rooms) room.locked = startsLocked(lockRng, room);
  // Each common room's own stream, so a room's layout doesn't hang on the rest of the floor.
  for (const room of rooms.filter((r) => r.type === 'normal')) {
    room.obstacles = rollObstacles(new Rng(`${seed}:obstacles:${depth}:${room.x},${room.y}`));
  }
  const roomItems = rollRoomItems(seed, depth, rooms, owned);
  stockShops(seed, depth, rooms, owned, roomItems);
  return { floor, boss, roomItems };
}

/** Assigns treasure and boss rewards from the item stream, preferring item bases not yet owned. */
function rollRoomItems(seed: string, depth: number, rooms: readonly RoomNode[], owned: readonly Item[]) {
  const rewardRooms = rooms.filter((r) => r.type === 'treasure' || r.type === 'boss');
  const rewards = rollRewards(new Rng(`${seed}:items:${depth}`), ITEMS, owned, rewardRooms.length, depth);
  const roomItems = new Map<RoomNode, Item>();
  rewardRooms.forEach((room, i) => rewards[i] && roomItems.set(room, rewards[i]));
  return roomItems;
}

/** Each shop's item, from its own stream so the treasure and boss rolls stay as they were. */
function stockShops(
  seed: string,
  depth: number,
  rooms: readonly RoomNode[],
  owned: readonly Item[],
  roomItems: Map<RoomNode, Item>,
) {
  const rng = new Rng(`${seed}:shop:${depth}`);
  const reserved = [...owned, ...roomItems.values()];
  for (const room of rooms) {
    if (room.type !== 'shop') continue;
    const [item] = rollRewards(rng, ITEMS, reserved, 1, depth);
    if (!item) continue;
    roomItems.set(room, item);
    reserved.push(item);
  }
}
