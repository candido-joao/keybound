import Phaser from 'phaser';
import { COLORS, LABEL_RANGE, TILE, tileX, tileY } from '../config';
import type { Item } from '../combat/stats';
import { type Locale, getLocale, t } from '../i18n';
import type { GameScene } from './GameScene';
import { addItemIcon } from './itemIcon';

/** A pedestal that must be stepped away from first arms beyond this distance. */
const ARM_RANGE = TILE;

interface Pedestal {
  x: number;
  y: number;
  /** Rebuilt when the language changes under the pedestal. */
  text: () => string[];
  label: Phaser.GameObjects.Text;
  pickup: Phaser.Physics.Arcade.Collider;
}

/**
 * Called each time the player touches the pedestal; `take` empties it for good. A pedestal that
 * refuses (a price the player can't pay) just doesn't call it.
 */
export type OnTouch = (take: () => void) => void;

/** Pedestals in this room, whose labels show only while the player is near. */
export class Pedestals {
  private readonly game: GameScene;
  private list: Pedestal[] = [];
  /** Language the labels were written in; the pause menu can switch it mid room. */
  private labelLocale?: Locale;

  constructor(game: GameScene) {
    this.game = game;
  }

  /** The room's objects go with the room; this only forgets them. */
  clear() {
    this.list = [];
  }

  /**
   * Pedestal holding `item` on a room tile; `onTake` runs once, when the player grabs it.
   * With `armWhenAway`, it can't be grabbed until the player has stepped off it once.
   */
  placeItem(col: number, row: number, item: Item, onTake?: () => void, armWhenAway = false) {
    const x = tileX(col);
    const y = tileY(row);
    const icon = addItemIcon(this.game, x, y - 12, item);
    // Name and hint only; the exact effect shows once the item is taken.
    const text = () => [t(item.name), t(item.hint)];
    const touch: OnTouch = (take) => {
      take();
      onTake?.();
      this.game.grantItem(item);
    };
    this.place(x, y, icon, text, touch, armWhenAway);
  }

  /** A pedestal at (`x`, `y`) with `icon` bobbing over it and its label above; returns the label. */
  place(
    x: number,
    y: number,
    icon: Phaser.GameObjects.Image,
    text: () => string[],
    onTouch: OnTouch,
    armWhenAway = false,
  ) {
    const game = this.game;
    const pedestal = game.add.image(x, y + 10, 'pedestal').setDepth(3);
    icon.setDepth(4);
    game.tweens.add({ targets: icon, y: y - 18, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    game.physics.add.existing(pedestal, true);
    const label = this.labelText(x, y - 44, text());
    const take = () => {
      pickup.active = false;
      icon.destroy();
      label.destroy();
      this.list = this.list.filter((p) => p !== entry);
    };
    const pickup = game.physics.add.overlap(game.player, pedestal, () => onTouch(take));
    pickup.active = !armWhenAway;
    const entry = { x, y, text, label, pickup };
    this.list.push(entry);
    for (const object of [pedestal, icon, label, pickup]) game.keep(object);
    return label;
  }

  update() {
    const locale = getLocale();
    if (locale !== this.labelLocale) this.relabel(locale);
    const { player } = this.game;
    const range = LABEL_RANGE * LABEL_RANGE;
    const armRange = ARM_RANGE * ARM_RANGE;
    for (const p of this.list) {
      const distance = Phaser.Math.Distance.Squared(p.x, p.y, player.x, player.y);
      const near = distance < range;
      if (p.label.visible !== near) p.label.setVisible(near);
      if (!p.pickup.active && distance > armRange) p.pickup.active = true;
    }
  }

  private relabel(locale: Locale) {
    this.labelLocale = locale;
    for (const p of this.list) p.label.setText(p.text());
  }

  private labelText(x: number, y: number, lines: string[]): Phaser.GameObjects.Text {
    return this.game.add
      .text(x, y, lines, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: COLORS.text,
        align: 'center',
        stroke: '#000',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 1)
      .setDepth(50)
      .setVisible(false);
  }
}
