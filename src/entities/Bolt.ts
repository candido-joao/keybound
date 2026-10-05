import Phaser from 'phaser';

export interface BoltSpec {
  x: number;
  y: number;
  angle: number;
  speed: number;
  damage: number;
  range: number;
  homing: number;
  scale: number;
  /** Enemies it can pass through before bursting. */
  pierce: number;
  /** Shooter velocity added on top, so bolts carry movement like Isaac's tears. */
  inheritVx: number;
  inheritVy: number;
}

/** How long the burst puff takes to grow and fade. */
const BURST_MS = 160;
const BURST_GROWTH = 2.2;

/**
 * Player projectile. Pooled by GameScene: `launch` takes one out; a burst turns it into its own
 * fading puff, and once that ends it waits, inactive, for the next shot.
 */
export class Bolt extends Phaser.Physics.Arcade.Image {
  damage = 0;
  homing = 0;
  private pierceLeft = 0;
  /** Enemies already struck, so overlapping one for several frames hits it once. */
  private struck: object[] = [];
  private range = 0;
  private startX = 0;
  private startY = 0;
  private speed = 0;
  private baseScale = 1;
  /** Time left on the burst puff; 0 while flying. */
  private burstLeft = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'bolt');
  }

  /** Flying, not yet burst: the only state that hits, homes or expires. */
  get flying(): boolean {
    return this.active && this.burstLeft <= 0;
  }

  launch(spec: BoltSpec) {
    this.enableBody(true, spec.x, spec.y, true, true);
    this.setAlpha(1);
    this.burstLeft = 0;
    this.struck.length = 0;
    this.baseScale = spec.scale;
    this.damage = spec.damage;
    this.homing = spec.homing;
    this.pierceLeft = spec.pierce;
    this.range = spec.range;
    this.speed = spec.speed;
    this.startX = spec.x;
    this.startY = spec.y;
    this.setScale(spec.scale);
    this.setBlendMode(Phaser.BlendModes.ADD);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(5, 2, 2);
    body.setVelocity(
      Math.cos(spec.angle) * spec.speed + spec.inheritVx,
      Math.sin(spec.angle) * spec.speed + spec.inheritVy,
    );
  }

  steerToward(target: { x: number; y: number } | undefined, dt: number) {
    if (!target || this.homing <= 0) return;
    const body = this.body as Phaser.Physics.Arcade.Body;
    const current = Math.atan2(body.velocity.y, body.velocity.x);
    const wanted = Phaser.Math.Angle.Between(this.x, this.y, target.x, target.y);
    const angle = Phaser.Math.Angle.RotateTo(current, wanted, this.homing * dt);
    body.setVelocity(Math.cos(angle) * this.speed, Math.sin(angle) * this.speed);
  }

  /**
   * Called on touching `target`. False if it was already struck. Otherwise the bolt counts the
   * hit and bursts, unless it can still pierce.
   */
  strike(target: object): boolean {
    if (this.hasStruck(target)) return false;
    this.struck.push(target);
    if (this.pierceLeft <= 0) {
      this.burst();
      return true;
    }
    this.pierceLeft--;
    return true;
  }

  hasStruck(target: object): boolean {
    return this.struck.includes(target);
  }

  /** True once the bolt has flown past its range. */
  expired(): boolean {
    return Phaser.Math.Distance.Between(this.startX, this.startY, this.x, this.y) > this.range;
  }

  /** Stops it where it is; from here it only grows and fades as the puff. */
  burst() {
    if (!this.flying) return;
    this.disableBody(false, false);
    this.burstLeft = BURST_MS;
  }

  /** Advances the puff; frees the bolt for the pool once it's gone. */
  fade(deltaMs: number) {
    if (this.burstLeft <= 0) return;
    this.burstLeft -= deltaMs;
    if (this.burstLeft <= 0) {
      this.free();
      return;
    }
    const share = 1 - this.burstLeft / BURST_MS;
    this.setScale(this.baseScale * (1 + (BURST_GROWTH - 1) * share)).setAlpha(1 - share);
  }

  free() {
    this.burstLeft = 0;
    this.disableBody(true, true);
  }
}
