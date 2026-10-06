import type { Rng } from '../core/rng';
import type { MessageKey } from '../i18n';
import { type FadeCycle, ringSpreadDeg } from './behaviors';
import { pickWeighted } from './itemPool';

/** Stops, swells for `telegraphMs`, then lunges at where the player stood when the telegraph began. */
export interface DashAttack {
  kind: 'dash';
  /** Measured from the start of the previous dash. */
  everyMs: number;
  telegraphMs: number;
  durationMs: number;
  speed: number;
  /** Only dashes at a target this close; farther off, the dash waits and the volley takes over. */
  maxDistance?: number;
  /**
   * Waits for the target to line up on its row or column, within this many px, then lunges
   * straight along it until a wall stops it or `durationMs` runs out.
   */
  align?: number;
}

/**
 * Punishes keeping away: once the player has stayed beyond `minDistance` for `farMs` straight,
 * the enemy stops with glowing eyes for `telegraphMs`, then fires a fan of slow orbs.
 */
export interface VolleyAttack {
  kind: 'volley';
  minDistance: number;
  farMs: number;
  /** 0 fires on the move, with no stop and no eye glow. */
  telegraphMs: number;
  /** Measured from the shot. */
  cooldownMs: number;
  count: number;
  /** Total fan angle in degrees. */
  spreadDeg: number;
  speed: number;
  damage: number;
  /** Fans fired one after another, each aimed anew. 1 when absent. */
  shots?: number;
  shotGapMs?: number;
}

/** Stops and swells for `telegraphMs`, then calls in plain enemies of `minionId` around itself. */
export interface SummonAttack {
  kind: 'summon';
  /** Measured from the start of the previous summon. */
  everyMs: number;
  telegraphMs: number;
  min: number;
  max: number;
  /** Skips the summon while this many enemies are already up, so a long fight doesn't flood the room. */
  maxAlive: number;
  minionId: string;
}

/** Within `triggerDistance` it stops for `fuseMs`, then blows up, hurting the player and enemies alike. */
export interface ExplodeAttack {
  kind: 'explode';
  triggerDistance: number;
  fuseMs: number;
  radius: number;
  damage: number;
}

export type EnemyAttack = DashAttack | VolleyAttack | SummonAttack | ExplodeAttack;

/** Teleports somewhere far from the player when it comes close. */
export interface BlinkMove {
  range: number;
  /** Measured from the previous blink. */
  cooldownMs: number;
  /** Fires its volley the moment it lands, cooldown or not. */
  volley?: boolean;
}

/** Falls into a pile instead of dying, and gets back up unless the player steps on the pile first. */
export interface Revive {
  delayMs: number;
  /** Share of max HP it gets back up with. */
  hpShare: number;
  /** How many times it gets back up; the death after that is for good. */
  times: number;
}

/** Every dash, calm or furious, leaves a line of puddles that hurt the player until they dry. */
export interface BloodTrail {
  /** A puddle this often while the dash lasts. */
  everyMs: number;
  radius: number;
  /** How long a puddle stays, the fade before it dries included. */
  lifeMs: number;
  damage: number;
}

/**
 * A harder second phase. Past the HP threshold the enemy turns invulnerable for the
 * transition, then trades its normal dash for a furious one that ricochets off walls.
 */
export interface FuryPhase {
  /** Starts once HP drops below this share of the max. */
  hpShare: number;
  transitionMs: number;
  /** Added to the body's colors: the shadow is near black, so a multiplied tint wouldn't show. */
  tint: number;
  dash: FuryDash;
}

/** Launched without stopping, after a short eye flash; the direction locks when the flash starts. */
export interface FuryDash {
  /** Measured from the start of the previous dash. */
  everyMs: number;
  flashMs: number;
  speed: number;
  /** Total path length, bounces included. */
  distance: number;
  damage: number;
}

