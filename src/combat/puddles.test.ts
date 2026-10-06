import { describe, expect, it } from 'vitest';
import { PUDDLE_FADE_MS, type Puddle, inPuddle, puddleAlpha, puddleSlot, wet } from './puddles';

const puddle = (dryAt: number): Puddle => ({ x: 100, y: 100, radius: 20, damage: 5, dryAt });

describe('inPuddle', () => {
  it('hurts inside the radius while wet', () => {
    expect(inPuddle(puddle(1000), 110, 110, 500)).toBe(true);
  });

  it('spares a step outside the radius', () => {
    expect(inPuddle(puddle(1000), 120, 100, 500)).toBe(false);
  });

  it('is harmless once dry', () => {
    expect(wet(puddle(1000), 1000)).toBe(false);
    expect(inPuddle(puddle(1000), 100, 100, 1000)).toBe(false);
  });
});

describe('puddleAlpha', () => {
  it('stays opaque until the fade starts', () => {
    expect(puddleAlpha(puddle(5000), 5000 - PUDDLE_FADE_MS - 1)).toBe(1);
  });

  it('fades over the last stretch', () => {
    expect(puddleAlpha(puddle(5000), 5000 - PUDDLE_FADE_MS / 2)).toBeCloseTo(0.5);
  });

  it('is gone once dry', () => {
    expect(puddleAlpha(puddle(5000), 6000)).toBe(0);
  });
});

describe('puddleSlot', () => {
  it('reuses the puddle closest to drying', () => {
    expect(puddleSlot([puddle(900), puddle(300), puddle(600)])).toBe(1);
  });

  it('takes the first of several dry slots', () => {
    expect(puddleSlot([puddle(0), puddle(0)])).toBe(0);
  });
});
