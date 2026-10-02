import Phaser from 'phaser';
import { KNOCKBACK } from '../combat/balance';
import { type Axis, alignedAxis, dominantAxis, fadeSolid, fadeState } from '../combat/behaviors';
import {
  type DashAttack,
  type EnemyDef,
  type ExplodeAttack,
  type SummonAttack,
  type VolleyAttack,
  crossesFury,
  findAttack,
  walkAnimKey,
} from '../combat/enemies';
import { type Bounds, type Velocity, ricochet } from '../combat/ricochet';
import { RangeTrigger, fanAngle } from '../combat/volley';
import { ROOM_H, ROOM_W, ROOM_X, ROOM_Y, TILE } from '../config';
import type { GameClock } from '../core/clock';

const SPAWN_MS = 550;
/** Eye positions on the 32 px shadow texture, from its center; scaled with the enemy. */
const EYE_OFFSETS = [
  { x: -5, y: 1 },
  { x: 5, y: 1 },
] as const;
/** How much bigger the outline silhouette is than the body: about 2 px on each side of a 32 px sprite. */
export const OUTLINE_SCALE = 1.14;

/** After the transition, a short breather before the first furious dash. */
const FURY_FIRST_DASH_MS = 800;
/** The glow texture is 8 px; at this share of the enemy's scale it just covers an eye. */
const EYE_GLOW_SCALE = 0.9;
/** A dash never follows a volley straight away, so the orbs stay the thing to dodge. */
const VOLLEY_DASH_GAP_MS = 600;

const BODY_RADIUS_SHARE = 0.375;
/** Hidden, a fading enemy is only a faint shimmer. */
const HIDDEN_ALPHA = 0.12;
/** Flicker period while it is about to fade out or back in. */
const FADE_FLICKER_MS = 70;
/** An axis lunge ends at the first wall, but not on the one it may already be pressed against when it sets off. */
const LUNGE_WALL_GRACE_MS = 60;

/** Fires one enemy projectile; GameScene hands it out from its orb pool. */
export type OrbShooter = (x: number, y: number, angle: number, speed: number, damage: number) => void;

/**
 * Any enemy from the registry. Rises out of the floor (harmless while spawning), then chases.
 * Attacks listed in its def (the boss dash) interrupt the chase.
 */
export class Enemy extends Phaser.Physics.Arcade.Sprite {
  hp: number;
  /** Times it has got back up from a bone pile. */
  revivals = 0;
  readonly def: EnemyDef;
  /** Set by GameScene from the player's items: scales walking and dashing, not the fury's fixed path. */
  speedScale = 1;
  /** Clock time from which a hit may start an arc chain again. */
  chainReadyAt = 0;
  /** Damage it takes if the current push slams it into a wall. */
  private pendingSlam = 0;
  private clock: GameClock;
  private activeAt: number;
  private dash?: DashAttack;
  private nextDashAt = Infinity;
  /** Pending dash launch: the telegraph ends here, then the enemy lunges at (`dashTargetX`, `dashTargetY`). */
  private dashLaunchAt = Infinity;
  private dashTargetX = 0;
  private dashTargetY = 0;
  private dashingUntil = 0;
  /** Set for an axis lunge, which runs along it instead of at the target. */
  private lungeAxis?: Axis;
  private lungeStartedAt = 0;
  private knockedUntil = 0;
  private wobbleSeed: number;
  /** False while faded out: it neither hurts nor takes hits. */
  private solid = true;

  /** Set by GameScene; without it the enemy never blows up. */
  explode?: (enemy: Enemy, attack: ExplodeAttack) => void;
  private explodeAttack?: ExplodeAttack;
  private fuseEndsAt = Infinity;
  /** Set by GameScene: where a blink lands. Without it the enemy never blinks. */
  blinkTo?: (enemy: Enemy) => { x: number; y: number };
  private nextBlinkAt = 0;
  /** Shots of the current burst still to fire, and when the next goes. */
  private shotsLeft = 0;
  private nextShotAt = Infinity;

  /** Set by GameScene; without it the enemy never fires. */
  shoot?: OrbShooter;
  /** Set by GameScene; without it the enemy never summons. */
  summon?: (summoner: Enemy, attack: SummonAttack) => void;
  private summonAttack?: SummonAttack;
  private nextSummonAt = Infinity;
  /** Pending summon: the swell ends here and the minions appear. */
  private summonAt = Infinity;
  private volley?: VolleyAttack;
  private rangeTrigger?: RangeTrigger;
  private nextVolleyAt = 0;
  /** Pending volley: the eye glow ends here and the orbs fly. */
  private volleyFireAt = Infinity;

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
  /** Same texture, filled with `def.outline` and a little bigger, just behind the body. */
  private outline?: Phaser.GameObjects.Image;

