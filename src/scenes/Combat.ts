import { inBlast } from '../combat/behaviors';
import { type DropKind, rollDrops, withBossHeal } from '../combat/drops';
import type { EnemyDef, ExplodeAttack } from '../combat/enemies';
import type { Enemy } from '../entities/Enemy';
import type { MessageKey } from '../i18n';
import type { GameScene } from './GameScene';

/** Blasts shove enemies harder than a bolt does. */
const BLAST_KNOCKBACK = 2;

/** Summed over every living boss in the room; `max` 0 when there is none. */
export interface BossHealth {
  hp: number;
  max: number;
  name?: MessageKey;
}

/** What happens to enemies once hit: damage, death, what they leave behind and what they set off. */
export class Combat {
  /** Refreshed each frame for the HUD. */
  readonly bossHealth: BossHealth = { hp: 0, max: 0 };
  private readonly game: GameScene;

  constructor(game: GameScene) {
    this.game = game;
  }

  strike(enemy: Enemy, damage: number, fromX: number, fromY: number, knockback: number) {
    if (!enemy.active) return;
    const slam = knockback > 0 ? this.game.player.stats.wallSlam : 0;
    if (enemy.hit(damage, fromX, fromY, knockback, slam)) this.kill(enemy);
  }

  /** Enemies thrown into a wall take the slam. Backwards, since a slam can kill and take the enemy out of the list. */
  applyWallSlams(enemies: readonly Enemy[]) {
    for (let i = enemies.length - 1; i >= 0; i--) {
      const enemy = enemies[i];
      const slam = enemy.slammed();
      if (slam > 0) this.strike(enemy, slam, enemy.x, enemy.y, 0);
    }
  }

  updateBossHealth(enemies: readonly Enemy[]) {
    const boss = this.bossHealth;
    boss.hp = 0;
    boss.max = 0;
    for (const enemy of enemies) {
      if (!enemy.active || (!enemy.def.boss && !enemy.def.miniBoss)) continue;
      boss.hp += Math.max(0, enemy.hp);
      boss.max += enemy.def.hp;
      boss.name = enemy.def.name;
    }
  }

  kill(enemy: Enemy) {
    const { x, y, def } = enemy;
    enemy.die();
    // A mini boss's death pays the event: it doesn't get back up.
    if (def.revive && !def.miniBoss && enemy.revivals < def.revive.times) {
      this.game.piles.drop(def, x, y, enemy.revivals);
      return;
    }
    this.reward(def, x, y);
    if (def.split) this.game.spawner.split(def, x, y);
  }

  /** Kill count, drops and what a boss's fall sets off. */
  reward(def: EnemyDef, x: number, y: number) {
    const game = this.game;
    game.kills++;
    const kinds = this.rollDrops(def);
    for (const kind of kinds) game.drops.spawn(kind, x, y);
    game.eventDirector.onDrops(kinds);
    if (def.boss && game.room.event === 'twin') this.enrageSurvivingBosses();
  }

  /** A cursed enemy rolls twice; a boss always leaves a heal. */
  private rollDrops(def: EnemyDef): DropKind[] {
    const game = this.game;
    const rolls = def.cursed ? 2 : 1;
    const kinds: DropKind[] = [];
    for (let i = 0; i < rolls; i++) {
      const roll = rollDrops(game.dropRng, game.luck, game.player.stats.healOdds);
      game.luck = roll.luck;
      kinds.push(...roll.drops);
    }
    if (!def.boss) return kinds;
    const guaranteed = withBossHeal(kinds, game.luck);
    game.luck = guaranteed.luck;
    return guaranteed.drops;
  }

  /** Hurts the player and every enemy in reach, then the bomber is gone. */
  readonly explode = (enemy: Enemy, blast: ExplodeAttack) => {
    const game = this.game;
    const { x, y } = enemy;
    this.showBlast(x, y, blast.radius);
    const { player } = game;
    if (inBlast(player.x - x, player.y - y, blast.radius)) game.hurtPlayer(blast.damage);
    // Backwards, since a blast can kill and take enemies out of the list.
    const enemies = game.enemyGroup();
    for (let i = enemies.length - 1; i >= 0; i--) {
      const other = enemies[i];
      if (other === enemy || !other.active || !other.hittable) continue;
      if (inBlast(other.x - x, other.y - y, blast.radius)) this.strike(other, blast.damage, x, y, BLAST_KNOCKBACK);
    }
    // A rock counts as caught once the blast reaches its middle.
    game.breakRocks((rx, ry) => inBlast(rx - x, ry - y, blast.radius));
    if (enemy.active) this.kill(enemy);
  };

  private showBlast(x: number, y: number, radius: number) {
    const { add, tweens, cameras } = this.game;
    const ring = add.circle(x, y, radius, 0xffa640, 0.45).setDepth(6).setScale(0.2);
    tweens.add({ targets: ring, scale: 1, alpha: 0, duration: 260, onComplete: () => ring.destroy() });
    cameras.main.shake(140, 0.006);
  }

  /** When a twin falls, the other goes into fury at once, whatever its HP. */
  private enrageSurvivingBosses() {
    for (const other of this.game.enemyGroup()) {
      if (other.active && other.def.boss) other.enrage();
    }
  }
}
