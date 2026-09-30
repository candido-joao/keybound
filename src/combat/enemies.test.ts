import { describe, expect, it } from 'vitest';
import { SHADOW, SHADOW_COLOSSUS, crossesFury, enemyForDepth } from './enemies';

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

describe('SHADOW_COLOSSUS fury dash', () => {
  it('goes about 40% farther than the normal dash', () => {
    const dash = SHADOW_COLOSSUS.attacks[0];
    const normal = (dash.speed * dash.durationMs) / 1000;
    expect(SHADOW_COLOSSUS.fury!.dash.distance / normal).toBeCloseTo(1.4, 1);
  });
});
