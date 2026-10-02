import type { RoomNode } from './FloorGenerator';

/** The first floor teaches the swing; from here on treasure rooms are locked. */
export const LOCK_FROM_DEPTH = 2;

/** Locked rooms open only to a key swing, which spends a drive charge. */
export function startsLocked(room: Pick<RoomNode, 'type'>, depth: number): boolean {
  return room.type === 'treasure' && depth >= LOCK_FROM_DEPTH;
}
