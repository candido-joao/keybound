import Phaser from 'phaser';
import { DOOR_COL, DOOR_ROW, ROOM_H, ROOM_W, ROOM_X, ROOM_Y, TILE, tileX, tileY } from '../config';
import { enemiesPerRoom } from '../combat/balance';
import { spotAwayFrom } from '../combat/behaviors';
import { ENEMIES, type EnemyDef, type SummonAttack, enemyForDepth, rollRoomEnemies } from '../combat/enemies';
import { Rng } from '../core/rng';
import { Enemy } from '../entities/Enemy';
import type { HostileOrb } from '../entities/HostileOrb';
import type { RoomNode } from '../floor/FloorGenerator';
import { INTERIOR_CELLS, cellCol, cellRow } from '../floor/obstacles';
import { EVENT_TUNING, curseStrays, cursedDef, miniBossDef, twinDef } from '../floor/roomEvents';
import { t } from '../i18n';
import type { GameScene } from './GameScene';

/** How far from a mini boss its summons appear. */
const SUMMON_RING = TILE * 1.4;
/** How far from a fallen sentinel its shards land. */
const SPLIT_SPREAD = 14;
/** A blink lands at least this far from the player. */
const BLINK_MIN_DISTANCE = TILE * 4;
/** New enemies keep this far from the player, so none appears on top of them. */
const SPAWN_CLEARANCE = TILE * 3.5;

/**
 * Brings enemies into the room: a room's pack, the boss, event spawns, summons and splits.
 * Every roll has its own seeded stream, so the same seed fills the same rooms.
 */
export class EnemySpawner {
  private readonly game: GameScene;
  /** Give each console spawn, summon, split and blink its own Rng stream. */
  private debugSpawns = 0;
  private summons = 0;
  private splits = 0;
  private blinks = 0;

  constructor(game: GameScene) {
    this.game = game;
  }

  /** The room's enemies when it isn't clear yet: the floor's boss in a boss room, a pack anywhere else. */
  fill(room: RoomNode) {
    if (room.type !== 'boss') {
      this.wave(room, 0);
      return;
    }
    const game = this.game;
    const boss = enemyForDepth(game.boss, game.depth);
    this.spawn(boss, tileX(DOOR_COL), tileY(DOOR_ROW - 1));
    game.startBossIntro(boss, tileX(DOOR_COL), tileY(DOOR_ROW - 1));
  }

  /** See `EventHost.spawnWave`. */
  wave(room: RoomNode, wave: number, transform?: (def: EnemyDef) => EnemyDef) {
    const { seed, depth, phase } = this.game;
    // Wave 0 keeps the plain room's stream, so a room rolls the same with or without an event.
    const suffix = wave > 0 ? `:w${wave}` : '';
    const rng = new Rng(`${seed}:room:${depth}:${room.x},${room.y}${suffix}`);
    const { min, max } = enemiesPerRoom(depth);
    const kinds = rollRoomEnemies(rng, rng.int(min, max), phase.enemies);
    const defs = kinds.map((def) => enemyForDepth(def, depth));
    this.pack(transform ? defs.map(transform) : curseStrays(rng, defs, depth), rng);
  }

  miniBoss(room: RoomNode) {
    const { seed, depth, phase } = this.game;
    const rng = new Rng(`${seed}:miniboss:${depth}:${room.x},${room.y}`);
    const [kind] = rollRoomEnemies(rng, 1, phase.enemies);
    const def = miniBossDef(enemyForDepth(kind, depth));
    this.pack([def], rng);
    this.game.banner(t(def.name));
  }

  /** Two smaller copies of the floor's boss a few tiles apart, their attacks out of step. */
  twins() {
    const game = this.game;
    const def = twinDef(enemyForDepth(game.boss, game.depth));
    const y = tileY(DOOR_ROW - 1);
    this.spawn(def, tileX(DOOR_COL - 2), y);
    this.spawn(def, tileX(DOOR_COL + 2), y).delayAttacks(EVENT_TUNING.twin.desyncMs);
    game.startBossIntro(def, tileX(DOOR_COL), y);
  }

  /** The console's spawn: `count` of one enemy, scaled to this floor. */
  debug(enemyId: string, count: number) {
    const def = ENEMIES.find((e) => e.id === enemyId);
    if (!def) return;
    const { seed, depth } = this.game;
    const rng = new Rng(`${seed}:debug:${depth}:${this.debugSpawns++}`);
    this.pack(Array<EnemyDef>(count).fill(enemyForDepth(def, depth)), rng);
  }

