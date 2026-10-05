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
import { RangeTrigger, fanAngle } from '../combat/volley';
import type { GameClock } from '../core/clock';
import { EnemyEyes } from './EnemyEyes';
import { EnemyFury } from './EnemyFury';
import { EnemyOutline, deathBurst } from './EnemyOutline';

const SPAWN_MS = 550;

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
export interface Point {
  x: number;
  y: number;
}

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
  /** Set by GameScene: where to head for on the way to the target. Without it, straight at it. */
  steer?: (enemy: Enemy, target: Point) => Point;
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

  private readonly eyes: EnemyEyes;
  /** Only for an enemy whose def has a fury phase. */
  private readonly fury?: EnemyFury;
  /** Same texture, filled with `def.outline` and a little bigger, just behind the body. */
  private outline?: EnemyOutline;

  /** `def` already scaled for the floor. `wobbleSeed` offsets the chase wobble so a pack doesn't move in lockstep; pass it from the seeded Rng. */
  constructor(scene: Phaser.Scene, clock: GameClock, x: number, y: number, def: EnemyDef, wobbleSeed = 0) {
    super(scene, x, y, def.texture);
    scene.add.existing(this);
    this.def = def;
    this.clock = clock;
    this.wobbleSeed = wobbleSeed;
    this.hp = def.hp;
    this.eyes = new EnemyEyes(this, def.scale);
    if (def.fury) this.fury = new EnemyFury(this, def.fury, this.eyes);
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
    if (def.outline !== undefined) this.outline = new EnemyOutline(this, def.outline);
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
    if (this.def.fury && this.fury?.dashing(this.clock.now)) return this.def.fury.dash.damage;
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

    if (this.fury?.state === 'transition') {
      this.fury.hold(time);
      return;
    }
    if (time < this.knockedUntil) return;
    if (this.attack(target, time)) return;
    this.updateBlink(target, time);
    this.walk(target, time);
  }

  /** Returns true while an attack owns movement: the fury's dashes, or else the first calm attack under way. */
  private attack(target: Phaser.GameObjects.Components.Transform, time: number): boolean {
    if (this.fury?.state === 'fury') return this.fury.update(target, time);
    return this.updateVolley(target, time) || this.updateSummon(time) || this.updateDash(target, time);
  }

  private walk(target: Phaser.GameObjects.Components.Transform, time: number) {
    const body = this.body as Phaser.Physics.Arcade.Body;
    const speed = this.def.speed * this.speedScale;
    const goal = this.steer?.(this, target) ?? target;
    if (this.def.axisWalk) {
      const axis = dominantAxis(goal.x - this.x, goal.y - this.y);
      body.setVelocity(axis.x * speed, axis.y * speed);
      this.face(body.velocity.x);
      return;
    }
    const angle = Phaser.Math.Angle.Between(this.x, this.y, goal.x, goal.y);
    // Wobbling on the way around an obstacle would rub it at every corner.
    const wobble = goal === target ? Math.sin((time + this.wobbleSeed) / 180) * 0.6 : 0;
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
    if (this.fuseEndsAt !== Infinity) return this.burnFuse(attack, time);
    if (this.distanceTo(target) > attack.triggerDistance) return false;
    this.fuseEndsAt = time + attack.fuseMs;
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    return true;
  }

  private burnFuse(attack: ExplodeAttack, time: number): boolean {
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    if (time < this.fuseEndsAt) return true;
    this.fuseEndsAt = Infinity;
    this.explode?.(this, attack);
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
    if (this.volleyFireAt !== Infinity) return this.holdVolley(volley, target, time);
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

  /** Stands with glowing eyes until the orbs fly. */
  private holdVolley(volley: VolleyAttack, target: Phaser.GameObjects.Components.Transform, time: number): boolean {
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.eyes.place();
    if (time < this.volleyFireAt) return true;
    this.fireVolley(volley, target);
    return true;
  }

  /** Stops with glowing eyes; the orbs fly when the glow ends. */
  private startVolley(volley: VolleyAttack, time: number) {
    this.volleyFireAt = time + volley.telegraphMs;
    this.nextDashAt = Math.max(this.nextDashAt, this.volleyFireAt + VOLLEY_DASH_GAP_MS);
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.eyes.show(true);
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
    if (this.summonAt !== Infinity) return this.channelSummon(summon, time);
    // Never on top of a dash or a volley already under way.
    if (time < this.nextSummonAt || time < this.dashingUntil || this.volleyFireAt !== Infinity) return false;

    this.nextSummonAt = time + summon.everyMs;
    this.summonAt = time + summon.telegraphMs;
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.scene.tweens.add({
      targets: this,
      scaleY: this.def.scale * 1.2,
      duration: summon.telegraphMs / 2,
      yoyo: true,
    });
    return true;
  }

  private channelSummon(summon: SummonAttack, time: number): boolean {
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    if (time < this.summonAt) return true;
    this.summonAt = Infinity;
    this.summon?.(this, summon);
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
    this.eyes.show(false);
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
    if (!this.linedUp(dash, target)) return false;

    this.nextDashAt = time + dash.everyMs;
    this.telegraphDash(dash, target, time);
    return true;
  }

  /** Not lined up yet: keep walking, ready to go the moment it is. */
  private linedUp(dash: DashAttack, target: Phaser.GameObjects.Components.Transform): boolean {
    if (dash.align === undefined) return true;
    this.lungeAxis = alignedAxis(target.x - this.x, target.y - this.y, dash.align);
    return this.lungeAxis !== undefined;
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
    if (this.fury?.state === 'transition') return false;
    const before = this.hp;
    this.hp -= damage;
    if (this.hp > 0 && crossesFury(this.def, before, this.hp)) this.startFury();
    this.setTintMode(Phaser.TintModes.FILL).setTint(0xffffff);
    this.scene.time.delayedCall(70, () => this.active && this.restoreTint());
    if (knockback <= 0 || !this.pushable) return this.hp <= 0;
    this.knockFrom(fromX, fromY, knockback);
    this.pendingSlam = damage * slamShare;
    return this.hp <= 0;
  }

  /** Bosses, mini bosses and rooted enemies hold their ground. */
  private get pushable(): boolean {
    return !this.def.boss && !this.def.miniBoss && !this.def.anchored;
  }

  /**
   * Damage owed for being pushed into a wall, once per push; 0 if none. Arcade marks a body
   * blocked when it runs into a static one, and walls, closed doors, rocks and pits are the
   * only static bodies an enemy collides with.
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

  /** Into fury: the transition starts, and any dash or volley under way is called off. */
  private startFury() {
    if (!this.fury?.start(this.clock.now)) return;
    this.dashLaunchAt = Infinity;
    this.dashingUntil = 0;
    // No ranged attack in fury: a volley still glowing is called off.
    this.volleyFireAt = Infinity;
    this.eyes.show(false);
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.restoreTint();
  }

  /** Restores the phase's body color after a hit flash so fury keeps its additive tint. */
  private restoreTint() {
    if (!this.fury || this.fury.state === 'calm') {
      this.setTintMode(Phaser.TintModes.MULTIPLY).clearTint();
      return;
    }
    this.setTintMode(Phaser.TintModes.ADD).setTint(this.def.fury!.tint);
  }

  die() {
    deathBurst(this.scene, this.x, this.y, this.def.deathColor, this.def.scale);
    this.destroy();
  }

  /** Releases scene-owned fury effects with the enemy, including during scene teardown. */
  preUpdate(time: number, delta: number) {
    super.preUpdate(time, delta);
    this.outline?.sync();
  }

  destroy(fromScene?: boolean) {
    this.outline?.destroy();
    this.fury?.destroy();
    this.eyes.destroy();
    super.destroy(fromScene);
  }
}
