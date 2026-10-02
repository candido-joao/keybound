import Phaser from 'phaser';
import {
  COLORS,
  DOOR_COL,
  DOOR_ROW,
  GAME_W,
  LABEL_RANGE,
  ROOM_COLS,
  ROOM_H,
  ROOM_ROWS,
  ROOM_W,
  ROOM_X,
  ROOM_Y,
  TILE,
  tileX,
  tileY,
} from '../config';
import { ITEMS, addItemIcon } from '../combat/items';
import { rollRewards } from '../combat/itemPool';
import { BASE_STATS, CHAIN_COOLDOWN_MS, enemiesPerRoom } from '../combat/balance';
import { DROPS, type DropKind, type DropLuck, applyDrop, canCollect, rollDrops, withBossHeal } from '../combat/drops';
import { inBlast, reviveHp, spotAwayFrom } from '../combat/behaviors';
import { SWING, chargeDrive, inSwing, swingTouchesBox } from '../combat/swing';
import {
  BONE_PILE,
  ENEMIES,
  type EnemyDef,
  type ExplodeAttack,
  type SummonAttack,
  enemyForDepth,
  rollRoomEnemies,
  walkAnimKey,
} from '../combat/enemies';
import { type Item, type PlayerStats, computeStats } from '../combat/stats';
import { GameClock } from '../core/clock';
import { Rng } from '../core/rng';
import { type RunCheats, type RunData, type RunStats, newRun } from '../core/run';
import type { DebugTarget } from '../debug/commands';
import { Bolt } from '../entities/Bolt';
import { Player } from '../entities/Player';
import { SWING_FX, SWING_FX_FRAME } from '../entities/keyArt';
import { Enemy, OUTLINE_SCALE } from '../entities/Enemy';
import { HostileOrb } from '../entities/HostileOrb';
import { DIRS, type Dir, type Floor, type RoomNode, type RoomType, generateFloor } from '../floor/FloorGenerator';
import {
  type PhaseDef,
  floorTexture,
  isFinalFloor,
  isPhaseStart,
  phaseAt,
  rollFloorBoss,
  wallTexture,
} from '../floor/phases';
import {
  EVENT_TUNING,
  type RoomEventId,
  curseStrays,
  eventRoomType,
  miniBossDef,
  payAltar,
  rollRoomEvents,
  twinDef,
} from '../floor/roomEvents';
import { startsLocked } from '../floor/locks';
import { type Locale, type MessageKey, getLocale, t } from '../i18n';
import { pad } from '../input/touch';
import { BeamWeapon } from './BeamWeapon';
import type { BossIntroData } from './BossIntroScene';
import { ChainShock, type StrikeHost } from './ChainShock';
import { type EventHost, RoomEventDirector } from './RoomEventDirector';

/** Where the player appears when entering through a given side. */
const ENTRY: Record<Dir, { col: number; row: number }> = {
  up: { col: DOOR_COL, row: 1 },
  down: { col: DOOR_COL, row: ROOM_ROWS - 2 },
  left: { col: 1, row: DOOR_ROW },
  right: { col: ROOM_COLS - 2, row: DOOR_ROW },
};

/** How far from a mini boss its summons appear. */
const SUMMON_RING = TILE * 1.4;

/** Enough for a few volleys at once; a full pool skips the shot. */
const ORB_POOL_SIZE = 40;

/** Drops lie where they fell until the player walks over them. */
const DROP_PICKUP_RADIUS = 20;
/** Within this distance a drop slides toward the player: a short reach, so it still takes walking up to it. */
const DROP_MAGNET_RADIUS = 56;
const DROP_MAGNET_SPEED = 260;
/** Drops land around the kill, not stacked on one spot. */
const DROP_SCATTER = 14;

const CURSED_FLOOR_TINT = 0xc9a8ff;

/** Walking this close to a bone pile crushes it for good. */
const STOMP_RADIUS = 26;
/** A pile rattles for this long before it gets back up. */
const PILE_RATTLE_MS = 700;
/** How far from a fallen sentinel its shards land. */
const SPLIT_SPREAD = 14;
/** A blink lands at least this far from the player. */
const BLINK_MIN_DISTANCE = TILE * 4;
/** Blasts shove enemies harder than a bolt does. */
const BLAST_KNOCKBACK = 2;

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

/** A pedestal that must be stepped away from first arms beyond this distance. */
const PEDESTAL_ARM_RANGE = TILE;

/** Lintel color over each door, by the room it leads to. */
const DOOR_MARKER: Record<RoomType, number> = {
  start: COLORS.doorMarker,
  normal: COLORS.doorMarker,
  treasure: COLORS.treasure,
  boss: COLORS.boss,
};

export class GameScene extends Phaser.Scene implements EventHost, StrikeHost {
  seed!: string;
  seeded!: boolean;
  depth!: number;
  phase!: PhaseDef;
  /** This floor's boss, rolled from the phase's group. */
  private boss!: EnemyDef;
  floor!: Floor;
  room!: RoomNode;
  items: Item[] = [];
  currency = 0;
  /** Key swing charges; one comes back with each cleared room. */
  drive = 0;
  driveMax = 0;
  /** Heal orb odds carried across floors. */
  private luck!: DropLuck;
  /** Max HP traded away at blood altars this run. */
  private maxHealthLost = 0;
  private eventDirector!: RoomEventDirector;
  private beamWeapon!: BeamWeapon;
  private chainShock!: ChainShock;
  private dropRng!: Rng;
  /** Pickups lying in the current room. */
  private drops: { kind: DropKind; image: Phaser.GameObjects.Image }[] = [];
  /** Pickups left behind in other rooms of this floor, put back on re-entry. */
  private leftDrops = new Map<RoomNode, { kind: DropKind; x: number; y: number }[]>();
  player!: Player;
  /** Pauses with the scene; entities time their windows against it. */
  private clock!: GameClock;
  private kills = 0;
  private roomsCleared = 0;
  /** Gameplay time of earlier floors; this floor's is on the clock. */
  private pastTimeMs = 0;
  /** Debug console changes; they follow the run to the next floor. */
  private cheats: RunCheats = { god: false, stats: {} };
  /** Set by the console's reveal; lasts for this floor only. */
  mapRevealed = false;
  /** Gives each console spawn its own Rng stream. */
  private debugSpawns = 0;
  /** Gives each mini boss summon its own Rng stream. */
  private summons = 0;
  /** Give each split and each blink their own Rng stream. */
  private splits = 0;
  private blinks = 0;
  /** Bone piles in this room; the room isn't clear while any is left. */
  private piles: Pile[] = [];

