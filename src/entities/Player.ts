import Phaser from 'phaser';
import { PLAYER_INVULN_MS } from '../combat/balance';
import type { PlayerStats } from '../combat/stats';
import type { GameClock } from '../core/clock';
import type { BoltSpec } from './Bolt';
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
/** Pivot at the center of each sprite's ring guard, where the hand holds it. */
const KEY_ART_PIVOT = 0.28;
const KEY_FALLBACK_PIVOT = 0.15;
/** Share of the gap to the target velocity closed each frame. */
const GRIP = 0.22;

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
    this.invulnUntil = this.clock.now + PLAYER_INVULN_MS;
    this.scene.cameras.main.shake(120, 0.006);
    return true;
  }

  move() {
    const k = this.keys;
    const ix = (k.D.isDown ? 1 : 0) - (k.A.isDown ? 1 : 0);
    const iy = (k.S.isDown ? 1 : 0) - (k.W.isDown ? 1 : 0);
    const len = Math.hypot(ix, iy) || 1;
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

  /** Arrow keys aim and fire. Returns bolts to spawn this frame, if any. */
  tryShoot(time: number): BoltSpec[] {
    const k = this.keys;
    const sx = (k.RIGHT.isDown ? 1 : 0) - (k.LEFT.isDown ? 1 : 0);
    const sy = (k.DOWN.isDown ? 1 : 0) - (k.UP.isDown ? 1 : 0);
    const firing = sx !== 0 || sy !== 0;
    this.aim = axisAim(sx, sy) ?? this.aim;

    this.updateKeyWeapon();
    this.updateLook(firing);
    if (!firing || time < this.nextShotAt) return [];
    this.nextShotAt = time + this.stats.fireDelay;

    const { shotCount, spread } = this.stats;
    const step = shotCount > 1 ? Phaser.Math.DegToRad(spread) / (shotCount - 1) : 0;
    const first = this.aim - (step * (shotCount - 1)) / 2;
    const tip = this.orbit + 22;
    const tipX = this.x + Math.cos(this.aim) * tip;
    const tipY = this.y + 4 + Math.sin(this.aim) * tip;
    const body = this.body as Phaser.Physics.Arcade.Body;

    this.scene.tweens.add({ targets: this.keyWeapon, scaleX: 0.8, duration: 50, yoyo: true });

    return Array.from({ length: shotCount }, (_, i) => ({
      x: tipX,
      y: tipY,
      angle: first + step * i,
      speed: this.stats.shotSpeed,
      damage: this.stats.damage,
      range: this.stats.range,
      homing: this.stats.homing,
      scale: this.stats.boltScale,
      inheritVx: body.velocity.x * 0.3,
      inheritVy: body.velocity.y * 0.3,
    }));
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
    this.keyWeapon.setPosition(
      this.x + Math.cos(this.aim) * reach + side,
      this.y + KEY_HAND_Y * scale + Math.sin(this.aim) * reach,
    );
    this.keyWeapon.setRotation(this.aim);
    this.keyWeapon.setFlipY(Math.cos(this.aim) < -0.01);
    this.keyWeapon.setAlpha(this.alpha);
  }

  /** Bolts leave from outside the body, however big it gets. */
  private get orbit(): number {
    return SHOT_ORBIT * this.stats.hitboxScale;
  }

  teleport(x: number, y: number) {
    this.setPosition(x, y);
    (this.body as Phaser.Physics.Arcade.Body).reset(x, y);
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

/** Isaac shoots in 4 directions; on diagonals the current aim holds, so the last pressed axis wins. */
function axisAim(sx: number, sy: number): number | undefined {
  if (sx !== 0 && sy !== 0) return undefined;
  if (sx !== 0) return Math.atan2(0, sx);
  if (sy !== 0) return Math.atan2(sy, 0);
  return undefined;
}
