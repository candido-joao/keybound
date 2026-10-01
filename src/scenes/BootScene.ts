import Phaser from 'phaser';
import { ITEMS, itemTextureKey } from '../combat/items';
import { COLORS, ROOM_H, ROOM_W, TILE } from '../config';
import { PORTRAIT_KEYHOLE, WEAPON_SLOT, cssColor, keyholeOutline, traceKeyhole } from '../ui/hpGauge';
import { hasLaunchParams, parseLaunchParams, runFromParams } from '../core/run';
import { PHASES, floorTexture, wallTexture } from '../floor/phases';
import { HERO_PORTRAIT_ART, HERO_SHEET, KEY_ART, KEY_ICON_ART, KEY_TITLE_ART } from '../entities/Player';
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
    this.load.spritesheet(HERO_SHEET, 'hero/walk.png', { frameWidth: HERO_FRAME_W, frameHeight: HERO_FRAME_H });
  }

  create() {
    // The hero and key art are smooth downscales, not native pixel art: nearest sampling would break them up.
    for (const key of [KEY_ART, KEY_TITLE_ART, KEY_ICON_ART, HERO_SHEET]) {
      if (this.textures.exists(key)) this.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
    }
    this.createHeroAnims();

    const g = this.make.graphics({}, false);
    const bake = (key: string, w: number, h: number, draw: () => void) => {
      g.clear();
      draw();
      g.generateTexture(key, w, h);
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
    }

    bake('door', TILE, TILE, () => {
      g.fillStyle(0x0c0a16).fillRect(0, 0, TILE, TILE);
      g.fillStyle(COLORS.door).fillRect(4, 4, TILE - 8, TILE - 8);
      g.fillStyle(0x5c4719).fillRect(TILE / 2 - 2, 4, 4, TILE - 8);
      g.fillStyle(COLORS.shadowEye).fillCircle(TILE / 2, TILE / 2, 5);
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

    // The later phases' enemies are recolors until their own art arrives.
    const bakeShadow = (key: string, body: number, eye: number) =>
      bake(key, 32, 32, () => {
        g.fillStyle(body).fillEllipse(16, 20, 26, 22);
        g.fillStyle(body).fillTriangle(6, 14, 4, 0, 12, 10).fillTriangle(26, 14, 28, 0, 20, 10);
        g.fillStyle(eye).fillCircle(11, 17, 3.2).fillCircle(21, 17, 3.2);
      });
    bakeShadow('shadow', COLORS.shadow, COLORS.shadowEye);
    bakeShadow('crystal-sentinel', 0x173a40, 0x9ff7ff);
    bakeShadow('automaton', 0x3a2a1a, 0xffa640);

    // Same eye spots as the plain shadow, so the eye glow lines up; hood and bright eyes mark it as a shooter.
    const bakeCaster = (key: string, body: number, hood: number, eye: number) =>
      bake(key, 32, 32, () => {
        g.fillStyle(body).fillEllipse(16, 20, 24, 22);
        g.fillStyle(body).fillTriangle(5, 16, 16, -1, 27, 16);
        g.fillStyle(hood).fillTriangle(9, 14, 16, 3, 23, 14);
        g.fillStyle(eye).fillCircle(11, 17, 3).fillCircle(21, 17, 3);
      });
    bakeCaster('shadow-caster', 0x3b2358, 0x5c3a82, 0xff5fa2);
    bakeCaster('crystal-seer', 0x1f4f57, 0x3f8f99, 0xe0fbff);
    bakeCaster('automaton-gunner', 0x4a3522, 0x8a6a3a, 0xff6f3c);

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