  /** Item each reward room holds, fixed per floor so revisits and route don't change it. */
  private roomItems = new Map<RoomNode, Item>();
  /** Pedestals in this room whose label shows only while the player is near. */
  private pedestals: {
    x: number;
    y: number;
    item: Item;
    label: Phaser.GameObjects.Text;
    pickup: Phaser.Physics.Arcade.Collider;
  }[] = [];
  /** Language the pedestal labels were written in; the pause menu can switch it mid room. */
  private labelLocale?: Locale;
  private walls!: Phaser.Physics.Arcade.StaticGroup;
  private doorBlocks!: Phaser.Physics.Arcade.StaticGroup;
  /** This room's closed doors by side, so a swing can open just the one it hits. */
  private doorBlockAt = new Map<Dir, Phaser.Physics.Arcade.Sprite>();
  /** Doors a swing opened mid fight; walking back into an uncleared room shuts them again. */
  private openDoors = new Set<Dir>();
  private enemies!: Phaser.Physics.Arcade.Group;
  private bolts!: Phaser.Physics.Arcade.Group;
  /** Pool of enemy projectiles; orbs are released, never destroyed, until the scene restarts. */
  private orbs!: Phaser.Physics.Arcade.Group;
  /** Everything owned by the current room; destroyed on room change. */
  private roomDecor: { destroy(): void }[] = [];
  private transitioning = false;
  private gameOver = false;
  private bannerTexts: Phaser.GameObjects.Text[] = [];
  /** The run summary's title: what killed the player, or the victory. */
  endTitle: MessageKey = 'death.title';
  /** The final floor's boss fell and the player took its portal. */
  won = false;
  /** The boss intro holds the clock and physics until it ends. */
  private inBossIntro = false;
  /** Summed over every living boss in the room; `max` 0 when there is none. Refreshed each frame for the HUD. */
  readonly bossHealth: { hp: number; max: number; name?: MessageKey } = { hp: 0, max: 0 };

  constructor() {
    super('game');
  }

  create(data: RunData) {
    this.seed = data.seed;
    this.seeded = data.seeded;
    this.depth = data.depth;
    this.phase = phaseAt(this.depth);
    this.boss = rollFloorBoss(new Rng(`${this.seed}:boss:${this.depth}`), this.phase);
    this.kills = data.stats.kills;
    this.roomsCleared = data.stats.roomsCleared;
    this.pastTimeMs = data.stats.timeMs;
    this.cheats = { god: data.cheats?.god ?? false, stats: { ...data.cheats?.stats } };
    this.mapRevealed = false;
    this.debugSpawns = 0;
    this.summons = 0;
    this.splits = 0;
    this.blinks = 0;
    this.piles = [];
    this.transitioning = false;
    this.gameOver = false;
    this.inBossIntro = false;
    this.bossHealth.hp = 0;
    this.bossHealth.max = 0;
    this.roomDecor = [];
    this.bannerTexts = [];
    this.endTitle = 'death.title';
    this.won = false;
    this.pedestals = [];
    this.drops = [];
    this.leftDrops = new Map();
    this.currency = data.currency;
    this.drive = data.drive;
    this.driveMax = data.driveMax;
    this.luck = data.luck;
    this.maxHealthLost = data.maxHealthLost;
    this.dropRng = new Rng(`${this.seed}:drops:${this.depth}`);
    this.clock = new GameClock();
    // A restart after death would otherwise inherit the paused world.
    this.physics.resume();

    this.items = data.itemIds.flatMap((id) => ITEMS.find((i) => i.id === id) ?? []);
    this.floor = generateFloor(new Rng(`${this.seed}:floor:${this.depth}`), this.depth);
    const events = rollRoomEvents(new Rng(`${this.seed}:events:${this.depth}`), this.floor.rooms.values());
    for (const [room, id] of events) room.event = id;
    for (const room of this.floor.rooms.values()) room.locked = startsLocked(room, this.depth);
    this.eventDirector = new RoomEventDirector(this, this);

    const rewardRooms = [...this.floor.rooms.values()].filter((r) => r.type === 'treasure' || r.type === 'boss');
    const rewards = rollRewards(
      new Rng(`${this.seed}:items:${this.depth}`),
      ITEMS,
      this.items,
      rewardRooms.length,
      this.depth,
    );
    this.roomItems = new Map();
    rewardRooms.forEach((room, i) => rewards[i] && this.roomItems.set(room, rewards[i]));

    this.cameras.main.setBackgroundColor(this.phase.palette.background);
    this.walls = this.physics.add.staticGroup();
    this.doorBlocks = this.physics.add.staticGroup();
    this.enemies = this.physics.add.group();
    this.bolts = this.physics.add.group();
    this.orbs = this.physics.add.group({ classType: HostileOrb, maxSize: ORB_POOL_SIZE });

    const stats = this.currentStats();
    this.player = new Player(this, this.clock, tileX(DOOR_COL), tileY(DOOR_ROW), stats);
    if (data.health !== undefined) this.player.health = Math.min(stats.maxHealth, data.health);
    this.chainShock = new ChainShock(this, this, new Rng(`${this.seed}:chain:${this.depth}`));
    this.beamWeapon = new BeamWeapon(this, this, this.chainShock);

    this.setupCollisions();
    this.enterRoom(this.floor.start);
    this.showFloorBanner();

    if (!this.scene.isActive('hud')) this.scene.launch('hud');
    this.scene.bringToTop('hud');
    if (!this.scene.isActive('touch')) this.scene.launch('touch');
    this.scene.bringToTop('touch');

    this.input.keyboard!.on('keydown-ESC', () => this.requestPause());
  }

  /** A new phase is announced by name, with the floor under it. */
  private showFloorBanner() {
    const floor = t('floor.label', { n: this.depth });
    if (isPhaseStart(this.depth)) {
      this.showBanner(t(this.phase.name), floor);
      return;
    }
    this.showBanner(floor);
  }

  /** False mid room change or after death, when overlays must not open. */
  get canPause(): boolean {
    return !this.transitioning && !this.gameOver && !this.inBossIntro;
  }

  /** Esc or the touch pause button; ignored when an overlay can't open. */
  requestPause() {
    if (!this.canPause) return;
    // A thumb still on a stick must not keep the player walking after the pause.
    pad.releaseAll();
    this.scene.pause();
    this.scene.launch('pause');
    this.scene.bringToTop('pause');
  }

