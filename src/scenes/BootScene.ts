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
import { PLACEHOLDER_BODY, placeholderColors } from '../combat/placeholderArt';
import { ITEMS, itemTextureKey } from '../combat/items';
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
  obstacleTexture,
  pitFrame,
} from '../floor/obstacles';
import { PHASES, floorTexture, wallTexture } from '../floor/phases';
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
    for (const item of ITEMS) if (!item.base) this.load.image(itemTextureKey(item), `items/${item.id}.png`);
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

    const g = this.make.graphics({}, false);
    const bake = (key: string, w: number, h: number, draw: () => void) => {
      g.clear();
      draw();
      g.generateTexture(key, w, h);
    };
    // Obstacle art that loaded keeps its key; only the missing ones are drawn.
    const bakeMissing = (key: string, w: number, h: number, draw: () => void) => {
      if (!this.textures.exists(key)) bake(key, w, h, draw);
    };

    for (const phase of PHASES) {
      const { floor, floorAlt, wall, wallEdge } = phase.palette;
      bake(floorTexture(phase), TILE, TILE, () => {
        g.fillStyle(floor).fillRect(0, 0, TILE, TILE);
        g.fillStyle(floorAlt).fillRect(2, 2, TILE - 4, TILE - 4);
        g.fillStyle(floor).fillRect(TILE / 2 - 1, 2, 2, TILE - 4);
      });
      bake(wallTexture(phase), TILE, TILE, () => {
        g.fillStyle(wall).fillRect(0, 0, TILE, TILE);
        g.lineStyle(2, wallEdge).strokeRect(1, 1, TILE - 2, TILE - 2);
        g.fillStyle(wallEdge).fillRect(6, TILE / 2 - 1, TILE - 12, 2);
      });
      const drawRock = () => {
        g.fillStyle(0x000000, 0.35).fillEllipse(TILE / 2, TILE - 9, TILE - 10, 12);
        g.fillStyle(wall).fillRoundedRect(5, 6, TILE - 10, TILE - 13, 10);
        g.fillStyle(wallEdge).fillRoundedRect(10, 9, TILE - 24, 9, 4);
        g.lineStyle(2, wallEdge).strokeRoundedRect(5, 6, TILE - 10, TILE - 13, 10);
      };
      bakeMissing(obstacleTexture(obstacleDef('rock'), phase.id), TILE, TILE, drawRock);
      bakeMissing(obstacleTexture(obstacleDef('cracked'), phase.id), TILE, TILE, () => {
        drawRock();
        // A zigzag split down the face: this one gives way to a swing.
        g.lineStyle(3, 0x0c0a16).beginPath();
        g.moveTo(TILE / 2 - 2, 8)
          .lineTo(TILE / 2 + 5, 17)
          .lineTo(TILE / 2 - 4, 25)
          .lineTo(TILE / 2 + 3, TILE - 9);
        g.moveTo(TILE / 2 - 4, 25).lineTo(12, 30);
        g.strokePath();
      });
    }

    bakeMissing(obstacleDef('pit').texture, TILE, TILE, () => {
      g.fillStyle(0x000000, 0.45).fillRoundedRect(2, 2, TILE - 4, TILE - 4, 8);
      g.fillStyle(0x030207).fillRoundedRect(5, 5, TILE - 10, TILE - 10, 7);
      g.fillStyle(0x000000).fillRoundedRect(9, 12, TILE - 18, TILE - 19, 5);
    });
    this.slicePit();

    bakeMissing(obstacleDef('spikes').texture, TILE, TILE, () => {
      // No plate: staggered rows of points coming straight out of the floor, each over its hole.
      for (let row = 0; row < 4; row++) drawSpikeRow(g, row);
    });

    bake('door', TILE, TILE, () => {
      g.fillStyle(0x0c0a16).fillRect(0, 0, TILE, TILE);
      g.fillStyle(COLORS.door).fillRect(4, 4, TILE - 8, TILE - 8);
      g.fillStyle(0x5c4719).fillRect(TILE / 2 - 2, 4, 4, TILE - 8);
      g.fillStyle(COLORS.shadowEye).fillCircle(TILE / 2, TILE / 2, 5);
    });

    // Iron bands and a keyhole: only a key swing opens it.
    bake('door-locked', TILE, TILE, () => {
      g.fillStyle(0x0c0a16).fillRect(0, 0, TILE, TILE);
      g.fillStyle(COLORS.door).fillRect(4, 4, TILE - 8, TILE - 8);
      g.fillStyle(0x6b6f80)
        .fillRect(4, 11, TILE - 8, 5)
        .fillRect(4, TILE - 16, TILE - 8, 5);
      g.fillStyle(0xcfd6e6).fillCircle(TILE / 2, TILE / 2 - 2, 6);
      g.fillStyle(0x0c0a16)
        .fillCircle(TILE / 2, TILE / 2 - 3, 2.5)
        .fillTriangle(TILE / 2 - 2.5, TILE / 2 - 2, TILE / 2 + 2.5, TILE / 2 - 2, TILE / 2, TILE / 2 + 4);
    });

    bake('player', 32, 36, () => {
      // Cloak, head, spiky hair.
      g.fillStyle(0x2f3f8f).fillRoundedRect(6, 18, 20, 16, 5);
      g.fillStyle(0xf2d3b3).fillCircle(16, 13, 9);
      g.fillStyle(0x5a3a22)
        .fillTriangle(6, 10, 12, 0, 16, 8)
        .fillTriangle(12, 8, 20, -1, 24, 9)
        .fillTriangle(20, 9, 28, 3, 26, 13);
      g.fillStyle(0x1b1830).fillRect(12, 13, 3, 3).fillRect(18, 13, 3, 3);
    });

    bake('key', 44, 14, () => {
      // Handle guard, shaft, bit at the tip.
      g.fillStyle(0xf2c14e).fillRoundedRect(0, 1, 9, 12, 3);
      g.fillStyle(0xcfd6e6).fillRect(9, 5, 28, 4);
      g.fillStyle(0xcfd6e6).fillRect(33, 5, 4, 9).fillRect(38, 5, 4, 9).fillRect(36, 10, 6, 4);
      g.fillStyle(COLORS.bolt).fillCircle(4, 7, 2);
    });

    bake('bolt', 14, 14, () => {
      g.fillStyle(COLORS.bolt, 0.45).fillCircle(7, 7, 7);
      g.fillStyle(COLORS.bolt).fillCircle(7, 7, 4.5);
      g.fillStyle(COLORS.boltCore).fillCircle(7, 7, 2.5);
    });

    // Enemies without art yet, the Colossi among them, get the placeholder body.
    const { size } = PLACEHOLDER_BODY;
    for (const def of ENEMIES) {
      if (this.textures.exists(def.texture)) continue;
      const colors = placeholderColors(def);
      bake(def.texture, size, size, () => drawPlaceholder(g, colors));
    }
    if (!this.textures.exists(BONE_PILE)) {
      bake(BONE_PILE, 32, 32, () => {
        g.fillStyle(0xb8ab84).fillEllipse(16, 24, 26, 10);
        g.fillStyle(0xd8cfb0).fillCircle(16, 18, 6);
      });
    }

    bake('particle', 8, 8, () => {
      g.fillStyle(0xffffff).fillCircle(4, 4, 4);
    });

    bake('pedestal', 40, 28, () => {
      g.fillStyle(0x4b4470).fillRect(4, 10, 32, 18);
      g.fillStyle(0x6d64a0).fillRect(0, 6, 40, 6);
    });

    // Fallback for items whose PNG is missing; tinted with the item's color.
    bake('item', 24, 24, () => {
      g.fillStyle(0xffffff).fillCircle(12, 12, 10);
      g.fillStyle(0xffffff, 0.4).fillCircle(12, 12, 12);
    });

    // Warm and dark, unlike the player's cyan bolts, so incoming shots read at a glance.
    bake('hostile-orb', 14, 14, () => {
      g.fillStyle(0xe8435a, 0.35).fillCircle(7, 7, 7);
      g.fillStyle(0xb02a6a).fillCircle(7, 7, 4.5);
      g.fillStyle(0xffc4d6).fillCircle(7, 7, 2);
    });

    bake('drop-currency', 14, 14, () => {
      g.fillStyle(0x8a6d2f).fillCircle(7, 7, 7);
      g.fillStyle(COLORS.treasure).fillCircle(7, 7, 5.5);
      g.fillStyle(0xfff3c4).fillRect(5, 4, 2, 5);
    });

    bake('drop-heal', 14, 14, () => {
      g.fillStyle(COLORS.hp, 0.4).fillCircle(7, 7, 7);
      g.fillStyle(COLORS.hp).fillCircle(7, 7, 5);
      g.fillStyle(0xffd0d8).fillCircle(5, 5, 1.8);
    });

    bake('portal', 56, 56, () => {
      g.fillStyle(0x000000).fillCircle(28, 28, 26);
      g.lineStyle(4, COLORS.bolt).strokeCircle(28, 28, 24);
      g.lineStyle(2, 0xc77dff).strokeCircle(28, 28, 16);
    });

    bake('altar', 40, 36, () => {
      g.fillStyle(0x3a2a3a).fillRect(2, 14, 36, 22);
      g.fillStyle(0x54404f).fillRect(0, 10, 40, 6);
      g.fillStyle(0x8e1b2e).fillRect(6, 11, 28, 3);
      g.fillStyle(0xe8435a).fillCircle(20, 6, 4).fillTriangle(16, 5, 24, 5, 20, -2);
    });

    this.bakePortraitFrame();
    this.bakeWeaponSlot();
    this.bakeDarkness();

    g.destroy();
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

/** One staggered row of spike points, each over its hole. */
function drawSpikeRow(g: Phaser.GameObjects.Graphics, row: number) {
  const shift = row % 2 === 0 ? 0 : 7;
  const y = 14 + row * 10;
  for (let x = 10 + shift; x < TILE - 4; x += 14) {
    g.fillStyle(0x07060d, 0.7).fillEllipse(x, y, 11, 4);
    g.fillStyle(0x6b6f80).fillTriangle(x - 4, y, x + 4, y, x, y - 12);
    g.fillStyle(0xcfd6e6).fillTriangle(x - 1, y - 1, x + 1, y - 1, x, y - 11);
  }
}

/** Draws the fallback body used for enemies that have no art yet. */
function drawPlaceholder(g: Phaser.GameObjects.Graphics, colors: { body: number; eye: number }) {
  const { body, horns, eyes, eyeRadius } = PLACEHOLDER_BODY;
  g.fillStyle(colors.body).fillEllipse(body.x, body.y, body.w, body.h);
  for (const h of horns) g.fillTriangle(h[0], h[1], h[2], h[3], h[4], h[5]);
  g.fillStyle(colors.eye);
  for (const [x, y] of eyes) g.fillCircle(x, y, eyeRadius);
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
