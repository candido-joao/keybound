import Phaser from 'phaser';
import { reviveHp } from '../combat/behaviors';
import { BONE_PILE, type EnemyDef, walkAnimKey } from '../combat/enemies';
import { OUTLINE_SCALE } from '../entities/EnemyOutline';
import type { GameScene } from './GameScene';

/** Walking this close to a bone pile crushes it for good. */
const STOMP_RADIUS = 26;
/** A pile rattles for this long before it gets back up. */
const RATTLE_MS = 700;

/** A fallen enemy that gets back up at `reviveAt` unless the player steps on it. */
interface Pile {
  def: EnemyDef;
  image: Phaser.GameObjects.Sprite;
  /** The body and, for an outlined enemy, its silhouette behind it: they rattle and fall together. */
  parts: Phaser.GameObjects.Sprite[];
  reviveAt: number;
  rattling: boolean;
  /** Times the enemy under it has already got back up. */
  revivals: number;
}

/** Bone piles in this room; the room isn't clear while any is left. */
export class BonePiles {
  private readonly game: GameScene;
  private piles: Pile[] = [];

  constructor(game: GameScene) {
    this.game = game;
  }

  get count(): number {
    return this.piles.length;
  }

  /** Leaving the room takes the piles with it. */
  clear() {
    for (const part of this.piles.flatMap((pile) => pile.parts)) part.destroy();
    this.piles = [];
  }

  drop(def: EnemyDef, x: number, y: number, revivals: number) {
    const { add, anims, clock } = this.game;
    const image = add.sprite(x, y, BONE_PILE).setDepth(3);
    const parts = [image];
    // A cursed skeleton's bones keep the darkness that cursed it.
    if (def.outline !== undefined) {
      const outline = add
        .sprite(x, y, BONE_PILE)
        .setTintMode(Phaser.TintModes.FILL)
        .setTint(def.outline)
        .setScale(OUTLINE_SCALE)
        .setAlpha(0.9)
        .setDepth(image.depth - 0.1);
      parts.push(outline);
    }
    const anim = walkAnimKey(BONE_PILE);
    if (anims.exists(anim)) for (const part of parts) part.play(anim);
    this.piles.push({ def, image, parts, reviveAt: clock.now + def.revive!.delayMs, rattling: false, revivals });
  }

  /** Stepping on a pile finishes it; left alone, it rattles and gets back up with part of its HP. */
  update(time: number) {
    const { player, tweens } = this.game;
    const stomp = STOMP_RADIUS * STOMP_RADIUS;
    for (let i = this.piles.length - 1; i >= 0; i--) {
      const pile = this.piles[i];
      const { image, parts } = pile;
      if (Phaser.Math.Distance.Squared(image.x, image.y, player.x, player.y) < stomp) {
        this.piles.splice(i, 1);
        this.crush(pile);
        continue;
      }
      if (!pile.rattling && time >= pile.reviveAt - RATTLE_MS) {
        pile.rattling = true;
        tweens.add({ targets: parts, x: image.x + 2, duration: 50, yoyo: true, repeat: -1 });
      }
      if (time < pile.reviveAt) continue;
      this.piles.splice(i, 1);
      this.revive(pile);
    }
  }

  /** Every pile at once, as the console's kill-all does. */
  crushAll() {
    for (const pile of this.piles) this.crush(pile);
    this.piles = [];
  }

  private revive(pile: Pile) {
    const { image, parts, def } = pile;
    this.game.tweens.killTweensOf(parts);
    for (const part of parts) part.destroy();
    const enemy = this.game.spawner.spawn(def, image.x, image.y, this.game.dropRng.next() * 1000);
    enemy.hp = reviveHp(def.hp, def.revive!.hpShare);
    enemy.revivals = pile.revivals + 1;
  }

  private crush(pile: Pile) {
    const { image, parts, def } = pile;
    const { tweens } = this.game;
    tweens.killTweensOf(parts);
    tweens.add({
      targets: parts,
      scaleY: 0.2,
      alpha: 0,
      duration: 160,
      onComplete: () => parts.forEach((part) => part.destroy()),
    });
    this.game.combat.reward(def, image.x, image.y);
  }
}
