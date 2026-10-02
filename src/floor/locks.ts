import type { Rng } from '../core/rng';
import type { RoomNode } from './FloorGenerator';

/** Odds that a treasure room or shop starts locked, on any floor. */
export const LOCK_CHANCE = 0.5;

/** Locked rooms open only to a key swing, which spends a drive charge. */
export function startsLocked(rng: Rng, room: Pick<RoomNode, 'type'>): boolean {
  if (room.type !== 'treasure' && room.type !== 'shop') return false;
  return rng.chance(LOCK_CHANCE);
}
