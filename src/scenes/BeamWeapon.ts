import Phaser from 'phaser';
import { STAT_LIMITS } from '../combat/balance';
import {
  BEAM,
  type BeamRay,
  type Bounds,
  beamDurationMs,
  beamLength,
  beamTickDamage,
  pathTouches,
  segmentDistanceSq,
  traceBeam,
} from '../combat/beam';
import type { PlayerStats } from '../combat/stats';
import { ECHO_OFFSETS, directionOffset, fanAngle, shotsInDirection } from '../combat/volley';
import { ROOM_H, ROOM_W, ROOM_X, ROOM_Y, TILE } from '../config';
import type { Enemy } from '../entities/Enemy';
import type { BeamTrigger, Player } from '../entities/Player';
import { PILE_RADIUS } from './BonePiles';
import type { ChainShock, StrikeHost } from './ChainShock';

/** Homing bends the beam as much per px as it turns a bolt flying at base speed. */
const HOMING_PX_PER_SECOND = 360;
/** Enemy bodies are 12 px circles at scale 1. */
const ENEMY_RADIUS = 12;
/** A held beam stays up this long past the last frame the key was down. */
const CONTINUOUS_GRACE_MS = 50;
/** The fan and the echoes share out `shotCount + echoShots` beams; each can refract into two more. */
const MAX_AIMED = STAT_LIMITS.maxShotCount + ECHO_OFFSETS.length;
const MAX_PATHS = MAX_AIMED * 3;
/** One group per direction, then one per refracted beam. */
const MAX_GROUPS = 1 + ECHO_OFFSETS.length + MAX_AIMED * 2;
/** x, y pairs per path; past this a long, winding beam is cut short. */
const PATH_POINTS = 96;
const REFRACT_RAD = (BEAM.refractDeg * Math.PI) / 180;
const GLOW_COLOR = 0x3d8bff;
const CORE_COLOR = 0xe8f6ff;
/** The beam's width swells and shrinks by this share, once every `THROB_MS` × 2π. */
const THROB = 0.12;
const THROB_MS = 45;
const BURST_SPIKES = 8;
const BURST_TURN_MS = 160;

const ROOM_INSIDE: Bounds = {
  minX: ROOM_X + TILE,
  minY: ROOM_Y + TILE,
  maxX: ROOM_X + ROOM_W - TILE,
  maxY: ROOM_Y + ROOM_H - TILE,
};

/**
 * The charged beam once fired: follows the player's aim while it lasts, hits what it touches
 * once per tick, and is drawn fresh each frame from preallocated paths.
 *
 * Beams are grouped: one group per direction (the aim and each echo), and one per refracted
 * beam. Each tick an enemy takes at most one hit per group, so a fan covers ground rather than
 * stacking its damage on whoever stands at its mouth.
 */
export class BeamWeapon {
  private readonly host: StrikeHost;
  private readonly chain: ChainShock;
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly paths: number[][] = Array.from({ length: MAX_PATHS }, () => new Array<number>(PATH_POINTS * 2));
  private readonly pointCounts: number[] = new Array<number>(MAX_PATHS).fill(0);
  /** Damage share per path: 1 aimed, `echoDamage` for echoes, less again once refracted. */
  private readonly shares: number[] = new Array<number>(MAX_PATHS).fill(1);
  private readonly widths: number[] = new Array<number>(MAX_PATHS).fill(1);
  private readonly groups: number[] = new Array<number>(MAX_PATHS).fill(0);
  /** A refracted beam starts inside the enemy that split it, and mustn't hit it again. */
  private readonly skips: (Enemy | null)[] = new Array<Enemy | null>(MAX_PATHS).fill(null);
  /** Per group, the last enemy stamp that took its hit this tick. */
  private readonly groupStamps: number[] = new Array<number>(MAX_GROUPS).fill(-1);
  private pathCount = 0;
  private groupCount = 0;
  private active = false;
  private continuous = false;
  private power = 1;
  private until = 0;
  private nextTickAt = 0;
  private firstTick = true;
  /** Refilled each frame; `aimAt` bends the beam toward the nearest of them. */
  private readonly targets: Enemy[] = [];
  /** Reused for every path traced, so tracing allocates nothing. */
  private readonly ray: BeamRay = { x: 0, y: 0, angle: 0, length: 0, turnPerPx: 0 };
  /** Set each frame by `tracePaths`, for every path traced and every tick that frame. */
  private length = 0;
  private turn = 0;
  private beamWidth = 0;
  /** Set by `tick` for the hits it deals. */
  private tickDamage = 0;
  private tickKnockback = 0;

