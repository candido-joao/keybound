import Phaser from 'phaser';
import { PLAYER_INVULN_MS } from '../combat/balance';
import type { PlayerStats } from '../combat/stats';
import type { GameClock } from '../core/clock';
import type { BoltSpec } from './Bolt';

type Keys = Record<'W' | 'A' | 'S' | 'D' | 'UP' | 'DOWN' | 'LEFT' | 'RIGHT', Phaser.Input.Keyboard.Key>;

const KEY_ORBIT = 20;

export class Player extends Phaser.Physics.Arcade.Sprite {
  stats: PlayerStats;
  health: number;
  private clock: GameClock;
  private keys: Keys;
  private keyWeapon: Phaser.GameObjects.Image;
  private aim = Math.PI / 2;
  private nextShotAt = 0;
  private invulnUntil = 0;

  constructor(scene: Phaser.Scene, clock: GameClock, x: number, y: number, stats: PlayerStats) {
    super(scene, x, y, 'player');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.clock = clock;
    this.stats = stats;
    this.health = stats.maxHealth;
    this.setDepth(10);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(11, 5, 12);

    this.keyWeapon = scene.add.image(x, y, 'key').setOrigin(0.15, 0.5).setDepth(11);
    this.keys = scene.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as Keys;
  }

  setStats(stats: PlayerStats) {
    const gained = stats.maxHealth - this.stats.maxHealth;
    this.stats = stats;
    this.health = Math.min(stats.maxHealth, this.health + Math.max(0, gained));
  }

  get invulnerable(): boolean {
    return this.clock.now < this.invulnUntil;
  }

  /** Returns true if the hit landed (not during i-frames). */
  hurt(halfHearts: number): boolean {
    if (this.invulnerable || this.health <= 0) return false;
    this.health = Math.max(0, this.health - halfHearts);
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

    // Lerp toward target velocity: a little slide, like Isaac.
    const tx = (ix / len) * this.stats.speed;
    const ty = (iy / len) * this.stats.speed;
    body.setVelocity(Phaser.Math.Linear(body.velocity.x, tx, 0.22), Phaser.Math.Linear(body.velocity.y, ty, 0.22));

    if (ix !== 0) this.setFlipX(ix < 0);
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
    if (!firing || time < this.nextShotAt) return [];
    this.nextShotAt = time + this.stats.fireDelay;

    const { shotCount, spread } = this.stats;
    const step = shotCount > 1 ? Phaser.Math.DegToRad(spread) / (shotCount - 1) : 0;
    const first = this.aim - (step * (shotCount - 1)) / 2;
    const tipX = this.x + Math.cos(this.aim) * (KEY_ORBIT + 22);
    const tipY = this.y + 4 + Math.sin(this.aim) * (KEY_ORBIT + 22);
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

  private updateKeyWeapon() {
    this.keyWeapon.setPosition(this.x + Math.cos(this.aim) * KEY_ORBIT, this.y + 4 + Math.sin(this.aim) * KEY_ORBIT);
    this.keyWeapon.setRotation(this.aim);
    this.keyWeapon.setFlipY(Math.cos(this.aim) < -0.01);
    // Draw the key behind the body when aiming up.
    this.keyWeapon.setDepth(Math.sin(this.aim) < -0.5 ? 9 : 11);
    this.keyWeapon.setAlpha(this.alpha);
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

/** Isaac shoots in 4 directions; on diagonals the current aim holds, so the last pressed axis wins. */
function axisAim(sx: number, sy: number): number | undefined {
  if (sx !== 0 && sy !== 0) return undefined;
  if (sx !== 0) return Math.atan2(0, sx);
  if (sy !== 0) return Math.atan2(sy, 0);
  return undefined;
}
