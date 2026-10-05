import type Phaser from 'phaser';
import { COLORS, DOOR_COL, DOOR_ROW, tileX, tileY } from '../config';
import { SHOP, type Ware, type Wallet, buy, canBuy, shopWares } from '../combat/shop';
import type { Item } from '../combat/stats';
import { KEY_ICON_ART } from '../entities/Player';
import type { RoomNode } from '../floor/FloorGenerator';
import { t } from '../i18n';
import type { GameScene } from './GameScene';
import { addItemIcon } from './itemIcon';

/** Tiles between shop pedestals. */
const SPACING = 3;
/** How long a refused price stays red. */
const REFUSE_FLASH_MS = 400;

/** The floor's shops: what each stocks, what it has sold, and paying for it. */
export class ShopRooms {
  private readonly game: GameScene;
  private readonly sold = new Map<RoomNode, Set<Ware>>();

  constructor(game: GameScene) {
    this.game = game;
  }

  /** Wares in a row across the room; what was bought stays gone. */
  spawn(room: RoomNode) {
    const sold = this.sold.get(room) ?? new Set<Ware>();
    this.sold.set(room, sold);
    const wares = shopWares(this.game.driveMax).filter((w) => !sold.has(w) && (w !== 'item' || !room.itemTaken));
    wares.forEach((ware, i) => {
      const col = DOOR_COL + (i - (wares.length - 1) / 2) * SPACING;
      this.placeWare(room, ware, col, () => sold.add(ware));
    });
  }

  /**
   * A pedestal with a price. Walking into it buys the ware when the player can pay and it would
   * do something; otherwise the price flashes and nothing happens.
   */
  private placeWare(room: RoomNode, ware: Ware, col: number, onSold: () => void) {
    const item = this.game.roomItems.get(room);
    if (ware === 'item' && !item) return;
    const x = tileX(col);
    const y = tileY(DOOR_ROW - 1);
    const icon = this.wareIcon(ware, item, x, y - 12);
    const text = () => [...wareText(ware, item), t('shop.price', { n: SHOP.prices[ware] })];
    let refusedAt = -Infinity;
    const label = this.game.pedestals.place(x, y, icon, text, (take) => {
      const wallet = this.wallet();
      if (!canBuy(ware, wallet)) {
        refusedAt = this.refuseOnce(label, icon, refusedAt);
        return;
      }
      take();
      onSold();
      if (ware === 'item') room.itemTaken = true;
      this.sell(ware, wallet, item);
    });
  }

  private wareIcon(ware: Ware, item: Item | undefined, x: number, y: number): Phaser.GameObjects.Image {
    const { add, textures } = this.game;
    if (ware === 'item' && item) return addItemIcon(this.game, x, y, item);
    if (ware === 'heal') return add.image(x, y, 'drop-heal').setScale(1.8);
    if (textures.exists(KEY_ICON_ART)) return add.image(x, y, KEY_ICON_ART);
    return add.image(x, y, 'key').setAngle(-45).setScale(0.75);
  }

  /** Flashes the refusal once per bump, not on every frame of it; returns the new bump time. */
  private refuseOnce(label: Phaser.GameObjects.Text, icon: Phaser.GameObjects.Image, refusedAt: number): number {
    const now = this.game.clock.now;
    if (now - refusedAt > REFUSE_FLASH_MS) this.refuse(label, icon);
    return now;
  }

  /** The price turns red and the ware shakes: the player can't pay, or it would do nothing. */
  private refuse(label: Phaser.GameObjects.Text, icon: Phaser.GameObjects.Image) {
    label.setColor('#e8435a');
    this.game.time.delayedCall(REFUSE_FLASH_MS, () => label.active && label.setColor(COLORS.text));
    this.game.tweens.add({ targets: icon, x: icon.x + 3, duration: 40, yoyo: true, repeat: 2 });
  }

  private wallet(): Wallet {
    const { player, currency, drive, driveMax } = this.game;
    return { currency, health: player.health, maxHealth: player.stats.maxHealth, drive, driveMax };
  }

  private sell(ware: Ware, wallet: Wallet, item: Item | undefined) {
    const game = this.game;
    const after = buy(ware, wallet);
    game.currency = after.currency;
    game.player.health = after.health;
    game.drive = after.drive;
    game.driveMax = after.driveMax;
    if (ware === 'item' && item) {
      game.grantItem(item);
      return;
    }
    game.banner(...wareText(ware, item));
  }
}

/** Name and what it does: an item keeps its hint, the shop's own wares say it plainly. */
function wareText(ware: Ware, item: Item | undefined): [string, string] {
  if (ware === 'heal') return [t('shop.heal.name'), t('shop.heal.hint', { pct: Math.round(SHOP.healShare * 100) })];
  if (ware === 'drive') return [t('shop.drive.name'), t('shop.drive.hint')];
  return item ? [t(item.name), t(item.hint)] : ['', ''];
}
