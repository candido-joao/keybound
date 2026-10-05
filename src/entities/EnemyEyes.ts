import Phaser from 'phaser';

/** Eye positions on the 32 px shadow texture, from its center; scaled with the enemy. */
const EYE_OFFSETS = [
  { x: -5, y: 1 },
  { x: 5, y: 1 },
] as const;
/** The glow texture is 8 px; at this share of the enemy's scale it just covers an eye. */
const EYE_GLOW_SCALE = 0.9;

/** The glow that warns of a furious dash or a volley; made on first use. */
export class EnemyEyes {
  private readonly owner: Phaser.GameObjects.Sprite;
  private readonly scale: number;
  private images: Phaser.GameObjects.Image[] = [];

  /** `scale` is the owner's base scale, not its current one, so a swell doesn't move the eyes. */
  constructor(owner: Phaser.GameObjects.Sprite, scale: number) {
    this.owner = owner;
    this.scale = scale;
  }

  show(on: boolean) {
    if (on && this.images.length === 0) this.images = EYE_OFFSETS.map(() => this.makeEye());
    for (const eye of this.images) eye.setVisible(on);
    if (on) this.place();
  }

  /** Keeps the glow on the eyes while the owner moves during the warning. */
  place() {
    const { x, y } = this.owner;
    for (let i = 0; i < this.images.length; i++) {
      const offset = EYE_OFFSETS[i];
      this.images[i].setPosition(x + offset.x * this.scale, y + offset.y * this.scale);
    }
  }

  destroy() {
    for (const eye of this.images) eye.destroy();
  }

  private makeEye(): Phaser.GameObjects.Image {
    return this.owner.scene.add
      .image(0, 0, 'particle')
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(this.scale * EYE_GLOW_SCALE)
      .setDepth(6)
      .setVisible(false);
  }
}
