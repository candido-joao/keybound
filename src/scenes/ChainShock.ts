import Phaser from 'phaser';
import { CHAIN_RADIUS } from '../combat/balance';
import { type Point, chainDamage, chainPath, novaTargets } from '../combat/chain';
import type { PlayerStats } from '../combat/stats';
import type { Rng } from '../core/rng';
import type { Enemy } from '../entities/Enemy';

/** What the shock needs from the scene: who can be hit, and how a hit lands. */
export interface StrikeHost {
  /** The live group, not a copy: read it, don't keep it across a kill. */
  enemyGroup(): readonly Enemy[];
  /** A fresh list of enemies that can be hit, safe to hold while hits kill some. */
  liveEnemies(): Enemy[];
  /** Applies the damage and any kill. */
  strikeEnemy(enemy: Enemy, damage: number, fromX: number, fromY: number, knockback: number): void;
  /** Bone piles, which take hits too though they aren't enemies. */
  readonly piles: { strikeWhere(struck: (x: number, y: number) => boolean | number, damage: number): void };
}

const ARC_MS = 120;
/** Enough for a few chains at once; a full pool just skips drawing. */
const ARC_POOL = 24;
const ARC_KINKS = 4;
const ARC_KINK_PX = 6;
const ARC_COLOR = 0xbfe8ff;

interface Arc {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  until: number;
}

/** Arcs that jump from a struck enemy to the ones around it, and the zigzags drawn for them. */
export class ChainShock {
  private readonly host: StrikeHost;
  private readonly rng: Rng;
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly arcs: Arc[] = Array.from({ length: ARC_POOL }, () => ({ ax: 0, ay: 0, bx: 0, by: 0, until: 0 }));
  private drawn = false;

  constructor(scene: Phaser.Scene, host: StrikeHost, rng: Rng) {
    this.host = host;
    this.rng = rng;
    this.gfx = scene.add.graphics().setDepth(8).setBlendMode(Phaser.BlendModes.ADD);
  }

  /**
   * A primary hit of `damage` landed on `struck` at (`x`, `y`). Arcs never start more arcs, and
   * don't push. `struck` may already be dead; its spot still anchors the chain.
   */
  trigger(stats: PlayerStats, struck: Enemy, x: number, y: number, damage: number, now: number) {
    if (stats.chain <= 0 && stats.chainNova <= 0) return;
    if (stats.chainNova <= 0 && !this.rng.chance(stats.chainChance)) return;
    const others = this.host.liveEnemies().filter((e) => e !== struck);
    if (others.length === 0) return;
    const points: Point[] = [{ x, y }, ...others];
    if (stats.chainNova > 0) {
      for (const i of novaTargets(points, 0, CHAIN_RADIUS))
        this.zap(others[i - 1], x, y, damage * stats.chainNova, now);
      return;
    }
    let fromX = x;
    let fromY = y;
    chainPath(points, 0, stats.chain, CHAIN_RADIUS).forEach((i, jump) => {
      const target = others[i - 1];
      const { x: toX, y: toY } = target;
      this.zap(target, fromX, fromY, chainDamage(damage, stats.chainRatio, jump), now);
      fromX = toX;
      fromY = toY;
    });
  }

  private zap(target: Enemy, fromX: number, fromY: number, damage: number, now: number) {
    this.addArc(fromX, fromY, target.x, target.y, now);
    this.host.strikeEnemy(target, damage, fromX, fromY, 0);
  }

  private addArc(ax: number, ay: number, bx: number, by: number, now: number) {
    const arc = this.arcs.find((a) => a.until <= now);
    if (!arc) return;
    arc.ax = ax;
    arc.ay = ay;
    arc.bx = bx;
    arc.by = by;
    arc.until = now + ARC_MS;
  }

  /** Redraws only while an arc is showing. */
  update(now: number) {
    let showing = false;
    for (const arc of this.arcs) showing ||= arc.until > now;
    if (!showing && !this.drawn) return;
    this.gfx.clear();
    this.drawn = showing;
    for (const arc of this.arcs) if (arc.until > now) this.drawArc(arc, (arc.until - now) / ARC_MS);
  }

  /** A zigzag with fixed kinks, alternating sides, so it reads as electric without any chance involved. */
  private drawArc(arc: Arc, life: number) {
    const dx = arc.bx - arc.ax;
    const dy = arc.by - arc.ay;
    const length = Math.hypot(dx, dy) || 1;
    const nx = -dy / length;
    const ny = dx / length;
    const g = this.gfx;
    g.lineStyle(2, ARC_COLOR, life);
    g.beginPath();
    g.moveTo(arc.ax, arc.ay);
    for (let k = 1; k <= ARC_KINKS; k++) {
      const t = k / (ARC_KINKS + 1);
      const side = k % 2 === 0 ? 1 : -1;
      g.lineTo(arc.ax + dx * t + nx * ARC_KINK_PX * side, arc.ay + dy * t + ny * ARC_KINK_PX * side);
    }
    g.lineTo(arc.bx, arc.by);
    g.strokePath();
  }

  clear() {
    for (const arc of this.arcs) arc.until = 0;
    this.gfx.clear();
    this.drawn = false;
  }
}
