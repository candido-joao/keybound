import { describe, expect, it } from 'vitest';
import { Rng } from '../core/rng';
import {
  alignedAxis,
  dominantAxis,
  fadeSolid,
  fadeState,
  inBlast,
  reviveHp,
  ringSpreadDeg,
  spotAwayFrom,
} from './behaviors';
import { fanAngles } from './volley';

describe('fadeState', () => {
  const fade = { shownMs: 1000, hiddenMs: 800, warnMs: 200 };

  it('walks through shown, fading, hidden and appearing', () => {
    expect(fadeState(fade, 0)).toBe('shown');
    expect(fadeState(fade, 850)).toBe('fading');
    expect(fadeState(fade, 1100)).toBe('hidden');
    expect(fadeState(fade, 1700)).toBe('appearing');
  });

  it('repeats every cycle', () => {
    expect(fadeState(fade, 1800)).toBe('shown');
    expect(fadeState(fade, 1800 + 1100)).toBe('hidden');
  });

  it('takes hits until fully gone', () => {
    expect(fadeSolid('shown')).toBe(true);
    expect(fadeSolid('fading')).toBe(true);
    expect(fadeSolid('hidden')).toBe(false);
    expect(fadeSolid('appearing')).toBe(false);
  });
});

describe('alignedAxis', () => {
  it('picks the row when the target is level with it', () => {
    expect(alignedAxis(-120, 10, 16)).toEqual({ x: -1, y: 0 });
  });

  it('picks the column when the target is straight above or below', () => {
    expect(alignedAxis(5, 90, 16)).toEqual({ x: 0, y: 1 });
  });

  it('is undefined off both axes', () => {
    expect(alignedAxis(60, 60, 16)).toBeUndefined();
  });

  it('is undefined on top of the target', () => {
    expect(alignedAxis(0, 0, 16)).toBeUndefined();
  });
});

describe('dominantAxis', () => {
  it('follows the larger offset', () => {
    expect(dominantAxis(30, -10)).toEqual({ x: 1, y: 0 });
    expect(dominantAxis(4, -10)).toEqual({ x: 0, y: -1 });
  });
});

describe('inBlast', () => {
  it('includes the edge and excludes beyond it', () => {
    expect(inBlast(30, 40, 50)).toBe(true);
    expect(inBlast(30, 41, 50)).toBe(false);
  });
});

describe('ringSpreadDeg', () => {
  it('spaces 8 shots 45 degrees apart all the way around', () => {
    const angles = fanAngles(0, 8, ringSpreadDeg(8));
    const step = angles[1] - angles[0];
    expect(step).toBeCloseTo(Math.PI / 4);
    expect(angles[7] - angles[0] + step).toBeCloseTo(Math.PI * 2);
  });
});

describe('reviveHp', () => {
  it('is a share of the max, at least 1', () => {
    expect(reviveHp(20, 0.5)).toBe(10);
    expect(reviveHp(1, 0.1)).toBe(1);
  });
});

describe('spotAwayFrom', () => {
  const spots = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 300, y: 0 },
  ];

  it('only picks spots far enough away', () => {
    for (let i = 0; i < 20; i++) {
      expect(spotAwayFrom(new Rng(`s${i}`), spots, 0, 0, 200)).toEqual({ x: 300, y: 0 });
    }
  });

  it('falls back to the farthest spot', () => {
    expect(spotAwayFrom(new Rng('x'), spots, 0, 0, 1000)).toEqual({ x: 300, y: 0 });
  });

  it('is the same for the same seed', () => {
    const pick = () => spotAwayFrom(new Rng('same'), spots, 0, 0, 50);
    expect(pick()).toEqual(pick());
  });
});
