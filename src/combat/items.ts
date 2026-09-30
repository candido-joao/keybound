import type Phaser from 'phaser';
import { type Item, baseId } from './stats';

/** Loaded from public/items/<base id>.png by BootScene; variants look like their base, so the pedestal doesn't give them away. */
export const itemTextureKey = (item: Item) => `item:${baseId(item)}`;

/** Item icon at 1:1 scale; falls back to the placeholder orb tinted with the item's color. */
export function addItemIcon(scene: Phaser.Scene, x: number, y: number, item: Item): Phaser.GameObjects.Image {
  const key = itemTextureKey(item);
  if (scene.textures.exists(key)) return scene.add.image(x, y, key);
  return scene.add.image(x, y, 'item').setTint(item.color);
}

/** Pure items weigh 1 against their variants: a subtle variant 2, an extreme one 1. */
const PURE = 1;
const SUBTLE = 2;
const EXTREME = 1;

export const ITEMS: readonly Item[] = [
  {
    id: 'ether-core',
    weight: PURE,
    name: 'item.ether-core.name',
    description: 'item.ether-core.description',
    hint: 'item.ether-core.hint',
    color: 0x7fe8ff,
    apply: (s) => ({ ...s, damage: s.damage + 1.5 }),
  },
  {
    id: 'ether-core:unstable',
    base: 'ether-core',
    weight: SUBTLE,
    name: 'item.ether-core:unstable.name',
    description: 'item.ether-core:unstable.description',
    hint: 'item.ether-core:unstable.hint',
    color: 0x7fe8ff,
    apply: (s) => ({ ...s, damage: s.damage + 2, fireDelay: s.fireDelay * 1.2 }),
  },
  {
    // Every shot has to count.
    id: 'ether-core:cannon',
    base: 'ether-core',
    weight: EXTREME,
    name: 'item.ether-core:cannon.name',
    description: 'item.ether-core:cannon.description',
    hint: 'item.ether-core:cannon.hint',
    color: 0x7fe8ff,
    apply: (s) => ({ ...s, damage: s.damage * 2.5, fireDelay: s.fireDelay / 0.4, shotSpeed: s.shotSpeed * 0.6 }),
  },
  {
    id: 'quickcast',
    weight: PURE,
    name: 'item.quickcast.name',
    description: 'item.quickcast.description',
    hint: 'item.quickcast.hint',
    color: 0xffd23f,
    apply: (s) => ({ ...s, fireDelay: s.fireDelay * 0.7 }),
  },
  {
    id: 'quickcast:frail',
    base: 'quickcast',
    weight: SUBTLE,
    name: 'item.quickcast:frail.name',
    description: 'item.quickcast:frail.description',
    hint: 'item.quickcast:frail.hint',
    color: 0xffd23f,
    apply: (s) => ({ ...s, fireDelay: s.fireDelay * 0.6, damage: s.damage * 0.8 }),
  },
  {
    // Short range forces close-quarters fighting.
    id: 'quickcast:gatling',
    base: 'quickcast',
    weight: EXTREME,
    name: 'item.quickcast:gatling.name',
    description: 'item.quickcast:gatling.description',
    hint: 'item.quickcast:gatling.hint',
    color: 0xffd23f,
    apply: (s) => ({ ...s, fireDelay: s.fireDelay / 3, range: s.range * 0.45, damage: s.damage * 0.45 }),
  },
  {
    id: 'trinity-sigil',
    weight: PURE,
    name: 'item.trinity-sigil.name',
    description: 'item.trinity-sigil.description',
    hint: 'item.trinity-sigil.hint',
    color: 0xc77dff,
    apply: (s) => ({ ...s, shotCount: s.shotCount + 2, spread: Math.max(s.spread, 24), damage: s.damage * 0.8 }),
  },
  {
    id: 'seeker-rune',
    weight: PURE,
    name: 'item.seeker-rune.name',
    description: 'item.seeker-rune.description',
    hint: 'item.seeker-rune.hint',
    color: 0x80ffb0,
    apply: (s) => ({ ...s, homing: s.homing + 4 }),
  },
  {
    id: 'swift-boots',
    weight: PURE,
    name: 'item.swift-boots.name',
    description: 'item.swift-boots.description',
    hint: 'item.swift-boots.hint',
    color: 0x9ad1ff,
    apply: (s) => ({ ...s, speed: s.speed * 1.2 }),
  },
  {
    id: 'swift-boots:slick',
    base: 'swift-boots',
    weight: SUBTLE,
    name: 'item.swift-boots:slick.name',
    description: 'item.swift-boots:slick.description',
    hint: 'item.swift-boots:slick.hint',
    color: 0x9ad1ff,
    apply: (s) => ({ ...s, speed: s.speed * 1.25, slide: s.slide + 3 }),
  },
  {
    id: 'long-focus',
    weight: PURE,
    name: 'item.long-focus.name',
    description: 'item.long-focus.description',
    hint: 'item.long-focus.hint',
    color: 0xff9ecb,
    apply: (s) => ({ ...s, range: s.range * 1.4, boltScale: s.boltScale * 1.3 }),
  },
  {
    id: 'long-focus:heavy',
    base: 'long-focus',
    weight: SUBTLE,
    name: 'item.long-focus:heavy.name',
    description: 'item.long-focus:heavy.description',
    hint: 'item.long-focus:heavy.hint',
    color: 0xff9ecb,
    apply: (s) => ({ ...s, range: s.range * 1.5, boltScale: s.boltScale * 1.3, shotSpeed: s.shotSpeed * 0.75 }),
  },
  {
    id: 'vital-shard',
    weight: PURE,
    name: 'item.vital-shard.name',
    description: 'item.vital-shard.description',
    hint: 'item.vital-shard.hint',
    color: 0xe8435a,
    apply: (s) => ({ ...s, maxHealth: s.maxHealth + 20 }),
  },
  {
    id: 'vital-shard:heavy',
    base: 'vital-shard',
    weight: SUBTLE,
    name: 'item.vital-shard:heavy.name',
    description: 'item.vital-shard:heavy.description',
    hint: 'item.vital-shard:heavy.hint',
    color: 0xe8435a,
    apply: (s) => ({ ...s, maxHealth: s.maxHealth + 25, hitboxScale: s.hitboxScale * 1.25, speed: s.speed * 0.9 }),
  },
  {
    id: 'vital-shard:colossus',
    base: 'vital-shard',
    weight: EXTREME,
    name: 'item.vital-shard:colossus.name',
    description: 'item.vital-shard:colossus.description',
    hint: 'item.vital-shard:colossus.hint',
    color: 0xe8435a,
    apply: (s) => ({ ...s, maxHealth: s.maxHealth + 50, hitboxScale: s.hitboxScale * 1.5, speed: s.speed * 0.75 }),
  },
];
