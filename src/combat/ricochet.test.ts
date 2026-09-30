import { describe, expect, it } from 'vitest';
import { ricochet } from './ricochet';

const BOUNDS = { minX: 0, maxX: 100, minY: 0, maxY: 50 };

function bounce(x: number, y: number, vx: number, vy: number) {
  const velocity = { vx, vy };
  const hit = ricochet(x, y, velocity, BOUNDS);
  return { ...velocity, hit };
}

describe('ricochet', () => {
  it('flips horizontal speed on a side wall', () => {
    expect(bounce(100, 20, 30, 10)).toEqual({ vx: -30, vy: 10, hit: true });
    expect(bounce(0, 20, -30, 10)).toEqual({ vx: 30, vy: 10, hit: true });
  });

  it('flips vertical speed on the ceiling and the floor', () => {
    expect(bounce(50, 0, 30, -10)).toEqual({ vx: 30, vy: 10, hit: true });
    expect(bounce(50, 50, 30, 10)).toEqual({ vx: 30, vy: -10, hit: true });
  });

  it('flips both in a corner', () => {
    expect(bounce(100, 50, 30, 10)).toEqual({ vx: -30, vy: -10, hit: true });
  });

  it('keeps the angle: entry equals exit', () => {
    const { vx, vy } = bounce(100, 20, 30, 10);
    expect(Math.atan2(vy, -vx)).toBeCloseTo(Math.atan2(10, 30));
  });

  it('ignores a wall the body is moving away from', () => {
    expect(bounce(100, 20, -30, 10)).toEqual({ vx: -30, vy: 10, hit: false });
  });

  it('does nothing in the open', () => {
    expect(bounce(50, 20, 30, 10).hit).toBe(false);
  });
});