export interface EnemyDef {
  id: string;
  name: MessageKey;
  /** Real art from public/enemies/<texture>.png when present; BootScene bakes a placeholder otherwise. */
  texture: string;
  /** Frames in the art's strip: idle first, then the walk. Absent for baked-only textures. */
  frames?: number;
  /**
   * Side of the art's square frames, when not `ENEMY_FRAME`. Such art is drawn at the placeholder
   * body's size times `scale`, so a boss drawn 80 px wide has `scale` 2.5 and shows pixel for pixel.
   */
  frameSize?: number;
  /** Has a pose of its own for the boss intro, in public/enemies/<texture>-intro.png. */
  introPose?: boolean;
  /** The art looks left, so it flips when heading right instead. */
  facesLeft?: boolean;
  hp: number;
  /** Share of base HP added per floor after the first. */
  hpGrowth: number;
  speed: number;
  scale: number;
  /** How long it takes to rise out of the floor, harmless. */
  spawnMs?: number;
  /** Risen, it stands this long before it moves or hurts: a window to get ready for it. */
  restMs?: number;
  /** HP the player loses on touch. */
  contactDamage: number;
  /** Bosses ignore knockback. */
  boss: boolean;
  /** A room event's mini boss: ignores knockback and shows the boss HP bar, but isn't a floor boss. */
  miniBoss?: boolean;
  attacks: readonly EnemyAttack[];
  fury?: FuryPhase;
  /** Walks along rows and columns only, turning at right angles. */
  axisWalk?: boolean;
  /** Rooted: neither hits nor other enemies push it. */
  anchored?: boolean;
  /** Drifts through other enemies. */
  ghost?: boolean;
  /** Floats over pits and spikes; rock still stops it. */
  flies?: boolean;
  /** Fades in and out; hidden, it neither hurts nor takes hits. */
  fade?: FadeCycle;
  blink?: BlinkMove;
  revive?: Revive;
  trail?: BloodTrail;
  /** Breaks into `count` plain `id` enemies when it dies. */
  split?: { id: string; count: number };
  /** Color of a silhouette drawn around the body; cursed enemies get one. */
  outline?: number;
  /** Stronger, and its drops are rolled twice. */
  cursed?: boolean;
  deathColor: number;
}

export const SHADOW: EnemyDef = {
  id: 'shadow',
  name: 'enemy.shadow',
  texture: 'shadow',
  frames: 3,
  hp: 12,
  hpGrowth: 0.15,
  speed: 115,
  scale: 1,
  contactDamage: 10,
  boss: false,
  attacks: [],
  deathColor: 0x2a2144,
};

/** Keeps back and shoots single orbs; slower and frailer than a plain shadow. */
export const SHADOW_CASTER: EnemyDef = {
  id: 'shadow-caster',
  name: 'enemy.shadow-caster',
  texture: 'shadow-caster',
  frames: 3,
  hp: 9,
  hpGrowth: 0.15,
  speed: 70,
  scale: 1,
  contactDamage: 10,
  boss: false,
  attacks: [
    {
      kind: 'volley',
      minDistance: 120,
      farMs: 1200,
      telegraphMs: 0,
      cooldownMs: 2600,
      count: 1,
      spreadDeg: 0,
      speed: 150,
      damage: 10,
    },
  ],
  deathColor: 0x3a1f4a,
};

/** Slow and frail, but it gets back up once, unless the player steps on the bones first. */
export const BONES: EnemyDef = {
  id: 'bones',
  name: 'enemy.bones',
  texture: 'bones',
  frames: 3,
  facesLeft: true,
  hp: 10,
  hpGrowth: 0.15,
  speed: 85,
  scale: 1,
  contactDamage: 10,
  boss: false,
  attacks: [],
  revive: { delayMs: 4000, hpShare: 0.5, times: 1 },
  deathColor: 0xb8ab84,
};

