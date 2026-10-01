/** Hero walk sheet in public/hero/walk.png: one row per direction, an idle frame then the walk cycle. */
export const HERO_FRAME_W = 34;
export const HERO_FRAME_H = 48;
export const HERO_FRAMES_PER_ROW = 5;
export const HERO_WALK_FPS = 8;

/** Sheet rows top to bottom face S, SE, E, NE, N, NW, W, SW; octants count clockwise from east. */
const ROW_BY_OCTANT = [2, 1, 0, 7, 6, 5, 4, 3];

/** Sheet row facing `angle` (radians, 0 = east, y down), snapped to the nearest of 8 directions. */
export function heroRow(angle: number): number {
  const octant = Math.round(angle / (Math.PI / 4));
  return ROW_BY_OCTANT[((octant % 8) + 8) % 8];
}

export const heroIdleFrame = (row: number) => row * HERO_FRAMES_PER_ROW;
export const heroWalkAnim = (row: number) => `hero-walk-${row}`;
