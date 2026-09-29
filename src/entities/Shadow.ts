import Phaser from 'phaser';
import { BOSS_DASH_EVERY_MS, type ShadowConfig } from '../combat/balance';
import type { GameClock } from '../core/clock';

const SPAWN_MS = 550;
const DASH_MS = 420;
const DASH_TELEGRAPH_MS = 380;
const DASH_SPEED = 460;

/**
 * Basic enemy. Rises out of the floor (harmless while spawning), then chases.
 * The boss variant periodically telegraphs and dashes at the player.
 */
export class Shadow extends Phaser.Physics.Arcade.Sprite {
  hp: number;
  readonly config: ShadowConfig;
  private clock: GameClock;
  private activeAt: number;
  private nextDashAt: number;
  /** Pending dash launch: the telegraph ends here, then the boss lunges at `dashTarget`. */
  private dashLaunchAt = Infinity;
  private dashTarget?: Phaser.GameObjects.Components.Transform;
  private dashingUntil = 0;
  private knockedUntil = 0;
  private wobbleSeed: number;

  /** `wobbleSeed` offsets the chase wobble so a pack doesn't move in lockstep; pass it from the seeded Rng. */
  constructor(scene: Phaser.Scene, clock: GameClock, x: number, y: number, config: ShadowConfig, wobbleSeed = 0) {
    super(scene, x, y, 'shadow');
    scene.add.existing(this);
    this.config = config;
    this.clock = clock;
    this.wobbleSeed = wobbleSeed;
    this.hp = config.hp;
    this.activeAt = clock.now + SPAWN_MS;
    this.nextDashAt = clock.now + SPAWN_MS + BOSS_DASH_EVERY_MS;
    this.setDepth(5).setScale(config.scale, 0.1).setAlpha(0);
    scene.tweens.add({ targets: this, scaleY: config.scale, alpha: 1, duration: SPAWN_MS, ease: 'Back.Out' });
  }

  /** Call after joining the physics group. */
  initBody() {
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(12, 4, 8);
  }

  get harmful(): boolean {
    return this.clock.now >= this.activeAt;
  }

  chase(target: Phaser.GameObjects.Components.Transform, time: number) {
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (!this.harmful) {
      body.setVelocity(0, 0);
      return;
    }

    if (time < this.knockedUntil) return;

    if (this.config.boss) {
      if (time >= this.dashLaunchAt) this.launchDash();
      if (time < this.dashingUntil) return;
      if (time >= this.nextDashAt) {
        this.nextDashAt = time + BOSS_DASH_EVERY_MS;
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
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.dashTarget = target;
    this.dashLaunchAt = time + DASH_TELEGRAPH_MS;
    this.dashingUntil = time + DASH_TELEGRAPH_MS + DASH_MS;
    this.scene.tweens.add({
      targets: this,
      scaleX: this.config.scale * 1.15,
      duration: DASH_TELEGRAPH_MS / 2,
      yoyo: true,
    });
  }

  private launchDash() {
    this.dashLaunchAt = Infinity;
    const target = this.dashTarget!;
    const angle = Phaser.Math.Angle.Between(this.x, this.y, target.x, target.y);
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(Math.cos(angle) * DASH_SPEED, Math.sin(angle) * DASH_SPEED);
  }

  /** Returns true when this hit killed it. */
  hit(damage: number, fromX: number, fromY: number): boolean {
    this.hp -= damage;
    this.setTintMode(Phaser.TintModes.FILL).setTint(0xffffff);
    this.scene.time.delayedCall(70, () => this.active && this.setTintMode(Phaser.TintModes.MULTIPLY).clearTint());

    if (!this.config.boss) {
      const angle = Phaser.Math.Angle.Between(fromX, fromY, this.x, this.y);
      (this.body as Phaser.Physics.Arcade.Body).setVelocity(Math.cos(angle) * 220, Math.sin(angle) * 220);
      this.knockedUntil = this.clock.now + 110;
    }
    return this.hp <= 0;
  }

  die() {
    const scene = this.scene;
    for (let i = 0; i < 8 * this.config.scale; i++) {
      const p = scene.add.image(this.x, this.y, 'particle').setTint(0x2a2144).setDepth(4);
      const a = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const d = 20 + Phaser.Math.FloatBetween(0, 30 * this.config.scale);
      scene.tweens.add({
        targets: p,
        x: this.x + Math.cos(a) * d,
        y: this.y + Math.sin(a) * d,
        alpha: 0,
        scale: 0.3,
        duration: 380,
        onComplete: () => p.destroy(),
      });
    }
    this.destroy();
  }
}
