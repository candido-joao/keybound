import { describe, expect, it } from 'vitest';
import { setUpFloor } from './floorSetup';

const SEEDS = Array.from({ length: 30 }, (_, i) => `SETUP${i}`);

/** A floor as plain data, to compare two rolls. */
function snapshot(seed: string, depth: number) {
  const { floor, boss, roomItems } = setUpFloor(seed, depth, []);
  const rooms = [...floor.rooms.values()].map(({ x, y, type, event, locked, obstacles }) => ({
    x,
    y,
    type,
    event,
    locked,
    obstacles,
    item: roomItems.get(floor.rooms.get(`${x},${y}`)!)?.id,
  }));
  return { boss: boss.id, rooms };
}

describe('setUpFloor', () => {
  it('rolls the same floor from the same seed', () => {
    for (const seed of SEEDS) expect(snapshot(seed, 4)).toEqual(snapshot(seed, 4));
  });

  it('gives obstacles to common rooms only', () => {
    const rooms = SEEDS.flatMap((seed) => [...setUpFloor(seed, 3, []).floor.rooms.values()]);
    expect(rooms.filter((r) => r.type !== 'normal' && r.obstacles)).toEqual([]);
    expect(rooms.some((r) => r.type === 'normal' && r.obstacles)).toBe(true);
  });

  it('puts an item in every treasure room, and never the same item in two rooms', () => {
    for (const seed of SEEDS) {
      const { floor, roomItems } = setUpFloor(seed, 4, []);
      const treasure = [...floor.rooms.values()].find((r) => r.type === 'treasure')!;
      const ids = [...roomItems.values()].map((item) => item.id);
      expect(roomItems.has(treasure)).toBe(true);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
