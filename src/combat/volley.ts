import type { VolleyAttack } from './enemies';

/** Angles of `count` shots spread evenly over `spreadDeg`, centered on `aim` (radians). */
export function fanAngles(aim: number, count: number, spreadDeg: number): number[] {
  if (count <= 1) return [aim];
  const spread = (spreadDeg * Math.PI) / 180;
  const step = spread / (count - 1);
  return Array.from({ length: count }, (_, i) => aim - spread / 2 + step * i);
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
