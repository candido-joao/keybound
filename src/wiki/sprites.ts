import { ENEMY_FRAME, ENEMY_WALK_FPS, type EnemyDef, walkFrames } from '../combat/enemies';
import { fadeState } from '../combat/behaviors';
import { PLACEHOLDER_BODY, placeholderColors } from '../combat/placeholderArt';
import { type Item, baseId } from '../combat/stats';

/** Art is drawn at whole multiples so the pixels stay square. */
const ZOOM = 2;

const FADE_OPACITY = { shown: 1, fading: 0.55, hidden: 0.12, appearing: 0.55 } as const;

/** Prefix a public asset path with Vite’s deployment base so subpath hosting works. */
const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`;

/** Format a numeric RGB color as a six-digit CSS hex value, preserving leading zeroes. */
const css = (color: number) => `#${color.toString(16).padStart(6, '0')}`;

interface Animated {
  canvas: HTMLCanvasElement;
  def: EnemyDef;
  image?: HTMLImageElement;
}

const animated: Animated[] = [];
const started = performance.now();

/** The enemy's art at its idle frame; it walks, and fades if it does, unless the reader asked for less motion. */
export function enemySprite(def: EnemyDef): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.className = 'sprite';
  canvas.width = ENEMY_FRAME * ZOOM;
  canvas.height = ENEMY_FRAME * ZOOM;
  canvas.setAttribute('aria-hidden', 'true');
  const entry: Animated = { canvas, def };
  animated.push(entry);
  if (!def.frames) {
    drawPlaceholder(canvas, def);
    return canvas;
  }
  const image = new Image();
  image.onload = () => {
    entry.image = image;
    drawFrame(entry, 0);
  };
  image.onerror = () => drawPlaceholder(canvas, def);
  image.src = asset(`enemies/${def.texture}.png`);
  return canvas;
}

/** Draw a zero-based frame from a horizontal enemy strip without smoothing; skip unavailable images or contexts. */
function drawFrame({ canvas, image }: Animated, frame: number) {
  const ctx = canvas.getContext('2d');
  if (!ctx || !image) return;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, frame * ENEMY_FRAME, 0, ENEMY_FRAME, ENEMY_FRAME, 0, 0, canvas.width, canvas.height);
}

/** The same stand-in body the game bakes, centered in a frame-sized box. */
function drawPlaceholder(canvas: HTMLCanvasElement, def: EnemyDef) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { size, body, horns, eyes, eyeRadius } = PLACEHOLDER_BODY;
  const colors = placeholderColors(def);
  const scale = (ENEMY_FRAME / size) * ZOOM * 0.85;
  ctx.save();
  ctx.translate((canvas.width - size * scale) / 2, (canvas.height - size * scale) / 2);
  ctx.scale(scale, scale);
  ctx.fillStyle = css(colors.body);
  ctx.beginPath();
  ctx.ellipse(body.x, body.y, body.w / 2, body.h / 2, 0, 0, Math.PI * 2);
  for (const h of horns) {
    ctx.moveTo(h[0], h[1]);
    ctx.lineTo(h[2], h[3]);
    ctx.lineTo(h[4], h[5]);
    ctx.closePath();
  }
  ctx.fill();
  ctx.fillStyle = css(colors.eye);
  for (const [x, y] of eyes) {
    ctx.beginPath();
    ctx.arc(x, y, eyeRadius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Load the base item’s decorative icon, replacing a failed image with an orb in the item’s color. */
export function itemIcon(item: Item): HTMLImageElement {
  const img = document.createElement('img');
  img.className = 'icon';
  img.alt = '';
  img.src = asset(`items/${baseId(item)}.png`);
  img.onerror = () => {
    img.replaceWith(itemOrb(item));
  };
  return img;
}

/** The game's fallback for a missing icon: an orb in the item's color. */
function itemOrb(item: Item): HTMLElement {
  const orb = document.createElement('span');
  orb.className = 'icon orb';
  orb.style.background = css(item.color);
  return orb;
}

/** Load a phase screenshot lazily with supplied alternative text, removing it if loading fails. */
export function phaseShot(phaseId: string, alt: string): HTMLImageElement {
  const img = document.createElement('img');
  img.className = 'shot';
  img.alt = alt;
  img.loading = 'lazy';
  img.src = asset(`wiki/${phaseId}.png`);
  img.onerror = () => img.remove();
  return img;
}

/** Drops sprites that left the page, after a re-render. */
export function forgetDetached() {
  for (let i = animated.length - 1; i >= 0; i--) if (!animated[i].canvas.isConnected) animated.splice(i, 1);
}

/** One timer for every sprite on the page, at the game's walk speed. */
export function startAnimation() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let tick = 0;
  setInterval(() => {
    tick++;
    const elapsed = performance.now() - started;
    for (const entry of animated) step(entry, tick, elapsed);
  }, 1000 / ENEMY_WALK_FPS);
}

/** Advance one sprite using a walk-cycle tick and elapsed milliseconds for its fade state. */
function step(entry: Animated, tick: number, elapsed: number) {
  const { def } = entry;
  const frames = walkFrames(def.frames ?? 1);
  if (frames.length > 0 && entry.image) drawFrame(entry, frames[tick % frames.length]);
  if (def.fade) entry.canvas.style.opacity = String(FADE_OPACITY[fadeState(def.fade, elapsed)]);
}
