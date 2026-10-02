import { ENEMY_FRAME, ENEMY_WALK_FPS } from '../combat/enemies';
import { SWING } from '../combat/swing';
import { HERO_FRAMES_PER_ROW, HERO_FRAME_H, HERO_FRAME_W, heroIdleFrame, heroRow } from '../entities/heroSheet';
import { KEY_ART_PIVOT, SWING_FX_FRAME } from '../entities/keyArt';

/** The scene in game px; the canvas doubles it. */
const VIEW_W = 200;
const VIEW_H = 140;
const ZOOM = 2;
/** One swing per loop, the rest is the hit settling. */
const LOOP_MS = 1500;
const AIM = 0;
const HERO = { x: 62, y: 70 };
/** Where the game holds the key: off the body toward the aim, at hip height. */
const GRIP = { x: HERO.x + 6, y: HERO.y + 7 };
const ENEMY_REST = { x: HERO.x + 50, y: HERO.y };
const KNOCK_PX = 16;
const KNOCK_MS = 180;
const RETURN_FROM_MS = 500;
const RETURN_MS = 500;
const SWING_FX_FRAMES = 7;
/** A still mid-swing for readers who asked for less motion. */
const STILL_MS = 90;

const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`;

interface Art {
  hero: HTMLImageElement;
  key: HTMLImageElement;
  fx: HTMLImageElement;
  enemy: HTMLImageElement;
}

/** Hero, key, swing crescent and a Shadow on a loop: what one swing looks like in the game. */
export function swingDemo(label: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.className = 'demo';
  canvas.width = VIEW_W * ZOOM;
  canvas.height = VIEW_H * ZOOM;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', label);
  const art: Art = {
    hero: load('hero/walk.png'),
    key: load('weapons/key.png'),
    fx: load('weapons/swing.png'),
    enemy: load('enemies/shadow.png'),
  };
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const started = performance.now();
  const frame = () => {
    // Re-rendering the page (a language change) drops this canvas; its loop ends with it.
    if (!canvas.isConnected && performance.now() - started > 1000) return;
    draw(canvas, art, still ? STILL_MS : (performance.now() - started) % LOOP_MS);
    if (!still) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  if (still) for (const image of Object.values(art)) image.addEventListener('load', frame);
  return canvas;
}

function load(path: string): HTMLImageElement {
  const image = new Image();
  image.src = asset(path);
  return image;
}

const ready = (image: HTMLImageElement) => image.complete && image.naturalWidth > 0;

function draw(canvas: HTMLCanvasElement, art: Art, t: number) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(ZOOM, 0, 0, ZOOM, 0, 0);
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  drawFan(ctx);
  drawEnemy(ctx, art.enemy, t);
  drawKey(ctx, art.key, t);
  drawHero(ctx, art.hero);
  drawCrescent(ctx, art.fx, t);
}

/** The hitbox, faint: everything inside it is hit. */
function drawFan(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  ctx.moveTo(HERO.x, HERO.y);
  ctx.arc(HERO.x, HERO.y, SWING.reach, AIM - SWING.arc / 2, AIM + SWING.arc / 2);
  ctx.closePath();
  ctx.fillStyle = 'rgb(127 232 255 / 0.1)';
  ctx.fill();
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = 'rgb(127 232 255 / 0.45)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawHero(ctx: CanvasRenderingContext2D, image: HTMLImageElement) {
  if (!ready(image)) return;
  const index = heroIdleFrame(heroRow(AIM));
  const sx = (index % HERO_FRAMES_PER_ROW) * HERO_FRAME_W;
  const sy = Math.floor(index / HERO_FRAMES_PER_ROW) * HERO_FRAME_H;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(
    image,
    sx,
    sy,
    HERO_FRAME_W,
    HERO_FRAME_H,
    HERO.x - HERO_FRAME_W / 2,
    HERO.y - HERO_FRAME_H / 2,
    HERO_FRAME_W,
    HERO_FRAME_H,
  );
}

/** Same sweep as the game: fast out of the wind-up, settling at the fan's far edge. */
function swingAngle(t: number): number {
  if (t >= SWING.durationMs) return AIM;
  const eased = 1 - (1 - t / SWING.durationMs) ** 3;
  return AIM + (eased * 2 - 1) * (SWING.arc / 2);
}

/** Behind the hero, as in the game: the blade shows past the body. */
function drawKey(ctx: CanvasRenderingContext2D, image: HTMLImageElement, t: number) {
  if (!ready(image)) return;
  ctx.save();
  ctx.translate(GRIP.x, GRIP.y);
  ctx.rotate(swingAngle(t));
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(image, -image.width * KEY_ART_PIVOT, -image.height / 2);
  ctx.restore();
}

/** The crescent rides the fan's far edge, one sheet frame per slice of the swing. */
function drawCrescent(ctx: CanvasRenderingContext2D, image: HTMLImageElement, t: number) {
  if (!ready(image) || t >= SWING.durationMs) return;
  const frame = Math.min(SWING_FX_FRAMES - 1, Math.floor((t / SWING.durationMs) * SWING_FX_FRAMES));
  const scale = (SWING.reach * 2) / SWING_FX_FRAME.height;
  const ahead = SWING.reach - (SWING_FX_FRAME.width / 2) * scale;
  const w = SWING_FX_FRAME.width * scale;
  const h = SWING_FX_FRAME.height * scale;
  ctx.save();
  ctx.translate(HERO.x + Math.cos(AIM) * ahead, HERO.y + Math.sin(AIM) * ahead);
  ctx.rotate(AIM);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(
    image,
    frame * SWING_FX_FRAME.width,
    0,
    SWING_FX_FRAME.width,
    SWING_FX_FRAME.height,
    -w / 2,
    -h / 2,
    w,
    h,
  );
  ctx.restore();
}

/** Shoved back on the hit, then drifting in again for the next swing. */
function knockOffset(t: number): number {
  if (t < KNOCK_MS) return KNOCK_PX * (1 - (1 - t / KNOCK_MS) ** 2);
  if (t < RETURN_FROM_MS) return KNOCK_PX;
  return KNOCK_PX * Math.max(0, 1 - (t - RETURN_FROM_MS) / RETURN_MS);
}

function drawEnemy(ctx: CanvasRenderingContext2D, image: HTMLImageElement, t: number) {
  if (!ready(image)) return;
  const frames = Math.max(1, Math.floor(image.width / ENEMY_FRAME));
  const frame = Math.floor((performance.now() / 1000) * ENEMY_WALK_FPS) % frames;
  const x = ENEMY_REST.x + knockOffset(t);
  ctx.imageSmoothingEnabled = false;
  // A white flash on the hit, as enemies flash in the game.
  ctx.filter = t < 70 ? 'brightness(3)' : 'none';
  ctx.drawImage(
    image,
    frame * ENEMY_FRAME,
    0,
    ENEMY_FRAME,
    ENEMY_FRAME,
    x - ENEMY_FRAME / 2,
    ENEMY_REST.y - ENEMY_FRAME / 2,
    ENEMY_FRAME,
    ENEMY_FRAME,
  );
  ctx.filter = 'none';
}
