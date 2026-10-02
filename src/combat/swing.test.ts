import { describe, expect, it } from 'vitest';
import { DRIVE, SWING, chargeDrive, inSwing, swingDirection, swingTouchesBox } from './swing';

const RIGHT = 0;
const UP = -Math.PI / 2;

describe('inSwing', () => {
  it('hits straight ahead within reach', () => {
    expect(inSwing(50, 0, RIGHT)).toBe(true);
    expect(inSwing(SWING.reach + 5, 0, RIGHT)).toBe(false);
  });

  it('sweeps wide to both sides of the aim', () => {
    expect(inSwing(15, 40, RIGHT)).toBe(true);
    expect(inSwing(15, -40, RIGHT)).toBe(true);
  });

  it('misses behind the player', () => {
    expect(inSwing(-40, 0, RIGHT)).toBe(false);
    expect(inSwing(-30, 30, RIGHT)).toBe(false);
  });

  it('counts the body radius', () => {
    expect(inSwing(SWING.reach + 8, 0, RIGHT, 10)).toBe(true);
    expect(inSwing(-5, 0, RIGHT, 10)).toBe(true);
  });

  it('follows the aim, across the wrap at ±π', () => {
    expect(inSwing(0, -40, UP)).toBe(true);
    expect(inSwing(0, 40, UP)).toBe(false);
    expect(inSwing(-40, 1, Math.PI)).toBe(true);
    expect(inSwing(-40, -1, -Math.PI)).toBe(true);
  });
});

describe('swingTouchesBox', () => {
  it('reaches a door tile in front of the player', () => {
    expect(swingTouchesBox(0, -60, UP, 24, 24)).toBe(true);
  });

  it('does not reach a tile too far ahead', () => {
    expect(swingTouchesBox(0, -100, UP, 24, 24)).toBe(false);
  });

  it('does not hit a tile behind the player', () => {
    expect(swingTouchesBox(0, 60, UP, 24, 24)).toBe(false);
  });
});

describe('swingDirection', () => {
  it('follows the aim while shooting, even when walking elsewhere', () => {
    expect(swingDirection(0, -1, 1, 0, UP)).toBe(UP);
  });

  it('follows the walk when not shooting, diagonals included', () => {
    expect(swingDirection(0, 0, 1, 0, UP)).toBe(RIGHT);
    expect(swingDirection(0, 0, -0.5, 0.5, UP)).toBeCloseTo((3 * Math.PI) / 4);
  });

  it('keeps the last aim when standing still', () => {
    expect(swingDirection(0, 0, 0, 0, UP)).toBe(UP);
  });
});

describe('chargeDrive', () => {
  it('adds a charge up to the max', () => {
    expect(chargeDrive(0, DRIVE.startMax)).toBe(1);
    expect(chargeDrive(1, DRIVE.startMax)).toBe(1);
    expect(chargeDrive(1, 3)).toBe(2);
  });
});
