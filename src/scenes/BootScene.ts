import Phaser from 'phaser';
import {
  BONE_PILE,
  BONE_PILE_FRAMES,
  ENEMIES,
  ENEMY_FRAME,
  ENEMY_WALK_FPS,
  walkAnimKey,
  walkFrames,
} from '../combat/enemies';
import { ITEMS, ITEM_ICON_FPS, ITEM_ICON_SIZE, itemTextureKey } from '../combat/items';
import { COLORS, ROOM_H, ROOM_W, TILE } from '../config';
import { PORTRAIT_KEYHOLE, WEAPON_SLOT, cssColor, keyholeOutline, traceKeyhole } from '../ui/hpGauge';
import { hasLaunchParams, parseLaunchParams, runFromParams } from '../core/run';
import {
  PIT_PARTS,
  PIT_PIECES,
  PIT_QUARTERS,
  type PitPiece,
  obstacleArtFiles,
  obstacleDef,
  pitFrame,
} from '../floor/obstacles';
import { PHASES } from '../floor/phases';
import { bakeFallbackArt } from './fallbackArt';
import { HERO_PORTRAIT_ART, HERO_SHEET, KEY_ART, KEY_ICON_ART, KEY_TITLE_ART } from '../entities/Player';
import { SWING_FX, SWING_FX_FRAME } from '../entities/keyArt';
import { SWING } from '../combat/swing';
import {
  HERO_FRAMES_PER_ROW,
  HERO_FRAME_H,
  HERO_FRAME_W,
  HERO_WALK_FPS,
  heroIdleFrame,
  heroWalkAnim,
} from '../entities/heroSheet';

/** Light around the player in a dark room: fully lit inside, fading out to the edge. */
const DARK_LIGHT_INNER = 50;
const DARK_LIGHT_OUTER = 120;

/** Drawn width of the portrait art; big enough that the face fills the keyhole's head. */
const PORTRAIT_ART_WIDTH = 52;
/** Point between the eyes in public/hero/portrait.png, centered in the keyhole's head. */
const PORTRAIT_ART_EYES = { x: 80, y: 92 };

/**
 * Placeholder art drawn with Graphics. Real art loads in preload() under its own
 * key, as item icons do (`item:<id>`); addItemIcon falls back to the baked orb.
 */
export class BootScene extends Phaser.Scene {
  /** Obstacle texture keys and their art files; a missing first look is baked, a missing variant falls back to it. */
  private readonly obstacleArt = obstacleArtFiles(PHASES.map((p) => p.id));

  constructor() {
    super('boot');
  }

  preload() {
    // Variants reuse their base's icon.
    const icon = { frameWidth: ITEM_ICON_SIZE, frameHeight: ITEM_ICON_SIZE };
    for (const item of ITEMS) if (!item.base) this.load.spritesheet(itemTextureKey(item), `items/${item.id}.png`, icon);
    this.load.image(KEY_ART, 'weapons/key.png');
    this.load.image(KEY_TITLE_ART, 'weapons/key-title.png');
    this.load.image(KEY_ICON_ART, 'weapons/key-icon.png');
    this.load.image(HERO_PORTRAIT_ART, 'hero/portrait.png');
    this.load.spritesheet(SWING_FX, 'weapons/swing.png', {
      frameWidth: SWING_FX_FRAME.width,
      frameHeight: SWING_FX_FRAME.height,
    });
    this.load.spritesheet(HERO_SHEET, 'hero/walk.png', { frameWidth: HERO_FRAME_W, frameHeight: HERO_FRAME_H });
    const frame = { frameWidth: ENEMY_FRAME, frameHeight: ENEMY_FRAME };
    for (const def of ENEMIES) if (def.frames) this.load.spritesheet(def.texture, `enemies/${def.texture}.png`, frame);
    this.load.spritesheet(BONE_PILE, `enemies/${BONE_PILE}.png`, frame);
    for (const [key, file] of this.obstacleArt) this.load.image(key, file);
  }

