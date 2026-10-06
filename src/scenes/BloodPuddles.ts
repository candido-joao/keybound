import type Phaser from 'phaser';
import { BLOOD_PUDDLE, type BloodTrail } from '../combat/enemies';
import { type Puddle, inPuddle, puddleAlpha, puddleSlot, wet } from '../combat/puddles';
import type { RoomNode } from '../floor/FloorGenerator';
import type { GameScene } from './GameScene';

/** Room for two colossi's overlapping trails through their full puddle lifetime. */
const POOL_SIZE = 64;

interface Slot extends Puddle {
  image: Phaser.GameObjects.Image;
}

/** Puddles a bleeding enemy leaves in this room, from a fixed pool; leaving or winning the room dries them all. */
export class BloodPuddles {
  private readonly game: GameScene;
  private readonly slots: Slot[] = [];
  private room?: RoomNode;
  private wasCleared = false;
  /** Some puddle may still be wet, so drying has work to do. */
  private spilled = false;

  /** Preallocates hidden puddles so spilling during a dash needs no new images. */
  constructor(game: GameScene) {
    this.game = game;
    for (let i = 0; i < POOL_SIZE; i++) {
      const image = game.add.image(0, 0, BLOOD_PUDDLE).setDepth(0.6).setVisible(false);
      this.slots.push({ image, x: 0, y: 0, radius: 0, damage: 0, dryAt: 0 });
    }
  }

  /** Reuses the soonest-drying slot for a fresh puddle timed by the gameplay clock. */
  readonly spill = (x: number, y: number, trail: BloodTrail) => {
    const slot = this.slots[puddleSlot(this.slots)];
    slot.x = x;
    slot.y = y;
    slot.radius = trail.radius;
    slot.damage = trail.damage;
    slot.dryAt = this.game.clock.now + trail.lifeMs;
    this.spilled = true;
    slot.image
      .setPosition(x, y)
      .setDisplaySize(trail.radius * 2, trail.radius * 2)
      .setAlpha(1)
      .setVisible(true);
  };

  /** Fades the drying ones and hurts the player standing in any, as often as invulnerability lets it. */
  update(time: number) {
    if (this.roomChanged()) {
      this.dry();
      return;
    }
    const feet = (this.game.player.body as Phaser.Physics.Arcade.Body).center;
    let damage = 0;
    for (const slot of this.slots) {
      if (!slot.image.visible) continue;
      slot.image.setAlpha(puddleAlpha(slot, time));
      if (!wet(slot, time)) slot.image.setVisible(false);
      if (inPuddle(slot, feet.x, feet.y, time)) damage = Math.max(damage, slot.damage);
    }
    if (damage > 0) this.game.hurtPlayer(damage, 'death.blood');
  }

  /**
   * Another room, or this one just won. Only the moment it is won: an enemy spawned from the
   * console into a room already cleared still bleeds.
   */
  private roomChanged(): boolean {
    const { room } = this.game;
    const won = room.cleared && !this.wasCleared;
    const left = room !== this.room;
    this.room = room;
    this.wasCleared = room.cleared;
    return left || won;
  }

  /** Makes every puddle harmless and hidden when the room is left or won. */
  private dry() {
    if (!this.spilled) return;
    this.spilled = false;
    for (const slot of this.slots) {
      slot.dryAt = 0;
      slot.image.setVisible(false);
    }
  }
}
