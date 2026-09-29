import Phaser from 'phaser';

export interface ShadowConfig {
  hp: number;
  speed: number;
  scale: number;
  boss?: boolean;
}

export const SHADOW_BASIC: ShadowConfig = { hp: 9, speed: 85, scale: 1 };
export const SHADOW_BOSS: ShadowConfig = { hp: 90, speed: 70, scale: 2.4, boss: true };

const SPAWN_MS = 550;
const DASH_EVERY_MS = 2600;
const DASH_MS = 420;

/**
 * Basic enemy. Rises out of the floor (harmless while spawning), then chases.
 * The boss variant periodically telegraphs and dashes at the player.
 */
export class Shadow extends Phaser.Physics.Arcade.Sprite {
  hp: number;
  readonly maxHp: number;
  readonly config: ShadowConfig;
  private activeAt: number;
  private nextDashAt: number;
  private dashingUntil = 0;
  private knockedUntil = 0;
  private wobbleSeed = Math.random() * 1000;

  constructor(scene: Phaser.Scene, x: number, y: number, config: ShadowConfig) {
    super(scene, x, y, 'shadow');
    scene.add.existing(this);
    this.config = config;
    this.hp = this.maxHp = config.hp;
    this.activeAt = scene.time.now + SPAWN_MS;
    this.nextDashAt = scene.time.now + SPAWN_MS + DASH_EVERY_MS;
    this.setDepth(5).setScale(config.scale, 0.1).setAlpha(0);
    scene.tweens.add({ targets: this, scaleY: config.scale, alpha: 1, duration: SPAWN_MS, ease: 'Back.Out' });
  }

  /** Call after joining the physics group. */
  initBody() {
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(12, 4, 8);
  }

  get harmful(): boolean {
    return this.scene.time.now >= this.activeAt;
  }

  chase(target: Phaser.GameObjects.Components.Transform, time: number) {
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (!this.harmful) {
      body.setVelocity(0, 0);
      return;
    }

    if (time < this.knockedUntil) return;

    if (this.config.boss) {
      if (time < this.dashingUntil) return;
      if (time >= this.nextDashAt) {
        this.nextDashAt = time + DASH_EVERY_MS;
        this.telegraphDash(target, time);
        return;
      }
    }

    const angle = Phaser.Math.Angle.Between(this.x, this.y, target.x, target.y);
    const wobble = Math.sin((time + this.wobbleSeed) / 180) * 0.6;
    const speed = this.config.speed;
    body.setVelocity(Math.cos(angle + wobble) * speed, Math.sin(angle + wobble) * speed);
    this.setFlipX(body.velocity.x < 0);
  }

  private telegraphDash(target: Phaser.GameObjects.Components.Transform, time: number) {
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
    this.dashingUntil = time + 380 + DASH_MS;
    this.scene.tweens.add({ targets: this, scaleX: this.config.scale * 1.15, duration: 190, yoyo: true });
    this.scene.time.delayedCall(380, () => {
      if (!this.active) return;
      const angle = Phaser.Math.Angle.Between(this.x, this.y, target.x, target.y);
      body.setVelocity(Math.cos(angle) * 460, Math.sin(angle) * 460);
    });
  }

  /** Returns true when this hit killed it. */
  hit(damage: number, fromX: number, fromY: number): boolean {
    this.hp -= damage;
    this.setTintMode(Phaser.TintModes.FILL).setTint(0xffffff);
    this.scene.time.delayedCall(70, () => this.active && this.setTintMode(Phaser.TintModes.MULTIPLY).clearTint());

    if (!this.config.boss) {
      const angle = Phaser.Math.Angle.Between(fromX, fromY, this.x, this.y);
      (this.body as Phaser.Physics.Arcade.Body).setVelocity(Math.cos(angle) * 220, Math.sin(angle) * 220);
      this.knockedUntil = this.scene.time.now + 110;
    }
    return this.hp <= 0;
  }

  die() {
    const scene = this.scene;
    for (let i = 0; i < 8 * this.config.scale; i++) {
      const p = scene.add.image(this.x, this.y, 'particle').setTint(0x2a2144).setDepth(4);
      const a = Math.random() * Math.PI * 2;
      const d = 20 + Math.random() * 30 * this.config.scale;
      scene.tweens.add({ targets: p, x: this.x + Math.cos(a) * d, y: this.y + Math.sin(a) * d, alpha: 0, scale: 0.3, duration: 380, onComplete: () => p.destroy() });
    }
    this.destroy();
  }
}