  /** `def` already scaled for the floor. `wobbleSeed` offsets the chase wobble so a pack doesn't move in lockstep; pass it from the seeded Rng. */
  constructor(scene: Phaser.Scene, clock: GameClock, x: number, y: number, def: EnemyDef, wobbleSeed = 0) {
    super(scene, x, y, def.texture);
    scene.add.existing(this);
    this.def = def;
    this.clock = clock;
    this.wobbleSeed = wobbleSeed;
    this.hp = def.hp;
    const spawnMs = def.spawnMs ?? SPAWN_MS;
    this.activeAt = clock.now + spawnMs;
    this.explodeAttack = findAttack(def, 'explode');
    this.dash = findAttack(def, 'dash');
    if (this.dash) this.nextDashAt = this.activeAt + this.dash.everyMs;
    this.volley = findAttack(def, 'volley');
    if (this.volley) this.rangeTrigger = new RangeTrigger(this.volley);
    this.summonAttack = findAttack(def, 'summon');
    if (this.summonAttack) this.nextSummonAt = this.activeAt + this.summonAttack.everyMs;
    this.setDepth(5).setScale(def.scale, 0.1).setAlpha(0);
    if (def.outline !== undefined) {
      this.outline = scene.add
        .image(x, y, def.texture)
        .setTintMode(Phaser.TintModes.FILL)
        .setTint(def.outline)
        .setDepth(this.depth - 0.1);
      this.syncOutline();
    }
    scene.tweens.add({ targets: this, scaleY: def.scale, alpha: 1, duration: spawnMs, ease: 'Back.Out' });
    const walk = walkAnimKey(def.texture);
    if (scene.anims.exists(walk)) this.play({ key: walk, startFrame: Math.floor(wobbleSeed) % 4 });
  }

  /** Call after joining the physics group. */
  initBody() {
    const body = this.body as Phaser.Physics.Arcade.Body;
    // Sized off the frame: a 32 px frame gets a 12 px circle, sitting a little low, at the feet.
    const size = this.frame.width;
    const radius = size * BODY_RADIUS_SHARE;
    body.setCircle(radius, size / 2 - radius, size / 2 - radius + size / 8);
    if (this.def.anchored) body.setImmovable(true);
  }

  get harmful(): boolean {
    return this.clock.now >= this.activeAt && this.solid;
  }

  /** Faded out, shots go through it. */
  get hittable(): boolean {
    return this.solid;
  }

  /** A furious dash hits harder than touching the body. */
  get contactDamage(): number {
    if (this.def.fury && this.clock.now < this.furyDashUntil) return this.def.fury.dash.damage;
    return this.def.contactDamage;
  }

  /** Updates pursuit using game-clock time, yielding movement to spawning, knockback and attack phases. */
  chase(target: Phaser.GameObjects.Components.Transform, time: number) {
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (time < this.activeAt) {
      body.setVelocity(0, 0);
      return;
    }
    this.updateFade(time);
    this.updateBurst(target, time);
    if (this.updateExplode(target, time)) return;

    if (this.furyState === 'transition') {
      body.setVelocity(0, 0);
      if (time >= this.furyReadyAt) this.beginFury(time);
      return;
    }
    if (time < this.knockedUntil) return;
    if (this.furyState === 'fury' && this.updateFuryDash(target, time)) return;
    if (this.furyState === 'calm' && this.updateVolley(target, time)) return;
    if (this.furyState === 'calm' && this.updateSummon(time)) return;
    if (this.furyState === 'calm' && this.updateDash(target, time)) return;
    this.updateBlink(target, time);
    this.walk(target, time);
  }

  private walk(target: Phaser.GameObjects.Components.Transform, time: number) {
    const body = this.body as Phaser.Physics.Arcade.Body;
    const speed = this.def.speed * this.speedScale;
    if (this.def.axisWalk) {
      const axis = dominantAxis(target.x - this.x, target.y - this.y);
      body.setVelocity(axis.x * speed, axis.y * speed);
      this.face(body.velocity.x);
      return;
    }
    const angle = Phaser.Math.Angle.Between(this.x, this.y, target.x, target.y);
    const wobble = Math.sin((time + this.wobbleSeed) / 180) * 0.6;
    body.setVelocity(Math.cos(angle + wobble) * speed, Math.sin(angle + wobble) * speed);
    this.face(body.velocity.x);
  }

