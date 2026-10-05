import { describe, expect, it } from 'vitest';
import { Rng } from '../core/rng';
import {
  BONES,
  CRYPT_ENEMIES,
  ENEMIES,
  LANTERN,
  SHADOW,
  SHADOW_CASTER,
  SHADOW_COLOSSUS,
  crossesFury,
  enemyForDepth,
  findAttack,
  rollRoomEnemies,
  walkFrames,
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
  it('mixes in casters, shadows still the most common', () => {
    const kinds = rollRoomEnemies(new Rng('f1'), 200, CRYPT_ENEMIES);
    expect(kinds).toContain(SHADOW_CASTER);
    expect(kinds.filter((d) => d === SHADOW).length).toBeGreaterThan(kinds.filter((d) => d === SHADOW_CASTER).length);
  });

  it('is the same for the same seed', () => {
    const ids = () => rollRoomEnemies(new Rng('same'), 6, CRYPT_ENEMIES).map((d) => d.id);
    expect(ids()).toEqual(ids());
  });

  it('returns nothing from an empty table', () => {
    expect(rollRoomEnemies(new Rng('x'), 3, [])).toEqual([]);
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

describe('walkFrames', () => {
  it('alternates each step with the idle pose', () => {
    expect(walkFrames(3)).toEqual([1, 0, 2, 0]);
  });

  it('is empty for a single frame', () => {
    expect(walkFrames(1)).toEqual([]);
  });
});

describe('ENEMIES', () => {
  it('splits only into enemies that exist', () => {
    for (const def of ENEMIES) {
      if (def.split) expect(ENEMIES.map((e) => e.id)).toContain(def.split.id);
    }
  });

  it('has unique ids', () => {
    expect(new Set(ENEMIES.map((e) => e.id)).size).toBe(ENEMIES.length);
  });

  it('keeps plain enemies free of attack telegraphs', () => {
    const attacks = ENEMIES.filter((def) => !def.boss).flatMap((def) => def.attacks.map((attack) => ({ def, attack })));
    for (const { def, attack } of attacks) {
      if ('telegraphMs' in attack) expect(attack.telegraphMs, def.id).toBe(0);
    }
  });
});

describe('CRYPT_ENEMIES', () => {
  it('can roll every crypt enemy', () => {
    expect(new Set(rollRoomEnemies(new Rng('f1'), 300, CRYPT_ENEMIES))).toEqual(
      new Set([SHADOW, SHADOW_CASTER, BONES, LANTERN]),
    );
  });
});
