import { describe, expect, it } from 'vitest';
import { MAX_DEPTH, formatDuration, hasLaunchParams, newRun, parseLaunchParams, runFromParams } from './run';

const KNOWN = ['quickcast', 'swift-boots'];

describe('parseLaunchParams', () => {
  it('reads seed, depth and items', () => {
    expect(parseLaunchParams('?seed=abc&depth=3&items=quickcast,quickcast', KNOWN)).toEqual({
      seed: 'ABC',
      depth: 3,
      itemIds: ['quickcast', 'quickcast'],
    });
  });

  it('drops what it cannot use instead of throwing', () => {
    expect(parseLaunchParams('?seed=!!!&depth=-2&items=nope', KNOWN)).toEqual({});
    expect(parseLaunchParams('?depth=1.5', KNOWN)).toEqual({});
  });

  it('caps the depth', () => {
    expect(parseLaunchParams('?depth=5000', KNOWN).depth).toBe(MAX_DEPTH);
  });

  it('keeps known items and skips unknown ones', () => {
    expect(parseLaunchParams('?items=nope,swift-boots', KNOWN).itemIds).toEqual(['swift-boots']);
  });

  it('tells whether anything was given', () => {
    expect(hasLaunchParams(parseLaunchParams('', KNOWN))).toBe(false);
    expect(hasLaunchParams(parseLaunchParams('?depth=2', KNOWN))).toBe(true);
  });
});

describe('newRun', () => {
  it('starts on floor 1 with nothing, and counts as seeded only when a seed is given', () => {
    const rolled = newRun();
    expect(rolled).toMatchObject({ depth: 1, itemIds: [], currency: 0, seeded: false });
    expect(newRun('ABC')).toMatchObject({ seed: 'ABC', seeded: true });
  });
});

describe('runFromParams', () => {
  it('is always seeded and starts where the params say', () => {
    expect(runFromParams({ depth: 4, itemIds: ['quickcast'] })).toMatchObject({
      seeded: true,
      depth: 4,
      itemIds: ['quickcast'],
    });
  });
});

describe('formatDuration', () => {
  it('shows minutes and seconds, and hours past an hour', () => {
    expect(formatDuration(83000)).toBe('1:23');
    expect(formatDuration(3723000)).toBe('1:02:03');
    expect(formatDuration(-5)).toBe('0:00');
  });
});
