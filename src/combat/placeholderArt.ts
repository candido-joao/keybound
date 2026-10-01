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

/** The Colossi keep this body until their own art arrives. */
const COLOSSUS_COLORS: Record<string, PlaceholderColors> = {
  'shadow-colossus': { body: COLORS.shadow, eye: COLORS.shadowEye },
  'crystal-colossus': { body: 0x173a40, eye: 0x9ff7ff },
  'gear-colossus': { body: 0x3a2a1a, eye: 0xffa640 },
};

/** Any other enemy whose art is missing still shows up, in its death color. */
export function placeholderColors(def: Pick<EnemyDef, 'texture' | 'deathColor'>): PlaceholderColors {
  return COLOSSUS_COLORS[def.texture] ?? { body: def.deathColor, eye: 0xffffff };
}
