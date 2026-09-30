import Phaser from 'phaser';
import { type DashAttack, type EnemyDef, crossesFury, findAttack } from '../combat/enemies';
import { type Bounds, type Velocity, ricochet } from '../combat/ricochet';
import { ROOM_H, ROOM_W, ROOM_X, ROOM_Y, TILE } from '../config';
import type { GameClock } from '../core/clock';

const SPAWN_MS = 550;
/** Eye positions on the 32 px shadow texture, from its center; scaled with the enemy. */
const EYE_OFFSETS = [
  { x: -5, y: 1 },
  { x: 5, y: 1 },
] as const;
/** After the transition, a short breather before the first furious dash. */
const FURY_FIRST_DASH_MS = 800;

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

  private furyState: 'calm' | 'transition' | 'fury' = 'calm';
  private furyReadyAt = Infinity;
  private nextFuryDashAt = Infinity;
  /** Pending furious dash: the eye flash ends here and the dash sets off. */
  private furyLaunchAt = Infinity;
  private furyDashUntil = 0;
  /** Locked when the flash starts; flipped in place on each bounce. */
  private furyVelocity: Velocity = { vx: 0, vy: 0 };
  /** Room edges for this body's center; fixed, since the body never changes size. */
  private furyBounds?: Bounds;
  private aura?: Phaser.GameObjects.Particles.ParticleEmitter;
  private dust?: Phaser.GameObjects.Particles.ParticleEmitter;
  private eyes: Phaser.GameObjects.Image[] = [];

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

  /** A furious dash hits harder than touching the body. */
  get contactDamage(): number {
    if (this.def.fury && this.clock.now < this.furyDashUntil) return this.def.fury.dash.damage;
    return this.def.contactDamage;
  }

  chase(target: Phaser.GameObjects.Components.Transform, time: number) {
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (!this.harmful) {
      body.setVelocity(0, 0);
      return;
    }

    if (this.furyState === 'transition') {
      body.setVelocity(0, 0);
      if (time >= this.furyReadyAt) this.beginFury(time);
      return;
    }
    if (time < this.knockedUntil) return;
    if (this.furyState === 'fury' && this.updateFuryDash(target, time)) return;
    if (this.furyState === 'calm' && this.updateDash(target, time)) return;

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

  /** Returns true when this hit killed it. Invulnerable during the fury transition. */
  hit(damage: number, fromX: number, fromY: number): boolean {
    if (this.furyState === 'transition') return false;
    const before = this.hp;
    this.hp -= damage;
    if (this.hp > 0 && crossesFury(this.def, before, this.hp)) this.startFury();
    this.setTintMode(Phaser.TintModes.FILL).setTint(0xffffff);
    this.scene.time.delayedCall(70, () => this.active && this.restoreTint());

    if (!this.def.boss) {
      const angle = Phaser.Math.Angle.Between(fromX, fromY, this.x, this.y);
      (this.body as Phaser.Physics.Arcade.Body).setVelocity(Math.cos(angle) * 220, Math.sin(angle) * 220);
      this.knockedUntil = this.clock.now + 110;
    }
    return this.hp <= 0;
  }

  /** Debug: sets HP to a share of the max, entering fury if that crosses the threshold. */
  setHealthShare(share: number) {
    const before = this.hp;
    this.hp = Math.max(1, Math.round(this.def.hp * share));
    if (crossesFury(this.def, before, this.hp)) this.startFury();
  }

  private restoreTint() {
    if (this.furyState === 'calm') {
      this.setTintMode(Phaser.TintModes.MULTIPLY).clearTint();
      return;
    }
    this.setTintMode(Phaser.TintModes.ADD).setTint(this.def.fury!.tint);
  }

  // ---------------------------------------------------------------- fury

  /** Invulnerable transition: the normal dash is cancelled and the camera shakes. */
  private startFury() {
    if (this.furyState !== 'calm') return;
    const fury = this.def.fury!;
    this.furyState = 'transition';
    this.furyReadyAt = this.clock.now + fury.transitionMs;
    this.dashLaunchAt = Infinity;
    this.dashingUntil = 0;
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.scene.cameras.main.shake(fury.transitionMs, 0.01);
    this.createFuryEffects();
    this.restoreTint();
  }

  private beginFury(time: number) {
    this.furyState = 'fury';
    this.nextFuryDashAt = time + FURY_FIRST_DASH_MS;
    this.aura?.start();
  }

  private createFuryEffects() {
    const scene = this.scene;
    this.aura = scene.add
      .particles(0, 0, 'particle', {
        tint: 0xff4d4d,
        blendMode: Phaser.BlendModes.ADD,
        lifespan: 650,
        speed: { min: 15, max: 50 },
        scale: { start: 1.4, end: 0 },
        alpha: { start: 0.9, end: 0 },
        frequency: 50,
        quantity: 2,
        emitting: false,
      })
      .setDepth(4)
      .startFollow(this);
    this.dust = scene.add
      .particles(0, 0, 'particle', {
        tint: 0x8d84b8,
        lifespan: 380,
        speed: { min: 40, max: 120 },
        scale: { start: 1.1, end: 0 },
        alpha: { start: 0.7, end: 0 },
        emitting: false,
      })
      .setDepth(6);
    this.eyes = EYE_OFFSETS.map(() =>
      scene.add.image(0, 0, 'particle').setBlendMode(Phaser.BlendModes.ADD).setDepth(6).setVisible(false),
    );
    const r = (this.body as Phaser.Physics.Arcade.Body).halfWidth + 1;
    this.furyBounds = {
      minX: ROOM_X + TILE + r,
      maxX: ROOM_X + ROOM_W - TILE - r,
      minY: ROOM_Y + TILE + r,
      maxY: ROOM_Y + ROOM_H - TILE - r,
    };
  }

  /** Returns true while the dash owns movement. During the eye flash it keeps chasing. */
  private updateFuryDash(target: Phaser.GameObjects.Components.Transform, time: number): boolean {
    const dash = this.def.fury!.dash;
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (time < this.furyDashUntil) {
      this.bounce(body);
      body.setVelocity(this.furyVelocity.vx, this.furyVelocity.vy);
      return true;
    }
    if (time >= this.furyLaunchAt) {
      this.furyLaunchAt = Infinity;
      this.furyDashUntil = time + (dash.distance / dash.speed) * 1000;
      this.showEyes(false);
      body.setVelocity(this.furyVelocity.vx, this.furyVelocity.vy);
      return true;
    }
    if (this.furyLaunchAt !== Infinity) {
      this.placeEyes();
      return false;
    }
    if (time < this.nextFuryDashAt) return false;

    this.nextFuryDashAt = time + dash.everyMs;
    this.furyLaunchAt = time + dash.flashMs;
    const angle = Phaser.Math.Angle.Between(this.x, this.y, target.x, target.y);
    this.furyVelocity.vx = Math.cos(angle) * dash.speed;
    this.furyVelocity.vy = Math.sin(angle) * dash.speed;
    this.showEyes(true);
    return false;
  }

  /** The wall collider stops the body at the edge; the bounce reflects it from there. */
  private bounce(body: Phaser.Physics.Arcade.Body) {
    if (!ricochet(body.center.x, body.center.y, this.furyVelocity, this.furyBounds!)) return;
    this.scene.cameras.main.shake(120, 0.006);
    this.dust?.explode(10, body.center.x, body.center.y);
  }

  private showEyes(on: boolean) {
    for (const eye of this.eyes) eye.setVisible(on);
    if (on) this.placeEyes();
  }

  private placeEyes() {
    for (let i = 0; i < this.eyes.length; i++) {
      const offset = EYE_OFFSETS[i];
      this.eyes[i].setPosition(this.x + offset.x * this.def.scale, this.y + offset.y * this.def.scale);
    }
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

  destroy(fromScene?: boolean) {
    this.aura?.destroy();
    this.dust?.destroy();
    for (const eye of this.eyes) eye.destroy();
    super.destroy(fromScene);
  }
}
