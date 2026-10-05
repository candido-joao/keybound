import Phaser from 'phaser';

/** How much bigger the outline silhouette is than the body: about 2 px on each side of a 32 px sprite. */
export const OUTLINE_SCALE = 1.14;

/** Same texture as its owner, filled with one color and a little bigger, just behind the body. */
export class EnemyOutline {
  private readonly owner: Phaser.GameObjects.Sprite;
  private readonly image: Phaser.GameObjects.Image;

  constructor(owner: Phaser.GameObjects.Sprite, color: number) {
    this.owner = owner;
    this.image = owner.scene.add
      .image(owner.x, owner.y, owner.texture.key)
      .setTintMode(Phaser.TintModes.FILL)
      .setTint(color)
      .setDepth(owner.depth - 0.1);
    this.sync();
  }

  /** Follows the body every frame, spawn rise and flips included. */
  sync() {
    const { owner, image } = this;
    if (image.frame.name !== owner.frame.name) image.setFrame(owner.frame.name);
    image
      .setPosition(owner.x, owner.y)
      .setScale(owner.scaleX * OUTLINE_SCALE, owner.scaleY * OUTLINE_SCALE)
      .setFlipX(owner.flipX)
      .setAlpha(owner.alpha * 0.9);
  }

  destroy() {
    this.image.destroy();
  }
}

/** Bits of `color` flying out from (`x`, `y`) and fading; more and farther for a bigger enemy. */
export function deathBurst(scene: Phaser.Scene, x: number, y: number, color: number, scale: number) {
  for (let i = 0; i < 8 * scale; i++) {
    const p = scene.add.image(x, y, 'particle').setTint(color).setDepth(4);
    const a = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const d = 20 + Phaser.Math.FloatBetween(0, 30 * scale);
    scene.tweens.add({
      targets: p,
      x: x + Math.cos(a) * d,
      y: y + Math.sin(a) * d,
      alpha: 0,
      scale: 0.3,
      duration: 380,
      onComplete: () => p.destroy(),
    });
  }
}
