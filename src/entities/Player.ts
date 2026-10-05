import Phaser from 'phaser';
import { BEAM, beamChargeMs, chargeStage, isContinuousBeam, releasePower } from '../combat/beam';
import { SWING, swingDirection } from '../combat/swing';
import { directionOffset, fanAngle, shotsInDirection } from '../combat/volley';
import { type PlayerStats, boltRangeOf } from '../combat/stats';
import type { GameClock } from '../core/clock';
import { pad } from '../input/touch';
import type { BoltSpec } from './Bolt';
import { KEY_ART_PIVOT } from './keyArt';
import { HERO_FRAME_H, HERO_FRAME_W, heroIdleFrame, heroRow, heroWalkAnim } from './heroSheet';

type Keys = Record<'W' | 'A' | 'S' | 'D' | 'UP' | 'DOWN' | 'LEFT' | 'RIGHT', Phaser.Input.Keyboard.Key>;

/**
 * Bolts start this far out plus 22 px, wherever the key is drawn: starting at the key's tip
 * would put an enemy pressed against the player behind the shot.
 */
const SHOT_ORBIT = 20;
/** Hand position from the sprite's center: off the body toward the aim, and down at hip height. */
const KEY_HAND_REACH = 6;
const KEY_HAND_Y = 7;
const KEY_HAND_SIDE = 10;
/** Always behind the body: grip and guard hide behind the hero and only the blade shows. */
const KEY_DEPTH = 9;
/** Loaded from public/weapons by BootScene; the baked 'key' stands in when it's missing. */
export const KEY_ART = 'key-art';
/** The key drawn tilted, as an equipment icon: big on the title screen, small in the HUD slot. */
export const KEY_TITLE_ART = 'key-title-art';
export const KEY_ICON_ART = 'key-icon-art';
/** Hero's head cropped from the character design, for the HUD portrait. */
export const HERO_PORTRAIT_ART = 'hero-portrait-art';
/** 8-direction walk sheet; the baked 'player' stands in when it's missing. */
export const HERO_SHEET = 'hero-sheet';
/** Pivot at the center of the baked key's ring guard; the art's own lives in keyArt. */
const KEY_FALLBACK_PIVOT = 0.15;
/** Share of the gap to the target velocity closed each frame. */
const GRIP = 0.22;
/** The key flashes this long on each charge stage. */
const CHARGE_FLASH_MS = 80;
/** Fully charged, the key trembles this many px either way. */
const CHARGE_TREMBLE_PX = 1;
/** The swing sweeps the key from one edge of its fan to the other. */
const SWING_HALF_ARC = SWING.arc / 2;

/** What firing produced this frame: bolts, a beam, or neither. */
export interface ShotOutput {
  bolts: BoltSpec[];
  beam: BeamTrigger | null;
}

/** A beam to fire now: released after a charge, or held on when charging takes no time. */
export interface BeamTrigger {
  /** Share of a full beam's damage. */
  power: number;
  continuous: boolean;
}

const NO_SHOT: ShotOutput = { bolts: [], beam: null };
const CONTINUOUS_BEAM: BeamTrigger = { power: 1, continuous: true };
// Shared: a held beam asks for this every frame.
const CONTINUOUS_SHOT: ShotOutput = { bolts: [], beam: CONTINUOUS_BEAM };

export class Player extends Phaser.Physics.Arcade.Sprite {
  stats: PlayerStats;
  health: number;
  private clock: GameClock;
  private keys: Keys;
  private keyWeapon: Phaser.GameObjects.Image;
  private aim = Math.PI / 2;
  private nextShotAt = 0;
  private invulnUntil = 0;
  /** Uses the hero sheet; the baked placeholder only flips left and right. */
  private animated: boolean;
  private moveX = 0;
  private moveY = 0;
  private facingRow = 0;
  /** Clock time the beam charge began; -1 while not charging. */
  private chargeStartAt = -1;
  private chargeStageShown = 0;
  private keyFlashUntil = 0;
  private keyFlashing = false;
  /** Clock time the current swing began; -1 when not swinging. */
  private swingStartAt = -1;
  /** Set by the Space keydown itself, so a press released within the same frame still counts. */
  private swingQueued = false;