  /** Wires room collisions and combat overlaps, using each enemy's current contact damage. */
  private setupCollisions() {
    const p = this.physics;
    p.add.collider(this.player, [this.walls, this.doorBlocks]);
    p.add.collider(this.enemies, [this.walls, this.doorBlocks]);
    p.add.collider(this.enemies, this.enemies, undefined, (a, b) => !(a as Enemy).def.ghost && !(b as Enemy).def.ghost);
    p.add.collider(this.bolts, [this.walls, this.doorBlocks], (bolt) => (bolt as Bolt).burst());

    p.add.overlap(this.bolts, this.enemies, (b, e) => {
      const bolt = b as Bolt;
      const enemy = e as Enemy;
      if (!bolt.active || !enemy.active || !enemy.hittable) return;
      // Read before striking: a bolt that can't pierce any further is gone after it.
      const { x, y, damage } = bolt;
      if (!bolt.strike(enemy)) return;
      const enemyX = enemy.x;
      const enemyY = enemy.y;
      this.strikeEnemy(enemy, damage, x, y, this.player.stats.knockback);
      const now = this.clock.now;
      if (now < enemy.chainReadyAt) return;
      enemy.chainReadyAt = now + CHAIN_COOLDOWN_MS;
      this.chainShock.trigger(this.player.stats, enemy, enemyX, enemyY, damage, now);
    });

    p.add.collider(this.orbs, [this.walls, this.doorBlocks], (orb) => (orb as HostileOrb).release());
    p.add.overlap(this.player, this.orbs, (_, o) => {
      const orb = o as HostileOrb;
      if (!orb.active) return;
      orb.release();
      if (this.cheats.god) return;
      if (this.player.hurt(orb.damage) && this.player.health <= 0) this.onDeath();
    });

    p.add.overlap(this.player, this.enemies, (_, e) => {
      const enemy = e as Enemy;
      if (this.cheats.god) return;
      if (enemy.harmful && this.player.hurt(enemy.contactDamage) && this.player.health <= 0) this.onDeath();
    });
  }

  update(_time: number, delta: number) {
    if (this.gameOver || this.transitioning || this.inBossIntro) {
      // Nothing moves the player meanwhile, so it mustn't walk in place, nor hold a beam on.
      this.player.stand();
      this.beamWeapon.stop();
      return;
    }

    this.clock.tick(delta);
    const time = this.clock.now;
    this.player.move();
    if (this.player.wantsSwing()) this.swing();
    const shot = this.player.tryShoot(time);
    for (const spec of shot.bolts) {
      const bolt = new Bolt(this, spec);
      this.bolts.add(bolt);
      bolt.launch(spec);
    }
    if (shot.beam) this.beamWeapon.fire(shot.beam, this.player.stats, time);

    const enemies = this.enemies.getChildren() as Enemy[];
    for (const enemy of enemies) enemy.chase(this.player, time);
    this.applyWallSlams(enemies);
    this.beamWeapon.update(this.player, time);
    this.chainShock.update(time);
    this.updateBossHealth(enemies);

    const dt = delta / 1000;
    for (const bolt of [...this.bolts.getChildren()] as Bolt[]) {
      if (bolt.expired()) {
        bolt.burst();
        continue;
      }
      if (bolt.homing > 0) bolt.steerToward(this.homingTarget(bolt, enemies), dt);
    }

    this.updatePiles(time);
    this.updateDrops(dt);
    this.updatePedestalLabels();
    this.eventDirector.update();

    if (!this.room.cleared && this.enemiesLeft() === 0 && !this.eventDirector.holdsClear()) this.clearRoom();
    if (this.room.cleared || this.openDoors.size > 0) this.checkDoorExit();
  }