  constructor(scene: Phaser.Scene, host: StrikeHost, chain: ChainShock) {
    this.host = host;
    this.chain = chain;
    this.gfx = scene.add.graphics().setDepth(8).setBlendMode(Phaser.BlendModes.ADD);
  }

  /** A beam released, or one held on: a held beam keeps its tick rhythm while it stays up. */
  fire(trigger: BeamTrigger, stats: PlayerStats, now: number) {
    if (trigger.continuous && this.active && this.continuous) {
      this.until = now + BEAM.tickMs + CONTINUOUS_GRACE_MS;
      return;
    }
    this.active = true;
    this.continuous = trigger.continuous;
    this.power = trigger.power;
    this.until = now + (trigger.continuous ? BEAM.tickMs + CONTINUOUS_GRACE_MS : beamDurationMs(stats));
    this.nextTickAt = now;
    this.firstTick = true;
  }

  update(player: Player, now: number) {
    if (!this.active) return;
    if (now >= this.until) {
      this.stop();
      return;
    }
    this.collectTargets();
    this.tracePaths(player);
    if (now >= this.nextTickAt) this.tick(player, now);
    this.draw(player.stats, now);
  }

  /** Refills the reused target list in place; kills during a tick only mark entries inactive. */
  private collectTargets() {
    this.targets.length = 0;
    for (const enemy of this.host.enemyGroup()) if (enemy.active && enemy.harmful) this.targets.push(enemy);
  }

  /**
   * A fan toward the aim and one toward each echo, sharing out the extra beams as bolts do.
   * The aimed fan leaves from the key's tip and the backward one from its handle end; side
   * fans, with no key reaching that way, leave from the grip.
   */
  private tracePaths(player: Player) {
    const s = player.stats;
    this.length = beamLength(s, this.continuous);
    this.turn = s.homing / HOMING_PX_PER_SECOND;
    this.beamWidth = this.width(s);
    this.pathCount = 0;
    this.groupCount = 1 + s.echoShots;
    for (let d = 0; d <= s.echoShots; d++) this.traceDirection(player, d);
  }

  /** Direction `d`'s fan: the aim for 0, an echo after. */
  private traceDirection(player: Player, d: number) {
    const s = player.stats;
    const offset = directionOffset(d);
    const center = player.aimAngle + offset;
    // Only the backward echo runs along the key: cos(offset) is -1 there and 0 to the sides.
    const reach = Math.max(0, -Math.cos(offset)) * player.keyHandleReach;
    const x = d === 0 ? player.keyTipX : player.keyGripX + Math.cos(center) * reach;
    const y = d === 0 ? player.keyTipY : player.keyGripY + Math.sin(center) * reach;
    const count = shotsInDirection(d, s.shotCount, s.echoShots);
    for (let i = 0; i < count; i++) {
      const p = this.tracePath(x, y, fanAngle(center, i, count, s.spread), this.length, d);
      if (p < 0) continue;
      this.shares[p] = d === 0 ? 1 : s.echoDamage;
      if (s.refract > 0) this.refract(p);
    }
  }

  /** Traces a full-width path that skips no one; returns its index, or -1 when there's no room for it. */
  private tracePath(x: number, y: number, angle: number, length: number, group: number): number {
    // The console can push shot counts past their limits; extra beams are dropped, never thrown.
    if (this.pathCount >= MAX_PATHS || group >= MAX_GROUPS) return -1;
    const p = this.pathCount++;
    const ray = this.ray;
    ray.x = x;
    ray.y = y;
    ray.angle = angle;
    ray.length = length;
    ray.turnPerPx = this.turn;
    this.pointCounts[p] = traceBeam(this.paths[p], ray, ROOM_INSIDE, this.aimAt);
    this.shares[p] = 1;
    this.widths[p] = 1;
    this.groups[p] = group;
    this.skips[p] = null;
    return p;
  }

