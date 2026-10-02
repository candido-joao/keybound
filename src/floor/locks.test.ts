import { describe, expect, it } from 'vitest';
import { Rng } from '../core/rng';
import { startsLocked } from './locks';

describe('startsLocked', () => {
  it('locks some treasure rooms and shops, not all', () => {
    const rng = new Rng('locks');
    const rolls = Array.from({ length: 200 }, (_, i) => startsLocked(rng, { type: i % 2 ? 'treasure' : 'shop' }));
    expect(rolls).toContain(true);
    expect(rolls).toContain(false);
  });

  it('gives the same locks for the same seed', () => {
    const roll = () => Array.from({ length: 20 }, () => startsLocked(new Rng('same'), { type: 'treasure' }));
    expect(roll()).toEqual(roll());
  });

  it('never locks other rooms', () => {
    const rng = new Rng('locks');
    for (let i = 0; i < 50; i++) {
      expect(startsLocked(rng, { type: 'boss' })).toBe(false);
      expect(startsLocked(rng, { type: 'normal' })).toBe(false);
    }
  });
});
