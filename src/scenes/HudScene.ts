import Phaser from 'phaser';
import { addItemIcon } from '../combat/items';
import { type Item, countItems } from '../combat/stats';
import { COLORS, FLOOR_GRID_H, FLOOR_GRID_W, GAME_H, GAME_W, ROOM_W, ROOM_X } from '../config';
import { DIRS, type Dir, type RoomType } from '../floor/FloorGenerator';
import { type Locale, getLocale, t } from '../i18n';
import { HealthTrail } from '../ui/healthTrail';
import { PORTRAIT_KEYHOLE, cssColor, gaugeLength, keyholeOutline, traceGauge } from '../ui/hpGauge';
import type { Player } from '../entities/Player';
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

// HP gauge at the top-left traces the keyhole portrait frame and runs out of its base
// as a straight bar. HP fills from the gauge's start, so damage eats the bar first.
// Drawn on a 2D canvas: pixelArt turns off antialiasing for Graphics, and curves need it.
const GAUGE_X = 40;
const GAUGE_Y = 36;
const HP_THICKNESS = 6;
const HP_BAR_LENGTH = 400;
/** Base HP (60) reaches about the head's lower left; more max HP goes on down the stem. */
const HP_PX_PER_HP = 1.75;
const GAUGE_OUTLINE = keyholeOutline(PORTRAIT_KEYHOLE, 4 + HP_THICKNESS / 2);
const GAUGE_LENGTH = gaugeLength(GAUGE_OUTLINE, HP_BAR_LENGTH);
const GAUGE_TEXTURE_W = GAUGE_X + HP_BAR_LENGTH + 40;
const GAUGE_TEXTURE_H = GAUGE_Y + PORTRAIT_KEYHOLE.stemBottom + 20;

/** Runs on top of GameScene and reads its state every frame. */
export class HudScene extends Phaser.Scene {
  private map!: Phaser.GameObjects.Graphics;
  private gauge!: Phaser.Textures.CanvasTexture;
  private trail = new HealthTrail();
  /** GameScene restarts (new floor, new run) replace the player while this scene keeps running. */
  private trackedPlayer: Player | null = null;
  private drawnHealth = -1;
  private drawnMaxHealth = -1;
  private icons: Phaser.GameObjects.GameObject[] = [];
  private iconsKey = '';
  private floorLabel!: Phaser.GameObjects.Text;
  private labelDepth = 0;
  private labelLocale: Locale | null = null;
  private tab!: Phaser.Input.Keyboard.Key;

  constructor() {
    super('hud');
  }

  create() {
    this.createHealthBar();
    // Above the HP bar and icons, so the expanded map's backdrop dims them too.
    this.map = this.add.graphics().setDepth(10);
    this.icons = [];
    this.iconsKey = '';
    this.labelDepth = 0;
    this.labelLocale = null;
    this.floorLabel = this.add
      .text(GAME_W / 2, BIG.y - 16, '', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: COLORS.text,
        stroke: '#000',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 1)
      .setDepth(11)
      .setVisible(false);
    // Key capture also stops Tab from moving browser focus.
    this.tab = this.input.keyboard!.addKey('TAB');
  }

  update(_time: number, delta: number) {
    const game = this.scene.get('game') as GameScene;
    if (!game.player?.active) return;

    const expanded = this.tab.isDown && !game.scene.isPaused();
    this.drawHealthBar(game.player, delta);
    this.drawMinimap(game, expanded ? BIG : MINI, expanded);
    this.floorLabel.setVisible(expanded);
    this.updateFloorLabel(game.depth);
    this.drawItemIcons(game.items);
  }

  private updateFloorLabel(depth: number) {
    const locale = getLocale();
    if (depth === this.labelDepth && locale === this.labelLocale) return;
    this.labelDepth = depth;
    this.labelLocale = locale;
    this.floorLabel.setText(t('floor.label', { n: depth }));
  }

