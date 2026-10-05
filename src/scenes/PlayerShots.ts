import Phaser from 'phaser';
import { CHAIN_COOLDOWN_MS } from '../combat/balance';
import { Bolt, type BoltSpec } from '../entities/Bolt';
import type { Enemy } from '../entities/Enemy';
import type { ChainShock } from './ChainShock';
import type { GameScene } from './GameScene';

/** Far above what fire rate, extra shots and range keep in the air at once. */
const POOL_SIZE = 160;

/** The player's bolts: a pool, their flight and homing, and what they do on a hit. */
export class PlayerShots {
  readonly bolts: Phaser.Physics.Arcade.Group;
  private readonly game: GameScene;
  private readonly chain: ChainShock;

  constructor(game: GameScene, chain: ChainShock) {
    this.game = game;
    this.chain = chain;
    this.bolts = game.physics.add.group({ classType: Bolt, maxSize: POOL_SIZE });
  }

  /** A full pool drops the bolt rather than growing mid fight. */
  launch(specs: readonly BoltSpec[]) {
    for (const spec of specs) (this.bolts.get(spec.x, spec.y) as Bolt | null)?.launch(spec);
  }

  update(enemies: readonly Enemy[], delta: number) {
    for (const bolt of this.bolts.getChildren() as Bolt[]) this.updateBolt(bolt, enemies, delta);
  }

  /** Back to the pool, all of them: the room is changing. */
  clear() {
    for (const bolt of this.bolts.getChildren() as Bolt[]) bolt.free();
  }

  /** Overlap callback: strikes the enemy, maybe sets off a chain. */
  readonly hit = (bolt: Bolt, enemy: Enemy) => {
    if (!bolt.flying || !enemy.active || !enemy.hittable) return;
    // Read before striking: a bolt that can't pierce any further is gone after it.
    const { x, y, damage } = bolt;
    if (!bolt.strike(enemy)) return;
    const { player, clock, combat } = this.game;
    const enemyX = enemy.x;
    const enemyY = enemy.y;
    combat.strike(enemy, damage, x, y, player.stats.knockback);
    const now = clock.now;
    if (now < enemy.chainReadyAt) return;
    enemy.chainReadyAt = now + CHAIN_COOLDOWN_MS;
    this.chain.trigger(player.stats, enemy, enemyX, enemyY, damage, now);
  };

  private updateBolt(bolt: Bolt, enemies: readonly Enemy[], delta: number) {
    bolt.fade(delta);
    if (!bolt.flying) return;
    if (bolt.expired()) {
      bolt.burst();
      return;
    }
    if (bolt.homing > 0) bolt.steerToward(homingTarget(bolt, enemies), delta / 1000);
  }
}

/** Nearest enemy the bolt hasn't gone through yet; a piercing bolt would otherwise circle the one it just hit. */
function homingTarget(bolt: Bolt, targets: readonly Enemy[]): Enemy | undefined {
  let best: Enemy | undefined;
  let bestD2 = Infinity;
  for (const t of targets) {
    if (!t.active || !t.harmful || bolt.hasStruck(t)) continue;
    const d2 = Phaser.Math.Distance.Squared(bolt.x, bolt.y, t.x, t.y);
    if (d2 >= bestD2) continue;
    best = t;
    bestD2 = d2;
  }
  return best;
}
