import Phaser from 'phaser';
import { ITEMS, itemTextureKey } from '../combat/items';
import { COLORS, TILE } from '../config';
import { hasLaunchParams, parseLaunchParams, runFromParams } from '../core/run';

/**
 * Placeholder art drawn with Graphics. Real art loads in preload() under its own
 * key, as item icons do (`item:<id>`); addItemIcon falls back to the baked orb.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload() {
    for (const item of ITEMS) this.load.image(itemTextureKey(item), `items/${item.id}.png`);
  }

  create() {
    const g = this.make.graphics({}, false);
    const bake = (key: string, w: number, h: number, draw: () => void) => {
      g.clear();
      draw();
      g.generateTexture(key, w, h);
    };

    bake('floor', TILE, TILE, () => {
      g.fillStyle(COLORS.floor).fillRect(0, 0, TILE, TILE);
      g.fillStyle(COLORS.floorAlt).fillRect(2, 2, TILE - 4, TILE - 4);
      g.fillStyle(COLORS.floor).fillRect(TILE / 2 - 1, 2, 2, TILE - 4);
    });

    bake('wall', TILE, TILE, () => {
      g.fillStyle(COLORS.wall).fillRect(0, 0, TILE, TILE);
      g.lineStyle(2, COLORS.wallEdge).strokeRect(1, 1, TILE - 2, TILE - 2);
      g.fillStyle(COLORS.wallEdge).fillRect(6, TILE / 2 - 1, TILE - 12, 2);
    });

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

    bake('shadow', 32, 32, () => {
      g.fillStyle(COLORS.shadow).fillEllipse(16, 20, 26, 22);
      g.fillStyle(COLORS.shadow).fillTriangle(6, 14, 4, 0, 12, 10).fillTriangle(26, 14, 28, 0, 20, 10);
      g.fillStyle(COLORS.shadowEye).fillCircle(11, 17, 3.2).fillCircle(21, 17, 3.2);
    });

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

    bake('portal', 56, 56, () => {
      g.fillStyle(0x000000).fillCircle(28, 28, 26);
      g.lineStyle(4, COLORS.bolt).strokeCircle(28, 28, 24);
      g.lineStyle(2, 0xc77dff).strokeCircle(28, 28, 16);
    });

    bake('heart', 18, 16, () => {
      g.fillStyle(0xffffff).fillCircle(5, 5, 5).fillCircle(13, 5, 5).fillTriangle(0, 7, 18, 7, 9, 16);
    });

    g.destroy();
    this.launch();
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
