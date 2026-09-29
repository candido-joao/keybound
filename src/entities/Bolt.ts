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
  /** Shooter velocity added on top, so bolts carry movement like Isaac's tears. */
  inheritVx: number;
  inheritVy: number;
}

export class Bolt extends Phaser.Physics.Arcade.Image {
  damage = 0;
  homing = 0;
  private range = 0;
  private startX = 0;
  private startY = 0;
  private speed = 0;

  constructor(scene: Phaser.Scene, spec: BoltSpec) {
    super(scene, spec.x, spec.y, 'bolt');
    scene.add.existing(this);
  }

  /** Call after the bolt joins its physics group; group.add resets body velocity. */
  launch(spec: BoltSpec) {
    this.damage = spec.damage;
    this.homing = spec.homing;
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

  /** True once the bolt has flown past its range. */
  expired(): boolean {
    return Phaser.Math.Distance.Between(this.startX, this.startY, this.x, this.y) > this.range;
  }

  burst() {
    const puff = this.scene.add.image(this.x, this.y, 'bolt').setBlendMode(Phaser.BlendModes.ADD).setScale(this.scale);
    this.scene.tweens.add({ targets: puff, scale: this.scale * 2.2, alpha: 0, duration: 160, onComplete: () => puff.destroy() });
    this.destroy();
  }
}
