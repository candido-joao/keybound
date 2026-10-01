import type { VolleyAttack } from './enemies';

/** Angles of `count` shots spread evenly over `spreadDeg`, centered on `aim` (radians). */
export function fanAngles(aim: number, count: number, spreadDeg: number): number[] {
  return Array.from({ length: Math.max(1, count) }, (_, i) => fanAngle(aim, i, count, spreadDeg));
}

/** Shot `index` of `fanAngles`, for loops that mustn't allocate. */
export function fanAngle(aim: number, index: number, count: number, spreadDeg: number): number {
  if (count <= 1) return aim;
  const spread = (spreadDeg * Math.PI) / 180;
  return aim - spread / 2 + (spread / (count - 1)) * index;
}

/** The player's extra shots away from the aim, in the order `echoShots` adds them: backward, then both sides. */
export const ECHO_OFFSETS = [Math.PI, Math.PI / 2, -Math.PI / 2] as const;

/** Offset from the aim of shot direction `d`: 0 is the aim itself, then each echo. */
export function directionOffset(d: number): number {
  return d === 0 ? 0 : ECHO_OFFSETS[d - 1];
}

/**
 * Shots fired toward direction `d` of `1 + echoShots`. Each direction has one; the fan's extra
 * shots (`shotCount - 1`) are dealt out one at a time, aim first, then backward, then the sides.
 * Echoes split the fan rather than copy it, so the total never grows.
 */
export function shotsInDirection(d: number, shotCount: number, echoShots: number): number {
  const directions = 1 + echoShots;
  const extras = Math.max(0, shotCount - 1);
  return 1 + Math.floor(extras / directions) + (d < extras % directions ? 1 : 0);
}

/** How long the target has stayed out of reach. Coming close starts the wait over. */
export class RangeTrigger {
  private farSince = -1;
  private readonly attack: Pick<VolleyAttack, 'minDistance' | 'farMs'>;

  constructor(attack: Pick<VolleyAttack, 'minDistance' | 'farMs'>) {
    this.attack = attack;
  }

  /** Call every frame; true once the target has been beyond `minDistance` for `farMs` straight. */
  update(distance: number, time: number): boolean {
    if (distance <= this.attack.minDistance) {
      this.farSince = -1;
      return false;
    }
    if (this.farSince < 0) this.farSince = time;
    return time - this.farSince >= this.attack.farMs;
  }

  /** After a shot, the target has to stay away the full time again. */
  reset() {
    this.farSince = -1;
  }
}
