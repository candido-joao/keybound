import { describe, expect, it } from 'vitest';
import { BASE_STATS } from './balance';
import { ITEMS } from './items';
import { baseId, boltRangeOf, computeStats } from './stats';

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

  it('leaves the pool and copy limit to pure items, so variants always follow their base', () => {
    for (const variant of ITEMS.filter((i) => i.base)) {
      expect(variant.pool).toBeUndefined();
      expect(variant.maxCopies).toBeUndefined();
    }
  });

  it('heals in full with every version of an item that does', () => {
    const healers = new Set(ITEMS.filter((i) => !i.base && i.fullHeal).map((i) => i.id));
    for (const variant of ITEMS.filter((i) => i.base && healers.has(i.base))) expect(variant.fullHeal).toBe(true);
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

  it('turns every beam version into a beam', () => {
    for (const id of ['arcane-beam', 'arcane-beam:unstable', 'arcane-beam:overcharged']) {
      expect(computeStats(BASE_STATS, [byId(id)]).beam).toBeGreaterThan(0);
    }
  });

  it('shortens bolts with the gatling but leaves the beam its reach', () => {
    const stats = computeStats(BASE_STATS, [byId('arcane-beam'), byId('arcane-beam'), byId('quickcast:gatling')]);
    expect(stats.range).toBe(BASE_STATS.range * 2);
    expect(boltRangeOf(stats)).toBeCloseTo(BASE_STATS.range * 2 * 0.45);
  });

  it('makes a second beam reach twice as far and grow wider', () => {
    const one = computeStats(BASE_STATS, [byId('arcane-beam')]);
    const two = computeStats(BASE_STATS, [byId('arcane-beam'), byId('arcane-beam:unstable')]);
    expect(one.range).toBe(BASE_STATS.range);
    expect(two.range).toBe(BASE_STATS.range * 2);
    expect(two.boltScale).toBeCloseTo(BASE_STATS.boltScale * 1.5);
  });

  it('slams enemies into walls with a second tooth', () => {
    const tooth = byId('key-tooth');
    expect(computeStats(BASE_STATS, [tooth]).wallSlam).toBe(0);
    expect(computeStats(BASE_STATS, [tooth, byId('key-tooth:ram')]).wallSlam).toBe(0.5);
  });

  it('cuts damage for the first sigil only', () => {
    const sigil = byId('trinity-sigil');
    const twice = computeStats(BASE_STATS, [sigil, sigil]);
    expect(twice.shotCount).toBe(5);
    expect(twice.damage).toBeCloseTo(BASE_STATS.damage * 0.8);
  });

  it('adds side echoes with a second echo', () => {
    const echo = byId('crystal-echo');
    expect(computeStats(BASE_STATS, [echo]).echoShots).toBe(1);
    expect(computeStats(BASE_STATS, [echo, echo]).echoShots).toBe(3);
    expect(computeStats(BASE_STATS, [echo, echo, echo]).echoShots).toBe(3);
  });

  it('caps arc jumps', () => {
    const coil = byId('spark-coil:unstable');
    expect(computeStats(BASE_STATS, [coil, coil, coil]).chain).toBe(4);
  });

  it('bounds fire delay both ways', () => {
    const cannon = byId('ether-core:cannon');
    expect(computeStats(BASE_STATS, [cannon, cannon]).fireDelay).toBe(3000);
    const gatling = byId('quickcast:gatling');
    expect(computeStats(BASE_STATS, [gatling, gatling]).fireDelay).toBe(140);
  });
});