  /** The parent's pieces bursting out around where it fell; a cursed parent's pieces keep the curse. */
  split(parent: EnemyDef, x: number, y: number) {
    const { id, count } = parent.split!;
    const base = ENEMIES.find((e) => e.id === id);
    if (!base) return;
    const { seed, depth } = this.game;
    const rng = new Rng(`${seed}:split:${depth}:${this.splits++}`);
    const plain = enemyForDepth(base, depth);
    this.ring(parent.cursed ? cursedDef(plain) : plain, count, x, y, SPLIT_SPREAD, rng);
  }

  spawn(def: EnemyDef, x: number, y: number, wobbleSeed = 0): Enemy {
    const game = this.game;
    const enemy = new Enemy(game, game.clock, x, y, def, wobbleSeed);
    game.enemies.add(enemy);
    enemy.initBody();
    enemy.shoot = this.fireOrb;
    enemy.steer = game.obstacles.steer;
    enemy.summon = this.summonMinions;
    enemy.explode = game.combat.explode;
    enemy.blinkTo = this.blinkSpot;
    enemy.speedScale = game.player.stats.enemySpeed;
    return enemy;
  }

  /** `defs` on shuffled floor tiles away from the player; more than fit wrap around. */
  private pack(defs: readonly EnemyDef[], rng: Rng) {
    const cells = rng.shuffle(this.cellsAwayFromPlayer());
    defs.forEach((def, i) => {
      const { col, row } = cells[i % cells.length];
      this.spawn(def, tileX(col), tileY(row), rng.next() * 1000);
    });
  }

  /** `count` of `def` spread evenly around (`x`, `y`) at `radius`, turned by a roll, kept inside the room. */
  private ring(def: EnemyDef, count: number, x: number, y: number, radius: number, rng: Rng) {
    const margin = TILE * 1.5;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + rng.next();
      const sx = Phaser.Math.Clamp(x + Math.cos(angle) * radius, ROOM_X + margin, ROOM_X + ROOM_W - margin);
      const sy = Phaser.Math.Clamp(y + Math.sin(angle) * radius, ROOM_Y + margin, ROOM_Y + ROOM_H - margin);
      const spot = this.game.obstacles.snap(sx, sy);
      this.spawn(def, spot.x, spot.y, rng.next() * 1000);
    }
  }

  private cellsAwayFromPlayer(): { col: number; row: number }[] {
    const { player, obstacles } = this.game;
    const cells: { col: number; row: number }[] = [];
    for (const cell of INTERIOR_CELLS) {
      const col = cellCol(cell);
      const row = cellRow(cell);
      const far = Phaser.Math.Distance.Between(tileX(col), tileY(row), player.x, player.y) > SPAWN_CLEARANCE;
      if (far && obstacles.isOpen(col, row)) cells.push({ col, row });
    }
    return cells;
  }

  /** A full pool drops the shot rather than growing mid fight. */
  private readonly fireOrb = (x: number, y: number, angle: number, speed: number, damage: number) => {
    const { orbs, player } = this.game;
    (orbs.get(x, y) as HostileOrb | null)?.fire(x, y, angle, speed * player.stats.orbSpeed, damage);
  };

  /** Plain copies around the summoner, in a ring, kept inside the room. */
  private readonly summonMinions = (summoner: Enemy, attack: SummonAttack) => {
    const { seed, depth, enemies } = this.game;
    const base = ENEMIES.find((e) => e.id === attack.minionId);
    if (!base || enemies.countActive() >= attack.maxAlive) return;
    const rng = new Rng(`${seed}:summon:${depth}:${this.summons++}`);
    const count = rng.int(attack.min, attack.max);
    this.ring(enemyForDepth(base, depth), count, summoner.x, summoner.y, SUMMON_RING, rng);
  };

  /** Somewhere on the floor far from the player. */
  private readonly blinkSpot = (enemy: Enemy) => {
    const { seed, depth, player } = this.game;
    const rng = new Rng(`${seed}:blink:${depth}:${this.blinks++}`);
    const spots = this.cellsAwayFromPlayer().map(({ col, row }) => ({ x: tileX(col), y: tileY(row) }));
    if (spots.length === 0) return { x: enemy.x, y: enemy.y };
    return spotAwayFrom(rng, spots, player.x, player.y, BLINK_MIN_DISTANCE);
  };
}
