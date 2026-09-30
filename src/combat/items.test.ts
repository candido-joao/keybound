import { describe, expect, it } from 'vitest';
import { BASE_STATS } from './balance';
import { ITEMS } from './items';
import { baseId, computeStats } from './stats';

describe('ITEMS', () => {
  it('has unique ids', () => {
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEMS.length);
  });

  it('ties every variant to a pure item', () => {
    const pure = new Set(ITEMS.filter((i) => !i.base).map((i) => i.id));
    for (const variant of ITEMS.filter((i) => i.base)) {
      expect(pure.has(baseId(variant))).toBe(true);
      expect(variant.id.startsWith(`${variant.base}:`)).toBe(true);
    }
  });

  it('has positive weights', () => {
    for (const item of ITEMS) expect(item.weight).toBeGreaterThan(0);
  });
});

describe('computeStats', () => {
  const byId = (id: string) => ITEMS.find((i) => i.id === id)!;

  it('keeps stacked costs within limits', () => {
    const colossus = byId('vital-shard:colossus');
    const stats = computeStats(BASE_STATS, [colossus, colossus, colossus, colossus]);
    expect(stats.maxHealth).toBe(BASE_STATS.maxHealth + 200);
    expect(stats.hitboxScale).toBe(2);
    expect(stats.speed).toBe(100);
  });

  it('bounds fire delay both ways', () => {
    const cannon = byId('ether-core:cannon');
    expect(computeStats(BASE_STATS, [cannon, cannon]).fireDelay).toBe(3000);
    const gatling = byId('quickcast:gatling');
    expect(computeStats(BASE_STATS, [gatling, gatling]).fireDelay).toBe(140);
  });
});