  private createHealthBar() {
    this.gauge = this.textures.exists('hp-gauge')
      ? (this.textures.get('hp-gauge') as Phaser.Textures.CanvasTexture)
      : this.textures.createCanvas('hp-gauge', GAUGE_TEXTURE_W, GAUGE_TEXTURE_H)!;
    this.add.image(0, 0, 'hp-gauge').setOrigin(0);
    // Pivot on the keyhole's round head, which BootScene draws 2px below the top.
    const frame = this.add.image(GAUGE_X, GAUGE_Y, 'portrait-frame');
    frame.setOrigin(0.5, (PORTRAIT_KEYHOLE.headRadius + 2) / frame.height);
    // Head and hair of the player sprite, centered in the keyhole's head.
    this.add
      .image(GAUGE_X, GAUGE_Y + 7, 'player')
      .setCrop(5, 0, 23, 23)
      .setScale(1.3);
    this.trackedPlayer = null;
  }

  /** Redraws only when health, max health or the damage trail changed. */
  private drawHealthBar(player: Player, delta: number) {
    const { health } = player;
    const { maxHealth } = player.stats;
    if (player !== this.trackedPlayer) this.trackPlayer(player);
    const trailMoved = this.trail.update(health, delta);
    if (!trailMoved && health === this.drawnHealth && maxHealth === this.drawnMaxHealth) return;

    const length = Math.min(GAUGE_LENGTH, maxHealth * HP_PX_PER_HP);
    const toLength = (hp: number) => (length * hp) / maxHealth;
    this.gauge.context.clearRect(0, 0, GAUGE_TEXTURE_W, GAUGE_TEXTURE_H);
    this.strokeGauge(0x000000, HP_THICKNESS + 3, length);
    this.strokeGauge(COLORS.hpBack, HP_THICKNESS, length);
    this.strokeGauge(COLORS.hpTrail, HP_THICKNESS, toLength(this.trail.value));
    this.strokeGauge(COLORS.hp, HP_THICKNESS, toLength(health));
    this.gauge.refresh();
    this.drawnHealth = health;
    this.drawnMaxHealth = maxHealth;
  }

  /** A new player starts with no damage trail and forces a redraw. */
  private trackPlayer(player: Player) {
    this.trackedPlayer = player;
    this.trail.reset(player.health);
    this.drawnHealth = -1;
    this.drawnMaxHealth = -1;
  }

  /** Strokes the first `length` px of the gauge, as one dash followed by a gap past its end. */
  private strokeGauge(color: number, width: number, length: number) {
    if (length <= 0) return;
    const ctx = this.gauge.context;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = width;
    ctx.strokeStyle = cssColor(color);
    ctx.setLineDash([length, GAUGE_LENGTH + width]);
    traceGauge(ctx, GAUGE_OUTLINE, GAUGE_X, GAUGE_Y, HP_BAR_LENGTH);
    ctx.stroke();
  }

  private drawMinimap(game: GameScene, layout: MapLayout, expanded: boolean) {
    const { cellW, cellH } = layout;
    const g = this.map.clear();
    if (expanded) g.fillStyle(0x000000, 0.5).fillRect(0, 0, GAME_W, GAME_H);
    g.fillStyle(0x000000, expanded ? 0.75 : 0.45).fillRect(
      layout.x - 4,
      layout.y - 4,
      FLOOR_GRID_W * cellW + 8,
      FLOOR_GRID_H * cellH + 8,
    );

    const gap = expanded ? 4 : 2;
    for (const room of game.floor.rooms.values()) {
      // Isaac rule: visited rooms plus their direct neighbors are shown.
      const revealed =
        game.mapRevealed ||
        room.visited ||
        (Object.keys(DIRS) as Dir[]).some((d) => game.floor.neighbor(room, d)?.visited);
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
        const count = this.add.text(x + ICON_SIZE / 2, y + ICON_SIZE / 2, `${n}`, {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: COLORS.text,
          stroke: '#000',
          strokeThickness: 3,
        });
        this.icons.push(count.setOrigin(1, 1).setAlpha(0.8));
      }
    });
  }
}
