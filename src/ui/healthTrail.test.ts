import { describe, expect, it } from 'vitest';
import { HealthTrail } from './healthTrail';

describe('HealthTrail', () => {
  it('holds after a hit, then drains down to the new health', () => {
    const trail = new HealthTrail();
    trail.reset(100);
    expect(trail.update(60, 16)).toBe(false);
    expect(trail.value).toBe(100);
    trail.update(60, 500);
    expect(trail.update(60, 100)).toBe(true);
    expect(trail.value).toBeLessThan(100);
    for (let i = 0; i < 100; i++) trail.update(60, 100);
    expect(trail.value).toBe(60);
  });

  it('snaps up on a heal', () => {
    const trail = new HealthTrail();
    trail.reset(40);
    expect(trail.update(70, 16)).toBe(true);
    expect(trail.value).toBe(70);
  });

  it('asks for no redraw while nothing changes', () => {
    const trail = new HealthTrail();
    trail.reset(50);
    expect(trail.update(50, 16)).toBe(false);
  });
});