  constructor(scene: Phaser.Scene, clock: GameClock, x: number, y: number, stats: PlayerStats) {
    const animated = scene.textures.exists(HERO_SHEET);
    super(scene, x, y, animated ? HERO_SHEET : 'player', 0);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.animated = animated;
    this.clock = clock;
    this.stats = stats;
    this.health = stats.maxHealth;
    this.setDepth(10).setScale(stats.hitboxScale);
    const body = this.body as Phaser.Physics.Arcade.Body;
    // Around the hips in either sprite, so the hair doesn't take hits.
    const [offsetX, offsetY] = animated ? [HERO_FRAME_W / 2 - 11, HERO_FRAME_H - 26] : [5, 12];
    body.setCircle(11, offsetX, offsetY);

    this.keyWeapon = addKeyImage(scene, x, y).setDepth(KEY_DEPTH);
    this.keys = scene.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as Keys;
    // Key capture keeps Space from scrolling the page.
    scene.input.keyboard!.addKey('SPACE');
    scene.input.keyboard!.on('keydown-SPACE', (event: KeyboardEvent) => {
      if (!event.repeat) this.swingQueued = true;
    });
  }

  setStats(stats: PlayerStats) {
    const gained = stats.maxHealth - this.stats.maxHealth;
    this.stats = stats;
    this.health = Math.min(stats.maxHealth, this.health + Math.max(0, gained));
    // Arcade bodies follow the sprite's scale, so this resizes the hitbox too.
    this.setScale(stats.hitboxScale);
  }

  get invulnerable(): boolean {
    return this.clock.now < this.invulnUntil;
  }

  /** Returns true if the hit landed (not during i-frames). */
  hurt(amount: number): boolean {
    if (this.invulnerable || this.health <= 0) return false;
    this.health = Math.max(0, this.health - amount);
    this.invulnUntil = this.clock.now + this.stats.invulnMs;
    this.scene.cameras.main.shake(120, 0.006);
    return true;
  }

  move() {
    const k = this.keys;
    // Keys give full steps; the stick also gives partial ones, which walk slower.
    const ix = clampAxis((k.D.isDown ? 1 : 0) - (k.A.isDown ? 1 : 0) + pad.moveX);
    const iy = clampAxis((k.S.isDown ? 1 : 0) - (k.W.isDown ? 1 : 0) + pad.moveY);
    const len = Math.max(1, Math.hypot(ix, iy));
    const body = this.body as Phaser.Physics.Arcade.Body;

    // Lerp toward target velocity: a little slide, like Isaac. Slide only loosens the stop.
    const tx = (ix / len) * this.stats.speed;
    const ty = (iy / len) * this.stats.speed;
    const grip = ix === 0 && iy === 0 ? GRIP / (1 + this.stats.slide) : GRIP;
    body.setVelocity(Phaser.Math.Linear(body.velocity.x, tx, grip), Phaser.Math.Linear(body.velocity.y, ty, grip));

    this.moveX = ix;
    this.moveY = iy;
    if (!this.animated && ix !== 0) this.setFlipX(ix < 0);
    this.setAlpha(this.invulnerable ? (Math.floor(this.clock.now / 80) % 2 ? 0.35 : 1) : 1);
  }

  /** Space or the touch swing button, once per press. Both are read so neither press lingers. */
  wantsSwing(): boolean {
    const key = this.swingQueued;
    this.swingQueued = false;
    const touch = pad.consume('swing');
    return key || touch;
  }

  get swinging(): boolean {
    return this.swingStartAt >= 0 && this.clock.now - this.swingStartAt < SWING.durationMs;
  }

  /**
   * Starts the swing's look, turns the aim to its direction and returns it: the aim while
   * shooting, else the way the player walks. GameScene resolves what it hits. Call after `move`,
   * which reads the walk.
   */
  startSwing(): number {
    const sx = this.shootX();
    const sy = this.shootY();
    this.swingStartAt = this.clock.now;
    // The key stays where it swung: the swing becomes the aim until the next shot sets one.
    this.aim = swingDirection(sx, sy, this.moveX, this.moveY, axisAim(sx, sy) ?? this.aim);
    return this.aim;
  }

  /** Arrow keys and the aim stick, each axis -1, 0 or 1. */
  private shootX(): number {
    return Math.sign((this.keys.RIGHT.isDown ? 1 : 0) - (this.keys.LEFT.isDown ? 1 : 0) + pad.aimX);
  }

  private shootY(): number {
    return Math.sign((this.keys.DOWN.isDown ? 1 : 0) - (this.keys.UP.isDown ? 1 : 0) + pad.aimY);
  }

