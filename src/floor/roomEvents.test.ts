import { describe, expect, it } from 'vitest';
import { CUCKOO, SHADOW, SHADOW_CASTER, SHADOW_COLOSSUS, findAttack } from '../combat/enemies';
import { Rng } from '../core/rng';
import type { RoomType } from './FloorGenerator';
import { PHASES } from './phases';
import {
  EVENT_TUNING,
  altarCost,
  curseStrays,
  cursedDef,
  darkRain,
  darkWaveCount,
  eventRoomType,
  miniBossDef,
  miniBossPaysItem,
  payAltar,
  rollRoomEvents,
  timedChallengeMs,
  twinDef,
} from './roomEvents';

const rooms = (type: RoomType, n: number) => Array.from({ length: n }, () => ({ type }));

describe('rollRoomEvents', () => {
  it('hits about 15% of normal rooms and 5% of boss rooms', () => {
    const normal = rollRoomEvents(new Rng('normal'), rooms('normal', 4000));
    const boss = rollRoomEvents(new Rng('boss'), rooms('boss', 4000));
    expect(normal.size / 4000).toBeCloseTo(0.15, 1);
    expect(boss.size / 4000).toBeCloseTo(0.05, 1);
  });

  it('gives each room type only its own events', () => {
    for (const id of rollRoomEvents(new Rng('n'), rooms('normal', 500)).values())
      expect(eventRoomType(id)).toBe('normal');
    for (const id of rollRoomEvents(new Rng('b'), rooms('boss', 500)).values()) expect(id).toBe('twin');
  });

  it('never touches start or treasure rooms', () => {
    const special = [...rooms('start', 200), ...rooms('treasure', 200)];
    expect(rollRoomEvents(new Rng('s'), special).size).toBe(0);
  });

  it('is the same for the same seed', () => {
    const list = rooms('normal', 60);
    const roll = () => [...rollRoomEvents(new Rng('same'), list)].map(([room, id]) => `${list.indexOf(room)}:${id}`);
    expect(roll()).toEqual(roll());
  });
});

describe('event tuning', () => {
  it('rolls 2 or 3 dark waves', () => {
    const rng = new Rng('waves');
    const counts = new Set(Array.from({ length: 100 }, () => darkWaveCount(rng)));
    expect(counts).toEqual(new Set([2, 3]));
  });

  it('gives about 20 s to the challenge, capped deeper down', () => {
    expect(timedChallengeMs(2)).toBe(20000);
    expect(timedChallengeMs(50)).toBe(EVENT_TUNING.timed.maxMs);
  });

  it('curses enemies with 50% more HP, a bit bigger and outlined', () => {
    const cursed = cursedDef(SHADOW);
    expect(cursed.hp).toBe(Math.round(SHADOW.hp * 1.5));
    expect(cursed.scale).toBeGreaterThan(SHADOW.scale);
    expect(cursed.outline).toBeDefined();
    expect(SHADOW.outline).toBeUndefined();
    expect(cursed.cursed).toBe(true);
  });

  it('curses a few strays in plain rooms from floor 2', () => {
    const pack = Array(1000).fill(SHADOW);
    expect(curseStrays(new Rng('f1'), pack, 1).some((d) => d.cursed)).toBe(false);
    const strays = curseStrays(new Rng('f2'), pack, 2).filter((d) => d.cursed).length;
    expect(strays / 1000).toBeCloseTo(0.08, 1);
  });

  it('makes twins at 55% HP and 80% size, full damage', () => {
    const twin = twinDef(SHADOW_COLOSSUS);
    expect(twin.hp).toBe(Math.round(SHADOW_COLOSSUS.hp * 0.55));
    expect(twin.scale).toBeCloseTo(SHADOW_COLOSSUS.scale * 0.8);
    expect(twin.contactDamage).toBe(SHADOW_COLOSSUS.contactDamage);
    expect(twin.name).toBe('boss.shadow-colossus-twins');
  });

  it('grows a plain enemy into a mini boss that summons its own kind', () => {
    const elder = miniBossDef(SHADOW);
    expect(elder.hp).toBe(SHADOW.hp * 4);
    expect(elder.scale).toBeGreaterThan(SHADOW.scale);
    expect(elder.contactDamage).toBe(13);
    expect(elder.miniBoss).toBe(true);
    expect(elder.outline).toBe(cursedDef(SHADOW).outline);
    expect(elder.name).toBe('enemy.shadow-elder');
    expect(findAttack(elder, 'summon')?.minionId).toBe('shadow');
  });

  it('rarely pays a mini boss with an item instead of the rain', () => {
    const rng = new Rng('elder');
    let items = 0;
    for (let i = 0; i < 1000; i++) if (miniBossPaysItem(rng)) items++;
    expect(items / 1000).toBeCloseTo(0.15, 1);
  });

  it('keeps a caster mini boss shooting', () => {
    const elder = miniBossDef(SHADOW_CASTER);
    expect(findAttack(elder, 'volley')).toBeDefined();
    expect(findAttack(elder, 'summon')?.minionId).toBe('shadow-caster');
  });

  it('makes a cuckoo mini boss summon without exploding', () => {
    const elder = miniBossDef(CUCKOO);
    expect(findAttack(elder, 'explode')).toBeUndefined();
    expect(findAttack(elder, 'summon')).toEqual({
      kind: 'summon',
      ...EVENT_TUNING.miniboss.summon,
      minionId: CUCKOO.id,
    });
    expect(findAttack(CUCKOO, 'explode')).toBeDefined();
  });

  it('prices the altar at a quarter of the current max HP', () => {
    expect(altarCost(60)).toBe(15);
    expect(altarCost(100)).toBe(25);
    expect(altarCost(2)).toBe(1);
  });

  it('takes the price from current HP too, and can kill', () => {
    expect(payAltar({ health: 40, maxHealth: 60 })).toEqual({ health: 25, cost: 15 });
    expect(payAltar({ health: 10, maxHealth: 60 }).health).toBeLessThanOrEqual(0);
  });

  it('rains more after more dark waves', () => {
    expect(darkRain(3).length).toBeGreaterThan(darkRain(2).length);
    expect(darkRain(2).filter((k) => k === 'heal')).toHaveLength(2);
  });
});

describe('miniBossDef names', () => {
  it('gives every enemy that can fill a room an elder name of its own', () => {
    for (const phase of PHASES) {
      for (const { def } of phase.enemies) expect(miniBossDef(def).name).not.toBe(def.name);
    }
  });
});