  /** Turns toward where it's heading; standing still, it keeps its facing. */
  private face(vx: number) {
    if (vx === 0) return;
    this.setFlipX(this.def.facesLeft ? vx > 0 : vx < 0);
  }

  /** Fades in and out on its own cycle; hidden, it is a faint shimmer that neither hurts nor takes hits. */
  private updateFade(time: number) {
    const fade = this.def.fade;
    if (!fade) return;
    const state = fadeState(fade, time - this.activeAt + this.wobbleSeed);
    this.solid = fadeSolid(state);
    if (state === 'shown') {
      this.setAlpha(1);
      return;
    }
    if (state === 'hidden') {
      this.setAlpha(HIDDEN_ALPHA);
      return;
    }
    this.setAlpha(Math.floor(time / FADE_FLICKER_MS) % 2 === 0 ? 0.85 : 0.3);
  }

  /** Close in on it and it is somewhere else, with no warning. */
  private updateBlink(target: Phaser.GameObjects.Components.Transform, time: number) {
    const blink = this.def.blink;
    if (!blink || !this.blinkTo || time < this.nextBlinkAt) return;
    if (this.distanceTo(target) > blink.range) return;
    this.nextBlinkAt = time + blink.cooldownMs;
    const spot = this.blinkTo(this);
    (this.body as Phaser.Physics.Arcade.Body).reset(spot.x, spot.y);
    this.setAlpha(0);
    this.scene.tweens.add({ targets: this, alpha: 1, duration: 180 });
  }

  /** Returns true while the fuse burns: it stands still, then blows up. */
  private updateExplode(target: Phaser.GameObjects.Components.Transform, time: number): boolean {
    const attack = this.explodeAttack;
    if (!attack) return false;
    if (this.fuseEndsAt !== Infinity) {
      (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      if (time < this.fuseEndsAt) return true;
      this.fuseEndsAt = Infinity;
      this.explode?.(this, attack);
      return true;
    }
    if (this.distanceTo(target) > attack.triggerDistance) return false;
    this.fuseEndsAt = time + attack.fuseMs;
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    return true;
  }

  /** The rest of a burst goes out on schedule, each shot aimed anew, whatever the enemy is doing. */
  private updateBurst(target: Phaser.GameObjects.Components.Transform, time: number) {
    const volley = this.volley;
    if (!volley || this.shotsLeft <= 0 || time < this.nextShotAt) return;
    this.shotsLeft--;
    this.nextShotAt = this.shotsLeft > 0 ? time + (volley.shotGapMs ?? 0) : Infinity;
    this.shootFan(volley, target);
  }

  /** Returns true while the volley owns movement: standing still with glowing eyes, then firing. */
  private updateVolley(target: Phaser.GameObjects.Components.Transform, time: number): boolean {
    const volley = this.volley;
    if (!volley || !this.rangeTrigger) return false;
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (this.volleyFireAt !== Infinity) {
      body.setVelocity(0, 0);
      this.placeEyes();
      if (time < this.volleyFireAt) return true;
      this.fireVolley(volley, target);
      return true;
    }
    // A dash in progress (telegraph included) keeps movement; the wait still counts meanwhile.
    const ready = this.rangeTrigger.update(this.distanceTo(target), time);
    if (time < this.dashingUntil || !ready || time < this.nextVolleyAt) return false;
    if (volley.telegraphMs <= 0) {
      this.fireVolley(volley, target);
      return false;
    }
    this.startVolley(volley, time);
    return true;
  }

  /** Stops with glowing eyes; the orbs fly when the glow ends. */
  private startVolley(volley: VolleyAttack, time: number) {
    this.volleyFireAt = time + volley.telegraphMs;
    this.nextDashAt = Math.max(this.nextDashAt, this.volleyFireAt + VOLLEY_DASH_GAP_MS);
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.showEyes(true);
  }

  /**
   * A target that runs out of dash reach during the telegraph gets a volley instead,
   * without the usual wait, as long as the volley is off cooldown.
   */
  private switchesToVolley(dash: DashAttack, target: Phaser.GameObjects.Components.Transform, time: number): boolean {
    const volley = this.volley;
    if (!volley || dash.maxDistance === undefined) return false;
    if (this.dashLaunchAt === Infinity || time >= this.dashLaunchAt || time < this.nextVolleyAt) return false;
    if (this.distanceTo(target) <= dash.maxDistance) return false;

    this.dashLaunchAt = Infinity;
    this.dashingUntil = 0;
    // Undo the telegraph swell.
    this.scene.tweens.killTweensOf(this);
    this.setScale(this.def.scale);
    this.startVolley(volley, time);
    return true;
  }

  /** Returns true while the summon owns movement: standing still and swelling, then calling in help. */
  private updateSummon(time: number): boolean {
    const summon = this.summonAttack;
    if (!summon) return false;
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (this.summonAt !== Infinity) {
      body.setVelocity(0, 0);
      if (time < this.summonAt) return true;
      this.summonAt = Infinity;
      this.summon?.(this, summon);
      return true;
    }
    // Never on top of a dash or a volley already under way.
    if (time < this.nextSummonAt || time < this.dashingUntil || this.volleyFireAt !== Infinity) return false;

    this.nextSummonAt = time + summon.everyMs;
    this.summonAt = time + summon.telegraphMs;
    body.setVelocity(0, 0);
    this.scene.tweens.add({
      targets: this,
      scaleY: this.def.scale * 1.2,
      duration: summon.telegraphMs / 2,
      yoyo: true,
    });
    return true;
  }

  private distanceTo(target: Phaser.GameObjects.Components.Transform): number {
    return Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);
  }