  /** Arrow keys or the aim stick aim and fire. Returns what to spawn this frame. */
  tryShoot(time: number): ShotOutput {
    const sx = this.shootX();
    const sy = this.shootY();
    const firing = sx !== 0 || sy !== 0;
    this.aim = axisAim(sx, sy) ?? this.aim;

    const beam = this.stats.beam > 0 ? this.updateCharge(firing, time) : null;
    this.updateKeyWeapon();
    this.updateLook(firing);
    if (beam === CONTINUOUS_BEAM) return CONTINUOUS_SHOT;
    if (this.stats.beam > 0) return beam ? { bolts: [], beam } : NO_SHOT;
    if (!firing || time < this.nextShotAt) return NO_SHOT;
    this.nextShotAt = time + this.stats.fireDelay;

    this.scene.tweens.add({ targets: this.keyWeapon, scaleX: 0.8, duration: 50, yoyo: true });
    return { bolts: this.boltVolley(), beam: null };
  }

  /**
   * A fan toward the aim and one toward each echo, the fan's extra bolts shared out between
   * them. Each fan leaves from the side it flies to; echoes deal `echoDamage` of the shot.
   */
  private boltVolley(): BoltSpec[] {
    const s = this.stats;
    const body = this.body as Phaser.Physics.Arcade.Body;
    const tip = this.orbit + 22;
    const bolt = (angle: number, damage: number, from: number): BoltSpec => ({
      x: this.x + Math.cos(from) * tip,
      y: this.y + 4 + Math.sin(from) * tip,
      angle,
      speed: s.shotSpeed,
      damage,
      range: boltRangeOf(s),
      homing: s.homing,
      scale: s.boltScale,
      pierce: s.pierce,
      inheritVx: body.velocity.x * 0.3,
      inheritVy: body.velocity.y * 0.3,
    });
    const bolts: BoltSpec[] = [];
    for (let d = 0; d <= s.echoShots; d++) {
      const center = this.aim + directionOffset(d);
      const count = shotsInDirection(d, s.shotCount, s.echoShots);
      const damage = d === 0 ? s.damage : s.damage * s.echoDamage;
      const fan = Array.from({ length: count }, (_, i) => bolt(fanAngle(center, i, count, s.spread), damage, center));
      bolts.push(...fan);
    }
    return bolts;
  }

  get aimAngle(): number {
    return this.aim;
  }

  /** Where the hand holds the key. */
  get keyGripX(): number {
    return this.keyWeapon.x;
  }

  get keyGripY(): number {
    return this.keyWeapon.y;
  }

  /** The key's far end, past the grip by the part of the sprite beyond its pivot. */
  get keyTipX(): number {
    return this.keyWeapon.x + Math.cos(this.aim) * this.keyReach;
  }

  get keyTipY(): number {
    return this.keyWeapon.y + Math.sin(this.aim) * this.keyReach;
  }

  private get keyReach(): number {
    return this.keyWeapon.displayWidth * (1 - this.keyWeapon.originX);
  }

  /** How far the key's handle end sits behind the grip. */
  get keyHandleReach(): number {
    return this.keyWeapon.displayWidth * this.keyWeapon.originX;
  }

  /**
   * Holding charges the beam and letting go fires it, as strong as the charge allows. When the
   * charge is shorter than the beam itself, holding simply keeps the beam on.
   */
  private updateCharge(firing: boolean, time: number): BeamTrigger | null {
    if (isContinuousBeam(this.stats)) {
      this.endCharge();
      return firing ? CONTINUOUS_BEAM : null;
    }
    if (firing) {
      this.holdCharge(time);
      return null;
    }
    if (this.chargeStartAt < 0) return null;
    const power = releasePower(this.chargeShare(time));
    this.endCharge();
    return power > 0 ? { power, continuous: false } : null;
  }

  private holdCharge(time: number) {
    if (this.chargeStartAt < 0) this.chargeStartAt = time;
    this.showChargeStage(chargeStage(this.chargeShare(time)), time);
  }

  private chargeShare(time: number): number {
    return (time - this.chargeStartAt) / beamChargeMs(this.stats);
  }

  /** Flashes the key once per new stage; the last stage, full charge, trembles instead. */
  private showChargeStage(stage: number, time: number) {
    if (stage <= this.chargeStageShown) return;
    this.chargeStageShown = stage;
    if (stage >= BEAM.stages) return;
    this.keyFlashUntil = time + CHARGE_FLASH_MS;
  }

  private endCharge() {
    this.chargeStartAt = -1;
    this.chargeStageShown = 0;
  }

