import { describe, expect, it } from 'vitest';
import { POOL_DEPTH } from '../combat/balance';
import {
  BLOOD_COLOSSUS,
  CRYSTAL_SENTINEL,
  CRYSTAL_SHARD,
  ENEMIES,
  SHADOW_COLOSSUS,
  type VolleyAttack,
} from '../combat/enemies';
import { ITEMS } from '../combat/items';
import { baseId } from '../combat/stats';
import { RUN_FLOORS } from '../floor/phases';
import { ROOM_EVENTS } from '../floor/roomEvents';
import { SWING } from '../combat/swing';
import { SHOP } from '../combat/shop';
import {
  attackLine,
  enemyLines,
  eventEntries,
  itemEntries,
  itemPools,
  phaseEntries,
  shopLines,
  swingEntry,
} from './catalog';

describe('phaseEntries', () => {
  it('covers every floor of the run once, in order', () => {
    const phases = phaseEntries();
    expect(phases[0].firstFloor).toBe(1);
    for (let i = 1; i < phases.length; i++) expect(phases[i].firstFloor).toBe(phases[i - 1].lastFloor + 1);
    expect(phases.at(-1)!.lastFloor).toBe(RUN_FLOORS);
  });

  it('lists every enemy somewhere, so a new one cannot be left out of the wiki', () => {
    const listed = new Set(phaseEntries().flatMap((p) => [...p.enemies, ...p.bosses].map((e) => e.def.id)));
    for (const def of ENEMIES) expect(listed, def.id).toContain(def.id);
  });

  it('starts every enemy from the first floor of its phase', () => {
    const entries = phaseEntries().flatMap((phase) => phase.enemies.map((e) => ({ phase, e })));
    for (const { phase, e } of entries) expect(e.fromFloor, e.def.id).toBe(phase.firstFloor);
  });

  it('puts split pieces right after their parent, telling where they come from', () => {
    const enemies = phaseEntries().find((p) => p.def.id === 'garden')!.enemies;
    const parent = enemies.findIndex((e) => e.def === CRYSTAL_SENTINEL);
    expect(enemies[parent + 1].def).toBe(CRYSTAL_SHARD);
    expect(enemies[parent + 1].lines[0].key).toBe('wiki.trait.split-from');
  });

  it('opens each item pool in the phase that holds its floor', () => {
    const opened = phaseEntries().map((p) => p.itemsFrom);
    expect(opened).toEqual(Object.values(POOL_DEPTH));
  });
});

describe('enemy lines', () => {
  it('describes the Colossus dash, volley and fury', () => {
    const keys = enemyLines(SHADOW_COLOSSUS).map((l) => l.key);
    expect(keys).toEqual(['wiki.attack.dash', 'wiki.attack.volley.fan', 'wiki.trait.boss', 'wiki.trait.fury']);
  });

  it('warns of the Crimson Colossus blood trail', () => {
    const trail = enemyLines(BLOOD_COLOSSUS).find((l) => l.key === 'wiki.trait.trail');
    expect(trail?.params).toEqual({ s: BLOOD_COLOSSUS.trail!.lifeMs / 1000, damage: BLOOD_COLOSSUS.trail!.damage });
  });

  it('tells a ring, a burst and a single orb apart', () => {
    const volley: VolleyAttack = {
      kind: 'volley',
      minDistance: 0,
      farMs: 0,
      telegraphMs: 0,
      cooldownMs: 1,
      count: 1,
      spreadDeg: 0,
      speed: 1,
      damage: 5,
    };
    expect(attackLine({ ...volley, count: 8, spreadDeg: 315 }).key).toBe('wiki.attack.volley.ring');
    expect(attackLine({ ...volley, shots: 3 }).key).toBe('wiki.attack.volley.burst');
    expect(attackLine(volley).key).toBe('wiki.attack.volley.single');
  });
});

describe('itemEntries', () => {
  it('groups every item under its base, with the odds of each version adding up to about 100%', () => {
    const entries = itemEntries();
    const listed = entries.flatMap((e) => [e.base, ...e.variants].map((v) => v.item.id));
    expect(listed.sort()).toEqual(ITEMS.map((i) => i.id).sort());
    for (const e of entries) {
      expect(e.variants.every((v) => baseId(v.item) === e.base.item.id)).toBe(true);
      const total = [e.base, ...e.variants].reduce((sum, v) => sum + v.odds, 0);
      expect(Math.abs(total - 100)).toBeLessThanOrEqual(1);
    }
  });

  it('splits items into pools by the floor they open on', () => {
    const pools = itemPools();
    expect(pools.map((p) => p.fromFloor)).toEqual(Object.values(POOL_DEPTH));
    expect(pools.reduce((sum, p) => sum + p.items.length, 0)).toBe(itemEntries().length);
  });
});

describe('eventEntries', () => {
  it('has one entry per room event', () => {
    expect(eventEntries().map((e) => e.id)).toEqual(ROOM_EVENTS.map((e) => e.id));
  });
});

describe('swingEntry', () => {
  it('reads the swing straight from its tuning', () => {
    const entry = swingEntry();
    expect(entry.reach).toBe(SWING.reach);
    expect(entry.arcDegrees).toBe(150);
    expect(entry.damagePct).toBe(50);
  });
});

describe('shopLines', () => {
  it('quotes the prices the game charges', () => {
    const prices = shopLines().flatMap((l) => (l.params?.price === undefined ? [] : [l.params.price]));
    expect(prices).toEqual([SHOP.prices.item, SHOP.prices.heal, SHOP.prices.drive]);
  });
});
