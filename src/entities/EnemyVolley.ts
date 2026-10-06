import type Phaser from 'phaser';
import type { VolleyAttack } from '../combat/enemies';
import { RangeTrigger, fanAngle } from '../combat/volley';
import type { OrbShooter } from './Enemy';
import type { EnemyEyes } from './EnemyEyes';

type Target = Phaser.GameObjects.Components.Transform;

/**
 * An enemy's volleys. With a warning it stops for `telegraphMs`, then fires a fan of orbs, maybe
 * the first of a burst. With several in its def it fires them in turn, so a boss keeps changing pattern.
 */
export class EnemyVolley {
  private readonly owner: Phaser.Physics.Arcade.Sprite;
  private readonly volleys: readonly VolleyAttack[];
  private readonly triggers: RangeTrigger[];
  private readonly eyes: EnemyEyes;
  /** Which volley goes next. */
  private turn = 0;
  private nextAt = 0;
  /** Pending volley: the warning ends here and the orbs fly. */
  fireAt = Infinity;
  /** The volley whose burst is still going, the shots it has left, and when the next goes. */
  private bursting?: VolleyAttack;
  private shotsLeft = 0;
  private nextShotAt = Infinity;

  constructor(owner: Phaser.Physics.Arcade.Sprite, volleys: readonly VolleyAttack[], eyes: EnemyEyes) {
    this.owner = owner;
    this.volleys = volleys;
    this.triggers = volleys.map((volley) => new RangeTrigger(volley));
    this.eyes = eyes;
  }

  get pending(): boolean {
    return this.fireAt !== Infinity;
  }

  /** Off cooldown: a volley may start now. */
  ready(time: number): boolean {
    return time >= this.nextAt;
  }

  /**
   * Returns true while the volley owns movement: standing still through the warning, then firing.
   * While `busy` (a dash under way, its warning included) none starts, but the wait still counts.
   */
  update(target: Target, time: number, busy: boolean, shoot?: OrbShooter): boolean {
    if (this.pending) return this.hold(target, time, shoot);
    const ready = this.triggers[this.turn].update(this.distanceTo(target), time);
    if (busy || !ready || !this.ready(time)) return false;
    if (this.volleys[this.turn].telegraphMs <= 0) {
      this.fire(target, time, shoot);
      return false;
    }
    this.start(time);
    return true;
  }

  /** Stops, warning; the orbs fly when the warning ends. */
  start(time: number) {
    this.fireAt = time + this.volleys[this.turn].telegraphMs;
    this.stop();
    this.eyes.show(true);
  }

  private hold(target: Target, time: number, shoot?: OrbShooter): boolean {
    this.stop();
    this.eyes.place();
    if (time < this.fireAt) return true;
    this.fire(target, time, shoot);
    return true;
  }

  /** Fires the next volley now, aimed at where the target is; its burst follows on schedule. */
  fire(target: Target, time: number, shoot?: OrbShooter) {
    const volley = this.volleys[this.turn];
    this.fireAt = Infinity;
    this.nextAt = time + volley.cooldownMs;
    this.triggers[this.turn].reset();
    this.turn = (this.turn + 1) % this.volleys.length;
    this.eyes.show(false);
    this.shootFan(volley, target, shoot);
    this.bursting = volley;
    this.shotsLeft = (volley.shots ?? 1) - 1;
    this.nextShotAt = this.shotsLeft > 0 ? time + (volley.shotGapMs ?? 0) : Infinity;
  }

  /** The rest of a burst goes out on schedule, each shot aimed anew, whatever the enemy is doing. */
  burst(target: Target, time: number, shoot?: OrbShooter) {
    const volley = this.bursting;
    if (!volley || this.shotsLeft <= 0 || time < this.nextShotAt) return;
    this.shotsLeft--;
    this.nextShotAt = this.shotsLeft > 0 ? time + (volley.shotGapMs ?? 0) : Infinity;
    this.shootFan(volley, target, shoot);
  }

  delay(ms: number) {
    this.nextAt += ms;
  }

  /** Calls off a volley still in its warning. */
  cancel() {
    this.fireAt = Infinity;
    this.eyes.show(false);
  }

  private shootFan(volley: VolleyAttack, target: Target, shoot?: OrbShooter) {
    const { x, y } = this.owner;
    const aim = Math.atan2(target.y - y, target.x - x);
    for (let i = 0; i < volley.count; i++) {
      shoot?.(x, y, fanAngle(aim, i, volley.count, volley.spreadDeg), volley.speed, volley.damage);
    }
  }

  private stop() {
    (this.owner.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
  }

  private distanceTo(target: Target): number {
    return Math.hypot(target.x - this.owner.x, target.y - this.owner.y);
  }
}