/** Fades in and out; it can only be hit, and only hurts, while it shows. */
export const LANTERN: EnemyDef = {
  id: 'lantern',
  name: 'enemy.lantern',
  texture: 'lantern',
  frames: 3,
  hp: 10,
  hpGrowth: 0.15,
  speed: 60,
  scale: 1,
  contactDamage: 10,
  boss: false,
  attacks: [],
  ghost: true,
  flies: true,
  fade: { shownMs: 1800, hiddenMs: 1500, warnMs: 300 },
  deathColor: 0x5fbf7a,
};

/** The Colossus dashes at players within this distance and shoots at those beyond it. */
const COLOSSUS_REACH = 260;

export const SHADOW_COLOSSUS: EnemyDef = {
  id: 'shadow-colossus',
  name: 'boss.shadow-colossus',
  texture: 'shadow-colossus',
  frames: 3,
  frameSize: 144,
  introPose: true,
  hp: 150,
  hpGrowth: 0.2,
  speed: 70,
  scale: 4.5,
  contactDamage: 10,
  boss: true,
  attacks: [
    { kind: 'dash', everyMs: 2000, telegraphMs: 380, durationMs: 420, speed: 460, maxDistance: COLOSSUS_REACH },
    {
      kind: 'volley',
      minDistance: COLOSSUS_REACH,
      farMs: 700,
      telegraphMs: 500,
      cooldownMs: 3000,
      count: 3,
      spreadDeg: 36,
      speed: 170,
      damage: 10,
    },
  ],
  fury: {
    hpShare: 0.4,
    transitionMs: 600,
    tint: 0x360808,
    // 40% farther than the normal dash (460 px/s for 420 ms).
    dash: { everyMs: 2400, flashMs: 150, speed: 520, distance: 270, damage: 15 },
  },
  deathColor: 0x2a2144,
};

/** What sets a boss variant apart from its base: always its name and look, often a number or two. */
type VariantChanges = Pick<EnemyDef, 'id' | 'name' | 'texture' | 'deathColor'> & Partial<EnemyDef>;

/** `base` reused in another pool: another name and look, and the changes on top of its own. */
function bossVariant(base: EnemyDef, changes: VariantChanges): EnemyDef {
  return { ...base, ...changes };
}

type AttackChanges = { [K in EnemyAttack['kind']]?: Partial<Extract<EnemyAttack, { kind: K }>> };

/** `def`'s attacks with the listed kinds changed; the others as they were. */
function tweakAttacks(def: EnemyDef, changes: AttackChanges): EnemyAttack[] {
  return def.attacks.map((attack) => ({ ...attack, ...changes[attack.kind] }) as EnemyAttack);
}

/**
 * Bleeds where it dashes: each lunge leaves puddles that hurt, so the floor safe to dodge on
 * shrinks as the fight goes on. Its volley comes in two fans.
 */
export const BLOOD_COLOSSUS = bossVariant(SHADOW_COLOSSUS, {
  id: 'blood-colossus',
  name: 'boss.blood-colossus',
  texture: 'blood-colossus',
  deathColor: 0x5a1414,
  attacks: tweakAttacks(SHADOW_COLOSSUS, { volley: { shots: 2, shotGapMs: 350 } }),
  // A puddle every ~28 px of a calm dash, wider than that apart, so the line reads unbroken.
  trail: { everyMs: 60, radius: 22, lifeMs: 4500, damage: 5 },
});

/**
 * A slow caster: aimed bursts and rings of bone in turn, and a couple of bones raised now and then.
 */
export const BONE_KING: EnemyDef = {
  id: 'bone-king',
  name: 'boss.bone-king',
  texture: 'bone-king',
  frames: 3,
  frameSize: 128,
  introPose: true,
  hp: 180,
  hpGrowth: 0.2,
  speed: 60,
  scale: 4,
  contactDamage: 10,
  boss: true,
  attacks: [
    {
      kind: 'volley',
      minDistance: 0,
      farMs: 0,
      telegraphMs: 450,
      cooldownMs: 2200,
      count: 1,
      spreadDeg: 0,
      speed: 210,
      damage: 10,
      shots: 3,
      shotGapMs: 200,
    },
    {
      kind: 'volley',
      minDistance: 0,
      farMs: 0,
      telegraphMs: 550,
      cooldownMs: 2400,
      count: 10,
      spreadDeg: ringSpreadDeg(10),
      speed: 140,
      damage: 10,
    },
    { kind: 'summon', everyMs: 9000, telegraphMs: 700, min: 2, max: 2, maxAlive: 4, minionId: 'bones' },
  ],
  deathColor: 0xb8ab84,
};

