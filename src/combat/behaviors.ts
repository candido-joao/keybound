import type { Rng } from '../core/rng';

/** Shown, then hidden, over and over; each switch is announced by a flicker. */
export interface FadeCycle {
  shownMs: number;
  hiddenMs: number;
  /** The flicker at the end of each half, counted inside it. */
  warnMs: number;
}

export type FadeState = 'shown' | 'fading' | 'hidden' | 'appearing';

/** Where in the cycle an enemy is, `elapsed` ms after it first showed up. */
export function fadeState(fade: FadeCycle, elapsed: number): FadeState {
  const t = elapsed % (fade.shownMs + fade.hiddenMs);
  if (t < fade.shownMs - fade.warnMs) return 'shown';
  if (t < fade.shownMs) return 'fading';
  if (t < fade.shownMs + fade.hiddenMs - fade.warnMs) return 'hidden';
  return 'appearing';
}

/** Solid until it is fully gone: the flicker before hiding still takes hits, the one before showing doesn't. */
export function fadeSolid(state: FadeState): boolean {
  return state === 'shown' || state === 'fading';
}

export interface Axis {
  x: number;
  y: number;
}

/**
 * Unit step along the row or column the target shares with the enemy, `dx`/`dy` being the
 * target's offset; undefined when it's off both by more than `align` px.
 */
export function alignedAxis(dx: number, dy: number, align: number): Axis | undefined {
  if (Math.abs(dy) <= align && dx !== 0) return { x: Math.sign(dx), y: 0 };
  if (Math.abs(dx) <= align && dy !== 0) return { x: 0, y: Math.sign(dy) };
  return undefined;
}

/** Unit step along whichever axis covers more of the offset: a walk that only turns at right angles. */
export function dominantAxis(dx: number, dy: number): Axis {
  if (Math.abs(dx) >= Math.abs(dy)) return { x: Math.sign(dx), y: 0 };
  return { x: 0, y: Math.sign(dy) };
}

export function inBlast(dx: number, dy: number, radius: number): boolean {
  return dx * dx + dy * dy <= radius * radius;
}

/** Fan width that spreads `count` shots evenly all the way around, none doubled up at the back. */
export function ringSpreadDeg(count: number): number {
  return 360 - 360 / Math.max(1, count);
}

/** HP an enemy gets back up with: a share of its max, never compounding over revivals. */
export function reviveHp(maxHp: number, hpShare: number): number {
  return Math.max(1, Math.round(maxHp * hpShare));
}

export interface Spot {
  x: number;
  y: number;
}

/**
 * A random spot at least `minDistance` from (`x`, `y`); with none that far, the farthest one.
 * `spots` must not be empty.
 */
export function spotAwayFrom(rng: Rng, spots: readonly Spot[], x: number, y: number, minDistance: number): Spot {
  const min2 = minDistance * minDistance;
  const far = spots.filter((s) => (s.x - x) ** 2 + (s.y - y) ** 2 >= min2);
  if (far.length > 0) return far[rng.int(0, far.length - 1)];
  let best = spots[0];
  let bestD2 = -1;
  for (const s of spots) {
    const d2 = (s.x - x) ** 2 + (s.y - y) ** 2;
    if (d2 <= bestD2) continue;
    best = s;
    bestD2 = d2;
  }
  return best;
}
