import Phaser from 'phaser';
import { type DashAttack, type EnemyDef, findAttack } from '../combat/enemies';
import type { GameClock } from '../core/clock';

const SPAWN_MS = 550;

/**
 * Any enemy from the registry. Rises out of the floor (harmless while spawning), then chases.
 * Attacks listed in its def (the boss dash) interrupt the chase.
 */
export class Enemy extends Phaser.Physics.Arcade.Sprite {
  hp: number;
  readonly def: EnemyDef;
  private clock: GameClock;
  private activeAt: number;
  private dash?: DashAttack;
  private nextDashAt = Infinity;
  /** Pending dash launch: the telegraph ends here, then the enemy lunges at (`dashTargetX`, `dashTargetY`). */
  private dashLaunchAt = Infinity;
  private dashTargetX = 0;
  private dashTargetY = 0;
  private dashingUntil = 0;
  private knockedUntil = 0;
  private wobbleSeed: number;

  /** `def` already scaled for the floor. `wobbleSeed` offsets the chase wobble so a pack doesn't move in lockstep; pass it from the seeded Rng. */
  constructor(scene: Phaser.Scene, clock: GameClock, x: number, y: number, def: EnemyDef, wobbleSeed = 0) {
    super(scene, x, y, def.texture);
    scene.add.existing(this);
    this.def = def;
    this.clock = clock;
    this.wobbleSeed = wobbleSeed;
    this.hp = def.hp;
    this.activeAt = clock.now + SPAWN_MS;
    this.dash = findAttack(def, 'dash');
    if (this.dash) this.nextDashAt = this.activeAt + this.dash.everyMs;
    this.setDepth(5).setScale(def.scale, 0.1).setAlpha(0);
    scene.tweens.add({ targets: this, scaleY: def.scale, alpha: 1, duration: SPAWN_MS, ease: 'Back.Out' });
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
    if (this.updateDash(target, time)) return;

    const angle = Phaser.Math.Angle.Between(this.x, this.y, target.x, target.y);
    const wobble = Math.sin((time + this.wobbleSeed) / 180) * 0.6;
    const speed = this.def.speed;
    body.setVelocity(Math.cos(angle + wobble) * speed, Math.sin(angle + wobble) * speed);
    this.setFlipX(body.velocity.x < 0);
  }

  /** Returns true while the dash owns movement. */
  private updateDash(target: Phaser.GameObjects.Components.Transform, time: number): boolean {
    const dash = this.dash;
    if (!dash) return false;
    if (time >= this.dashLaunchAt) this.launchDash(dash);
    if (time < this.dashingUntil) return true;
    if (time < this.nextDashAt) return false;

    this.nextDashAt = time + dash.everyMs;
    this.telegraphDash(dash, target, time);
    return true;
  }

  private telegraphDash(dash: DashAttack, target: Phaser.GameObjects.Components.Transform, time: number) {
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.dashTargetX = target.x;
    this.dashTargetY = target.y;
    this.dashLaunchAt = time + dash.telegraphMs;
    this.dashingUntil = time + dash.telegraphMs + dash.durationMs;
    this.scene.tweens.add({
      targets: this,
      scaleX: this.def.scale * 1.15,
      duration: dash.telegraphMs / 2,
      yoyo: true,
    });
  }

  private launchDash(dash: DashAttack) {
    this.dashLaunchAt = Infinity;
    const angle = Phaser.Math.Angle.Between(this.x, this.y, this.dashTargetX, this.dashTargetY);
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(Math.cos(angle) * dash.speed, Math.sin(angle) * dash.speed);
  }

  /** Returns true when this hit killed it. */
  hit(damage: number, fromX: number, fromY: number): boolean {
    this.hp -= damage;
    this.setTintMode(Phaser.TintModes.FILL).setTint(0xffffff);
    this.scene.time.delayedCall(70, () => this.active && this.setTintMode(Phaser.TintModes.MULTIPLY).clearTint());

    if (!this.def.boss) {
      const angle = Phaser.Math.Angle.Between(fromX, fromY, this.x, this.y);
      (this.body as Phaser.Physics.Arcade.Body).setVelocity(Math.cos(angle) * 220, Math.sin(angle) * 220);
      this.knockedUntil = this.clock.now + 110;
    }
    return this.hp <= 0;
  }

  die() {
    const scene = this.scene;
    const scale = this.def.scale;
    for (let i = 0; i < 8 * scale; i++) {
      const p = scene.add.image(this.x, this.y, 'particle').setTint(this.def.deathColor).setDepth(4);
      const a = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const d = 20 + Phaser.Math.FloatBetween(0, 30 * scale);
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
