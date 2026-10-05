import Phaser from 'phaser';
import type { FuryPhase } from '../combat/enemies';
import { type Bounds, type Velocity, ricochet } from '../combat/ricochet';
import { ROOM_H, ROOM_W, ROOM_X, ROOM_Y, TILE } from '../config';
import type { EnemyEyes } from './EnemyEyes';

/** After the transition, a short breather before the first furious dash. */
const FIRST_DASH_MS = 800;

export type FuryState = 'calm' | 'transition' | 'fury';

/**
 * A boss's fury: an invulnerable transition, then dashes that ricochet off the walls, each
 * warned by an eye flash, with a red aura while it lasts.
 */
export class EnemyFury {
  state: FuryState = 'calm';
  private readonly owner: Phaser.Physics.Arcade.Sprite;
  private readonly phase: FuryPhase;
  private readonly eyes: EnemyEyes;
  private readyAt = Infinity;
  private nextDashAt = Infinity;
  /** Pending furious dash: the eye flash ends here and the dash sets off. */
  private launchAt = Infinity;
  private dashUntil = 0;
  /** Locked when the flash starts; flipped in place on each bounce. */
  private readonly velocity: Velocity = { vx: 0, vy: 0 };
  /** Room edges for the owner's center; fixed, since its body never changes size. */
  private bounds?: Bounds;
  private aura?: Phaser.GameObjects.Particles.ParticleEmitter;
  private dust?: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(owner: Phaser.Physics.Arcade.Sprite, phase: FuryPhase, eyes: EnemyEyes) {
    this.owner = owner;
    this.phase = phase;
    this.eyes = eyes;
  }

  /** A furious dash hits harder than touching the body. */
  dashing(now: number): boolean {
    return now < this.dashUntil;
  }

  /** Starts the invulnerable transition; false if the fury already began. The owner calls off its own attacks. */
  start(now: number): boolean {
    if (this.state !== 'calm') return false;
    this.state = 'transition';
    this.readyAt = now + this.phase.transitionMs;
    this.owner.scene.cameras.main.shake(this.phase.transitionMs, 0.01);
    this.createEffects();
    return true;
  }

  /** Stands still through the transition, then lets the fury loose, with a breather before the first dash. */
  hold(time: number) {
    this.body.setVelocity(0, 0);
    if (time < this.readyAt) return;
    this.state = 'fury';
    this.nextDashAt = time + FIRST_DASH_MS;
    this.aura?.start();
  }

  /** Returns true while the dash owns movement. During the eye flash the owner keeps chasing. */
  update(target: Phaser.GameObjects.Components.Transform, time: number): boolean {
    const body = this.body;
    if (time < this.dashUntil) {
      this.bounce(body);
      body.setVelocity(this.velocity.vx, this.velocity.vy);
      return true;
    }
    if (time >= this.launchAt) {
      this.launch(time);
      return true;
    }
    if (this.launchAt !== Infinity) {
      this.eyes.place();
      return false;
    }
    if (time >= this.nextDashAt) this.warn(target, time);
    return false;
  }

  destroy() {
    this.aura?.destroy();
    this.dust?.destroy();
  }

  private get body(): Phaser.Physics.Arcade.Body {
    return this.owner.body as Phaser.Physics.Arcade.Body;
  }

  /** Locks the dash's heading at the target and flashes the eyes. */
  private warn(target: Phaser.GameObjects.Components.Transform, time: number) {
    const dash = this.phase.dash;
    this.nextDashAt = time + dash.everyMs;
    this.launchAt = time + dash.flashMs;
    const angle = Phaser.Math.Angle.Between(this.owner.x, this.owner.y, target.x, target.y);
    this.velocity.vx = Math.cos(angle) * dash.speed;
    this.velocity.vy = Math.sin(angle) * dash.speed;
    this.eyes.show(true);
  }

  private launch(time: number) {
    const dash = this.phase.dash;
    this.launchAt = Infinity;
    this.dashUntil = time + (dash.distance / dash.speed) * 1000;
    this.eyes.show(false);
    this.body.setVelocity(this.velocity.vx, this.velocity.vy);
  }

  /** The wall collider stops the body at the edge; the bounce reflects it from there. */
  private bounce(body: Phaser.Physics.Arcade.Body) {
    if (!ricochet(body.center.x, body.center.y, this.velocity, this.bounds!)) return;
    this.owner.scene.cameras.main.shake(120, 0.006);
    this.dust?.explode(10, body.center.x, body.center.y);
  }

  /** Reusable fury visuals, and room bounds inset for reflecting the owner's center. */
  private createEffects() {
    const { scene } = this.owner;
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
      .startFollow(this.owner);
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
    const r = this.body.halfWidth + 1;
    this.bounds = {
      minX: ROOM_X + TILE + r,
      maxX: ROOM_X + ROOM_W - TILE - r,
      minY: ROOM_Y + TILE + r,
      maxY: ROOM_Y + ROOM_H - TILE - r,
    };
  }
}