  /** Aims at where the target is when the glow ends. */
  private fireVolley(volley: VolleyAttack, target: Phaser.GameObjects.Components.Transform) {
    this.volleyFireAt = Infinity;
    this.nextVolleyAt = this.clock.now + volley.cooldownMs;
    this.rangeTrigger?.reset();
    this.showEyes(false);
    this.shootFan(volley, target);
    this.shotsLeft = (volley.shots ?? 1) - 1;
    this.nextShotAt = this.shotsLeft > 0 ? this.clock.now + (volley.shotGapMs ?? 0) : Infinity;
  }

  private shootFan(volley: VolleyAttack, target: Phaser.GameObjects.Components.Transform) {
    const aim = Phaser.Math.Angle.Between(this.x, this.y, target.x, target.y);
    for (let i = 0; i < volley.count; i++) {
      this.shoot?.(this.x, this.y, fanAngle(aim, i, volley.count, volley.spreadDeg), volley.speed, volley.damage);
    }
  }

  /** Returns true while the dash owns movement. */
  private updateDash(target: Phaser.GameObjects.Components.Transform, time: number): boolean {
    const dash = this.dash;
    if (!dash) return false;
    if (this.switchesToVolley(dash, target, time)) return true;
    if (time >= this.dashLaunchAt) this.launchDash(dash, time);
    if (this.lungeHitWall(time)) this.dashingUntil = time;
    if (time < this.dashingUntil) return true;
    if (time < this.nextDashAt) return false;
    if (dash.maxDistance !== undefined && this.distanceTo(target) > dash.maxDistance) return false;
    if (dash.align !== undefined) {
      // Not lined up yet: keep walking, ready to go the moment it is.
      this.lungeAxis = alignedAxis(target.x - this.x, target.y - this.y, dash.align);
      if (!this.lungeAxis) return false;
    }

    this.nextDashAt = time + dash.everyMs;
    this.telegraphDash(dash, target, time);
    return true;
  }

  /** An axis lunge stops at the first wall it runs into. */
  private lungeHitWall(time: number): boolean {
    if (!this.lungeAxis || time >= this.dashingUntil || time < this.lungeStartedAt + LUNGE_WALL_GRACE_MS) return false;
    return !(this.body as Phaser.Physics.Arcade.Body).blocked.none;
  }

  private telegraphDash(dash: DashAttack, target: Phaser.GameObjects.Components.Transform, time: number) {
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.dashTargetX = target.x;
    this.dashTargetY = target.y;
    this.dashLaunchAt = time + dash.telegraphMs;
    this.dashingUntil = time + dash.telegraphMs + dash.durationMs;
    if (dash.telegraphMs <= 0) return;
    this.scene.tweens.add({
      targets: this,
      scaleX: this.def.scale * 1.15,
      duration: dash.telegraphMs / 2,
      yoyo: true,
    });
  }

  private launchDash(dash: DashAttack, time: number) {
    this.dashLaunchAt = Infinity;
    this.lungeStartedAt = time;
    const speed = dash.speed * this.speedScale;
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (this.lungeAxis) {
      body.setVelocity(this.lungeAxis.x * speed, this.lungeAxis.y * speed);
      this.face(body.velocity.x);
      return;
    }
    const angle = Phaser.Math.Angle.Between(this.x, this.y, this.dashTargetX, this.dashTargetY);
    body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
  }

