import Phaser from 'phaser';

/** Enemy projectile. Pooled by GameScene: `fire` takes one out, `release` puts it back. */
export class HostileOrb extends Phaser.Physics.Arcade.Image {
  damage = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'hostile-orb');
  }

  fire(x: number, y: number, angle: number, speed: number, damage: number) {
    this.enableBody(true, x, y, true, true);
    this.damage = damage;
    this.setDepth(7).setBlendMode(Phaser.BlendModes.ADD);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(5, 2, 2);
    body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
  }

  release() {
    this.disableBody(true, true);
  }
}
