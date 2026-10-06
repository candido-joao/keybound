import type Phaser from 'phaser';
import { itemTextureKey } from '../combat/items';
import type { Item } from '../combat/stats';

/** Item icon at 1:1 scale, looping its strip if it has one; falls back to the placeholder orb tinted with the item's color. */
export function addItemIcon(scene: Phaser.Scene, x: number, y: number, item: Item): Phaser.GameObjects.Sprite {
  const key = itemTextureKey(item);
  if (!scene.textures.exists(key)) return scene.add.sprite(x, y, 'item').setTint(item.color);
  const icon = scene.add.sprite(x, y, key, 0);
  if (scene.anims.exists(key)) icon.play(key);
  return icon;
}