  /**
   * Returns true when this hit killed it. Invulnerable during the fury transition.
   * `knockback` scales the push away from (`fromX`, `fromY`); 0 doesn't push. If the push
   * drives it into a wall, it takes `slamShare` of the damage again (see `slammed`).
   */
  hit(damage: number, fromX: number, fromY: number, knockback = 1, slamShare = 0): boolean {
    if (this.furyState === 'transition') return false;
    const before = this.hp;
    this.hp -= damage;
    if (this.hp > 0 && crossesFury(this.def, before, this.hp)) this.startFury();
    this.setTintMode(Phaser.TintModes.FILL).setTint(0xffffff);
    this.scene.time.delayedCall(70, () => this.active && this.restoreTint());
    if (knockback <= 0 || this.def.boss || this.def.miniBoss || this.def.anchored) return this.hp <= 0;
    this.knockFrom(fromX, fromY, knockback);
    this.pendingSlam = damage * slamShare;
    return this.hp <= 0;
  }

  /**
   * Damage owed for being pushed into a wall, once per push; 0 if none. Arcade marks a body
   * blocked when it runs into a static one, and walls and closed doors are the only static
   * bodies an enemy collides with.
   */
  slammed(): number {
    const owed = this.pendingSlam;
    if (owed <= 0 || this.clock.now >= this.knockedUntil) return 0;
    if ((this.body as Phaser.Physics.Arcade.Body).blocked.none) return 0;
    this.pendingSlam = 0;
    return owed;
  }

  /** Stronger pushes also last a little longer, so they carry the enemy farther. */
  private knockFrom(fromX: number, fromY: number, scale: number) {
    const angle = Phaser.Math.Angle.Between(fromX, fromY, this.x, this.y);
    const speed = KNOCKBACK.speed * scale;
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    this.knockedUntil = this.clock.now + KNOCKBACK.ms * Math.max(1, Math.sqrt(scale));
  }

  /** Straight into fury, whatever the HP: a twin whose partner fell. */
  enrage() {
    if (this.def.fury) this.startFury();
  }

  /** Pushes the next attacks back, so enemies spawned together don't strike in lockstep. */
  delayAttacks(ms: number) {
    this.nextDashAt += ms;
    this.nextVolleyAt += ms;
  }

  /** Debug: sets HP to a share of the max, entering fury if that crosses the threshold. */
  setHealthShare(share: number) {
    const before = this.hp;
    this.hp = Math.max(1, Math.round(this.def.hp * share));
    if (crossesFury(this.def, before, this.hp)) this.startFury();
  }

  /** Restores the phase's body color after a hit flash so fury keeps its additive tint. */
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
    // No ranged attack in fury: a volley still glowing is called off.
    this.volleyFireAt = Infinity;
    this.showEyes(false);
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.scene.cameras.main.shake(fury.transitionMs, 0.01);
    this.createFuryEffects();
    this.restoreTint();
  }

  /** Ends the invulnerable transition and starts the aura, allowing a breather before the first dash. */
  private beginFury(time: number) {
    this.furyState = 'fury';
    this.nextFuryDashAt = time + FURY_FIRST_DASH_MS;
    this.aura?.start();
  }

  /** Prepares reusable fury visuals and inset room bounds for reflecting the enemy's center. */
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

  /** Toggles the eye glow that warns of a furious dash or a volley; made on first use. */
  private showEyes(on: boolean) {
    if (on && this.eyes.length === 0) {
      this.eyes = EYE_OFFSETS.map(() =>
        this.scene.add
          .image(0, 0, 'particle')
          .setBlendMode(Phaser.BlendModes.ADD)
          .setScale(this.def.scale * EYE_GLOW_SCALE)
          .setDepth(6)
          .setVisible(false),
      );
    }
    for (const eye of this.eyes) eye.setVisible(on);
    if (on) this.placeEyes();
  }

  /** Keeps the warning sprites aligned with the scaled enemy while it chases during the flash. */
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

  /** Releases scene-owned fury effects with the enemy, including during scene teardown. */
  preUpdate(time: number, delta: number) {
    super.preUpdate(time, delta);
    this.syncOutline();
  }

  /** Follows the body every frame, spawn rise and flips included. */
  private syncOutline() {
    const outline = this.outline;
    if (!outline) return;
    if (outline.frame.name !== this.frame.name) outline.setFrame(this.frame.name);
    outline
      .setPosition(this.x, this.y)
      .setScale(this.scaleX * OUTLINE_SCALE, this.scaleY * OUTLINE_SCALE)
      .setFlipX(this.flipX)
      .setAlpha(this.alpha * 0.9);
  }

  destroy(fromScene?: boolean) {
    this.outline?.destroy();
    this.aura?.destroy();
    this.dust?.destroy();
    for (const eye of this.eyes) eye.destroy();
    super.destroy(fromScene);
  }
}
