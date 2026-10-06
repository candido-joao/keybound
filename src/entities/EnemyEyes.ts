import Phaser from 'phaser';

/** The glow texture is 8 px; at this share of the sprite's scale it just covers an eye. */
const EYE_GLOW_SCALE = 0.9;

type Spot = { readonly x: number; readonly y: number };

/** The glow that warns of a furious dash or a volley; made on first use. */
export class EnemyEyes {
  private readonly owner: Phaser.GameObjects.Sprite;
  private readonly spots: readonly Spot[];
  private readonly scale: number;
  private images: Phaser.GameObjects.Image[] = [];

  /**
   * `spots` are the eyes on the texture, in its px from the center, none for no glow; `scale` is
   * the sprite's base scale, not its current one, so a swell doesn't move them.
   */
  constructor(owner: Phaser.GameObjects.Sprite, spots: readonly Spot[], scale: number) {
    this.owner = owner;
    this.spots = spots;
    this.scale = scale;
  }

  show(on: boolean) {
    if (on && this.images.length === 0) this.images = this.spots.map(() => this.makeEye());
    for (const eye of this.images) eye.setVisible(on);
    if (on) this.place();
  }

  /** Keeps the glow on the eyes while the owner moves during the warning. */
  place() {
    const { x, y, flipX } = this.owner;
    for (let i = 0; i < this.images.length; i++) {
      const spot = this.spots[i];
      // The art turns with the owner, and its eyes with it.
      const dx = flipX ? -spot.x : spot.x;
      this.images[i].setPosition(x + dx * this.scale, y + spot.y * this.scale);
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