  /** Splits path `p` in two at the first enemy it touches, the halves carrying on for what reach is left. */
  private refract(p: number) {
    const path = this.paths[p];
    const x0 = path[0];
    const y0 = path[1];
    let first: Enemy | null = null;
    let firstD2 = Infinity;
    for (const enemy of this.targets) {
      const radius = this.beamWidth / 2 + ENEMY_RADIUS * enemy.def.scale;
      if (!pathTouches(path, this.pointCounts[p], enemy.x, enemy.y, radius)) continue;
      const d2 = (enemy.x - x0) ** 2 + (enemy.y - y0) ** 2;
      if (d2 >= firstD2) continue;
      first = enemy;
      firstD2 = d2;
    }
    const left = this.length - Math.sqrt(firstD2);
    if (!first || left <= 0) return;
    const heading = Math.atan2(first.y - y0, first.x - x0);
    const share = this.shares[p] * BEAM.refractShare;
    for (let side = -1; side <= 1; side += 2) {
      const q = this.tracePath(first.x, first.y, heading + side * REFRACT_RAD, left, this.groupCount++);
      if (q < 0) continue;
      this.shares[q] = share;
      this.widths[q] = BEAM.refractWidth;
      this.skips[q] = first;
    }
  }

  /** Angle from (`x`, `y`) to the nearest enemy, for homing. */
  private readonly aimAt = (x: number, y: number): number | undefined => {
    let best: Enemy | undefined;
    let bestD2 = Infinity;
    for (const enemy of this.targets) {
      if (!enemy.active) continue;
      const d2 = (enemy.x - x) ** 2 + (enemy.y - y) ** 2;
      if (d2 >= bestD2) continue;
      best = enemy;
      bestD2 = d2;
    }
    return best ? Math.atan2(best.y - y, best.x - x) : undefined;
  };

  /**
   * Every enemy takes the tick's damage once per beam group it's in. The key itself counts as
   * part of the aimed group, so an enemy pressed against the hero, short of the tip, is hit too.
   * Only a released beam's first tick starts arc chains; a held one lets each enemy start one now and then.
   */
  private tick(player: Player, now: number) {
    const s = player.stats;
    this.tickDamage = beamTickDamage(s, this.power, this.continuous);
    // A held beam pushing every tick would pin enemies out of reach for free.
    this.tickKnockback = this.continuous ? 0 : s.knockback * BEAM.tickKnockback;
    this.groupStamps.fill(-1);
    for (let e = 0; e < this.targets.length; e++) {
      const enemy = this.targets[e];
      const keyReach = this.beamWidth / 2 + ENEMY_RADIUS * enemy.def.scale;
      const onKey =
        segmentDistanceSq(enemy.x, enemy.y, player.keyGripX, player.keyGripY, player.keyTipX, player.keyTipY) <=
        keyReach * keyReach;
      this.hitAlongPaths(player, e, onKey, now);
    }
    this.host.piles.strikeWhere(this.inBeam, this.tickDamage);
    this.nextTickAt += BEAM.tickMs;
    this.firstTick = false;
  }

  /** Whether any path touches a bone pile at (`x`, `y`); a pile takes one tick's damage however many do. */
  private readonly inBeam = (x: number, y: number): boolean => {
    for (let p = 0; p < this.pathCount; p++) {
      const radius = (this.beamWidth * this.widths[p]) / 2 + PILE_RADIUS;
      if (pathTouches(this.paths[p], this.pointCounts[p], x, y, radius)) return true;
    }
    return false;
  };

  /** Strikes target `e` once for each beam group whose path touches it. */
  private hitAlongPaths(player: Player, e: number, onKey: boolean, now: number) {
    const enemy = this.targets[e];
    const body = ENEMY_RADIUS * enemy.def.scale;
    for (let p = 0; p < this.pathCount; p++) {
      const group = this.groups[p];
      if (!enemy.active || this.groupStamps[group] === e || this.skips[p] === enemy) continue;
      const radius = (this.beamWidth * this.widths[p]) / 2 + body;
      const touches =
        (group === 0 && onKey) || pathTouches(this.paths[p], this.pointCounts[p], enemy.x, enemy.y, radius);
      if (!touches) continue;
      this.groupStamps[group] = e;
      this.strike(player, enemy, this.tickDamage * this.shares[p], this.tickKnockback, now);
    }
  }