  /** Prepare animations and baked textures, including missing-art fallbacks, before launching the game scenes. */
  create() {
    // The hero and key art are smooth downscales, not native pixel art: nearest sampling would break them up.
    for (const key of [KEY_ART, KEY_TITLE_ART, KEY_ICON_ART, HERO_SHEET, SWING_FX]) {
      if (this.textures.exists(key)) this.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
    }
    this.createHeroAnims();
    this.createEnemyAnims();
    this.createSwingAnim();
    this.createItemAnims();

    bakeFallbackArt(this);
    this.slicePit();
    this.bakePortraitFrame();
    this.bakeWeaponSlot();
    this.bakeDarkness();

    this.launch();
  }

  /**
   * Twice the room in size, so centered on the player it covers the room from anywhere in it.
   * The hole is soft-edged, drawn on a 2D canvas like the portrait frame.
   */
  private bakeDarkness() {
    const w = ROOM_W * 2;
    const h = ROOM_H * 2;
    const texture = this.textures.createCanvas('darkness', w, h)!;
    const ctx = texture.context;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.96)';
    ctx.fillRect(0, 0, w, h);
    const light = ctx.createRadialGradient(w / 2, h / 2, DARK_LIGHT_INNER, w / 2, h / 2, DARK_LIGHT_OUTER);
    light.addColorStop(0, 'rgba(0, 0, 0, 1)');
    light.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, DARK_LIGHT_OUTER, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    texture.refresh();
  }

  /**
   * Keyhole behind the HUD portrait, drawn on a 2D canvas so its curves stay antialiased
   * (pixelArt turns that off for Graphics). The HUD's HP gauge traces the same outline.
   * With the hero art loaded, the face is drawn inside it, clipped to the keyhole.
   */
  /** Rounded square for the equipped key, on a 2D canvas like the portrait frame. */
  private bakeWeaponSlot() {
    const { size, cornerRadius } = WEAPON_SLOT;
    const pad = 2;
    const texture = this.textures.createCanvas('weapon-slot', size + pad * 2, size + pad * 2)!;
    const ctx = texture.context;
    ctx.beginPath();
    ctx.roundRect(pad, pad, size, size, cornerRadius);
    ctx.fillStyle = cssColor(COLORS.hpBack);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = cssColor(COLORS.hpFrame);
    ctx.stroke();
    texture.refresh();
  }

  private bakePortraitFrame() {
    const { headRadius, stemBottom } = PORTRAIT_KEYHOLE;
    const cx = headRadius + 2;
    const cy = headRadius + 2;
    const texture = this.textures.createCanvas('portrait-frame', cx * 2, cy + stemBottom + 2)!;
    const ctx = texture.context;
    traceKeyhole(ctx, keyholeOutline(PORTRAIT_KEYHOLE, 0), cx, cy);
    ctx.fillStyle = cssColor(COLORS.hpBack);
    ctx.fill();
    this.drawHeroPortrait(ctx, cx, cy);
    traceKeyhole(ctx, keyholeOutline(PORTRAIT_KEYHOLE, 0), cx, cy);
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = cssColor(COLORS.hpFrame);
    ctx.stroke();
    texture.refresh();
  }

  /** One walk loop per sheet row; each row's first frame is the idle pose, so the loop skips it. */
  /** The whole sheet plays once over the length of a swing. */
  private createSwingAnim() {
    if (!this.textures.exists(SWING_FX)) return;
    const frames = this.anims.generateFrameNumbers(SWING_FX);
    this.anims.create({ key: SWING_FX, frames, frameRate: (frames.length * 1000) / SWING.durationMs });
  }

  private createHeroAnims() {
    if (!this.textures.exists(HERO_SHEET)) return;
    const rows = this.textures.get(HERO_SHEET).frameTotal / HERO_FRAMES_PER_ROW;
    for (let row = 0; row < Math.floor(rows); row++) {
      const first = heroIdleFrame(row) + 1;
      this.anims.create({
        key: heroWalkAnim(row),
        frames: this.anims.generateFrameNumbers(HERO_SHEET, { start: first, end: first + HERO_FRAMES_PER_ROW - 2 }),
        frameRate: HERO_WALK_FPS,
        repeat: -1,
      });
    }
  }

  /** An icon strip loops under its texture key; a single-frame icon gets no animation. */
  private createItemAnims() {
    for (const item of ITEMS) if (!item.base) this.createItemLoop(itemTextureKey(item));
  }

  private createItemLoop(key: string) {
    if (!this.textures.exists(key)) return;
    // frameTotal counts Phaser's whole-image __BASE frame too.
    if (this.textures.get(key).frameTotal <= 2) return;
    this.anims.create({ key, frames: this.anims.generateFrameNumbers(key), frameRate: ITEM_ICON_FPS, repeat: -1 });
  }

  private createEnemyAnims() {
    for (const def of ENEMIES) this.createStripLoop(def.texture, def.frames ?? 1);
    this.createStripLoop(BONE_PILE, BONE_PILE_FRAMES);
  }

  /** Cuts the pit art, loaded or baked, into quarter pieces, so touching pits join up (see `pitPiece`). */
  private slicePit() {
    const half = TILE / 2;
    const source = this.textures.get(obstacleDef('pit').texture).getSourceImage() as CanvasImageSource;
    const sheet = this.textures.createCanvas(PIT_PARTS, half * PIT_PIECES.length * 4, half)!;
    const cuts = PIT_PIECES.flatMap((piece) => PIT_QUARTERS.map(([dx, dy]) => ({ piece, dx, dy })));
    for (const [i, { piece, dx, dy }] of cuts.entries()) {
      drawPitPiece(sheet.context, source, piece, dx, dy, i * half);
      sheet.add(pitFrame(piece, dx, dy), 0, i * half, 0, half, half);
    }
    sheet.refresh();
  }

  private createStripLoop(texture: string, frameCount: number) {
    const frames = walkFrames(frameCount);
    const key = walkAnimKey(texture);
    if (frames.length === 0 || !this.textures.exists(texture) || this.anims.exists(key)) return;
    // A missing strip loads as a single frame: no walk to play.
    if (this.textures.get(texture).frameTotal < frameCount) return;
    this.anims.create({
      key,
      frames: frames.map((frame) => ({ key: texture, frame })),
      frameRate: ENEMY_WALK_FPS,
      repeat: -1,
    });
  }

  private drawHeroPortrait(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
    if (!this.textures.exists(HERO_PORTRAIT_ART)) return;
    const art = this.textures.get(HERO_PORTRAIT_ART).getSourceImage() as HTMLImageElement;
    const scale = PORTRAIT_ART_WIDTH / art.width;
    ctx.save();
    traceKeyhole(ctx, keyholeOutline(PORTRAIT_KEYHOLE, 0), cx, cy);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const x = cx - PORTRAIT_ART_EYES.x * scale;
    const y = cy - PORTRAIT_ART_EYES.y * scale;
    ctx.drawImage(art, x, y, art.width * scale, art.height * scale);
    ctx.restore();
  }

  /** URL params jump straight into a run, skipping the title. */
  private launch() {
    const params = parseLaunchParams(
      location.search,
      ITEMS.map((i) => i.id),
    );
    if (!hasLaunchParams(params)) {
      this.scene.start('title');
      return;
    }
    this.scene.start('game', runFromParams(params));
  }
}