/** Fades out, and blinks away from a player who closes in, firing the moment it lands: rings and aimed fans in turn. */
export const WRAITH: EnemyDef = {
  id: 'wraith',
  name: 'boss.wraith',
  texture: 'wraith',
  frames: 3,
  frameSize: 128,
  introPose: true,
  hp: 130,
  hpGrowth: 0.2,
  speed: 95,
  scale: 4,
  contactDamage: 10,
  boss: true,
  ghost: true,
  flies: true,
  fade: { shownMs: 3200, hiddenMs: 1400, warnMs: 400 },
  blink: { range: 110, cooldownMs: 3000, volley: true },
  attacks: [
    {
      kind: 'volley',
      minDistance: 0,
      farMs: 0,
      telegraphMs: 500,
      cooldownMs: 2600,
      count: 10,
      spreadDeg: ringSpreadDeg(10),
      speed: 140,
      damage: 10,
    },
    {
      kind: 'volley',
      minDistance: 0,
      farMs: 0,
      telegraphMs: 400,
      cooldownMs: 2200,
      count: 3,
      spreadDeg: 24,
      speed: 180,
      damage: 10,
      shots: 2,
      shotGapMs: 250,
    },
  ],
  deathColor: 0x5fbf7a,
};

/** Slower and tougher than a shadow; it shatters into shards when it falls. */
export const CRYSTAL_SENTINEL: EnemyDef = {
  id: 'crystal-sentinel',
  name: 'enemy.crystal-sentinel',
  texture: 'crystal-sentinel',
  frames: 3,
  hp: 20,
  hpGrowth: 0.15,
  speed: 80,
  scale: 1,
  contactDamage: 10,
  boss: false,
  attacks: [],
  split: { id: 'crystal-shard', count: 2 },
  deathColor: 0x4fc3d6,
};

/** A sentinel's leftovers: frail, but fast, and it bursts out at once. */
export const CRYSTAL_SHARD: EnemyDef = {
  id: 'crystal-shard',
  name: 'enemy.crystal-shard',
  texture: 'crystal-shard',
  frames: 3,
  hp: 4,
  hpGrowth: 0.15,
  speed: 145,
  // A piece of the sentinel: drawn smaller than what it broke off from.
  scale: 0.65,
  spawnMs: 150,
  restMs: 600,
  contactDamage: 6,
  boss: false,
  attacks: [],
  deathColor: 0x7fe3e8,
};

/** Keeps its distance: it blinks away from a player who closes in, and fires a fan of three. */
export const CRYSTAL_SEER: EnemyDef = {
  id: 'crystal-seer',
  name: 'enemy.crystal-seer',
  texture: 'crystal-seer',
  frames: 3,
  hp: 10,
  hpGrowth: 0.15,
  speed: 75,
  scale: 1,
  contactDamage: 10,
  boss: false,
  attacks: [
    {
      kind: 'volley',
      minDistance: 100,
      farMs: 900,
      telegraphMs: 0,
      cooldownMs: 2600,
      count: 3,
      spreadDeg: 30,
      speed: 150,
      damage: 10,
    },
  ],
  blink: { range: 90, cooldownMs: 3500 },
  deathColor: 0xb49be6,
};

