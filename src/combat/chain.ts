export interface Point {
  x: number;
  y: number;
}

/**
 * Indexes of `targets` an arc chain jumps through, in order, starting from `targets[from]`.
 * Each jump goes to the nearest target within `radius` of the last one hit, never twice to
 * the same one. Nearest, not random, so the same hit always chains the same way.
 */
export function chainPath(targets: readonly Point[], from: number, jumps: number, radius: number): number[] {
  const visited = new Set([from]);
  const path: number[] = [];
  let current = targets[from];
  for (let jump = 0; jump < jumps; jump++) {
    const next = nearestWithin(targets, current, radius, visited);
    if (next < 0) break;
    visited.add(next);
    path.push(next);
    current = targets[next];
  }
  return path;
}

/** Indexes of every target within `radius` of `targets[from]`, itself left out. */
export function novaTargets(targets: readonly Point[], from: number, radius: number): number[] {
  const origin = targets[from];
  const r2 = radius * radius;
  const hit: number[] = [];
  for (let i = 0; i < targets.length; i++) {
    if (i !== from && distanceSq(origin, targets[i]) <= r2) hit.push(i);
  }
  return hit;
}

/** Damage of jump `jump` (0 = the first), each worth `ratio` of the hit before it. */
export function chainDamage(hitDamage: number, ratio: number, jump: number): number {
  return hitDamage * ratio ** (jump + 1);
}

function nearestWithin(targets: readonly Point[], from: Point, radius: number, skip: ReadonlySet<number>): number {
  let best = -1;
  let bestD2 = radius * radius;
  for (let i = 0; i < targets.length; i++) {
    if (skip.has(i)) continue;
    const d2 = distanceSq(from, targets[i]);
    if (d2 > bestD2) continue;
    best = i;
    bestD2 = d2;
  }
  return best;
}

function distanceSq(a: Point, b: Point): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}
