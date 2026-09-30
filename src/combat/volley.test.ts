import { describe, expect, it } from 'vitest';
import { RangeTrigger, fanAngles } from './volley';

describe('fanAngles', () => {
  it('centers the fan on the aim', () => {
    const angles = fanAngles(1, 3, 36);
    expect(angles).toHaveLength(3);
    expect(angles[1]).toBeCloseTo(1);
    expect(angles[0]).toBeCloseTo(1 - Math.PI / 10);
    expect(angles[2]).toBeCloseTo(1 + Math.PI / 10);
  });

  it('shoots straight with a single shot', () => {
    expect(fanAngles(0.5, 1, 36)).toEqual([0.5]);
  });
});

describe('RangeTrigger', () => {
  const attack = { minDistance: 260, farMs: 1500 };

  it('fires only after the target stays away the whole time', () => {
    const trigger = new RangeTrigger(attack);
    expect(trigger.update(300, 0)).toBe(false);
    expect(trigger.update(300, 1499)).toBe(false);
    expect(trigger.update(300, 1500)).toBe(true);
  });

  it('starts over when the target comes close', () => {
    const trigger = new RangeTrigger(attack);
    trigger.update(300, 0);
    trigger.update(200, 1000);
    expect(trigger.update(300, 1600)).toBe(false);
    expect(trigger.update(300, 3100)).toBe(true);
  });

  it('starts over after a reset', () => {
    const trigger = new RangeTrigger(attack);
    trigger.update(300, 0);
    trigger.update(300, 1500);
    trigger.reset();
    expect(trigger.update(300, 1600)).toBe(false);
  });
});
