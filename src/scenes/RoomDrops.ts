import Phaser from 'phaser';
import { ROOM_H, ROOM_W, ROOM_X, ROOM_Y, TILE } from '../config';
import { DROPS, type DropKind, applyDrop, canCollect } from '../combat/drops';
import type { RoomNode } from '../floor/FloorGenerator';
import type { GameScene } from './GameScene';

/** Drops lie where they fell until the player walks over them. */
const PICKUP_RADIUS = 20;
/** Within this distance a drop slides toward the player: a short reach, so it still takes walking up to it. */
const MAGNET_RADIUS = 56;
const MAGNET_SPEED = 260;
/** Drops land around the kill, not stacked on one spot. */
const SCATTER = 14;

interface Drop {
  kind: DropKind;
  image: Phaser.GameObjects.Image;
}

/** Pickups on the floor: the ones in this room, and the ones left behind in others, put back on re-entry. */
export class RoomDrops {
  private readonly game: GameScene;
  private drops: Drop[] = [];
  private readonly left = new Map<RoomNode, { kind: DropKind; x: number; y: number }[]>();

  constructor(game: GameScene) {
    this.game = game;
  }

  /** Lands near (`x`, `y`), off the walls and off any obstacle, popping in. */
  spawn(kind: DropKind, x: number, y: number) {
    const rng = this.game.dropRng;
    const dx = (rng.next() * 2 - 1) * SCATTER;
    const dy = (rng.next() * 2 - 1) * SCATTER;
    // Kept off the walls, or a drop could land out of the player's reach.
    const margin = TILE + PICKUP_RADIUS / 2;
    const px = Phaser.Math.Clamp(x + dx, ROOM_X + margin, ROOM_X + ROOM_W - margin);
    const py = Phaser.Math.Clamp(y + dy, ROOM_Y + margin, ROOM_Y + ROOM_H - margin);
    // Nor on an obstacle, where it could sit inside a rock or over a pit.
    const spot = this.game.obstacles.snap(px, py);
    const image = this.place(kind, spot.x, spot.y).setScale(0);
    this.game.tweens.add({ targets: image, scale: 1, duration: 220, ease: 'Back.Out' });
  }

  /** Scatters drops anywhere over the room. */
  rain(kinds: readonly DropKind[]) {
    const rng = this.game.dropRng;
    for (const kind of kinds) {
      const x = ROOM_X + TILE + rng.next() * (ROOM_W - TILE * 2);
      const y = ROOM_Y + TILE + rng.next() * (ROOM_H - TILE * 2);
      this.spawn(kind, x, y);
    }
  }

  /** Drops close to the player slide in and get picked up; a heal orb at full HP stays put for later. */
  update(dt: number) {
    const player = this.game.player;
    const range = PICKUP_RADIUS * PICKUP_RADIUS;
    const pull = MAGNET_RADIUS * MAGNET_RADIUS;
    // Backwards, so collecting one doesn't skip the next.
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const { kind, image } = this.drops[i];
      // Checked per drop: an earlier orb in this loop can fill HP.
      if (!canCollect(kind, player.health >= player.stats.maxHealth)) continue;
      const d2 = Phaser.Math.Distance.Squared(image.x, image.y, player.x, player.y);
      if (d2 < range) {
        this.collect(i);
        continue;
      }
      if (d2 >= pull) continue;
      const distance = Math.sqrt(d2);
      const step = Math.min(distance, MAGNET_SPEED * dt) / distance;
      image.setPosition(image.x + (player.x - image.x) * step, image.y + (player.y - image.y) * step);
    }
  }

  /** Puts this room's drops away until the player comes back. Empty on a fresh floor, so nothing is stored. */
  leave(room: RoomNode) {
    if (this.drops.length === 0) return;
    this.left.set(
      room,
      this.drops.map(({ kind, image }) => ({ kind, x: image.x, y: image.y })),
    );
    for (const drop of this.drops) drop.image.destroy();
    this.drops = [];
  }

  restore(room: RoomNode) {
    for (const drop of this.left.get(room) ?? []) this.place(drop.kind, drop.x, drop.y);
    this.left.delete(room);
  }

  private place(kind: DropKind, x: number, y: number): Phaser.GameObjects.Image {
    const def = DROPS.find((d) => d.id === kind)!;
    const image = this.game.add.image(x, y, def.texture).setDepth(3);
    this.drops.push({ kind, image });
    return image;
  }

  private collect(index: number) {
    const [drop] = this.drops.splice(index, 1);
    drop.image.destroy();
    const game = this.game;
    const { player } = game;
    const state = { health: player.health, maxHealth: player.stats.maxHealth, currency: game.currency };
    const next = applyDrop(state, drop.kind, player.stats.currencyValue);
    player.health = next.health;
    game.currency = next.currency;
  }
}