  private get fullyCharged(): boolean {
    return this.chargeStartAt >= 0 && this.chargeStageShown >= BEAM.stages;
  }

  /** Faces the aim while firing, else the way it walks; walks in place of the idle frame while moving. */
  private updateLook(firing: boolean) {
    if (!this.animated) return;
    const moving = this.moveX !== 0 || this.moveY !== 0;
    if (firing) this.facingRow = heroRow(this.aim);
    if (!firing && moving) this.facingRow = heroRow(Math.atan2(this.moveY, this.moveX));
    if (!moving) {
      this.stand();
      return;
    }
    this.play(heroWalkAnim(this.facingRow), true);
  }

  /** Idle frame for the current facing; also used while the game holds the player still. */
  stand() {
    if (!this.animated) return;
    this.anims.stop();
    const idle = heroIdleFrame(this.facingRow);
    if (Number(this.frame.name) !== idle) this.setFrame(idle);
  }

  /** The grip sits in the hand at hip height, just off the body toward the aim, so the key reads as held. */
  private updateKeyWeapon() {
    const scale = this.stats.hitboxScale;
    const reach = KEY_HAND_REACH * scale;
    // Aiming up or down, the key runs along the body's side instead of through it.
    const side = Math.abs(Math.sin(this.aim)) > 0.5 ? KEY_HAND_SIDE * scale : 0;
    // Driven by the game clock, not chance: it's only a tell, and a pause freezes it.
    const tremble = this.fullyCharged ? Math.sign(Math.sin(this.clock.now * 0.9)) * CHARGE_TREMBLE_PX : 0;
    this.keyWeapon.setPosition(
      this.x + Math.cos(this.aim) * reach + side + tremble,
      this.y + KEY_HAND_Y * scale + Math.sin(this.aim) * reach - tremble,
    );
    this.keyWeapon.setRotation(this.aim + this.swingOffset());
    this.keyWeapon.setFlipY(Math.cos(this.aim) < -0.01);
    this.keyWeapon.setAlpha(this.alpha);
    this.flashKey(this.clock.now < this.keyFlashUntil);
  }

  /** Angle off the aim during a swing: from one edge of the hitbox to the other. */
  private swingOffset(): number {
    if (!this.swinging) return 0;
    const progress = (this.clock.now - this.swingStartAt) / SWING.durationMs;
    // Fast out of the wind-up, settling at the far edge: reads as a slash, not a turn.
    const eased = 1 - (1 - progress) ** 3;
    return (eased * 2 - 1) * SWING_HALF_ARC;
  }

  /** Paints the key white while a charge stage flashes; only touches the tint when that changes. */
  private flashKey(on: boolean) {
    if (this.keyFlashing === on) return;
    this.keyFlashing = on;
    if (on) {
      this.keyWeapon.setTintMode(Phaser.TintModes.FILL).setTint(0xffffff);
      return;
    }
    this.keyWeapon.setTintMode(Phaser.TintModes.MULTIPLY).clearTint();
  }

  /** Bolts leave from outside the body, however big it gets. */
  private get orbit(): number {
    return SHOT_ORBIT * this.stats.hitboxScale;
  }

  teleport(x: number, y: number) {
    this.setPosition(x, y);
    (this.body as Phaser.Physics.Arcade.Body).reset(x, y);
    // A charge doesn't carry through a door, nor a swing pressed mid transition.
    this.endCharge();
    this.swingQueued = false;
    pad.consume('swing');
    this.updateKeyWeapon();
  }

  destroy(fromScene?: boolean) {
    this.keyWeapon?.destroy();
    super.destroy(fromScene);
  }
}

export function addKeyImage(scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.Image {
  if (scene.textures.exists(KEY_ART)) return scene.add.image(x, y, KEY_ART).setOrigin(KEY_ART_PIVOT, 0.5);
  return scene.add.image(x, y, 'key').setOrigin(KEY_FALLBACK_PIVOT, 0.5);
}

/** Caps combined keyboard and stick input at full strength while preserving partial movement. */
function clampAxis(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

/** Isaac shoots in 4 directions; on diagonals the current aim holds, so the last pressed axis wins. */
function axisAim(sx: number, sy: number): number | undefined {
  if (sx !== 0 && sy !== 0) return undefined;
  if (sx !== 0) return Math.atan2(0, sx);
  if (sy !== 0) return Math.atan2(sy, 0);
  return undefined;
}
