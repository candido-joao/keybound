import Phaser from 'phaser';
import { addItemIcon } from '../combat/items';
import { type Item, countItems } from '../combat/stats';
import { COLORS, FLOOR_GRID_H, FLOOR_GRID_W, GAME_H, GAME_W, ROOM_W, ROOM_X } from '../config';
import { DIRS, type Dir, type RoomType } from '../floor/FloorGenerator';
import type { GameScene } from './GameScene';

interface MapLayout {
  x: number;
  y: number;
  cellW: number;
  cellH: number;
}

const MINI: MapLayout = { x: GAME_W - FLOOR_GRID_W * 13 - 12, y: 8, cellW: 13, cellH: 9 };
const BIG_SCALE = 3;
const BIG: MapLayout = {
  x: (GAME_W - FLOOR_GRID_W * MINI.cellW * BIG_SCALE) / 2,
  y: (GAME_H - FLOOR_GRID_H * MINI.cellH * BIG_SCALE) / 2 + 12,
  cellW: MINI.cellW * BIG_SCALE,
  cellH: MINI.cellH * BIG_SCALE,
};

/** Special rooms get a colored inset on the map. */
const MAP_MARKER: Record<RoomType, number | undefined> = {
  start: undefined,
  normal: undefined,
  treasure: COLORS.treasure,
  boss: COLORS.boss,
};

// Collected items sit under the minimap, centered in the margin right of the room.
// Icons are 32px pixel art; any non-integer downscale would eat pixels.
const ICON_SIZE = 32;
const ICON_GAP = 4;
const ICONS_PER_ROW = 3;
const ROOM_RIGHT = ROOM_X + ROOM_W;
const ICONS_X = ROOM_RIGHT + (GAME_W - ROOM_RIGHT - (ICONS_PER_ROW * (ICON_SIZE + ICON_GAP) - ICON_GAP)) / 2;
const ICONS_Y = MINI.y + FLOOR_GRID_H * MINI.cellH + 14;

/** Runs on top of GameScene and reads its state every frame. */
export class HudScene extends Phaser.Scene {
  private map!: Phaser.GameObjects.Graphics;
  private hearts: { back: Phaser.GameObjects.Image; front: Phaser.GameObjects.Image }[] = [];
  private icons: Phaser.GameObjects.GameObject[] = [];
  private iconsKey = '';
  private floorLabel!: Phaser.GameObjects.Text;
  private tab!: Phaser.Input.Keyboard.Key;

  constructor() {
    super('hud');
  }

  create() {
    // Above hearts and icons, so the expanded map's backdrop dims them too.
    this.map = this.add.graphics().setDepth(10);
    this.hearts = [];
    this.icons = [];
    this.iconsKey = '';
    this.floorLabel = this.add
      .text(GAME_W / 2, BIG.y - 16, '', { fontFamily: 'monospace', fontSize: '18px', color: COLORS.text, stroke: '#000', strokeThickness: 4 })
      .setOrigin(0.5, 1)
      .setDepth(11)
      .setVisible(false);
    // Key capture also stops Tab from moving browser focus.
    this.tab = this.input.keyboard!.addKey('TAB');
  }

  update() {
    const game = this.scene.get('game') as GameScene;
    if (!game.player?.active) return;

    const expanded = this.tab.isDown && !game.scene.isPaused();
    this.drawHearts(game.player.health, game.player.stats.maxHealth);
    this.drawMinimap(game, expanded ? BIG : MINI, expanded);
    this.floorLabel.setVisible(expanded).setText(`Andar ${game.depth}`);
    this.drawItemIcons(game.items);
  }

  private drawHearts(health: number, maxHealth: number) {
    const count = Math.ceil(maxHealth / 2);
    while (this.hearts.length < count) {
      const x = 16 + this.hearts.length * 22;
      const back = this.add.image(x, 14, 'heart').setOrigin(0).setTint(COLORS.heartEmpty);
      const front = this.add.image(x, 14, 'heart').setOrigin(0).setTint(COLORS.heart);
      this.hearts.push({ back, front });
    }
    while (this.hearts.length > count) {
      const { back, front } = this.hearts.pop()!;
      back.destroy();
      front.destroy();
    }

    this.hearts.forEach(({ front }, i) => {
      const fill = Phaser.Math.Clamp(health - i * 2, 0, 2);
      front.setVisible(fill > 0).setCrop(0, 0, fill === 1 ? 9 : 18, 16);
    });
  }

  private drawMinimap(game: GameScene, layout: MapLayout, expanded: boolean) {
    const { cellW, cellH } = layout;
    const g = this.map.clear();
    if (expanded) g.fillStyle(0x000000, 0.5).fillRect(0, 0, GAME_W, GAME_H);
    g.fillStyle(0x000000, expanded ? 0.75 : 0.45).fillRect(layout.x - 4, layout.y - 4, FLOOR_GRID_W * cellW + 8, FLOOR_GRID_H * cellH + 8);

    const gap = expanded ? 4 : 2;
    for (const room of game.floor.rooms.values()) {
      // Isaac rule: visited rooms plus their direct neighbors are shown.
      const revealed =
        room.visited || (Object.keys(DIRS) as Dir[]).some((d) => game.floor.neighbor(room, d)?.visited);
      if (!revealed) continue;

      const x = layout.x + room.x * cellW;
      const y = layout.y + room.y * cellH;
      const current = room === game.room;
      g.fillStyle(current ? 0xffffff : room.visited ? 0x8d84b8 : 0x3d365e).fillRect(x, y, cellW - gap, cellH - gap);

      const marker = MAP_MARKER[room.type];
      if (marker !== undefined) {
        const inset = expanded ? 8 : 3;
        g.fillStyle(marker).fillRect(x + inset, y + inset * 0.7, cellW - gap - inset * 2, cellH - gap - inset * 1.4);
      }
    }
  }

  /** One faded icon per distinct item; rebuilt only when the inventory changes. */
  private drawItemIcons(items: readonly Item[]) {
    const key = items.map((i) => i.id).join(',');
    if (key === this.iconsKey) return;
    this.iconsKey = key;
    this.icons.forEach((o) => o.destroy());
    this.icons = [];

    [...countItems(items)].forEach(([item, n], i) => {
      const x = ICONS_X + (i % ICONS_PER_ROW) * (ICON_SIZE + ICON_GAP) + ICON_SIZE / 2;
      const y = ICONS_Y + Math.floor(i / ICONS_PER_ROW) * (ICON_SIZE + ICON_GAP) + ICON_SIZE / 2;
      this.icons.push(addItemIcon(this, x, y, item).setAlpha(0.55));
      if (n > 1) {
        const count = this.add.text(x + ICON_SIZE / 2, y + ICON_SIZE / 2, `${n}`, { fontFamily: 'monospace', fontSize: '10px', color: COLORS.text, stroke: '#000', strokeThickness: 3 });
        this.icons.push(count.setOrigin(1, 1).setAlpha(0.8));
      }
    });
  }
}
