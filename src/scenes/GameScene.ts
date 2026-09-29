import Phaser from 'phaser';
import { COLORS, DOOR_COL, DOOR_ROW, GAME_W, ROOM_COLS, ROOM_H, ROOM_ROWS, ROOM_W, ROOM_X, ROOM_Y, TILE, tileX, tileY } from '../config';
import { ITEMS, addItemIcon } from '../combat/items';
import { BASE_STATS, computeStats, type Item } from '../combat/stats';
import { GameClock } from '../core/clock';
import { Rng, randomSeed } from '../core/rng';
import { Bolt } from '../entities/Bolt';
import { Player } from '../entities/Player';
import { SHADOW_BASIC, SHADOW_BOSS, Shadow } from '../entities/Shadow';
import { DIRS, type Dir, type Floor, type RoomNode, type RoomType, generateFloor } from '../floor/FloorGenerator';

export interface RunData {
  seed?: string;
  depth?: number;
  itemIds?: string[];
  health?: number;
}

/** Where the player appears when entering through a given side. */
const ENTRY: Record<Dir, { col: number; row: number }> = {
  up: { col: DOOR_COL, row: 1 },
  down: { col: DOOR_COL, row: ROOM_ROWS - 2 },
  left: { col: 1, row: DOOR_ROW },
  right: { col: ROOM_COLS - 2, row: DOOR_ROW },
};

/** Lintel color over each door, by the room it leads to. */
const DOOR_MARKER: Record<RoomType, number> = {
  start: COLORS.doorMarker,
  normal: COLORS.doorMarker,
  treasure: COLORS.treasure,
  boss: COLORS.boss,
};

export class GameScene extends Phaser.Scene {
  seed!: string;
  depth!: number;
  floor!: Floor;
  room!: RoomNode;
  items: Item[] = [];
  player!: Player;
  /** Pauses with the scene; entities time their windows against it. */
  private clock!: GameClock;

  /** Item each reward room holds, fixed per floor so revisits and route don't change it. */
  private roomItems = new Map<RoomNode, Item>();
  private walls!: Phaser.Physics.Arcade.StaticGroup;
  private doorBlocks!: Phaser.Physics.Arcade.StaticGroup;
  private enemies!: Phaser.Physics.Arcade.Group;
  private bolts!: Phaser.Physics.Arcade.Group;
  /** Everything owned by the current room; destroyed on room change. */
  private roomDecor: { destroy(): void }[] = [];
  private transitioning = false;
  private gameOver = false;

  constructor() {
    super('game');
  }

  create(data: RunData) {
    this.seed = data.seed ?? new URLSearchParams(location.search).get('seed') ?? randomSeed();
    this.depth = data.depth ?? 1;
    this.transitioning = false;
    this.gameOver = false;
    this.roomDecor = [];
    this.clock = new GameClock();

    this.items = (data.itemIds ?? []).flatMap((id) => ITEMS.find((i) => i.id === id) ?? []);
    this.floor = generateFloor(new Rng(`${this.seed}:floor:${this.depth}`), this.depth);

    // Items stack, so the pool never runs dry: unowned items pop first, repeats after.
    const itemRng = new Rng(`${this.seed}:items:${this.depth}`);
    const unowned = itemRng.shuffle(ITEMS.filter((i) => !this.items.includes(i)));
    const owned = itemRng.shuffle(ITEMS.filter((i) => this.items.includes(i)));
    const itemPool = [...owned, ...unowned];
    this.roomItems = new Map();
    for (const room of this.floor.rooms.values()) {
      if (room.type !== 'treasure' && room.type !== 'boss') continue;
      const item = itemPool.pop();
      if (item) this.roomItems.set(room, item);
    }

    this.cameras.main.setBackgroundColor(COLORS.background);
    this.walls = this.physics.add.staticGroup();
    this.doorBlocks = this.physics.add.staticGroup();
    this.enemies = this.physics.add.group();
    this.bolts = this.physics.add.group();

    const stats = computeStats(BASE_STATS, this.items);
    this.player = new Player(this, this.clock, tileX(DOOR_COL), tileY(DOOR_ROW), stats);
    if (data.health !== undefined) this.player.health = Math.min(stats.maxHealth, data.health);

    this.setupCollisions();
    this.enterRoom(this.floor.start);
    this.showBanner(`Andar ${this.depth}`);

    if (!this.scene.isActive('hud')) this.scene.launch('hud');
    this.scene.bringToTop('hud');

    this.input.keyboard!.on('keydown-ESC', () => this.pause());
  }

  private pause() {
    if (this.transitioning || this.gameOver) return;
    this.scene.pause();
    this.scene.launch('pause');
    this.scene.bringToTop('pause');
  }

  private setupCollisions() {
    const p = this.physics;
    p.add.collider(this.player, [this.walls, this.doorBlocks]);
    p.add.collider(this.enemies, [this.walls, this.doorBlocks]);
    p.add.collider(this.enemies, this.enemies);
    p.add.collider(this.bolts, [this.walls, this.doorBlocks], (bolt) => (bolt as Bolt).burst());

    p.add.overlap(this.bolts, this.enemies, (b, e) => {
      const bolt = b as Bolt;
      const enemy = e as Shadow;
      if (!bolt.active || !enemy.active) return;
      if (enemy.hit(bolt.damage, bolt.x, bolt.y)) enemy.die();
      bolt.burst();
    });

    p.add.overlap(this.player, this.enemies, (_, e) => {
      const enemy = e as Shadow;
      if (enemy.harmful && this.player.hurt(1) && this.player.health <= 0) this.onDeath();
    });
  }

