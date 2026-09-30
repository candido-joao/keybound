/** Where a body's center may go: the room's inner edges, shrunk by the body's radius. */
export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface Velocity {
  vx: number;
  vy: number;
}

/**
 * Mirror reflection, like the DVD logo: side walls flip the horizontal speed, ceiling
 * and floor the vertical, a corner both. Only a wall the body is moving into counts,
 * so a body still touching the wall it just left doesn't bounce back into it.
 * Flips `velocity` in place, since it runs every frame of a dash. Returns true on a hit.
 */
export function ricochet(x: number, y: number, velocity: Velocity, bounds: Bounds): boolean {
  const flipX = (x <= bounds.minX && velocity.vx < 0) || (x >= bounds.maxX && velocity.vx > 0);
  const flipY = (y <= bounds.minY && velocity.vy < 0) || (y >= bounds.maxY && velocity.vy > 0);
  if (flipX) velocity.vx = -velocity.vx;
  if (flipY) velocity.vy = -velocity.vy;
  return flipX || flipY;
}
