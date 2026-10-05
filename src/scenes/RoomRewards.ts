import Phaser from 'phaser';
import { ALTAR_ROW, DOOR_COL, DOOR_ROW, tileX, tileY } from '../config';
import { ITEMS } from '../combat/items';
import { rollRewards } from '../combat/itemPool';
import type { Rng } from '../core/rng';
import type { RoomNode } from '../floor/FloorGenerator';
import { isFinalFloor } from '../floor/phases';
import { payAltar } from '../floor/roomEvents';
import type { GameScene } from './GameScene';

/** What a room hands out: its item on a pedestal, an altar's bargain, the boss's portal. */
export class RoomRewards {
  private readonly game: GameScene;

  constructor(game: GameScene) {
    this.game = game;
  }

  /** On entering: the item a treasure room or a beaten mini boss left, and a beaten boss's way on. */
  restore(room: RoomNode) {
    const holdsItem = room.type === 'treasure' || (room.event === 'miniboss' && room.cleared);
    if (holdsItem && !room.itemTaken) this.placeItem(room, DOOR_ROW);
    if (room.type === 'boss' && room.cleared) this.bossRewards(room);
  }

  bossRewards(room: RoomNode) {
    this.spawnPortal();
    // The last portal ends the run, so there is nothing left to use an item on.
    if (isFinalFloor(this.game.depth)) return;
    // Above the portal, so walking in to grab it doesn't drop the player into the next floor.
    if (!room.itemTaken) this.placeItem(room, DOOR_ROW - 2);
  }

  /** See `EventHost.payAltar`. */
  payAltar(room: RoomNode, rng: Rng) {
    const game = this.game;
    const { player } = game;
    const paid = payAltar({ health: player.health, maxHealth: player.stats.maxHealth });
    game.loseMaxHealth(paid.cost);
    player.health = Phaser.Math.Clamp(paid.health, 0, player.stats.maxHealth);
    if (player.health <= 0 && !game.cheats.god) {
      game.die('death.greed');
      return;
    }
    player.health = Math.max(1, player.health);
    room.altarPaid = true;
    if (!this.rollItem(room, rng)) return;
    this.placeAltarPedestal(room);
  }

  /** Where the altar stood. The player is right there after paying, so it arms once they step away. */
  placeAltarPedestal(room: RoomNode) {
    this.placeItem(room, ALTAR_ROW, true);
  }

  /** See `EventHost.placeRewardItem`. */
  placeRewardItem(room: RoomNode, rng: Rng): boolean {
    if (!this.rollItem(room, rng)) return false;
    // The kill can land right on the center: don't grab it before reading it.
    this.placeItem(room, DOOR_ROW, true);
    return true;
  }

  /** Rolls an item the player doesn't hold yet into the room; false when the pool has nothing left. */
  private rollItem(room: RoomNode, rng: Rng): boolean {
    const { items, depth, roomItems } = this.game;
    const [item] = rollRewards(rng, ITEMS, items, 1, depth);
    if (!item) return false;
    roomItems.set(room, item);
    return true;
  }

  private placeItem(room: RoomNode, row: number, armWhenAway = false) {
    const item = this.game.roomItems.get(room);
    if (!item) return;
    this.game.pedestals.placeItem(DOOR_COL, row, item, () => (room.itemTaken = true), armWhenAway);
  }

  private spawnPortal() {
    const game = this.game;
    const portal = game.add.image(tileX(DOOR_COL), tileY(DOOR_ROW), 'portal').setDepth(2);
    // Static bodies don't follow scale changes: size the body before the grow-in tween.
    game.physics.add.existing(portal, true);
    (portal.body as Phaser.Physics.Arcade.StaticBody).setCircle(14, 14, 14);
    portal.setScale(0);
    game.tweens.add({ targets: portal, scale: 1, duration: 400, ease: 'Back.Out' });
    game.tweens.add({ targets: portal, angle: 360, duration: 4000, repeat: -1 });
    game.keep(portal);

    const enter = game.physics.add.overlap(game.player, portal, () => {
      enter.active = false;
      game.nextFloor();
    });
    // Don't swallow a player who happens to be standing on the spawn point.
    enter.active = false;
    game.time.delayedCall(800, () => enter.world && (enter.active = true));
    game.keep(enter);
  }
}
