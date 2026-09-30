export interface Point {
  x: number;
  y: number;
}

/** Keyhole outline, relative to the center of its round head. */
export interface KeyholeShape {
  headRadius: number;
  /** Where the stem leaves the head, in radians either side of straight down. */
  stemAngle: number;
  /** Half the stem's width at its base. */
  stemHalfWidth: number;
  /** Distance from the head's center down to the stem's base. */
  stemBottom: number;
}

/** A keyhole outline pushed `offset` px outward. The right side mirrors the left. */
export interface KeyholeOutline {
  radius: number;
  /** Angle where the head meets the stem's left edge (y down, so between π/2 and π). */
  leftJoinAngle: number;
  leftCorner: Point;
}

/** Keyhole behind the HUD portrait; the HP gauge traces it. */
export const PORTRAIT_KEYHOLE: KeyholeShape = { headRadius: 20, stemAngle: 0.45, stemHalfWidth: 10, stemBottom: 31 };

export function keyholeOutline(shape: KeyholeShape, offset: number): KeyholeOutline {
  const { headRadius, stemAngle, stemHalfWidth, stemBottom } = shape;
  const radius = headRadius + offset;

  const top = { x: -Math.sin(stemAngle) * headRadius, y: Math.cos(stemAngle) * headRadius };
  const edge = Math.hypot(-stemHalfWidth - top.x, stemBottom - top.y);
  const dir = { x: (-stemHalfWidth - top.x) / edge, y: (stemBottom - top.y) / edge };
  const normal = { x: -dir.y, y: dir.x };
  const origin = { x: top.x + normal.x * offset, y: top.y + normal.y * offset };

  // The offset edge leaves the offset head where it crosses the circle going down: the far root.
  const along = origin.x * dir.x + origin.y * dir.y;
  const exit = -along + Math.sqrt(along * along - (origin.x ** 2 + origin.y ** 2) + radius * radius);
  const join = { x: origin.x + dir.x * exit, y: origin.y + dir.y * exit };
  const baseY = stemBottom + offset;
  const toBase = (baseY - origin.y) / dir.y;

  return {
    radius,
    leftJoinAngle: Math.atan2(join.y, join.x),
    leftCorner: { x: origin.x + dir.x * toBase, y: baseY },
  };
}

/** Closed keyhole silhouette, for the portrait frame. */
export function traceKeyhole(ctx: CanvasRenderingContext2D, outline: KeyholeOutline, cx: number, cy: number) {
  const { radius, leftJoinAngle, leftCorner } = outline;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, Math.PI - leftJoinAngle, leftJoinAngle, true);
  ctx.lineTo(cx + leftCorner.x, cy + leftCorner.y);
  ctx.lineTo(cx - leftCorner.x, cy + leftCorner.y);
  ctx.closePath();
}

/**
 * Open path of the HP gauge: from level with the head's center on the right, counterclockwise
 * over the head, down the stem's left edge, then along the base and out to the right.
 */
export function traceGauge(
  ctx: CanvasRenderingContext2D,
  outline: KeyholeOutline,
  cx: number,
  cy: number,
  barLength: number,
) {
  const { radius, leftJoinAngle, leftCorner } = outline;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, leftJoinAngle, true);
  ctx.lineTo(cx + leftCorner.x, cy + leftCorner.y);
  ctx.lineTo(cx - leftCorner.x + barLength, cy + leftCorner.y);
}

export function gaugeLength(outline: KeyholeOutline, barLength: number): number {
  const { radius, leftJoinAngle, leftCorner } = outline;
  const join = { x: Math.cos(leftJoinAngle) * radius, y: Math.sin(leftJoinAngle) * radius };
  const arc = radius * (2 * Math.PI - leftJoinAngle);
  const stem = Math.hypot(leftCorner.x - join.x, leftCorner.y - join.y);
  return arc + stem - 2 * leftCorner.x + barLength;
}

/** "#rrggbb" for a 0xrrggbb color, for canvas styles. */
export const cssColor = (color: number) => `#${color.toString(16).padStart(6, '0')}`;
