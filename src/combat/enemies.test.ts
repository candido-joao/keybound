import { describe, expect, it } from 'vitest';
import { Rng } from '../core/rng';
import {
  SHADOW,
  SHADOW_CASTER,
  SHADOW_COLOSSUS,
  crossesFury,
  enemyForDepth,
  findAttack,
  rollRoomEnemies,
} from './enemies';

describe('crossesFury', () => {
  const colossus = enemyForDepth(SHADOW_COLOSSUS, 1);
  const threshold = colossus.hp * colossus.fury!.hpShare;

  it('triggers on the hit that goes below the threshold', () => {
    expect(crossesFury(colossus, threshold + 5, threshold - 1)).toBe(true);
  });

  it('triggers once: hits already below do not', () => {
    expect(crossesFury(colossus, threshold - 1, threshold - 10)).toBe(false);
  });

  it('does not trigger above the threshold', () => {
    expect(crossesFury(colossus, colossus.hp, threshold + 1)).toBe(false);
  });

  it('never triggers for enemies without fury', () => {
    expect(crossesFury(SHADOW, SHADOW.hp, 0)).toBe(false);
  });
});

describe('rollRoomEnemies', () => {
  it('keeps floor 1 to plain shadows', () => {
    expect(new Set(rollRoomEnemies(new Rng('f1'), 1, 200))).toEqual(new Set([SHADOW]));
  });

  it('mixes in casters from floor 2', () => {
    const kinds = rollRoomEnemies(new Rng('f2'), 2, 200);
    expect(kinds).toContain(SHADOW_CASTER);
    expect(kinds.filter((d) => d === SHADOW).length).toBeGreaterThan(kinds.filter((d) => d === SHADOW_CASTER).length);
  });

  it('is the same for the same seed', () => {
    const ids = () => rollRoomEnemies(new Rng('same'), 3, 6).map((d) => d.id);
    expect(ids()).toEqual(ids());
  });

  it('returns nothing when no enemy is allowed yet', () => {
    expect(rollRoomEnemies(new Rng('x'), 1, 3, [{ def: SHADOW, weight: 1, minDepth: 5 }])).toEqual([]);
  });
});

describe('SHADOW_COLOSSUS ranges', () => {
  it('hands off from dash to volley at the same distance', () => {
    const dash = findAttack(SHADOW_COLOSSUS, 'dash')!;
    const volley = findAttack(SHADOW_COLOSSUS, 'volley')!;
    expect(dash.maxDistance).toBe(volley.minDistance);
  });
});

describe('SHADOW_COLOSSUS fury dash', () => {
  it('goes about 40% farther than the normal dash', () => {
    const dash = findAttack(SHADOW_COLOSSUS, 'dash')!;
    const normal = (dash.speed * dash.durationMs) / 1000;
    expect(SHADOW_COLOSSUS.fury!.dash.distance / normal).toBeCloseTo(1.4, 1);
  });
});
