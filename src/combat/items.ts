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
    name: 'Núcleo de Éter',
    description: 'Dano +1.5',
    color: 0x7fe8ff,
    apply: (s) => ({ ...s, damage: s.damage + 1.5 }),
  },
  {
    id: 'quickcast',
    name: 'Conjuração Rápida',
    description: 'Cadência +30%',
    color: 0xffd23f,
    apply: (s) => ({ ...s, fireDelay: s.fireDelay * 0.7 }),
  },
  {
    id: 'trinity-sigil',
    name: 'Sigilo Trino',
    description: 'Três projéteis em leque, dano -20%',
    color: 0xc77dff,
    apply: (s) => ({ ...s, shotCount: s.shotCount + 2, spread: Math.max(s.spread, 24), damage: s.damage * 0.8 }),
  },
  {
    id: 'seeker-rune',
    name: 'Runa Buscadora',
    description: 'Projéteis perseguem inimigos',
    color: 0x80ffb0,
    apply: (s) => ({ ...s, homing: s.homing + 4 }),
  },
  {
    id: 'swift-boots',
    name: 'Botas Ligeiras',
    description: 'Velocidade +20%',
    color: 0x9ad1ff,
    apply: (s) => ({ ...s, speed: s.speed * 1.2 }),
  },
  {
    id: 'long-focus',
    name: 'Foco Distante',
    description: 'Alcance +40%, projéteis maiores',
    color: 0xff9ecb,
    apply: (s) => ({ ...s, range: s.range * 1.4, boltScale: s.boltScale * 1.3 }),
  },
  {
    id: 'vital-shard',
    name: 'Fragmento Vital',
    description: '+1 coração',
    color: 0xe8435a,
    apply: (s) => ({ ...s, maxHealth: s.maxHealth + 2 }),
  },
];