  private updateBossHealth(enemies: readonly Enemy[]) {
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

  /** Nearest enemy the bolt hasn't gone through yet; a piercing bolt would otherwise circle the one it just hit. */
  private homingTarget(bolt: Bolt, targets: readonly Enemy[]): Enemy | undefined {
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

  // ---------------------------------------------------------------- rooms

  private enterRoom(room: RoomNode, via?: Dir) {
    // Empty on a fresh floor, whose `room` still points at the last floor's.
    if (this.drops.length > 0) this.leaveDrops(this.room);
    this.room = room;
    room.visited = true;

    this.roomDecor.forEach((o) => o.destroy());
    this.roomDecor = [];
    this.pedestals = [];
    for (const pile of this.piles) for (const part of pile.parts) part.destroy();
    this.piles = [];
    this.walls.clear(true, true);
    this.doorBlocks.clear(true, true);
    this.doorBlockAt.clear();
    this.openDoors.clear();
    this.enemies.clear(true, true);
    this.bolts.clear(true, true);
    for (const orb of this.orbs.getChildren() as HostileOrb[]) orb.release();
    this.beamWeapon.stop();
    this.chainShock.clear();

    this.buildLayout(room);

    const entry = via ? ENTRY[DIRS[via].opposite] : { col: DOOR_COL, row: DOOR_ROW };
    this.player.teleport(tileX(entry.col), tileY(entry.row));

    this.restoreDrops(room);
    const eventSpawned = this.eventDirector.enter(room);
    if (!room.cleared && !eventSpawned) this.spawnEnemies(room);
    if (room.type === 'treasure' && !room.itemTaken) this.spawnItem(room, DOOR_ROW);
    if (room.event === 'miniboss' && room.cleared && !room.itemTaken) this.spawnItem(room, DOOR_ROW);
    if (room.type === 'boss' && room.cleared) this.spawnBossRewards(room);
  }

  private spawnBossRewards(room: RoomNode) {
    this.spawnPortal();
    // The last portal ends the run, so there is nothing left to use an item on.
    if (isFinalFloor(this.depth)) return;
    // Above the portal, so walking in to grab it doesn't drop the player into the next floor.
    if (!room.itemTaken) this.spawnItem(room, DOOR_ROW - 2);
  }

  private buildLayout(room: RoomNode) {
    const floor = this.add
      .tileSprite(ROOM_X, ROOM_Y, ROOM_W, ROOM_H, floorTexture(this.phase))
      .setOrigin(0)
      .setDepth(0);
    if (isCursed(room)) floor.setTint(CURSED_FLOOR_TINT);
    this.roomDecor.push(floor);

    const doors = new Set(this.floor.doors(room));
    const doorAt = (col: number, row: number): Dir | undefined => {
      if (row === 0 && col === DOOR_COL && doors.has('up')) return 'up';
      if (row === ROOM_ROWS - 1 && col === DOOR_COL && doors.has('down')) return 'down';
      if (col === 0 && row === DOOR_ROW && doors.has('left')) return 'left';
      if (col === ROOM_COLS - 1 && row === DOOR_ROW && doors.has('right')) return 'right';
      return undefined;
    };

    for (let row = 0; row < ROOM_ROWS; row++) {
      for (let col = 0; col < ROOM_COLS; col++) {
        const edge = row === 0 || col === 0 || row === ROOM_ROWS - 1 || col === ROOM_COLS - 1;
        if (!edge) continue;

        const door = doorAt(col, row);
        if (!door) {
          this.walls.create(tileX(col), tileY(row), wallTexture(this.phase)).setDepth(1);
          continue;
        }

        const neighbor = this.floor.neighbor(room, door)!;
        if (!room.cleared || neighbor.locked) this.closeDoor(door, col, row, neighbor);
        this.roomDecor.push(this.doorMarker(col, row, door, neighbor));
      }
    }
  }

  private closeDoor(dir: Dir, col: number, row: number, neighbor: RoomNode) {
    const texture = neighbor.locked ? 'door-locked' : 'door';
    const block = this.doorBlocks.create(tileX(col), tileY(row), texture) as Phaser.Physics.Arcade.Sprite;
    this.doorBlockAt.set(dir, block.setDepth(1));
  }

  private openDoor(dir: Dir) {
    const block = this.doorBlockAt.get(dir);
    if (!block) return;
    this.doorBlockAt.delete(dir);
    this.doorBlocks.remove(block, true, true);
  }

  /** Small colored lintel so boss/treasure doors read at a glance, and a cursed room can be avoided. */
  private doorMarker(col: number, row: number, dir: Dir, neighbor: RoomNode) {
    const color = isCursed(neighbor) ? COLORS.curse : DOOR_MARKER[neighbor.type];
    const horizontal = dir === 'up' || dir === 'down';
    const x = tileX(col) + DIRS[dir].dx * (TILE / 2 - 3);
    const y = tileY(row) + DIRS[dir].dy * (TILE / 2 - 3);
    return this.add.rectangle(x, y, horizontal ? TILE + 12 : 6, horizontal ? 6 : TILE + 12, color).setDepth(2);
  }

  private spawnEnemies(room: RoomNode) {
    if (room.type === 'boss') {
      const boss = enemyForDepth(this.boss, this.depth);
      this.spawnEnemy(boss, tileX(DOOR_COL), tileY(DOOR_ROW - 1));
      this.startBossIntro(boss, tileX(DOOR_COL), tileY(DOOR_ROW - 1));
      return;
    }

    this.spawnWave(room, 0);
  }

  spawnWave(room: RoomNode, wave: number, transform?: (def: EnemyDef) => EnemyDef) {
    // Wave 0 keeps the plain room's stream, so a room rolls the same with or without an event.
    const suffix = wave > 0 ? `:w${wave}` : '';
    const rng = new Rng(`${this.seed}:room:${this.depth}:${room.x},${room.y}${suffix}`);
    const { min, max } = enemiesPerRoom(this.depth);
    const kinds = rollRoomEnemies(rng, this.depth, rng.int(min, max), this.phase.enemies);
    const defs = kinds.map((def) => enemyForDepth(def, this.depth));
    this.spawnPack(transform ? defs.map(transform) : curseStrays(rng, defs, this.depth), rng);
  }

  spawnMiniBoss(room: RoomNode) {
    const rng = new Rng(`${this.seed}:miniboss:${this.depth}:${room.x},${room.y}`);
    const [kind] = rollRoomEnemies(rng, this.depth, 1, this.phase.enemies);
    const def = miniBossDef(enemyForDepth(kind, this.depth));
    this.spawnPack([def], rng);
    this.showBanner(t(def.name));
  }

  /** Plain copies around the summoner, in a ring, kept inside the room. */
  private readonly summonMinions = (summoner: Enemy, attack: SummonAttack) => {
    const base = ENEMIES.find((e) => e.id === attack.minionId);
    if (!base || this.enemies.countActive() >= attack.maxAlive) return;
    const rng = new Rng(`${this.seed}:summon:${this.depth}:${this.summons++}`);
    const count = rng.int(attack.min, attack.max);
    const def = enemyForDepth(base, this.depth);
    const margin = TILE * 1.5;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + rng.next();
      const x = Phaser.Math.Clamp(
        summoner.x + Math.cos(angle) * SUMMON_RING,
        ROOM_X + margin,
        ROOM_X + ROOM_W - margin,
      );
      const y = Phaser.Math.Clamp(
        summoner.y + Math.sin(angle) * SUMMON_RING,
        ROOM_Y + margin,
        ROOM_Y + ROOM_H - margin,
      );
      this.spawnEnemy(def, x, y, rng.next() * 1000);
    }
  };

  /** Two smaller copies of the floor's boss a few tiles apart, their attacks out of step. */
  spawnTwins() {
    const def = twinDef(enemyForDepth(this.boss, this.depth));
    const y = tileY(DOOR_ROW - 1);
    this.spawnEnemy(def, tileX(DOOR_COL - 2), y);
    this.spawnEnemy(def, tileX(DOOR_COL + 2), y).delayAttacks(EVENT_TUNING.twin.desyncMs);
    this.startBossIntro(def, tileX(DOOR_COL), y);
  }

  /** `defs` on shuffled floor tiles away from the player; more than fit wrap around. */
  private spawnPack(defs: readonly EnemyDef[], rng: Rng) {
    const cells = rng.shuffle(this.cellsAwayFromPlayer());
    defs.forEach((def, i) => {
      const { col, row } = cells[i % cells.length];
      this.spawnEnemy(def, tileX(col), tileY(row), rng.next() * 1000);
    });
  }

  private cellsAwayFromPlayer(): { col: number; row: number }[] {
    const cells: { col: number; row: number }[] = [];
    for (let row = 1; row < ROOM_ROWS - 1; row++) {
      for (let col = 1; col < ROOM_COLS - 1; col++) {
        const far = Phaser.Math.Distance.Between(tileX(col), tileY(row), this.player.x, this.player.y) > TILE * 3.5;
        if (far) cells.push({ col, row });
      }
    }
    return cells;
  }

  private spawnEnemy(def: EnemyDef, x: number, y: number, wobbleSeed = 0): Enemy {
    const enemy = new Enemy(this, this.clock, x, y, def, wobbleSeed);
    this.enemies.add(enemy);
    enemy.initBody();
    enemy.shoot = this.fireOrb;
    enemy.summon = this.summonMinions;
    enemy.explode = this.explodeEnemy;
    enemy.blinkTo = this.blinkSpot;
    enemy.speedScale = this.player.stats.enemySpeed;
    return enemy;
  }

  /** A full pool drops the shot rather than growing mid fight. */
  private readonly fireOrb = (x: number, y: number, angle: number, speed: number, damage: number) => {
    const orbSpeed = speed * this.player.stats.orbSpeed;
    (this.orbs.get(x, y) as HostileOrb | null)?.fire(x, y, angle, orbSpeed, damage);
  };

  // ---------------------------------------------------------------- strike host

  enemyGroup(): readonly Enemy[] {
    return this.enemies.getChildren() as Enemy[];
  }

  liveEnemies(): Enemy[] {
    return (this.enemies.getChildren() as Enemy[]).filter((e) => e.active && e.harmful);
  }

  strikeEnemy(enemy: Enemy, damage: number, fromX: number, fromY: number, knockback: number) {
    if (!enemy.active) return;
    const slam = knockback > 0 ? this.player.stats.wallSlam : 0;
    if (enemy.hit(damage, fromX, fromY, knockback, slam)) this.killEnemy(enemy);
  }

  /**
   * Spends a drive charge on a short blow from the key's grip: it shoves and lightly hurts what
   * it touches, and opens any door it hits, locked or held shut by the fight.
   */
  private swing() {
    if (this.drive < 1 || this.player.swinging) return;
    this.drive--;
    const aim = this.player.startSwing();
    const { x, y, stats } = this.player;
    this.showSwing(x, y, aim);
    const enemies = this.enemies.getChildren() as Enemy[];
    // Backwards, since a hit can kill and take the enemy out of the list.
    for (let i = enemies.length - 1; i >= 0; i--) {
      const enemy = enemies[i];
      if (!enemy.active || !enemy.hittable) continue;
      const radius = (enemy.body as Phaser.Physics.Arcade.Body).halfWidth;
      if (!inSwing(enemy.x - x, enemy.y - y, aim, radius)) continue;
      this.strikeEnemy(enemy, stats.damage * SWING.damageShare, x, y, SWING.knockback * stats.knockback);
    }
    for (const [dir, block] of [...this.doorBlockAt]) {
      if (swingTouchesBox(block.x - x, block.y - y, aim, TILE / 2, TILE / 2)) this.unlockDoor(dir);
    }
  }

  /** The crescent rides the fan's far edge, turned to the aim. */
  private showSwing(x: number, y: number, aim: number) {
    if (!this.textures.exists(SWING_FX)) {
      this.showSwingArc(x, y, aim);
      return;
    }
    const scale = (SWING.reach * 2) / SWING_FX_FRAME.height;
    // The sheet's frames are right-aligned: their front edge sits half a frame ahead of center.
    const ahead = SWING.reach - (SWING_FX_FRAME.width / 2) * scale;
    const fx = this.add
      .sprite(x + Math.cos(aim) * ahead, y + Math.sin(aim) * ahead, SWING_FX)
      .setRotation(aim)
      .setScale(scale)
      .setDepth(11);
    fx.play(SWING_FX).once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => fx.destroy());
  }

