import { describe, expect, it } from 'vitest';
import { Rng } from '../core/rng';
import { type RoomNode, generateFloor } from './FloorGenerator';

const SEEDS = Array.from({ length: 40 }, (_, i) => `SHOP${i}`);

describe('generateFloor', () => {
  it('places at most one shop, on a dead end, open from the start', () => {
    let shops = 0;
    for (const seed of SEEDS) {
      const floor = generateFloor(new Rng(seed), 4);
      const found = [...floor.rooms.values()].filter((r) => r.type === 'shop');
      expect(found.length).toBeLessThanOrEqual(1);
      shops += found.length;
      const shop = found.at(0);
      if (!shop) continue;
      expect(floor.doors(shop)).toHaveLength(1);
      expect(shop.cleared).toBe(true);
    }
    // Floors this deep almost always have a third dead end to spare.
    expect(shops).toBeGreaterThan(SEEDS.length / 2);
  });

  it('keeps the boss on the deepest dead end and the treasure on the shallowest', () => {
    for (const seed of SEEDS) {
      const rooms = [...generateFloor(new Rng(seed), 3).rooms.values()];
      const of = (type: RoomNode['type']) => rooms.find((r) => r.type === type)!;
      const shop = rooms.find((r) => r.type === 'shop');
      expect(of('boss').depth).toBeGreaterThanOrEqual(of('treasure').depth);
      if (shop) expect(shop.depth).toBeGreaterThanOrEqual(of('treasure').depth);
    }
  });
});
