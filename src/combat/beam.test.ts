import { describe, expect, it } from 'vitest';
import { BASE_STATS } from './balance';
import {
  BEAM,
  beamChargeMs,
  beamLength,
  beamTickDamage,
  chargeStage,
  isContinuousBeam,
  pathTouches,
  releasePower,
  rotateToward,
  traceBeam,
} from './beam';

const stats = { ...BASE_STATS, beam: 1 };
const ROOM = { minX: 0, minY: 0, maxX: 500, maxY: 300 };

describe('beam charge', () => {
  it('takes one and a half times the fire delay', () => {
    expect(beamChargeMs(stats)).toBe(BASE_STATS.fireDelay * 1.5);
  });

  it('turns continuous once the charge gets short enough', () => {
    expect(isContinuousBeam(stats)).toBe(false);
    expect(isContinuousBeam({ ...stats, fireDelay: 333 })).toBe(true);
    expect(isContinuousBeam({ ...stats, fireDelay: 334 })).toBe(false);
  });

  it('reaches continuous with a faster-charging beam at a slower fire rate', () => {
    expect(isContinuousBeam({ ...stats, fireDelay: 600, beamCharge: 0.5 })).toBe(true);
  });

  it('counts stages up to full', () => {
    expect([0, 0.24, 0.25, 0.5, 0.99, 1, 3].map(chargeStage)).toEqual([0, 0, 1, 2, 3, 4, 4]);
  });
});

describe('beamLength', () => {
  const base = BASE_STATS.range * BEAM.rangeShare;

  it('reaches a share of the bolt range', () => {
    expect(beamLength(stats, false)).toBeCloseTo(base);
  });

  it('reaches further only when held and homing', () => {
    const homing = { ...stats, homing: 4 };
    expect(beamLength(homing, true)).toBeCloseTo(base * (1 + BEAM.homingContinuousReach));
    expect(beamLength(homing, false)).toBeCloseTo(base);
    expect(beamLength(stats, true)).toBeCloseTo(base);
  });

  it('drops the homing bonus once the beam is doubled', () => {
    expect(beamLength({ ...stats, homing: 4, beamCopies: 2 }, true)).toBeCloseTo(base);
  });
});

describe('releasePower', () => {
  it('fires nothing under a quarter of the charge', () => {
    expect(releasePower(0.2)).toBe(0);
  });

  it('pays early releases at three quarters efficiency', () => {
    expect(releasePower(0.5)).toBe(0.375);
  });

  it('pays a full charge in full', () => {
    expect(releasePower(1)).toBe(1);
    expect(releasePower(1.5)).toBe(1);
  });
});

describe('beamTickDamage', () => {
  it('spreads a full beam over its ticks', () => {
    const ticks = BEAM.durationMs / BEAM.tickMs;
    expect(beamTickDamage(stats, 1, false) * ticks).toBeCloseTo(BASE_STATS.damage * BEAM.shotsPerBeam);
  });

  it('runs continuous beams below the bolts they replace', () => {
    const fast = { ...stats, fireDelay: 150 };
    const perSecond = beamTickDamage(fast, 1, true) * (1000 / BEAM.tickMs);
    const boltsPerSecond = fast.damage * (1000 / fast.fireDelay);
    expect(perSecond / boltsPerSecond).toBeCloseTo(BEAM.continuousShare);
  });
});

describe('traceBeam', () => {
  const path = new Array<number>(200).fill(0);
  const end = (points: number) => ({ x: path[points * 2 - 2], y: path[points * 2 - 1] });
  const ray = (x: number, y: number, length: number, turnPerPx: number) => ({ x, y, angle: 0, length, turnPerPx });

  it('runs straight for its length', () => {
    const points = traceBeam(path, ray(100, 100, 120, 0), ROOM);
    expect(end(points).x).toBeCloseTo(220);
    expect(end(points).y).toBeCloseTo(100);
  });

  it('stops at the wall', () => {
    const points = traceBeam(path, ray(450, 100, 120, 0), ROOM);
    expect(end(points).x).toBeCloseTo(500);
  });

  it('bends toward a target when homing', () => {
    const points = traceBeam(path, ray(100, 100, 200, 0.02), ROOM, () => Math.PI / 2);
    expect(end(points).y).toBeGreaterThan(150);
  });

  it('stops when the buffer is full', () => {
    const small = new Array<number>(6).fill(0);
    expect(traceBeam(small, ray(0, 0, 1000, 0), { minX: -1e4, minY: -1e4, maxX: 1e4, maxY: 1e4 })).toBe(3);
  });
});

describe('pathTouches', () => {
  const path = [0, 0, 100, 0];

  it('hits circles within reach of a segment', () => {
    expect(pathTouches(path, 2, 50, 8, 10)).toBe(true);
    expect(pathTouches(path, 2, 50, 12, 10)).toBe(false);
  });

  it('measures past the ends to the nearest end', () => {
    expect(pathTouches(path, 2, 108, 0, 10)).toBe(true);
    expect(pathTouches(path, 2, 112, 0, 10)).toBe(false);
  });
});

describe('rotateToward', () => {
  it('turns the short way and no further than allowed', () => {
    expect(rotateToward(0, 0.1, 0.5)).toBeCloseTo(0.1);
    expect(rotateToward(0, 1, 0.5)).toBeCloseTo(0.5);
    expect(rotateToward(3, -3, 0.1)).toBeCloseTo(3.1);
  });
});