/** Rock left in the corner where an L of pits turns around a floor tile. */
const PIT_NUB = 11;

/**
 * One quarter of a pit tile, taken from the whole-tile art: its own corner for a lone corner,
 * the middle of an edge for a rim that runs on, the middle for open hole.
 */
function drawPitPiece(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  piece: PitPiece,
  dx: number,
  dy: number,
  x: number,
) {
  const half = TILE / 2;
  const mid = TILE / 4;
  const near = (d: number) => (d < 0 ? 0 : half);
  const from: Record<PitPiece, [number, number]> = {
    outer: [near(dx), near(dy)],
    rimX: [near(dx), mid],
    rimY: [mid, near(dy)],
    inner: [mid, mid],
    fill: [mid, mid],
  };
  const [sx, sy] = from[piece];
  ctx.drawImage(source, sx, sy, half, half, x, 0, half, half);
  if (piece !== 'inner') return;
  const cornerX = dx < 0 ? 0 : TILE - PIT_NUB;
  const cornerY = dy < 0 ? 0 : TILE - PIT_NUB;
  const toX = x + (dx < 0 ? 0 : half - PIT_NUB);
  const toY = dy < 0 ? 0 : half - PIT_NUB;
  ctx.drawImage(source, cornerX, cornerY, PIT_NUB, PIT_NUB, toX, toY, PIT_NUB, PIT_NUB);
}
