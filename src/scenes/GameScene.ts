import Phaser from 'phaser';
import {
  COLORS,
  DOOR_COL,
  DOOR_ROW,
  GAME_W,
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
import { BASE_STATS, enemiesPerRoom } from '../combat/balance';
import { DROPS, type DropKind, type DropLuck, applyDrop, rollDrops } from '../combat/drops';
import { ENEMIES, type EnemyDef, SHADOW_COLOSSUS, enemyForDepth, rollRoomEnemies } from '../combat/enemies';
import { type Item, type PlayerStats, computeStats } from '../combat/stats';
import { GameClock } from '../core/clock';
import { Rng } from '../core/rng';
import { type RunCheats, type RunData, type RunStats, newRun } from '../core/run';
import type { DebugTarget } from '../debug/commands';
import { Bolt } from '../entities/Bolt';
import { Player } from '../entities/Player';
import { Enemy } from '../entities/Enemy';
import { HostileOrb } from '../entities/HostileOrb';
import { DIRS, type Dir, type Floor, type RoomNode, type RoomType, generateFloor } from '../floor/FloorGenerator';
import { type Locale, type MessageKey, getLocale, t } from '../i18n';
import type { BossIntroData } from './BossIntroScene';

/** Where the player appears when entering through a given side. */
const ENTRY: Record<Dir, { col: number; row: number }> = {
  up: { col: DOOR_COL, row: 1 },
  down: { col: DOOR_COL, row: ROOM_ROWS - 2 },
  left: { col: 1, row: DOOR_ROW },
  right: { col: ROOM_COLS - 2, row: DOOR_ROW },
};

/** Enough for a few volleys at once; a full pool skips the shot. */
const ORB_POOL_SIZE = 40;

/** Drops lie where they fell until the player walks over them. */
const DROP_PICKUP_RADIUS = 20;
/** Drops land around the kill, not stacked on one spot. */
const DROP_SCATTER = 14;

/** How close the player must be to read a pedestal's name and hint. */
const PEDESTAL_LABEL_RANGE = TILE * 2;

/** Lintel color over each door, by the room it leads to. */
const DOOR_MARKER: Record<RoomType, number> = {
  start: COLORS.doorMarker,
  normal: COLORS.doorMarker,
  treasure: COLORS.treasure,
  boss: COLORS.boss,
};

export class GameScene extends Phaser.Scene {
  seed!: string;
  seeded!: boolean;
  depth!: number;
  floor!: Floor;
  room!: RoomNode;
  items: Item[] = [];
  currency = 0;
  /** Heal orb odds carried across floors. */
  private luck!: DropLuck;
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

  /** Item each reward room holds, fixed per floor so revisits and route don't change it. */
  private roomItems = new Map<RoomNode, Item>();
  /** Pedestals in this room whose label shows only while the player is near. */
  private pedestals: { x: number; y: number; item: Item; label: Phaser.GameObjects.Text }[] = [];
  /** Language the pedestal labels were written in; the pause menu can switch it mid room. */
  private labelLocale?: Locale;
  private walls!: Phaser.Physics.Arcade.StaticGroup;
  private doorBlocks!: Phaser.Physics.Arcade.StaticGroup;
  private enemies!: Phaser.Physics.Arcade.Group;
  private bolts!: Phaser.Physics.Arcade.Group;
  /** Pool of enemy projectiles; orbs are released, never destroyed, until the scene restarts. */
  private orbs!: Phaser.Physics.Arcade.Group;
  /** Everything owned by the current room; destroyed on room change. */
  private roomDecor: { destroy(): void }[] = [];
  private transitioning = false;
  private gameOver = false;
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
    this.kills = data.stats.kills;
    this.roomsCleared = data.stats.roomsCleared;
    this.pastTimeMs = data.stats.timeMs;
    this.cheats = { god: data.cheats?.god ?? false, stats: { ...data.cheats?.stats } };
    this.mapRevealed = false;
    this.debugSpawns = 0;
    this.transitioning = false;
    this.gameOver = false;
    this.inBossIntro = false;
    this.bossHealth.hp = 0;
    this.bossHealth.max = 0;
    this.roomDecor = [];
    this.pedestals = [];
    this.drops = [];
    this.leftDrops = new Map();
    this.currency = data.currency;
    this.luck = data.luck;
    this.dropRng = new Rng(`${this.seed}:drops:${this.depth}`);
    this.clock = new GameClock();
    // A restart after death would otherwise inherit the paused world.
    this.physics.resume();

    this.items = data.itemIds.flatMap((id) => ITEMS.find((i) => i.id === id) ?? []);
    this.floor = generateFloor(new Rng(`${this.seed}:floor:${this.depth}`), this.depth);

    const rewardRooms = [...this.floor.rooms.values()].filter((r) => r.type === 'treasure' || r.type === 'boss');
    const rewards = rollRewards(new Rng(`${this.seed}:items:${this.depth}`), ITEMS, this.items, rewardRooms.length);
    this.roomItems = new Map();
    rewardRooms.forEach((room, i) => rewards[i] && this.roomItems.set(room, rewards[i]));

    this.cameras.main.setBackgroundColor(COLORS.background);
    this.walls = this.physics.add.staticGroup();
    this.doorBlocks = this.physics.add.staticGroup();
    this.enemies = this.physics.add.group();
    this.bolts = this.physics.add.group();
    this.orbs = this.physics.add.group({ classType: HostileOrb, maxSize: ORB_POOL_SIZE });

    const stats = this.currentStats();
    this.player = new Player(this, this.clock, tileX(DOOR_COL), tileY(DOOR_ROW), stats);
    if (data.health !== undefined) this.player.health = Math.min(stats.maxHealth, data.health);

    this.setupCollisions();
    this.enterRoom(this.floor.start);
    this.showBanner(t('floor.label', { n: this.depth }));

    if (!this.scene.isActive('hud')) this.scene.launch('hud');
    this.scene.bringToTop('hud');

    this.input.keyboard!.on('keydown-ESC', () => this.pause());
  }

  /** False mid room change or after death, when overlays must not open. */
  get canPause(): boolean {
    return !this.transitioning && !this.gameOver && !this.inBossIntro;
  }

  private pause() {
    if (!this.canPause) return;
    this.scene.pause();
    this.scene.launch('pause');
    this.scene.bringToTop('pause');
  }

  /** Wires room collisions and combat overlaps, using each enemy's current contact damage. */
  private setupCollisions() {
    const p = this.physics;
    p.add.collider(this.player, [this.walls, this.doorBlocks]);
    p.add.collider(this.enemies, [this.walls, this.doorBlocks]);
    p.add.collider(this.enemies, this.enemies);
    p.add.collider(this.bolts, [this.walls, this.doorBlocks], (bolt) => (bolt as Bolt).burst());

    p.add.overlap(this.bolts, this.enemies, (b, e) => {
      const bolt = b as Bolt;
      const enemy = e as Enemy;
      if (!bolt.active || !enemy.active) return;
      bolt.burst();
      if (!enemy.hit(bolt.damage, bolt.x, bolt.y)) return;
      this.killEnemy(enemy);
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
    if (this.gameOver || this.transitioning || this.inBossIntro) return;

    this.clock.tick(delta);
    const time = this.clock.now;
    this.player.move();
    for (const spec of this.player.tryShoot(time)) {
      const bolt = new Bolt(this, spec);
      this.bolts.add(bolt);
      bolt.launch(spec);
    }

    const enemies = this.enemies.getChildren() as Enemy[];
    for (const enemy of enemies) enemy.chase(this.player, time);
    this.updateBossHealth(enemies);

    const dt = delta / 1000;
    for (const bolt of [...this.bolts.getChildren()] as Bolt[]) {
      if (bolt.expired()) {
        bolt.burst();
        continue;
      }
      if (bolt.homing > 0) bolt.steerToward(this.nearest(bolt, enemies), dt);
    }

    this.updateDrops();
    this.updatePedestalLabels();

    if (!this.room.cleared && this.enemies.countActive() === 0) this.clearRoom();
    if (this.room.cleared) this.checkDoorExit();
  }

  private updateBossHealth(enemies: readonly Enemy[]) {
    const boss = this.bossHealth;
    boss.hp = 0;
    boss.max = 0;
    for (const enemy of enemies) {
      if (!enemy.active || !enemy.def.boss) continue;
      boss.hp += Math.max(0, enemy.hp);
      boss.max += enemy.def.hp;
      boss.name = enemy.def.name;
    }
  }

  private nearest(from: Phaser.GameObjects.Components.Transform, targets: Enemy[]): Enemy | undefined {
    const dist = (t: Enemy) => Phaser.Math.Distance.Squared(from.x, from.y, t.x, t.y);
    return targets
      .filter((t) => t.active && t.harmful)
      .reduce<Enemy | undefined>((best, t) => (!best || dist(t) < dist(best) ? t : best), undefined);
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
    this.walls.clear(true, true);
    this.doorBlocks.clear(true, true);
    this.enemies.clear(true, true);
    this.bolts.clear(true, true);
    for (const orb of this.orbs.getChildren() as HostileOrb[]) orb.release();

    this.buildLayout(room);

    const entry = via ? ENTRY[DIRS[via].opposite] : { col: DOOR_COL, row: DOOR_ROW };
    this.player.teleport(tileX(entry.col), tileY(entry.row));

    this.restoreDrops(room);
    if (!room.cleared) this.spawnEnemies(room);
    if (room.type === 'treasure' && !room.itemTaken) this.spawnItem(room, DOOR_ROW);
    if (room.type === 'boss' && room.cleared) this.spawnBossRewards(room);
  }

  private spawnBossRewards(room: RoomNode) {
    this.spawnPortal();
    // Above the portal, so walking in to grab it doesn't drop the player into the next floor.
    if (!room.itemTaken) this.spawnItem(room, DOOR_ROW - 2);
  }

  private buildLayout(room: RoomNode) {
    const floor = this.add.tileSprite(ROOM_X, ROOM_Y, ROOM_W, ROOM_H, 'floor').setOrigin(0).setDepth(0);
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
          this.walls.create(tileX(col), tileY(row), 'wall').setDepth(1);
          continue;
        }

        if (!room.cleared) this.doorBlocks.create(tileX(col), tileY(row), 'door').setDepth(1);
        const neighbor = this.floor.neighbor(room, door)!;
        this.roomDecor.push(this.doorMarker(col, row, door, neighbor));
      }
    }
  }

  /** Small colored lintel so boss/treasure doors read at a glance. */
  private doorMarker(col: number, row: number, dir: Dir, neighbor: RoomNode) {
    const color = DOOR_MARKER[neighbor.type];
    const horizontal = dir === 'up' || dir === 'down';
    const x = tileX(col) + DIRS[dir].dx * (TILE / 2 - 3);
    const y = tileY(row) + DIRS[dir].dy * (TILE / 2 - 3);
    return this.add.rectangle(x, y, horizontal ? TILE + 12 : 6, horizontal ? 6 : TILE + 12, color).setDepth(2);
  }

  private spawnEnemies(room: RoomNode) {
    if (room.type === 'boss') {
      const boss = enemyForDepth(SHADOW_COLOSSUS, this.depth);
      this.spawnEnemy(boss, tileX(DOOR_COL), tileY(DOOR_ROW - 1));
      this.startBossIntro(boss, tileX(DOOR_COL), tileY(DOOR_ROW - 1));
      return;
    }

    const rng = new Rng(`${this.seed}:room:${this.depth}:${room.x},${room.y}`);
    const { min, max } = enemiesPerRoom(this.depth);
    const kinds = rollRoomEnemies(rng, this.depth, rng.int(min, max));
    this.spawnPack(
      kinds.map((def) => enemyForDepth(def, this.depth)),
      rng,
    );
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

  private spawnEnemy(def: EnemyDef, x: number, y: number, wobbleSeed = 0) {
    const enemy = new Enemy(this, this.clock, x, y, def, wobbleSeed);
    this.enemies.add(enemy);
    enemy.initBody();
    enemy.shoot = this.fireOrb;
  }

  /** A full pool drops the shot rather than growing mid fight. */
  private readonly fireOrb = (x: number, y: number, angle: number, speed: number, damage: number) => {
    (this.orbs.get(x, y) as HostileOrb | null)?.fire(x, y, angle, speed, damage);
  };

  private killEnemy(enemy: Enemy) {
    const { x, y } = enemy;
    enemy.die();
    this.kills++;
    const roll = rollDrops(this.dropRng, this.luck);
    this.luck = roll.luck;
    for (const kind of roll.drops) this.spawnDrop(kind, x, y);
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
    this.doorBlocks.clear(true, true);
    if (this.room.type === 'boss') this.spawnBossRewards(this.room);
  }

  private checkDoorExit() {
    const dir = exitSide(this.player.x, this.player.y);
    if (!dir) return;

    const next = this.floor.neighbor(this.room, dir);
    if (!next) return;

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

  private updateDrops() {
    const range = DROP_PICKUP_RADIUS * DROP_PICKUP_RADIUS;
    // Backwards, so collecting one doesn't skip the next.
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const { image } = this.drops[i];
      if (Phaser.Math.Distance.Squared(image.x, image.y, this.player.x, this.player.y) < range) this.collectDrop(i);
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
    const next = applyDrop({ health: player.health, maxHealth: player.stats.maxHealth, currency: this.currency }, kind);
    player.health = next.health;
    this.currency = next.currency;
  }

  private spawnItem(room: RoomNode, row: number) {
    const item = this.roomItems.get(room);
    if (!item) return;
    this.placePedestal(DOOR_COL, row, item, () => (room.itemTaken = true));
  }

  /** Pedestal holding `item` on a room tile; `onTake` runs once, when the player grabs it. */
  private placePedestal(col: number, row: number, item: Item, onTake?: () => void) {
    const x = tileX(col);
    const y = tileY(row);

    const pedestal = this.add.image(x, y + 10, 'pedestal').setDepth(3);
    const orb = addItemIcon(this, x, y - 12, item).setDepth(4);
    this.tweens.add({ targets: orb, y: y - 18, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    this.physics.add.existing(pedestal, true);
    const label = this.pedestalLabel(x, y - 44, item);
    const entry = { x, y, item, label };
    this.pedestals.push(entry);
    this.roomDecor.push(pedestal, orb, label);

    const pickup = this.physics.add.overlap(this.player, pedestal, () => {
      pickup.active = false;
      onTake?.();
      orb.destroy();
      label.destroy();
      this.pedestals = this.pedestals.filter((p) => p !== entry);
      this.grantItem(item);
    });
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

    const range = PEDESTAL_LABEL_RANGE * PEDESTAL_LABEL_RANGE;
    for (const p of this.pedestals) {
      const near = Phaser.Math.Distance.Squared(p.x, p.y, this.player.x, this.player.y) < range;
      if (p.label.visible !== near) p.label.setVisible(near);
    }
  }

  private grantItem(item: Item) {
    this.items.push(item);
    this.player.setStats(this.currentStats());
    this.showBanner(t(item.name), t(item.description));
  }

  private currentStats(): PlayerStats {
    return { ...computeStats(BASE_STATS, this.items), ...this.cheats.stats };
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
      luck: this.luck,
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
      setStat: (name, value) => {
        this.cheats.stats[name] = value;
        this.player.setStats(this.currentStats());
      },
      spawn: (enemyId, count) => this.debugSpawn(enemyId, count),
      spawnBoss: () => this.debugSpawn(SHADOW_COLOSSUS.id, 1),
      drop: (dropId, count) => this.debugDrop(dropId, count),
      killAll: () => this.debugKillAll(),
      setEnemyHealth: (percent) => this.debugEnemyHealth(percent),
      goToFloor: (depth) => scene.restart(this.carryOver(depth)),
      revealMap: () => {
        this.mapRevealed = true;
      },
    };
  }

  private debugGive(itemId: string, count: number) {
    const item = ITEMS.find((i) => i.id === itemId);
    if (!item) return;
    for (let i = 0; i < count; i++) this.items.push(item);
    this.player.setStats(this.currentStats());
  }

  private debugTake(itemId: string): boolean {
    const index = this.items.findLastIndex((i) => i.id === itemId);
    if (index < 0) return false;
    this.items.splice(index, 1);
    this.player.setStats(this.currentStats());
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

  private onDeath() {
    this.gameOver = true;
    this.physics.pause();
    this.player.setTint(0x555555);
    this.scene.launch('summary');
    this.scene.bringToTop('summary');
  }

  private showBanner(title: string, subtitle = '', holdMs = 1400) {
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

/** Which room edge the player has walked into, if any. */
function exitSide(x: number, y: number): Dir | undefined {
  const edge = TILE * 0.5;
  if (x < ROOM_X + edge) return 'left';
  if (x > ROOM_X + ROOM_W - edge) return 'right';
  if (y < ROOM_Y + edge) return 'up';
  if (y > ROOM_Y + ROOM_H - edge) return 'down';
  return undefined;
}