  private strike(player: Player, enemy: Enemy, damage: number, knockback: number, now: number) {
    const { x, y } = enemy;
    this.host.strikeEnemy(enemy, damage, player.x, player.y, knockback);
    if (!this.startsChain(enemy, now)) return;
    enemy.chainReadyAt = now + BEAM.chainCooldownMs;
    this.chain.trigger(player.stats, enemy, x, y, damage, now);
  }

  private startsChain(enemy: Enemy, now: number): boolean {
    if (this.continuous) return now >= enemy.chainReadyAt;
    return this.firstTick;
  }

  /** Early releases are thinner, so a weak beam reads as weak. */
  private width(s: PlayerStats): number {
    const charge = this.continuous ? 1 : 0.5 + 0.5 * this.power;
    return BEAM.width * s.boltScale * charge;
  }

  /**
   * A thick, throbbing beam: a soft haze, the colored body and a bright core, with a flare at
   * the mouth and a spiked burst where it ends. A released beam fades over its last moments.
   */
  private draw(s: PlayerStats, now: number) {
    const g = this.gfx;
    const fade = this.continuous ? 1 : Math.min(1, (this.until - now) / BEAM.tickMs);
    const throbbing = this.width(s) * (1 + THROB * Math.sin(now / THROB_MS));
    g.clear();
    for (let p = 0; p < this.pathCount; p++) {
      const width = throbbing * this.widths[p];
      this.strokePath(p, width * 1.7, GLOW_COLOR, 0.22 * fade);
      this.strokePath(p, width, GLOW_COLOR, 0.75 * fade);
      this.strokePath(p, width * 0.45, CORE_COLOR, fade);
      const path = this.paths[p];
      const end = (this.pointCounts[p] - 1) * 2;
      this.drawFlare(path[0], path[1], width * 0.7, fade);
      this.drawBurst(path[end], path[end + 1], width, now, fade);
    }
  }

  private drawFlare(x: number, y: number, radius: number, fade: number) {
    const g = this.gfx;
    g.fillStyle(GLOW_COLOR, 0.6 * fade).fillCircle(x, y, radius);
    g.fillStyle(CORE_COLOR, fade).fillCircle(x, y, radius * 0.55);
  }

  /** Spikes turn slowly and alternate in length, so the impact reads as splashing, not as a dot. */
  private drawBurst(x: number, y: number, size: number, now: number, fade: number) {
    const g = this.gfx;
    const turn = now / BURST_TURN_MS;
    g.fillStyle(GLOW_COLOR, 0.7 * fade);
    for (let i = 0; i < BURST_SPIKES; i++) {
      const a = turn + (i / BURST_SPIKES) * Math.PI * 2;
      const reach = size * (i % 2 === 0 ? 1.5 : 1);
      const side = Math.PI / BURST_SPIKES / 2;
      g.fillTriangle(
        x + Math.cos(a - side) * size * 0.4,
        y + Math.sin(a - side) * size * 0.4,
        x + Math.cos(a + side) * size * 0.4,
        y + Math.sin(a + side) * size * 0.4,
        x + Math.cos(a) * reach,
        y + Math.sin(a) * reach,
      );
    }
    g.fillCircle(x, y, size * 0.7);
    g.fillStyle(CORE_COLOR, fade).fillCircle(x, y, size * 0.4);
  }

  private strokePath(p: number, width: number, color: number, alpha: number) {
    const path = this.paths[p];
    const g = this.gfx;
    g.lineStyle(width, color, alpha);
    g.beginPath();
    g.moveTo(path[0], path[1]);
    for (let i = 1; i < this.pointCounts[p]; i++) g.lineTo(path[i * 2], path[i * 2 + 1]);
    g.strokePath();
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    this.gfx.clear();
  }
}
