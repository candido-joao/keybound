import { COLORS } from '../config';
import type { EnemyDef } from './enemies';

/**
 * Stand-in body for an enemy with no art yet, on a square of `size` px: BootScene bakes it for
 * the game and the wiki draws the same one. The eyes are where a boss's warning glows.
 */
export const PLACEHOLDER_BODY = {
  size: 32,
  body: { x: 16, y: 20, w: 26, h: 22 },
  horns: [
    [6, 14, 4, 0, 12, 10],
    [26, 14, 28, 0, 20, 10],
  ],
  eyes: [
    [11, 17],
    [21, 17],
  ],
  eyeRadius: 3.2,
} as const;

export interface PlaceholderColors {
  body: number;
  eye: number;
}

/** The bosses keep this body until their own art arrives; a variant only changes the colors. */
const BOSS_COLORS: Record<string, PlaceholderColors> = {
  'shadow-colossus': { body: COLORS.shadow, eye: COLORS.shadowEye },
  'blood-colossus': { body: 0x3d0b0b, eye: 0xff5a3c },
  'bone-king': { body: 0x8a7f5e, eye: 0xff4f4f },
  wraith: { body: 0x1f3d2c, eye: 0x9cffb8 },
  'crystal-colossus': { body: 0x173a40, eye: 0x9ff7ff },
  'crystal-hydra': { body: 0x1c5560, eye: 0xd8fbff },
  'crystal-matriarch': { body: 0x4a3a6e, eye: 0xf0d8ff },
  'shard-king': { body: 0x2f6f78, eye: 0xffffff },
  'gear-colossus': { body: 0x3a2a1a, eye: 0xffa640 },
  clockmaker: { body: 0x5a3220, eye: 0xffe08a },
  'brass-titan': { body: 0x7a5a26, eye: 0xff7a2a },
  'pendulum-wraith': { body: 0x4a3410, eye: 0xffd36a },
};

const PLACEHOLDER_EYES = PLACEHOLDER_BODY.eyes.map(([x, y]) => ({
  x: x - PLACEHOLDER_BODY.size / 2,
  y: y - PLACEHOLDER_BODY.size / 2,
}));

/** Whether the texture is the def's own art rather than the baked placeholder. */
const hasArt = (def: Pick<EnemyDef, 'frameSize'>, frameWidth: number) => frameWidth === def.frameSize;

/** The sprite's scale: `scale` as is, or, for art with its own frame size, so it shows at the placeholder's size times `scale`. */
export function spriteScale(def: Pick<EnemyDef, 'scale' | 'frameSize'>, frameWidth: number): number {
  if (!def.frameSize) return def.scale;
  return (def.scale * PLACEHOLDER_BODY.size) / frameWidth;
}

/** Where the warning glow sits, in texture px from the center: on the placeholder's eyes; own art has none. */
export function eyeSpots(def: Pick<EnemyDef, 'frameSize'>, frameWidth: number): readonly { x: number; y: number }[] {
  return hasArt(def, frameWidth) ? [] : PLACEHOLDER_EYES;
}

/** Any other enemy whose art is missing still shows up, in its death color. */
export function placeholderColors(def: Pick<EnemyDef, 'texture' | 'deathColor'>): PlaceholderColors {
  return BOSS_COLORS[def.texture] ?? { body: def.deathColor, eye: 0xffffff };
}
