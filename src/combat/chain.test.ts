import { describe, expect, it } from 'vitest';
import { chainDamage, chainPath, novaTargets } from './chain';

const at = (x: number, y = 0) => ({ x, y });

describe('chainPath', () => {
  it('jumps to the nearest each time', () => {
    const targets = [at(0), at(80), at(50), at(130)];
    expect(chainPath(targets, 0, 3, 90)).toEqual([2, 1, 3]);
  });

  it('stops at the jump limit', () => {
    const targets = [at(0), at(50), at(100), at(150)];
    expect(chainPath(targets, 0, 2, 90)).toEqual([1, 2]);
  });

  it('stops when nothing is in reach', () => {
    expect(chainPath([at(0), at(200)], 0, 2, 90)).toEqual([]);
  });

  it('never visits a target twice', () => {
    const targets = [at(0), at(10)];
    expect(chainPath(targets, 0, 4, 90)).toEqual([1]);
  });
});

describe('novaTargets', () => {
  it('takes everyone in reach but the origin', () => {
    expect(novaTargets([at(0), at(50), at(200), at(-60)], 0, 90)).toEqual([1, 3]);
  });
});

describe('chainDamage', () => {
  it('shrinks by the ratio at each jump', () => {
    expect(chainDamage(10, 0.4, 0)).toBeCloseTo(4);
    expect(chainDamage(10, 0.4, 1)).toBeCloseTo(1.6);
  });
});
