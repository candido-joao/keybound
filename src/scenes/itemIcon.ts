import type Phaser from 'phaser';
import { itemTextureKey } from '../combat/items';
import type { Item } from '../combat/stats';

/** Item icon at 1:1 scale; falls back to the placeholder orb tinted with the item's color. */
export function addItemIcon(scene: Phaser.Scene, x: number, y: number, item: Item): Phaser.GameObjects.Image {
  const key = itemTextureKey(item);
  if (scene.textures.exists(key)) return scene.add.image(x, y, key);
  return scene.add.image(x, y, 'item').setTint(item.color);
}
