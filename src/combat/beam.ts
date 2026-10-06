import type { PlayerStats } from './stats';

/**
 * Charged beam: hold fire to charge, release to fire one short beam that pierces every enemy
 * in its line. Charge time follows fire delay, so with enough fire rate the charge gets short
 * enough that holding just keeps the beam on.
 */
export const BEAM = {
  /** Charge time per ms of fire delay. */
  chargePerFireDelay: 1.5,
  /** At or under this charge time, holding keeps the beam on instead of charging it. */
  continuousChargeMs: 500,
  durationMs: 400,
  tickMs: 100,
  /**
   * A full release deals this many shots' worth of damage, spread over its ticks. The charge and
   * the beam take about 1.9 shots' worth of time; the rest pays for the short reach and for not
   * firing while charging.
   */
  shotsPerBeam: 3.5,
  /** A continuous beam's damage per second against the bolts it replaces. */
  continuousShare: 0.6,
  /** Reach as a share of the bolts' range: hits hard, so it has to be used up close. */
  rangeShare: 0.75,
  /** Extra reach for a held beam that homes: bending toward targets eats into how far it gets. */
  homingContinuousReach: 0.25,
  /** Charge stages; the key flashes on reaching each one, and the last is full. */
  stages: 4,
  /** Below this share of the charge, letting go fires nothing. */
  minCharge: 0.25,
  /** A beam released early deals this share of what its charge would be worth. */
  earlyEfficiency: 0.75,
  /** Width at bolt scale 1, px. */
  width: 14,
  /** Path step; the beam can only bend between steps. */
  stepPx: 12,
  /** A continuous beam lets each enemy start an arc chain this often. */
  chainCooldownMs: 500,
  /** Ticks push enemies this share of a bolt's knockback. */
  tickKnockback: 0.3,
  /** With `refract`, a beam splits at the first enemy into two this far off its line, each this much of it. */
  refractDeg: 25,
  refractShare: 0.4,
  refractWidth: 0.5,
} as const;

type BeamStats = Pick<PlayerStats, 'fireDelay' | 'damage' | 'beam' | 'beamCharge' | 'beamTime'>;

/** Beam length, px. A doubled beam already reaches far, so it doesn't add the homing bonus. */
export function beamLength(s: Pick<PlayerStats, 'range' | 'homing' | 'beamCopies'>, continuous: boolean): number {
  const bonus = continuous && s.homing > 0 && s.beamCopies < 2 ? BEAM.homingContinuousReach : 0;
  return s.range * BEAM.rangeShare * (1 + bonus);
}

export const beamChargeMs = (s: BeamStats) => s.fireDelay * BEAM.chargePerFireDelay * s.beamCharge;
export const beamDurationMs = (s: BeamStats) => BEAM.durationMs * s.beamTime;
export const isContinuousBeam = (s: BeamStats) => beamChargeMs(s) <= BEAM.continuousChargeMs;

/** Stages reached for a charge share, 0 to `BEAM.stages`. */
export function chargeStage(share: number): number {
  return Math.max(0, Math.min(BEAM.stages, Math.floor(share * BEAM.stages)));
}

/** Damage share of a beam let go at `share` of the charge; 0 fires nothing. */
export function releasePower(share: number): number {
  if (share < BEAM.minCharge) return 0;
  if (share >= 1) return 1;
  return share * BEAM.earlyEfficiency;
}

/** Damage each tick deals to every enemy the beam touches. */
export function beamTickDamage(s: BeamStats, power: number, continuous: boolean): number {
  if (continuous) return (s.damage / s.fireDelay) * BEAM.tickMs * BEAM.continuousShare;
  const ticksPerFullBeam = BEAM.durationMs / BEAM.tickMs;
  return (s.damage * BEAM.shotsPerBeam * s.beam * power) / ticksPerFullBeam;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Where a beam starts and how it goes: `turnPerPx` radians per px of bend toward its target. */
export interface BeamRay {
  x: number;
  y: number;
  angle: number;
  length: number;
  turnPerPx: number;
}

/**
 * Writes the beam's path into `out` as x, y pairs and returns how many points it has.
 * Each step turns up to `turnPerPx` radians per px toward `aimAt`'s angle, if any, and the
 * path is cut where it leaves `bounds`. Stops early when `out` is full.
 */
export function traceBeam(
  out: number[],
  ray: BeamRay,
  bounds: Bounds,
  aimAt?: (x: number, y: number) => number | undefined,
): number {
  const { length, turnPerPx } = ray;
  const capacity = Math.floor(out.length / 2);
  out[0] = ray.x;
  out[1] = ray.y;
  let points = 1;
  let heading = ray.angle;
  let travelled = 0;
  while (travelled < length && points < capacity) {
    const px = out[points * 2 - 2];
    const py = out[points * 2 - 1];
    const wanted = turnPerPx > 0 ? aimAt?.(px, py) : undefined;
    if (wanted !== undefined) heading = rotateToward(heading, wanted, turnPerPx * BEAM.stepPx);
    const step = Math.min(BEAM.stepPx, length - travelled);
    const nx = px + Math.cos(heading) * step;
    const ny = py + Math.sin(heading) * step;
    const t = exitShare(px, py, nx, ny, bounds);
    out[points * 2] = px + (nx - px) * t;
    out[points * 2 + 1] = py + (ny - py) * t;
    points++;
    travelled += step * t;
    if (t < 1) break;
  }
  return points;
}

/** `from` turned toward `to` by at most `maxTurn` radians, the short way round. */
export function rotateToward(from: number, to: number, maxTurn: number): number {
  const diff = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + Math.max(-maxTurn, Math.min(maxTurn, diff));
}

/** Share of the segment inside `bounds`, from its start; the start is taken to be inside. */
function exitShare(ax: number, ay: number, bx: number, by: number, b: Bounds): number {
  let t = 1;
  if (bx < b.minX) t = Math.min(t, (b.minX - ax) / (bx - ax));
  if (bx > b.maxX) t = Math.min(t, (b.maxX - ax) / (bx - ax));
  if (by < b.minY) t = Math.min(t, (b.minY - ay) / (by - ay));
  if (by > b.maxY) t = Math.min(t, (b.maxY - ay) / (by - ay));
  return Math.max(0, t);
}

/** True when a circle at (`cx`, `cy`) with `radius` touches the first `points` of `path`. */
export function pathTouches(path: readonly number[], points: number, cx: number, cy: number, radius: number): boolean {
  const r2 = radius * radius;
  for (let i = 1; i < points; i++) {
    const d2 = segmentDistanceSq(cx, cy, path[i * 2 - 2], path[i * 2 - 1], path[i * 2], path[i * 2 + 1]);
    if (d2 <= r2) return true;
  }
  return false;
}

export function segmentDistanceSq(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  const ex = ax + dx * t - px;
  const ey = ay + dy * t - py;
  return ex * ex + ey * ey;
}