/** Rooted turret that throws a ring of orbs every few seconds. */
export const CRYSTAL_SPIKE: EnemyDef = {
  id: 'crystal-spike',
  name: 'enemy.crystal-spike',
  texture: 'crystal-spike',
  frames: 3,
  hp: 16,
  hpGrowth: 0.15,
  speed: 0,
  scale: 1,
  contactDamage: 10,
  boss: false,
  anchored: true,
  attacks: [
    {
      kind: 'volley',
      // Fires wherever the player stands.
      minDistance: 0,
      farMs: 0,
      telegraphMs: 0,
      cooldownMs: 2800,
      count: 8,
      spreadDeg: ringSpreadDeg(8),
      speed: 120,
      damage: 10,
    },
  ],
  deathColor: 0x7fe3e8,
};

/** Its volley is a wide fan of five slower orbs. */
export const CRYSTAL_COLOSSUS = bossVariant(SHADOW_COLOSSUS, {
  id: 'crystal-colossus',
  name: 'boss.crystal-colossus',
  texture: 'crystal-colossus',
  deathColor: 0x1f4a52,
  attacks: tweakAttacks(SHADOW_COLOSSUS, { volley: { count: 5, spreadDeg: 70, speed: 145 } }),
});

/** What the Hydra breaks into: frail and quick, still counted on the boss bar. */
export const HYDRA_HEAD: EnemyDef = {
  id: 'hydra-head',
  name: 'enemy.hydra-head',
  texture: 'hydra-head',
  frames: 3,
  frameSize: 56,
  hp: 30,
  hpGrowth: 0.2,
  speed: 120,
  scale: 1.75,
  spawnMs: 200,
  contactDamage: 10,
  boss: false,
  miniBoss: true,
  attacks: [
    {
      kind: 'volley',
      minDistance: 90,
      farMs: 600,
      telegraphMs: 0,
      cooldownMs: 1800,
      count: 1,
      spreadDeg: 0,
      speed: 180,
      damage: 8,
    },
  ],
  deathColor: 0x7fe3e8,
};

/** Huge and slow: three heads take turns with fans, double fans and rings; felled, it breaks into three heads that fight on. */
export const CRYSTAL_HYDRA: EnemyDef = {
  id: 'crystal-hydra',
  name: 'boss.crystal-hydra',
  texture: 'crystal-hydra',
  frames: 3,
  frameSize: 192,
  introPose: true,
  hp: 200,
  hpGrowth: 0.2,
  speed: 40,
  scale: 6,
  contactDamage: 10,
  boss: true,
  attacks: [
    {
      kind: 'volley',
      minDistance: 0,
      farMs: 0,
      telegraphMs: 450,
      cooldownMs: 1800,
      count: 3,
      spreadDeg: 40,
      speed: 170,
      damage: 10,
    },
    {
      kind: 'volley',
      minDistance: 0,
      farMs: 0,
      telegraphMs: 500,
      cooldownMs: 2200,
      count: 5,
      spreadDeg: 70,
      speed: 150,
      damage: 10,
      shots: 2,
      shotGapMs: 300,
    },
    {
      kind: 'volley',
      minDistance: 0,
      farMs: 0,
      telegraphMs: 600,
      cooldownMs: 2600,
      count: 12,
      spreadDeg: ringSpreadDeg(12),
      speed: 130,
      damage: 10,
    },
  ],
  split: { id: 'hydra-head', count: 3 },
  deathColor: 0x4fc3d6,
};

/**
 * Rooted in place, it cycles through wide rings, aimed bursts and slow dense rings, blinks off
 * when the player gets close and fires the moment it lands, and now and then grows a spike.
 */
