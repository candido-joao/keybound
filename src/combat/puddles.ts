/** A spot on the floor that hurts the player until `dryAt`. */
export interface Puddle {
  x: number;
  y: number;
  radius: number;
  damage: number;
  dryAt: number;
}

/** The fade before a puddle dries; it still hurts meanwhile. */
export const PUDDLE_FADE_MS = 700;

/** Whether the puddle can still hurt the player, including while it fades. */
export function wet(puddle: Puddle, now: number): boolean {
  return now < puddle.dryAt;
}

/** Whether (`x`, `y`) stands in a puddle that hasn't dried yet. */
export function inPuddle(puddle: Puddle, x: number, y: number, now: number): boolean {
  if (!wet(puddle, now)) return false;
  const dx = x - puddle.x;
  const dy = y - puddle.y;
  return dx * dx + dy * dy < puddle.radius * puddle.radius;
}

/** Opacity as it dries: full, then down to 0 over the last `PUDDLE_FADE_MS`. */
export function puddleAlpha(puddle: Puddle, now: number): number {
  const left = puddle.dryAt - now;
  if (left <= 0) return 0;
  return Math.min(1, left / PUDDLE_FADE_MS);
}

/** The slot a new puddle takes: a dry one, else the one closest to drying. */
export function puddleSlot(puddles: readonly Puddle[]): number {
  let slot = 0;
  for (let i = 1; i < puddles.length; i++) {
    if (puddles[i].dryAt < puddles[slot].dryAt) slot = i;
  }
  return slot;
}