  update(_time: number, delta: number) {
    if (this.gameOver || this.transitioning) return;

    this.clock.tick(delta);
    const time = this.clock.now;
    this.player.move();
    for (const spec of this.player.tryShoot(time)) {
      const bolt = new Bolt(this, spec);
      this.bolts.add(bolt);
      bolt.launch(spec);
    }

    const enemies = this.enemies.getChildren() as Shadow[];
    for (const enemy of enemies) enemy.chase(this.player, time);

    const dt = delta / 1000;
    for (const bolt of [...this.bolts.getChildren()] as Bolt[]) {
      if (bolt.expired()) {
        bolt.burst();
        continue;
      }
      if (bolt.homing > 0) bolt.steerToward(this.nearest(bolt, enemies), dt);
    }

    if (!this.room.cleared && this.enemies.countActive() === 0) this.clearRoom();
    if (this.room.cleared) this.checkDoorExit();
  }

  private nearest(from: Phaser.GameObjects.Components.Transform, targets: Shadow[]): Shadow | undefined {
    const dist = (t: Shadow) => Phaser.Math.Distance.Squared(from.x, from.y, t.x, t.y);
    return targets
      .filter((t) => t.active && t.harmful)
      .reduce<Shadow | undefined>((best, t) => (!best || dist(t) < dist(best) ? t : best), undefined);
  }

  // ---------------------------------------------------------------- rooms

  private enterRoom(room: RoomNode, via?: Dir) {
    this.room = room;
    room.visited = true;

    this.roomDecor.forEach((o) => o.destroy());
    this.roomDecor = [];
    this.walls.clear(true, true);
    this.doorBlocks.clear(true, true);
    this.enemies.clear(true, true);
    this.bolts.clear(true, true);

    this.buildLayout(room);

    const entry = via ? ENTRY[DIRS[via].opposite] : { col: DOOR_COL, row: DOOR_ROW };
    this.player.teleport(tileX(entry.col), tileY(entry.row));

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
      const boss = new Shadow(this, this.clock, tileX(DOOR_COL), tileY(DOOR_ROW - 1), { ...SHADOW_BOSS, hp: SHADOW_BOSS.hp + (this.depth - 1) * 30 });
      this.enemies.add(boss);
      boss.initBody();
      this.showBanner('Colosso Sombrio');
      return;
    }

    const rng = new Rng(`${this.seed}:room:${this.depth}:${room.x},${room.y}`);
    const cells: { col: number; row: number }[] = [];
    for (let row = 1; row < ROOM_ROWS - 1; row++) {
      for (let col = 1; col < ROOM_COLS - 1; col++) {
        const far = Phaser.Math.Distance.Between(tileX(col), tileY(row), this.player.x, this.player.y) > TILE * 3.5;
        if (far) cells.push({ col, row });
      }
    }

    const count = rng.int(2, 3 + this.depth);
    for (const { col, row } of rng.shuffle(cells).slice(0, count)) {
      const shadow = new Shadow(this, this.clock, tileX(col), tileY(row), { ...SHADOW_BASIC, hp: SHADOW_BASIC.hp + (this.depth - 1) * 3 });
      this.enemies.add(shadow);
      shadow.initBody();
    }
  }

  private clearRoom() {
    this.room.cleared = true;
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

  private spawnItem(room: RoomNode, row: number) {
    const item = this.roomItems.get(room);
    if (!item) return;
    const x = tileX(DOOR_COL);
    const y = tileY(row);

    const pedestal = this.add.image(x, y + 10, 'pedestal').setDepth(3);
    const orb = addItemIcon(this, x, y - 12, item).setDepth(4);
    this.tweens.add({ targets: orb, y: y - 18, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    this.physics.add.existing(pedestal, true);
    this.roomDecor.push(pedestal, orb);

    const pickup = this.physics.add.overlap(this.player, pedestal, () => {
      pickup.active = false;
      room.itemTaken = true;
      orb.destroy();
      this.grantItem(item);
    });
    this.roomDecor.push(pickup);
  }

  private grantItem(item: Item) {
    this.items.push(item);
    this.player.setStats(computeStats(BASE_STATS, this.items));
    this.showBanner(item.name, item.description);
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
      this.scene.restart({
        seed: this.seed,
        depth: this.depth + 1,
        itemIds: this.items.map((i) => i.id),
        health: this.player.health,
      } satisfies RunData);
    });
  }

  // ---------------------------------------------------------------- feedback

  private onDeath() {
    this.gameOver = true;
    this.physics.pause();
    this.player.setTint(0x555555);
    this.showBanner('Engolido pelas sombras', 'R para nova run', 0);
    this.input.keyboard!.once('keydown-R', () => {
      this.physics.resume();
      this.scene.restart({ seed: randomSeed() } satisfies RunData);
    });
  }

  private showBanner(title: string, subtitle = '', holdMs = 1400) {
    const cx = GAME_W / 2;
    const cy = ROOM_Y + ROOM_H / 2 - 60;
    const t1 = this.add.text(cx, cy, title, { fontFamily: 'monospace', fontSize: '26px', color: COLORS.text, stroke: '#000', strokeThickness: 5 }).setOrigin(0.5).setDepth(100);
    const t2 = this.add.text(cx, cy + 30, subtitle, { fontFamily: 'monospace', fontSize: '14px', color: COLORS.textDim, stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setDepth(100);
    if (holdMs > 0) this.tweens.add({ targets: [t1, t2], alpha: 0, delay: holdMs, duration: 400, onComplete: () => [t1, t2].forEach((t) => t.destroy()) });
  }
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