export const CRYSTAL_MATRIARCH: EnemyDef = {
  id: 'crystal-matriarch',
  name: 'boss.crystal-matriarch',
  texture: 'crystal-matriarch',
  frames: 3,
  frameSize: 144,
  introPose: true,
  hp: 170,
  hpGrowth: 0.2,
  speed: 0,
  scale: 4.5,
  contactDamage: 10,
  boss: true,
  anchored: true,
  blink: { range: 140, cooldownMs: 3500, volley: true },
  attacks: [
    {
      kind: 'volley',
      minDistance: 0,
      farMs: 0,
      telegraphMs: 600,
      cooldownMs: 2200,
      count: 12,
      spreadDeg: ringSpreadDeg(12),
      speed: 125,
      damage: 10,
    },
    {
      kind: 'volley',
      minDistance: 0,
      farMs: 0,
      telegraphMs: 400,
      cooldownMs: 1800,
      count: 3,
      spreadDeg: 20,
      speed: 190,
      damage: 10,
      shots: 3,
      shotGapMs: 180,
    },
    {
      kind: 'volley',
      minDistance: 0,
      farMs: 0,
      telegraphMs: 700,
      cooldownMs: 2400,
      count: 16,
      spreadDeg: ringSpreadDeg(16),
      speed: 95,
      damage: 10,
    },
    { kind: 'summon', everyMs: 10000, telegraphMs: 700, min: 1, max: 1, maxAlive: 3, minionId: 'crystal-spike' },
  ],
  deathColor: 0xb49be6,
};

/** The Bone King's crystal kin: fans of five and dense rings in turn, and packs of shards instead of bones. */
export const SHARD_KING = bossVariant(BONE_KING, {
  id: 'shard-king',
  name: 'boss.shard-king',
  texture: 'shard-king',
  deathColor: 0x7fe3e8,
  attacks: [
    {
      kind: 'volley',
      minDistance: 0,
      farMs: 0,
      telegraphMs: 450,
      cooldownMs: 2200,
      count: 5,
      spreadDeg: 50,
      speed: 170,
      damage: 10,
    },
    {
      kind: 'volley',
      minDistance: 0,
      farMs: 0,
      telegraphMs: 550,
      cooldownMs: 2400,
      count: 12,
      spreadDeg: ringSpreadDeg(12),
      speed: 130,
      damage: 10,
    },
    { kind: 'summon', everyMs: 8000, telegraphMs: 700, min: 3, max: 3, maxAlive: 6, minionId: 'crystal-shard' },
  ],
});

/** Plods along rows and columns; once the player lines up with it, it charges to the wall. */
export const AUTOMATON: EnemyDef = {
  id: 'automaton',
  name: 'enemy.automaton',
  texture: 'automaton',
  frames: 3,
  hp: 18,
  hpGrowth: 0.15,
  speed: 70,
  scale: 1,
  contactDamage: 10,
  boss: false,
  attacks: [{ kind: 'dash', everyMs: 2200, telegraphMs: 0, durationMs: 900, speed: 420, align: 18 }],
  axisWalk: true,
  deathColor: 0xc9a04a,
};

/** Fires three aimed shots in a row. */
export const AUTOMATON_GUNNER: EnemyDef = {
  id: 'automaton-gunner',
  name: 'enemy.automaton-gunner',
  texture: 'automaton-gunner',
  frames: 3,
  hp: 12,
  hpGrowth: 0.15,
  speed: 60,
  scale: 1,
  contactDamage: 10,
  boss: false,
  attacks: [
    {
      kind: 'volley',
      minDistance: 110,
      farMs: 900,
      telegraphMs: 0,
      cooldownMs: 2800,
      count: 1,
      spreadDeg: 0,
      speed: 190,
      damage: 8,
      shots: 3,
      shotGapMs: 170,
    },
  ],
  deathColor: 0xb8653a,
};

/** Runs at the player, stops for a moment and blows up, enemies around it included. */
export const CUCKOO: EnemyDef = {
  id: 'cuckoo',
  name: 'enemy.cuckoo',
  texture: 'cuckoo',
  frames: 3,
  hp: 8,
  hpGrowth: 0.15,
  speed: 140,
  scale: 1,
  contactDamage: 10,
  boss: false,
  attacks: [{ kind: 'explode', triggerDistance: 60, fuseMs: 400, radius: 70, damage: 20 }],
  deathColor: 0x8a4a2b,
};

