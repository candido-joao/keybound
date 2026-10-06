import { type Item, type PlayerStats, baseId } from './stats';

/** Loaded from public/items/<base id>.png by BootScene; variants look like their base, so the pedestal doesn't give them away. */
export const itemTextureKey = (item: Item) => `item:${baseId(item)}`;

/** Icon art is a horizontal strip of square frames; a strip with more than one loops (see `addItemIcon`). */
export const ITEM_ICON_SIZE = 32;
export const ITEM_ICON_FPS = 3;

/** Pure items weigh 1 against their variants: a subtle variant 2, an extreme one 1. */
const PURE = 1;
const SUBTLE = 2;
const EXTREME = 1;

/** Items whose second copy adds something; a third would add nothing, so rewards stop offering them. */
const STACKS_TWICE = 2;

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
    // Cuts bolt range only: it's the usual way into a held beam, which needs its reach.
    apply: (s) => ({ ...s, fireDelay: s.fireDelay / 3, boltRange: s.boltRange * 0.45, damage: s.damage * 0.45 }),
  },
  {
    id: 'trinity-sigil',
    maxCopies: STACKS_TWICE,
    weight: PURE,
    name: 'item.trinity-sigil.name',
    description: 'item.trinity-sigil.description',
    hint: 'item.trinity-sigil.hint',
    color: 0xc77dff,
    // The damage cut comes with the first sigil only; a second just adds bolts.
    apply: (s) => ({
      ...s,
      shotCount: s.shotCount + 2,
      spread: Math.max(s.spread, 24),
      damage: s.shotCount > 1 ? s.damage : s.damage * 0.8,
    }),
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
    // Slow bolts mean nothing to a beam, so it pays with a slower charge instead.
    apply: (s) => ({
      ...s,
      range: s.range * 1.5,
      boltScale: s.boltScale * 1.3,
      shotSpeed: s.shotSpeed * 0.75,
      beamCharge: s.beamCharge * 1.15,
    }),
  },
  {
    id: 'vital-shard',
    maxCopies: STACKS_TWICE,
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

  // ---------------------------------------------------------------- pool 1: the crypt
  {
    ...texts('key-tooth'),
    maxCopies: STACKS_TWICE,
    weight: PURE,
    color: 0xb08d57,
    apply: (s) => ({ ...slamOnSecondTooth(s), knockback: s.knockback * 1.8 }),
  },
  {
    ...texts('key-tooth:ram'),
    base: 'key-tooth',
    weight: EXTREME,
    color: 0xb08d57,
    apply: (s) => ({ ...slamOnSecondTooth(s), knockback: s.knockback * 3.5, fireDelay: s.fireDelay / 0.7 }),
  },
  {
    ...texts('copper-ring'),
    weight: PURE,
    color: 0xd9824a,
    apply: (s) => ({ ...s, healOdds: s.healOdds + 0.04 }),
  },
  {
    ...texts('copper-ring:greedy'),
    base: 'copper-ring',
    weight: SUBTLE,
    color: 0xd9824a,
    // A little damage until the shop gives coins a use; otherwise it'd be all cost.
    apply: (s) => ({ ...s, currencyValue: s.currencyValue + 1, healOdds: s.healOdds - 0.03, damage: s.damage * 1.02 }),
  },

  // ---------------------------------------------------------------- pool 2: the crystal garden
  {
    ...texts('prism-lens'),
    weight: PURE,
    pool: 2,
    color: 0xf2f2ff,
    // A beam already pierces; through the lens it splits instead.
    apply: (s) => ({ ...s, pierce: s.pierce + 1, refract: 1 }),
  },
  {
    ...texts('prism-lens:cracked'),
    base: 'prism-lens',
    weight: SUBTLE,
    color: 0xf2f2ff,
    apply: (s) => ({ ...s, pierce: s.pierce + 2, damage: s.damage * 0.85, refract: 1 }),
  },
  {
    ...texts('crystal-heart'),
    maxCopies: STACKS_TWICE,
    weight: PURE,
    pool: 2,
    fullHeal: true,
    color: 0xa3123a,
    apply: (s) => ({ ...s, maxHealth: s.maxHealth + 15 }),
  },
  {
    ...texts('crystal-heart:glass'),
    base: 'crystal-heart',
    weight: EXTREME,
    fullHeal: true,
    color: 0xa3123a,
    apply: (s) => ({ ...s, maxHealth: s.maxHealth + 35, invulnMs: s.invulnMs * 0.5 }),
  },
  {
    // The first echo fires backward; a second adds both sides.
    ...texts('crystal-echo'),
    maxCopies: STACKS_TWICE,
    weight: PURE,
    pool: 2,
    color: 0xc9b6ff,
    apply: (s) => ({ ...s, echoShots: s.echoShots > 0 ? 3 : 1 }),
  },
  {
    // Every direction at once, each bolt at less than half strength.
    ...texts('crystal-echo:shattered'),
    base: 'crystal-echo',
    weight: EXTREME,
    color: 0xc9b6ff,
    apply: (s) => ({ ...s, echoShots: 3, echoDamage: Math.max(s.echoDamage, 1), damage: s.damage * 0.45 }),
  },
  {
    ...texts('arcane-beam'),
    maxCopies: STACKS_TWICE,
    weight: PURE,
    pool: 2,
    color: 0x3d8bff,
    apply: (s) => ({ ...stackBeam(s), beam: Math.max(s.beam, 1) }),
  },
  {
    // Charges twice as fast and lasts half as long: the same damage, in quicker bursts.
    ...texts('arcane-beam:unstable'),
    base: 'arcane-beam',
    weight: SUBTLE,
    color: 0x3d8bff,
    apply: (s) => ({
      ...stackBeam(s),
      beam: Math.max(s.beam, 1),
      beamCharge: s.beamCharge * 0.5,
      beamTime: s.beamTime * 0.5,
    }),
  },
  {
    // About six shots' worth per beam, at twice the charge.
    ...texts('arcane-beam:overcharged'),
    base: 'arcane-beam',
    weight: EXTREME,
    color: 0x3d8bff,
    apply: (s) => {
      const stacked = stackBeam(s);
      return {
        ...stacked,
        beam: Math.max(s.beam, 1.67),
        beamCharge: s.beamCharge * 2,
        boltScale: stacked.boltScale * 1.6,
      };
    },
  },

  // ---------------------------------------------------------------- pool 3: the clock tower
  {
    ...texts('master-gear'),
    weight: PURE,
    pool: 3,
    color: 0xd4a93c,
    apply: (s) => ({ ...s, fireDelay: s.fireDelay * 0.65 }),
  },
  {
    ...texts('master-gear:worn'),
    base: 'master-gear',
    weight: SUBTLE,
    color: 0xd4a93c,
    apply: (s) => ({ ...s, fireDelay: s.fireDelay * 0.55, shotSpeed: s.shotSpeed * 0.7 }),
  },
  {
    // Passes through every enemy in its way.
    ...texts('clock-hand'),
    weight: PURE,
    pool: 3,
    color: 0x8a8f99,
    apply: (s) => ({ ...s, pierce: s.pierce + 99, damage: s.damage * 0.8 }),
  },
  {
    ...texts('broken-hourglass'),
    weight: PURE,
    pool: 3,
    color: 0xe0a64a,
    apply: (s) => ({ ...s, orbSpeed: s.orbSpeed * 0.75 }),
  },
  {
    ...texts('broken-hourglass:inverted'),
    base: 'broken-hourglass',
    weight: EXTREME,
    color: 0xe0a64a,
    apply: (s) => ({ ...s, orbSpeed: s.orbSpeed * 0.7, enemySpeed: s.enemySpeed * 0.7, speed: s.speed * 0.85 }),
  },
  {
    ...texts('spark-coil'),
    weight: PURE,
    pool: 3,
    color: 0xffe14d,
    apply: (s) => ({ ...s, damage: s.damage * 1.1, chain: s.chain + 2 }),
  },
  {
    ...texts('spark-coil:unstable'),
    base: 'spark-coil',
    weight: SUBTLE,
    color: 0xffe14d,
    apply: (s) => ({ ...s, damage: s.damage * 1.1, chain: s.chain + 3, chainChance: s.chainChance * 0.6 }),
  },
  {
    // Shocks everyone around the hit at once instead of chaining.
    ...texts('spark-coil:storm'),
    base: 'spark-coil',
    weight: EXTREME,
    color: 0xffe14d,
    apply: (s) => ({ ...s, chainNova: Math.max(s.chainNova, 0.3), damage: s.damage * 0.8 }),
  },
];

/** Only the tooth pushes harder than the base, so a push above it means one is already held. */
function slamOnSecondTooth(s: PlayerStats): PlayerStats {
  if (s.knockback <= 1) return s;
  return { ...s, wallSlam: 0.5 };
}

/** Another beam on top of one already held: the beam reaches twice as far and grows wider. */
function stackBeam(s: PlayerStats): PlayerStats {
  const counted = { ...s, beamCopies: s.beamCopies + 1 };
  if (s.beam <= 0) return counted;
  return { ...counted, range: s.range * 2, boltScale: s.boltScale * 1.5 };
}

/** Message keys follow the id; a typo in either fails the type check. */
function texts<Id extends string>(id: Id) {
  return {
    id,
    name: `item.${id}.name` as const,
    description: `item.${id}.description` as const,
    hint: `item.${id}.hint` as const,
  };
}
