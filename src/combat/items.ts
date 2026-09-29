import type Phaser from 'phaser';
import type { Item } from './stats';

/** Loaded from public/items/<id>.png by BootScene. */
export const itemTextureKey = (item: Item) => `item:${item.id}`;

/** Item icon at 1:1 scale; falls back to the placeholder orb tinted with the item's color. */
export function addItemIcon(scene: Phaser.Scene, x: number, y: number, item: Item): Phaser.GameObjects.Image {
  const key = itemTextureKey(item);
  if (scene.textures.exists(key)) return scene.add.image(x, y, key);
  return scene.add.image(x, y, 'item').setTint(item.color);
}

export const ITEMS: readonly Item[] = [
  {
    id: 'ether-core',
    name: 'item.ether-core.name',
    description: 'item.ether-core.description',
    color: 0x7fe8ff,
    apply: (s) => ({ ...s, damage: s.damage + 1.5 }),
  },
  {
    id: 'quickcast',
    name: 'item.quickcast.name',
    description: 'item.quickcast.description',
    color: 0xffd23f,
    apply: (s) => ({ ...s, fireDelay: s.fireDelay * 0.7 }),
  },
  {
    id: 'trinity-sigil',
    name: 'item.trinity-sigil.name',
    description: 'item.trinity-sigil.description',
    color: 0xc77dff,
    apply: (s) => ({ ...s, shotCount: s.shotCount + 2, spread: Math.max(s.spread, 24), damage: s.damage * 0.8 }),
  },
  {
    id: 'seeker-rune',
    name: 'item.seeker-rune.name',
    description: 'item.seeker-rune.description',
    color: 0x80ffb0,
    apply: (s) => ({ ...s, homing: s.homing + 4 }),
  },
  {
    id: 'swift-boots',
    name: 'item.swift-boots.name',
    description: 'item.swift-boots.description',
    color: 0x9ad1ff,
    apply: (s) => ({ ...s, speed: s.speed * 1.2 }),
  },
  {
    id: 'long-focus',
    name: 'item.long-focus.name',
    description: 'item.long-focus.description',
    color: 0xff9ecb,
    apply: (s) => ({ ...s, range: s.range * 1.4, boltScale: s.boltScale * 1.3 }),
  },
  {
    id: 'vital-shard',
    name: 'item.vital-shard.name',
    description: 'item.vital-shard.description',
    color: 0xe8435a,
    apply: (s) => ({ ...s, maxHealth: s.maxHealth + 2 }),
  },
];
