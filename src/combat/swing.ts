/**
 * The key swing: a sweep across the front of the player that spends a drive charge. Its
 * hitbox is a fan centered on the player, `reach` deep and `arc` wide around the aim.
 */
export const SWING = {
  reach: 64,
  /** Total width of the fan, in radians: 150°. */
  arc: (150 * Math.PI) / 180,
  durationMs: 200,
  /** Share of the bolt damage; the swing is for shoving and doors, not for killing. */
  damageShare: 0.5,
  knockback: 2.5,
} as const;

export const DRIVE = {
  /** Charges the player can hold at the start of a run; the shop raises it. */
  startMax: 1,
  maxCap: 3,
} as const;

/** One charge per cleared room, never past the max. */
export function chargeDrive(drive: number, max: number): number {
  return Math.min(max, drive + 1);
}

/**
 * Where a swing goes: the shooting direction while firing; otherwise the way the player walks,
 * so it can be aimed with movement alone; standing still, the last aim. Axes run -1 to 1.
 */
export function swingDirection(shootX: number, shootY: number, moveX: number, moveY: number, aim: number): number {
  if (shootX !== 0 || shootY !== 0) return aim;
  if (moveX !== 0 || moveY !== 0) return Math.atan2(moveY, moveX);
  return aim;
}

/** Smallest angle between two directions, 0 to π. */
function angleBetween(a: number, b: number): number {
  const diff = Math.abs(a - b) % (Math.PI * 2);
  return diff > Math.PI ? Math.PI * 2 - diff : diff;
}

/** Whether a body of `radius` at this offset from the player is touched by the sweep. */
export function inSwing(dx: number, dy: number, aim: number, radius = 0): boolean {
  const dist = Math.hypot(dx, dy);
  if (dist <= radius) return true;
  if (dist > SWING.reach + radius) return false;
  // A body's edge can poke into the fan even with its center just outside the angle.
  const slack = Math.asin(Math.min(1, radius / dist));
  return angleBetween(Math.atan2(dy, dx), aim) <= SWING.arc / 2 + slack;
}

/**
 * Whether the sweep touches an axis-aligned box centered at this offset, as a door tile is.
 * Checks points along the fan's far edge and halfway out against the box.
 */
export function swingTouchesBox(dx: number, dy: number, aim: number, halfW: number, halfH: number): boolean {
  for (let i = 0; i <= FAN_STEPS; i++) {
    const angle = aim - SWING.arc / 2 + (SWING.arc * i) / FAN_STEPS;
    for (const share of FAN_DEPTHS) {
      const x = Math.cos(angle) * SWING.reach * share;
      const y = Math.sin(angle) * SWING.reach * share;
      if (Math.abs(x - dx) <= halfW && Math.abs(y - dy) <= halfH) return true;
    }
  }
  return false;
}

const FAN_STEPS = 8;
const FAN_DEPTHS = [0.5, 1] as const;