/** Charges along rows and columns from any range, and its volley is a burst of aimed shots. */
export const GEAR_COLOSSUS = bossVariant(SHADOW_COLOSSUS, {
  id: 'gear-colossus',
  name: 'boss.gear-colossus',
  texture: 'gear-colossus',
  deathColor: 0x4a3522,
  attacks: tweakAttacks(SHADOW_COLOSSUS, {
    dash: { everyMs: 1800, telegraphMs: 300, durationMs: 900, speed: 520, maxDistance: undefined, align: 24 },
    volley: { count: 1, spreadDeg: 0, speed: 200, shots: 3, shotGapMs: 180 },
  }),
});

/** Sends cuckoos at the player, fires bursts of fans, and blinks off when the player gets close. */
export const CLOCKMAKER: EnemyDef = {
  id: 'clockmaker',
  name: 'boss.clockmaker',
  texture: 'clockmaker',
  frames: 3,
  frameSize: 80,
  introPose: true,
  hp: 140,
  hpGrowth: 0.2,
  speed: 75,
  scale: 2.5,
  contactDamage: 10,
  boss: true,
  blink: { range: 80, cooldownMs: 4000 },
  attacks: [
    { kind: 'summon', everyMs: 6500, telegraphMs: 700, min: 2, max: 2, maxAlive: 4, minionId: 'cuckoo' },
    {
      kind: 'volley',
      minDistance: 140,
      farMs: 500,
      telegraphMs: 450,
      cooldownMs: 2600,
      count: 3,
      spreadDeg: 30,
      speed: 190,
      damage: 8,
      shots: 3,
      shotGapMs: 200,
    },
  ],
  deathColor: 0x8a4a2b,
};

/** A giant automaton: it walks the grid, charges wall to wall once lined up, and turns furious below 40%. */
export const BRASS_TITAN: EnemyDef = {
  id: 'brass-titan',
  name: 'boss.brass-titan',
  texture: 'brass-titan',
  frames: 3,
  frameSize: 152,
  introPose: true,
  hp: 190,
  hpGrowth: 0.2,
  speed: 60,
  scale: 4.75,
  contactDamage: 10,
  boss: true,
  axisWalk: true,
  attacks: [
    { kind: 'dash', everyMs: 1600, telegraphMs: 380, durationMs: 1100, speed: 540, align: 26 },
    {
      kind: 'volley',
      minDistance: 200,
      farMs: 900,
      telegraphMs: 500,
      cooldownMs: 3200,
      count: 8,
      spreadDeg: ringSpreadDeg(8),
      speed: 150,
      damage: 10,
    },
  ],
  fury: {
    hpShare: 0.4,
    transitionMs: 600,
    tint: 0x3a1a00,
    dash: { everyMs: 2000, flashMs: 150, speed: 560, distance: 320, damage: 15 },
  },
  deathColor: 0xc9a04a,
};

/** The Wraith on a quicker swing: shorter fades, and aimed bursts and tighter rings in turn. */
export const PENDULUM_WRAITH = bossVariant(WRAITH, {
  id: 'pendulum-wraith',
  name: 'boss.pendulum-wraith',
  texture: 'pendulum-wraith',
  deathColor: 0xffa640,
  fade: { shownMs: 2400, hiddenMs: 1000, warnMs: 350 },
  attacks: [
    {
      kind: 'volley',
      minDistance: 0,
      farMs: 0,
      telegraphMs: 400,
      cooldownMs: 2200,
      count: 1,
      spreadDeg: 0,
      speed: 210,
      damage: 10,
      shots: 4,
      shotGapMs: 160,
    },
    {
      kind: 'volley',
      minDistance: 0,
      farMs: 0,
      telegraphMs: 500,
      cooldownMs: 2600,
      count: 8,
      spreadDeg: ringSpreadDeg(8),
      speed: 160,
      damage: 10,
    },
  ],
});

