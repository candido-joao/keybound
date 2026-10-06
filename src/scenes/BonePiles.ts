import Phaser from 'phaser';
import { reviveHp } from '../combat/behaviors';
import { BONE_PILE, type EnemyDef, walkAnimKey } from '../combat/enemies';
import type { Bolt } from '../entities/Bolt';
import { OUTLINE_SCALE } from '../entities/EnemyOutline';
import type { GameScene } from './GameScene';

/** A pile rattles for this long before it gets back up. */
const RATTLE_MS = 700;
/** How far a strike reaches into a pile, measured from its middle: about half its width. */
export const PILE_RADIUS = 12;
const PILE_BODY = { width: 24, height: 14, x: 4, y: 14 };
const HIT_FLASH_MS = 70;

/** A fallen enemy that gets back up at `reviveAt` unless the player breaks the pile first. */
interface Pile {
  def: EnemyDef;
  /** Solid: it blocks the player and stops bolts. */
  image: Phaser.Physics.Arcade.Sprite;
  /** The body and, for an outlined enemy, its silhouette behind it: they rattle and fall together. */
  parts: Phaser.GameObjects.Sprite[];
  hp: number;
  reviveAt: number;
  rattling: boolean;
  /** Times the enemy under it has already got back up. */
  revivals: number;
}

/** Bone piles in this room; the room isn't clear while any is left. */
export class BonePiles {
  /** The piles' bodies, for the player to bump into and bolts to hit. */
  readonly bodies: Phaser.Physics.Arcade.StaticGroup;
  private readonly game: GameScene;
  private piles: Pile[] = [];

  constructor(game: GameScene) {
    this.game = game;
    this.bodies = game.physics.add.staticGroup();
  }

  get count(): number {
    return this.piles.length;
  }

  /** The player can't walk through a pile; a bolt hitting one chips at it. */
  collide(player: Phaser.GameObjects.GameObject, bolts: Phaser.Physics.Arcade.Group) {
    const { physics } = this.game;
    physics.add.collider(player, this.bodies);
    physics.add.overlap(bolts, this.bodies, (b, image) => this.shot(b as Bolt, image));
  }

  /** Leaving the room takes the piles with it. */
  clear() {
    for (const part of this.piles.flatMap((pile) => pile.parts)) part.destroy();
    this.piles = [];
  }

  drop(def: EnemyDef, x: number, y: number, revivals: number) {
    const { anims, clock } = this.game;
    const image = this.bodies.create(x, y, BONE_PILE) as Phaser.Physics.Arcade.Sprite;
    image.setDepth(3);
    const body = image.body as Phaser.Physics.Arcade.StaticBody;
    body.setSize(PILE_BODY.width, PILE_BODY.height, false).setOffset(PILE_BODY.x, PILE_BODY.y);
    const parts: Phaser.GameObjects.Sprite[] = [image];
    // A cursed skeleton's bones keep the darkness that cursed it.
    if (def.outline !== undefined) parts.push(this.outline(def.outline, x, y, image.depth));
    const anim = walkAnimKey(BONE_PILE);
    if (anims.exists(anim)) for (const part of parts) part.play(anim);
    const { delayMs, pileHp } = def.revive!;
    this.piles.push({ def, image, parts, hp: pileHp, reviveAt: clock.now + delayMs, rattling: false, revivals });
  }

  private outline(color: number, x: number, y: number, depth: number): Phaser.GameObjects.Sprite {
    return this.game.add
      .sprite(x, y, BONE_PILE)
      .setTintMode(Phaser.TintModes.FILL)
      .setTint(color)
      .setScale(OUTLINE_SCALE)
      .setAlpha(0.9)
      .setDepth(depth - 0.1);
  }

  /** Left alone, a pile rattles and gets back up with part of its HP. */
  update(time: number) {
    const { tweens } = this.game;
    for (let i = this.piles.length - 1; i >= 0; i--) {
      const pile = this.piles[i];
      if (!pile.rattling && time >= pile.reviveAt - RATTLE_MS) {
        pile.rattling = true;
        tweens.add({ targets: pile.parts, x: pile.image.x + 2, duration: 50, yoyo: true, repeat: -1 });
      }
      if (time < pile.reviveAt) continue;
      this.piles.splice(i, 1);
      this.revive(pile);
    }
  }

  /** Hurts every pile `struck` picks by its middle; Infinity breaks them outright. */
  strikeWhere(struck: (x: number, y: number) => boolean, damage: number) {
    for (let i = this.piles.length - 1; i >= 0; i--) {
      const { image } = this.piles[i];
      if (struck(image.x, image.y)) this.damage(i, damage);
    }
  }

  /** Every pile at once, as the console's kill-all does. */
  crushAll() {
    for (const pile of this.piles) this.crush(pile);
    this.piles = [];
  }

  private shot(bolt: Bolt, image: object) {
    if (!bolt.flying) return;
    const i = this.piles.findIndex((pile) => pile.image === image);
    // Read before striking: a bolt that can't pierce any further is gone after it.
    const { damage } = bolt;
    if (i < 0 || !bolt.strike(image)) return;
    this.damage(i, damage);
  }

  private damage(i: number, damage: number) {
    const pile = this.piles[i];
    pile.hp -= damage;
    if (pile.hp > 0) {
      this.flash(pile);
      return;
    }
    this.piles.splice(i, 1);
    this.crush(pile);
  }

  private flash(pile: Pile) {
    const { image } = pile;
    image.setTintMode(Phaser.TintModes.FILL).setTint(0xffffff);
    this.game.time.delayedCall(
      HIT_FLASH_MS,
      () => image.active && image.setTintMode(Phaser.TintModes.MULTIPLY).clearTint(),
    );
  }

  private revive(pile: Pile) {
    const { image, parts, def } = pile;
    this.game.tweens.killTweensOf(parts);
    for (const part of parts) part.destroy();
    const enemy = this.game.spawner.spawn(def, image.x, image.y, this.game.dropRng.next() * 1000);
    enemy.hp = reviveHp(def.hp, def.revive!.hpShare);
    enemy.revivals = pile.revivals + 1;
  }

  /** Broken for good: it stops blocking at once, then falls apart. */
  private crush(pile: Pile) {
    const { image, parts, def } = pile;
    const { tweens } = this.game;
    this.bodies.remove(image);
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