  /** Fallback without the sheet: a fading stroke along the fan's edge. */
  private showSwingArc(x: number, y: number, aim: number) {
    const arc = this.add.graphics().setDepth(11);
    arc.lineStyle(6, COLORS.bolt, 0.9);
    arc.beginPath();
    arc.arc(x, y, SWING.reach - 6, aim - SWING.arc / 2, aim + SWING.arc / 2);
    arc.strokePath();
    this.tweens.add({ targets: arc, alpha: 0, duration: SWING.durationMs, onComplete: () => arc.destroy() });
  }

  private unlockDoor(dir: Dir) {
    const neighbor = this.floor.neighbor(this.room, dir);
    if (neighbor) neighbor.locked = false;
    this.openDoor(dir);
    this.openDoors.add(dir);
    this.cameras.main.shake(90, 0.004);
  }

  /** Backwards, since a slam can kill and take the enemy out of the list. */
  private applyWallSlams(enemies: readonly Enemy[]) {
    for (let i = enemies.length - 1; i >= 0; i--) {
      const enemy = enemies[i];
      const slam = enemy.slammed();
      if (slam > 0) this.strikeEnemy(enemy, slam, enemy.x, enemy.y, 0);
    }
  }

  private killEnemy(enemy: Enemy) {
    const { x, y, def } = enemy;
    enemy.die();
    // A mini boss's death pays the event: it doesn't get back up.
    if (def.revive && !def.miniBoss && enemy.revivals < def.revive.times) {
      this.dropPile(def, x, y, enemy.revivals);
      return;
    }
    this.reward(def, x, y);
    if (def.split) this.splitInto(def.split.id, def.split.count, x, y);
  }

  /** Kill count, drops and what a boss's fall sets off. */
  private reward(def: EnemyDef, x: number, y: number) {
    this.kills++;
    const rolls = def.cursed ? 2 : 1;
    let kinds: DropKind[] = [];
    for (let i = 0; i < rolls; i++) {
      const roll = rollDrops(this.dropRng, this.luck, this.player.stats.healOdds);
      this.luck = roll.luck;
      kinds.push(...roll.drops);
    }
    if (def.boss) {
      const guaranteed = withBossHeal(kinds, this.luck);
      kinds = guaranteed.drops;
      this.luck = guaranteed.luck;
    }
    for (const kind of kinds) this.spawnDrop(kind, x, y);
    this.eventDirector.onDrops(kinds);
    if (def.boss && this.room.event === 'twin') this.enrageSurvivingBosses();
  }

  private dropPile(def: EnemyDef, x: number, y: number, revivals: number) {
    const image = this.add.sprite(x, y, BONE_PILE).setDepth(3);
    const parts = [image];
    // A cursed skeleton's bones keep the darkness that cursed it.
    if (def.outline !== undefined) {
      const outline = this.add
        .sprite(x, y, BONE_PILE)
        .setTintMode(Phaser.TintModes.FILL)
        .setTint(def.outline)
        .setScale(OUTLINE_SCALE)
        .setAlpha(0.9)
        .setDepth(image.depth - 0.1);
      parts.push(outline);
    }
    const anim = walkAnimKey(BONE_PILE);
    if (this.anims.exists(anim)) for (const part of parts) part.play(anim);
    this.piles.push({ def, image, parts, reviveAt: this.clock.now + def.revive!.delayMs, rattling: false, revivals });
  }

  /** Stepping on a pile finishes it; left alone, it rattles and gets back up with part of its HP. */
  private updatePiles(time: number) {
    const stomp = STOMP_RADIUS * STOMP_RADIUS;
    for (let i = this.piles.length - 1; i >= 0; i--) {
      const pile = this.piles[i];
      const { image, parts, def } = pile;
      if (Phaser.Math.Distance.Squared(image.x, image.y, this.player.x, this.player.y) < stomp) {
        this.piles.splice(i, 1);
        this.crushPile(pile);
        continue;
      }
      if (!pile.rattling && time >= pile.reviveAt - PILE_RATTLE_MS) {
        pile.rattling = true;
        this.tweens.add({ targets: parts, x: image.x + 2, duration: 50, yoyo: true, repeat: -1 });
      }
      if (time < pile.reviveAt) continue;
      this.piles.splice(i, 1);
      this.tweens.killTweensOf(parts);
      for (const part of parts) part.destroy();
      const enemy = this.spawnEnemy(def, image.x, image.y, this.dropRng.next() * 1000);
      enemy.hp = reviveHp(def.hp, def.revive!.hpShare);
      enemy.revivals = pile.revivals + 1;
    }
  }

  private crushPile(pile: Pile) {
    const { image, parts, def } = pile;
    this.tweens.killTweensOf(parts);
    this.tweens.add({
      targets: parts,
      scaleY: 0.2,
      alpha: 0,
      duration: 160,
      onComplete: () => parts.forEach((part) => part.destroy()),
    });
    this.reward(def, image.x, image.y);
  }