export const ENEMIES: readonly EnemyDef[] = [
  SHADOW,
  SHADOW_CASTER,
  BONES,
  LANTERN,
  SHADOW_COLOSSUS,
  BLOOD_COLOSSUS,
  BONE_KING,
  WRAITH,
  CRYSTAL_SENTINEL,
  CRYSTAL_SHARD,
  CRYSTAL_SEER,
  CRYSTAL_SPIKE,
  CRYSTAL_COLOSSUS,
  CRYSTAL_HYDRA,
  HYDRA_HEAD,
  CRYSTAL_MATRIARCH,
  SHARD_KING,
  AUTOMATON,
  AUTOMATON_GUNNER,
  CUCKOO,
  GEAR_COLOSSUS,
  CLOCKMAKER,
  BRASS_TITAN,
  PENDULUM_WRAITH,
];

/** Who can fill a normal room and how often; any of a phase's enemies can turn up on any of its floors. */
export interface RoomEnemy {
  def: EnemyDef;
  weight: number;
}

export const CRYPT_ENEMIES: readonly RoomEnemy[] = [
  { def: SHADOW, weight: 3 },
  { def: SHADOW_CASTER, weight: 1 },
  { def: BONES, weight: 2 },
  { def: LANTERN, weight: 1 },
];

export const GARDEN_ENEMIES: readonly RoomEnemy[] = [
  { def: CRYSTAL_SENTINEL, weight: 3 },
  { def: CRYSTAL_SEER, weight: 1 },
  { def: CRYSTAL_SPIKE, weight: 1 },
];

export const CLOCK_TOWER_ENEMIES: readonly RoomEnemy[] = [
  { def: AUTOMATON, weight: 3 },
  { def: AUTOMATON_GUNNER, weight: 1 },
  { def: CUCKOO, weight: 1 },
];

/** `count` enemy kinds from `table`, each rolled by weight. */
export function rollRoomEnemies(rng: Rng, count: number, table: readonly RoomEnemy[]): EnemyDef[] {
  if (table.length === 0) return [];
  return Array.from({ length: count }, () => pickWeighted(rng, table).def);
}

/** Floor 1 uses the base HP; each floor after adds a fixed share of it. */
export function enemyForDepth(def: EnemyDef, depth: number): EnemyDef {
  const floorsAfterFirst = Math.max(0, depth - 1);
  return { ...def, hp: Math.round(def.hp * (1 + def.hpGrowth * floorsAfterFirst)) };
}

/** True when a hit takes HP from above the fury threshold to below it. */
export function crossesFury(def: EnemyDef, hpBefore: number, hpAfter: number): boolean {
  if (!def.fury) return false;
  const threshold = def.hp * def.fury.hpShare;
  return hpBefore >= threshold && hpAfter < threshold;
}

export function findAttack<K extends EnemyAttack['kind']>(
  def: EnemyDef,
  kind: K,
): Extract<EnemyAttack, { kind: K }> | undefined {
  return def.attacks.find((a): a is Extract<EnemyAttack, { kind: K }> => a.kind === kind);
}

/** Every attack of `kind`, in the def's order. */
export function findAttacks<K extends EnemyAttack['kind']>(
  def: EnemyDef,
  kind: K,
): Extract<EnemyAttack, { kind: K }>[] {
  return def.attacks.filter((a): a is Extract<EnemyAttack, { kind: K }> => a.kind === kind);
}

/** Enemy art is a strip of square frames this wide. */
export const ENEMY_FRAME = 48;
export const ENEMY_WALK_FPS = 6;

/** Walk cycle over an art strip whose first frame is the idle pose: each step, then idle again. */
export function walkFrames(frames: number): number[] {
  if (frames < 3) return [];
  return Array.from({ length: frames - 1 }, (_, i) => [i + 1, 0]).flat();
}

export const walkAnimKey = (texture: string) => `walk:${texture}`;

/** What a revived enemy leaves on the floor; its strip loops like a walk. */
export const BONE_PILE = 'bone-pile';
export const BONE_PILE_FRAMES = 3;

/** What a bleeding enemy's trail leaves on the floor. */
export const BLOOD_PUDDLE = 'blood-puddle';