  /** `count` plain `id` enemies bursting out around where the last one fell. */
  private splitInto(id: string, count: number, x: number, y: number) {
    const base = ENEMIES.find((e) => e.id === id);
    if (!base) return;
    const rng = new Rng(`${this.seed}:split:${this.depth}:${this.splits++}`);
    const def = enemyForDepth(base, this.depth);
    const margin = TILE * 1.5;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + rng.next();
      const sx = Phaser.Math.Clamp(x + Math.cos(angle) * SPLIT_SPREAD, ROOM_X + margin, ROOM_X + ROOM_W - margin);
      const sy = Phaser.Math.Clamp(y + Math.sin(angle) * SPLIT_SPREAD, ROOM_Y + margin, ROOM_Y + ROOM_H - margin);
      this.spawnEnemy(def, sx, sy, rng.next() * 1000);
    }
  }

  /** Hurts the player and every enemy in reach, then the bomber is gone. */
  private readonly explodeEnemy = (enemy: Enemy, blast: ExplodeAttack) => {
    const { x, y } = enemy;
    this.showBlast(x, y, blast.radius);
    const player = this.player;
    const hitsPlayer = inBlast(player.x - x, player.y - y, blast.radius);
    if (hitsPlayer && !this.cheats.god && player.hurt(blast.damage) && player.health <= 0) this.onDeath();
    // Backwards, since a blast can kill and take enemies out of the list.
    const enemies = this.enemies.getChildren() as Enemy[];
    for (let i = enemies.length - 1; i >= 0; i--) {
      const other = enemies[i];
      if (other === enemy || !other.active || !other.hittable) continue;
      if (inBlast(other.x - x, other.y - y, blast.radius)) this.strikeEnemy(other, blast.damage, x, y, BLAST_KNOCKBACK);
    }
    if (enemy.active) this.killEnemy(enemy);
  };

  private showBlast(x: number, y: number, radius: number) {
    const ring = this.add.circle(x, y, radius, 0xffa640, 0.45).setDepth(6).setScale(0.2);
    this.tweens.add({ targets: ring, scale: 1, alpha: 0, duration: 260, onComplete: () => ring.destroy() });
    this.cameras.main.shake(140, 0.006);
  }

  /** Somewhere on the floor far from the player. */
  private readonly blinkSpot = (enemy: Enemy) => {
    const rng = new Rng(`${this.seed}:blink:${this.depth}:${this.blinks++}`);
    const spots = this.cellsAwayFromPlayer().map(({ col, row }) => ({ x: tileX(col), y: tileY(row) }));
    if (spots.length === 0) return { x: enemy.x, y: enemy.y };
    return spotAwayFrom(rng, spots, this.player.x, this.player.y, BLINK_MIN_DISTANCE);
  };

  /** When a twin falls, the other goes into fury at once, whatever its HP. */
  private enrageSurvivingBosses() {
    for (const other of this.enemies.getChildren() as Enemy[]) {
      if (other.active && other.def.boss) other.enrage();
    }
  }

  private startBossIntro(boss: EnemyDef, x: number, y: number) {
    this.inBossIntro = true;
    (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.physics.pause();
    const data: BossIntroData = { name: boss.name, x, y };
    this.scene.launch('boss-intro', data);
    this.scene.bringToTop('boss-intro');
  }

  /** Called by BossIntroScene once it has put the camera back. */
  endBossIntro() {
    this.inBossIntro = false;
    this.physics.resume();
  }

  private clearRoom() {
    this.room.cleared = true;
    this.roomsCleared++;
    this.drive = chargeDrive(this.drive, this.driveMax);
    // Locked doors stay shut: only a swing opens them.
    for (const dir of [...this.doorBlockAt.keys()]) {
      if (!this.floor.neighbor(this.room, dir)?.locked) this.openDoor(dir);
    }
    this.eventDirector.onClear(this.room);
    if (this.room.type === 'boss') this.spawnBossRewards(this.room);
  }

  private checkDoorExit() {
    const dir = exitSide(this.player.x, this.player.y);
    if (!dir) return;

    const next = this.floor.neighbor(this.room, dir);
    if (!next || this.doorBlockAt.has(dir)) return;

    this.transitioning = true;
    (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.cameras.main.fadeOut(90, 7, 6, 13);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.enterRoom(next, dir);
      this.cameras.main.fadeIn(110, 7, 6, 13);
      this.transitioning = false;
    });
  }

  // ---------------------------------------------------------------- pickups

  private spawnDrop(kind: DropKind, x: number, y: number) {
    const dx = (this.dropRng.next() * 2 - 1) * DROP_SCATTER;
    const dy = (this.dropRng.next() * 2 - 1) * DROP_SCATTER;
    // Kept off the walls, or a drop could land out of the player's reach.
    const margin = TILE + DROP_PICKUP_RADIUS / 2;
    const px = Phaser.Math.Clamp(x + dx, ROOM_X + margin, ROOM_X + ROOM_W - margin);
    const py = Phaser.Math.Clamp(y + dy, ROOM_Y + margin, ROOM_Y + ROOM_H - margin);
    const image = this.placeDrop(kind, px, py).setScale(0);
    this.tweens.add({ targets: image, scale: 1, duration: 220, ease: 'Back.Out' });
  }

  private placeDrop(kind: DropKind, x: number, y: number): Phaser.GameObjects.Image {
    const def = DROPS.find((d) => d.id === kind)!;
    const image = this.add.image(x, y, def.texture).setDepth(3);
    this.drops.push({ kind, image });
    return image;
  }

  /** Drops close to the player slide in and get picked up; a heal orb at full HP stays put for later. */
  private updateDrops(dt: number) {
    const range = DROP_PICKUP_RADIUS * DROP_PICKUP_RADIUS;
    const pull = DROP_MAGNET_RADIUS * DROP_MAGNET_RADIUS;
    const player = this.player;
    // Backwards, so collecting one doesn't skip the next.
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const { kind, image } = this.drops[i];
      // Checked per drop: an earlier orb in this loop can fill HP.
      if (!canCollect(kind, player.health >= player.stats.maxHealth)) continue;
      const d2 = Phaser.Math.Distance.Squared(image.x, image.y, player.x, player.y);
      if (d2 < range) {
        this.collectDrop(i);
        continue;
      }
      if (d2 >= pull) continue;
      const distance = Math.sqrt(d2);
      const step = Math.min(distance, DROP_MAGNET_SPEED * dt) / distance;
      image.setPosition(image.x + (player.x - image.x) * step, image.y + (player.y - image.y) * step);
    }
  }

  private collectDrop(index: number) {
    const [drop] = this.drops.splice(index, 1);
    drop.image.destroy();
    this.grantDrop(drop.kind);
  }

  private leaveDrops(room: RoomNode) {
    this.leftDrops.set(
      room,
      this.drops.map(({ kind, image }) => ({ kind, x: image.x, y: image.y })),
    );
    for (const drop of this.drops) drop.image.destroy();
    this.drops = [];
  }

  private restoreDrops(room: RoomNode) {
    for (const drop of this.leftDrops.get(room) ?? []) this.placeDrop(drop.kind, drop.x, drop.y);
    this.leftDrops.delete(room);
  }

  private grantDrop(kind: DropKind) {
    const player = this.player;
    const state = { health: player.health, maxHealth: player.stats.maxHealth, currency: this.currency };
    const next = applyDrop(state, kind, player.stats.currencyValue);
    player.health = next.health;
    this.currency = next.currency;
  }

  private spawnItem(room: RoomNode, row: number, armWhenAway = false) {
    const item = this.roomItems.get(room);
    if (!item) return;
    this.placePedestal(DOOR_COL, row, item, () => (room.itemTaken = true), armWhenAway);
  }

  /**
   * Pedestal holding `item` on a room tile; `onTake` runs once, when the player grabs it.
   * With `armWhenAway`, it can't be grabbed until the player has stepped off it once.
   */
  private placePedestal(col: number, row: number, item: Item, onTake?: () => void, armWhenAway = false) {
    const x = tileX(col);
    const y = tileY(row);

    const pedestal = this.add.image(x, y + 10, 'pedestal').setDepth(3);
    const orb = addItemIcon(this, x, y - 12, item).setDepth(4);
    this.tweens.add({ targets: orb, y: y - 18, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    this.physics.add.existing(pedestal, true);
    const label = this.pedestalLabel(x, y - 44, item);
    this.roomDecor.push(pedestal, orb, label);

    const pickup = this.physics.add.overlap(this.player, pedestal, () => {
      pickup.active = false;
      onTake?.();
      orb.destroy();
      label.destroy();
      this.pedestals = this.pedestals.filter((p) => p !== entry);
      this.grantItem(item);
    });
    pickup.active = !armWhenAway;
    const entry = { x, y, item, label, pickup };
    this.pedestals.push(entry);
    this.roomDecor.push(pickup);
  }

  /** Name and hint only; the exact effect shows once the item is taken. */
  private pedestalLabel(x: number, y: number, item: Item): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, pedestalText(item), {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: COLORS.text,
        align: 'center',
        stroke: '#000',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 1)
      .setDepth(50)
      .setVisible(false);
  }

  private updatePedestalLabels() {
    const locale = getLocale();
    if (locale !== this.labelLocale) {
      this.labelLocale = locale;
      for (const p of this.pedestals) p.label.setText(pedestalText(p.item));
    }

    const range = LABEL_RANGE * LABEL_RANGE;
    const armRange = PEDESTAL_ARM_RANGE * PEDESTAL_ARM_RANGE;
    for (const p of this.pedestals) {
      const distance = Phaser.Math.Distance.Squared(p.x, p.y, this.player.x, this.player.y);
      const near = distance < range;
      if (p.label.visible !== near) p.label.setVisible(near);
      if (!p.pickup.active && distance > armRange) p.pickup.active = true;
    }
  }

  private grantItem(item: Item) {
    this.items.push(item);
    this.refreshStats();
    if (item.fullHeal) this.player.health = this.player.stats.maxHealth;
    this.showBanner(t(item.name), t(item.description));
  }

  private currentStats(): PlayerStats {
    const stats = computeStats(BASE_STATS, this.items);
    return { ...stats, maxHealth: stats.maxHealth - this.maxHealthLost, ...this.cheats.stats };
  }

  /** Recomputes the player's stats and passes on the ones enemies read. */
  private refreshStats() {
    this.player.setStats(this.currentStats());
    for (const enemy of this.enemies.getChildren() as Enemy[]) enemy.speedScale = this.player.stats.enemySpeed;
  }

  // ---------------------------------------------------------------- event host

  now(): number {
    return this.clock.now;
  }

  /** Bone piles count: they get back up. */
  enemiesLeft(): number {
    return this.enemies.countActive() + this.piles.length;
  }

  rainDrops(kinds: readonly DropKind[]) {
    for (const kind of kinds) {
      const x = ROOM_X + TILE + this.dropRng.next() * (ROOM_W - TILE * 2);
      const y = ROOM_Y + TILE + this.dropRng.next() * (ROOM_H - TILE * 2);
      this.spawnDrop(kind, x, y);
    }
  }

  payAltar(room: RoomNode, rng: Rng) {
    const player = this.player;
    const paid = payAltar({ health: player.health, maxHealth: player.stats.maxHealth });
    this.maxHealthLost += paid.cost;
    this.refreshStats();
    player.health = Phaser.Math.Clamp(paid.health, 0, player.stats.maxHealth);
    if (player.health <= 0 && !this.cheats.god) {
      this.onDeath('death.greed');
      return;
    }
    player.health = Math.max(1, player.health);
    const [item] = rollRewards(rng, ITEMS, this.items, 1, this.depth);
    room.altarPaid = true;
    if (!item) return;
    this.roomItems.set(room, item);
    this.placeAltarPedestal(room);
  }

  /** Where the altar stood. The player is right there after paying, so it arms once they step away. */
  placeAltarPedestal(room: RoomNode) {
    this.spawnItem(room, DOOR_ROW - 2, true);
  }

  placeRewardItem(room: RoomNode, rng: Rng): boolean {
    const [item] = rollRewards(rng, ITEMS, this.items, 1, this.depth);
    if (!item) return false;
    this.roomItems.set(room, item);
    // The kill can land right on the center: don't grab it before reading it.
    this.spawnItem(room, DOOR_ROW, true);
    return true;
  }

  banner(title: string, subtitle?: string) {
    this.showBanner(title, subtitle);
  }

  keep(object: { destroy(): void }) {
    this.roomDecor.push(object);
  }

  private spawnPortal() {
    const portal = this.add.image(tileX(DOOR_COL), tileY(DOOR_ROW), 'portal').setDepth(2);
    // Static bodies don't follow scale changes: size the body before the grow-in tween.
    this.physics.add.existing(portal, true);
    (portal.body as Phaser.Physics.Arcade.StaticBody).setCircle(14, 14, 14);
    portal.setScale(0);
    this.tweens.add({ targets: portal, scale: 1, duration: 400, ease: 'Back.Out' });
    this.tweens.add({ targets: portal, angle: 360, duration: 4000, repeat: -1 });
    this.roomDecor.push(portal);

    const enter = this.physics.add.overlap(this.player, portal, () => {
      enter.active = false;
      this.nextFloor();
    });
    // Don't swallow a player who happens to be standing on the spawn point.
    enter.active = false;
    this.time.delayedCall(800, () => enter.world && (enter.active = true));
    this.roomDecor.push(enter);
  }

  private nextFloor() {
    if (isFinalFloor(this.depth)) {
      this.won = true;
      this.endRun('victory.title');
      return;
    }
    this.transitioning = true;
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.restart(this.carryOver(this.depth + 1));
    });
  }

  /** The run as it enters floor `depth`. */
  private carryOver(depth: number): RunData {
    return {
      seed: this.seed,
      seeded: this.seeded,
      depth,
      itemIds: this.items.map((i) => i.id),
      health: this.player.health,
      currency: this.currency,
      drive: this.drive,
      driveMax: this.driveMax,
      luck: this.luck,
      maxHealthLost: this.maxHealthLost,
      stats: this.runStats(),
      cheats: this.cheats,
    };
  }

  runStats(): RunStats {
    return { kills: this.kills, roomsCleared: this.roomsCleared, timeMs: this.pastTimeMs + this.clock.now };
  }

  /** Replays or rolls a fresh run in place; the HUD keeps running. */
  restartRun(sameSeed: boolean) {
    this.scene.restart(newRun(sameSeed ? this.seed : undefined));
  }

  // ---------------------------------------------------------------- debug console

  /** What the debug console can change. Commands run while this scene is paused under the console. */
  debugTarget(): DebugTarget {
    const scene = this.scene;
    return {
      depth: () => this.depth,
      health: () => this.player.health,
      maxHealth: () => this.player.stats.maxHealth,
      god: () => this.cheats.god,
      markSeeded: () => {
        this.seeded = true;
      },
      give: (itemId, count) => this.debugGive(itemId, count),
      take: (itemId) => this.debugTake(itemId),
      placeItem: (itemId) => this.debugPedestal(itemId),
      setHealth: (hp) => {
        this.player.health = Math.min(hp, this.player.stats.maxHealth);
      },
      setGod: (on) => {
        this.cheats.god = on;
      },
      drive: () => this.drive,
      driveMax: () => this.driveMax,
      setDrive: (charges) => {
        this.driveMax = Math.max(this.driveMax, charges);
        this.drive = charges;
      },
      setStat: (name, value) => {
        this.cheats.stats[name] = value;
        this.refreshStats();
      },
      spawn: (enemyId, count) => this.debugSpawn(enemyId, count),
      spawnBoss: () => this.debugSpawn(this.boss.id, 1),
      drop: (dropId, count) => this.debugDrop(dropId, count),
      killAll: () => this.debugKillAll(),
      setEnemyHealth: (percent) => this.debugEnemyHealth(percent),
      goToFloor: (depth) => scene.restart(this.carryOver(depth)),
      revealMap: () => {
        this.mapRevealed = true;
      },
      startEvent: (eventId) => this.debugEvent(eventId as RoomEventId),
    };
  }

  /** Replays the current room as `id`, when the room's type can hold it. */
  private debugEvent(id: RoomEventId): boolean {
    if (eventRoomType(id) !== this.room.type) return false;
    this.room.event = id;
    this.room.cleared = false;
    this.room.itemTaken = false;
    this.room.altarPaid = false;
    this.enterRoom(this.room);
    return true;
  }

  private debugGive(itemId: string, count: number) {
    const item = ITEMS.find((i) => i.id === itemId);
    if (!item) return;
    for (let i = 0; i < count; i++) this.items.push(item);
    this.refreshStats();
  }

  private debugTake(itemId: string): boolean {
    const index = this.items.findLastIndex((i) => i.id === itemId);
    if (index < 0) return false;
    this.items.splice(index, 1);
    this.refreshStats();
    return true;
  }

  /** Two tiles above the player, or below when that would be in the wall; never on the player, or it'd be taken at once. */
  private debugPedestal(itemId: string) {
    const item = ITEMS.find((i) => i.id === itemId);
    if (!item) return;
    const col = Phaser.Math.Clamp(Math.floor((this.player.x - ROOM_X) / TILE), 1, ROOM_COLS - 2);
    const row = Math.floor((this.player.y - ROOM_Y) / TILE);
    this.placePedestal(col, row - 2 >= 1 ? row - 2 : row + 2, item);
  }

  private debugSpawn(enemyId: string, count: number) {
    const def = ENEMIES.find((e) => e.id === enemyId);
    if (!def) return;
    const rng = new Rng(`${this.seed}:debug:${this.depth}:${this.debugSpawns++}`);
    this.spawnPack(Array<EnemyDef>(count).fill(enemyForDepth(def, this.depth)), rng);
  }

  private debugKillAll(): number {
    let killed = 0;
    for (const enemy of [...this.enemies.getChildren()] as Enemy[]) {
      if (!enemy.active) continue;
      this.killEnemy(enemy);
      killed++;
    }
    for (const pile of this.piles) this.crushPile(pile);
    this.piles = [];
    return killed;
  }

  /** Sets active enemies to a percentage of max HP, triggering fury as needed; returns their count. */
  private debugEnemyHealth(percent: number): number {
    let changed = 0;
    for (const enemy of this.enemies.getChildren() as Enemy[]) {
      if (!enemy.active) continue;
      enemy.setHealthShare(percent / 100);
      changed++;
    }
    return changed;
  }

  /** A tile below the player, or above near the bottom wall, so they aren't taken at once. */
  private debugDrop(dropId: string, count: number) {
    const def = DROPS.find((d) => d.id === dropId);
    if (!def) return;
    const below = this.player.y + TILE * 2 < ROOM_Y + ROOM_H;
    const y = below ? this.player.y + TILE : this.player.y - TILE;
    for (let i = 0; i < count; i++) this.spawnDrop(def.id, this.player.x, y);
  }

  // ---------------------------------------------------------------- feedback

  private onDeath(title: MessageKey = 'death.title') {
    this.player.setTint(0x555555);
    this.endRun(title);
  }

  /** Freezes the run under the summary overlay. */
  private endRun(title: MessageKey) {
    this.endTitle = title;
    this.gameOver = true;
    this.physics.pause();
    pad.releaseAll();
    this.scene.launch('summary');
    this.scene.bringToTop('summary');
  }

  /** One banner at a time: a new one replaces whatever is still fading, so texts never pile up. */
  private showBanner(title: string, subtitle = '', holdMs = 1400) {
    this.tweens.killTweensOf(this.bannerTexts);
    for (const text of this.bannerTexts) text.destroy();
    const cx = GAME_W / 2;
    const cy = ROOM_Y + ROOM_H / 2 - 60;
    const t1 = this.add
      .text(cx, cy, title, {
        fontFamily: 'monospace',
        fontSize: '26px',
        color: COLORS.text,
        stroke: '#000',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(100);
    const t2 = this.add
      .text(cx, cy + 30, subtitle, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: COLORS.textDim,
        stroke: '#000',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(100);
    this.bannerTexts = [t1, t2];
    if (holdMs > 0)
      this.tweens.add({
        targets: [t1, t2],
        alpha: 0,
        delay: holdMs,
        duration: 400,
        onComplete: () => [t1, t2].forEach((t) => t.destroy()),
      });
  }
}

function pedestalText(item: Item): string[] {
  return [t(item.name), t(item.hint)];
}

/** A cursed room reads as cursed, from its doors and its floor, until it is cleared. */
function isCursed(room: RoomNode): boolean {
  return room.event === 'cursed' && !room.cleared;
}

/** Which room edge the player has walked into, if any. */
function exitSide(x: number, y: number): Dir | undefined {
  const edge = TILE * 0.5;
  if (x < ROOM_X + edge) return 'left';
  if (x > ROOM_X + ROOM_W - edge) return 'right';
  if (y < ROOM_Y + edge) return 'up';
  if (y > ROOM_Y + ROOM_H - edge) return 'down';
  return undefined;
}
