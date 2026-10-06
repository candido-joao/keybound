import Phaser from 'phaser';
import { DOOR_COL, DOOR_ROW, ROOM_COLS, ROOM_ROWS, tileX, tileY } from '../config';
import { ITEMS } from '../combat/items';
import { BASE_STATS } from '../combat/balance';
import type { DropLuck } from '../combat/drops';
import { chargeDrive } from '../combat/swing';
import type { EnemyDef } from '../combat/enemies';
import { type Item, type PlayerStats, computeStats } from '../combat/stats';
import { GameClock } from '../core/clock';
import { Rng } from '../core/rng';
import { type RunCheats, type RunData, type RunStats, newRun } from '../core/run';
import type { DebugTarget } from '../debug/commands';
import type { Bolt } from '../entities/Bolt';
import { Player } from '../entities/Player';
import type { Enemy } from '../entities/Enemy';
import { HostileOrb } from '../entities/HostileOrb';
import { DIRS, type Dir, type Floor, type RoomNode } from '../floor/FloorGenerator';
import { setUpFloor } from '../floor/floorSetup';
import { type PhaseDef, isFinalFloor, phaseAt } from '../floor/phases';
import { type MessageKey, t } from '../i18n';
import { pad } from '../input/touch';
import { Banner } from './Banner';
import { BeamWeapon } from './BeamWeapon';
import { BloodPuddles } from './BloodPuddles';
import { BonePiles } from './BonePiles';
import type { BossIntroData } from './BossIntroScene';
import { ChainShock, type StrikeHost } from './ChainShock';
import { type BossHealth, Combat } from './Combat';
import { EnemySpawner } from './EnemySpawner';
import { RoomEventDirector } from './RoomEventDirector';
import { eventHost } from './eventHost';
import { Pedestals } from './Pedestals';
import { PlayerShots } from './PlayerShots';
import { RoomDrops } from './RoomDrops';
import { RoomLayout, exitSide } from './RoomLayout';
import { RoomObstacles } from './RoomObstacles';
import { RoomRewards } from './RoomRewards';
import { ShopRooms } from './ShopRooms';
import { debugTarget } from './gameDebug';
import { swingKey } from './keySwing';

/** Where the player appears when entering through a given side. */
const ENTRY: Record<Dir, { col: number; row: number }> = {
  up: { col: DOOR_COL, row: 1 },
  down: { col: DOOR_COL, row: ROOM_ROWS - 2 },
  left: { col: 1, row: DOOR_ROW },
  right: { col: ROOM_COLS - 2, row: DOOR_ROW },
};

/** Enough for a few volleys at once; a full pool skips the shot. */
const ORB_POOL_SIZE = 40;

/**
 * One floor of a run. Holds the run's state and the room's shared objects; each concern of the
 * floor (layout, drops, pedestals, shops, piles, spawns, combat) is a system that reads them here.
 */
export class GameScene extends Phaser.Scene implements StrikeHost {
  seed!: string;
  seeded!: boolean;
  depth!: number;
  phase!: PhaseDef;
  /** This floor's boss, rolled from the phase's group. */
  boss!: EnemyDef;
  floor!: Floor;
  room!: RoomNode;
  items: Item[] = [];
  currency = 0;
  /** Key swing charges; one comes back with each cleared room. */
  drive = 0;
  driveMax = 0;
  /** Heal orb odds carried across floors. */
  luck!: DropLuck;
  kills = 0;
  /** Debug console changes; they follow the run to the next floor. */
  cheats: RunCheats = { god: false, stats: {} };
  /** Set by the console's reveal; lasts for this floor only. */
  mapRevealed = false;
  /** Item each reward room holds, fixed per floor so revisits and route don't change it. */
  roomItems = new Map<RoomNode, Item>();
  /** Drop rolls and placement; also the wobble of revived enemies. */
  dropRng!: Rng;
  player!: Player;
  /** Pauses with the scene; entities time their windows against it. */
  clock!: GameClock;
  enemies!: Phaser.Physics.Arcade.Group;
  /** Pool of enemy projectiles; orbs are released, never destroyed, until the scene restarts. */
  orbs!: Phaser.Physics.Arcade.Group;
  obstacles!: RoomObstacles;
  layout!: RoomLayout;
  drops!: RoomDrops;
  pedestals!: Pedestals;
  piles!: BonePiles;
  puddles!: BloodPuddles;
  spawner!: EnemySpawner;
  combat!: Combat;
  rewards!: RoomRewards;
  eventDirector!: RoomEventDirector;
  /** The run summary's title: what killed the player, or the victory. */
  endTitle: MessageKey = 'death.title';
  /** The final floor's boss fell and the player took its portal. */
  won = false;

  /** Max HP traded away at blood altars this run. */
  private maxHealthLost = 0;
  private roomsCleared = 0;
  /** Gameplay time of earlier floors; this floor's is on the clock. */
  private pastTimeMs = 0;
  private shots!: PlayerShots;
  private beamWeapon!: BeamWeapon;
  private chainShock!: ChainShock;
  private shops!: ShopRooms;
  private banners!: Banner;
  /** Everything owned by the current room; destroyed on room change. */
  private roomDecor: { destroy(): void }[] = [];
  private transitioning = false;
  private gameOver = false;
  /** The boss intro holds the clock and physics until it ends. */
  private inBossIntro = false;

  constructor() {
    super('game');
  }

  create(data: RunData) {
    this.loadRun(data);
    this.resetFloorState();
    this.rollFloor();
    this.createWorld(data);
    this.setupCollisions();
    this.enterRoom(this.floor.start);
    this.banners.showFloor(this.depth, this.phase);

    if (!this.scene.isActive('hud')) this.scene.launch('hud');
    this.scene.bringToTop('hud');
    if (!this.scene.isActive('touch')) this.scene.launch('touch');
    this.scene.bringToTop('touch');
    this.input.keyboard!.on('keydown-ESC', () => this.requestPause());
  }

  /** What the run carries into this floor. */
  private loadRun(data: RunData) {
    this.seed = data.seed;
    this.seeded = data.seeded;
    this.depth = data.depth;
    this.phase = phaseAt(this.depth);
    this.kills = data.stats.kills;
    this.roomsCleared = data.stats.roomsCleared;
    this.pastTimeMs = data.stats.timeMs;
    this.cheats = { god: data.cheats?.god ?? false, stats: { ...data.cheats?.stats } };
    this.currency = data.currency;
    this.drive = data.drive;
    this.driveMax = data.driveMax;
    this.luck = data.luck;
    this.maxHealthLost = data.maxHealthLost;
    this.items = data.itemIds.flatMap((id) => ITEMS.find((i) => i.id === id) ?? []);
  }

  /** The scene object is reused across floors: nothing from the last one may linger. */
  private resetFloorState() {
    this.mapRevealed = false;
    this.transitioning = false;
    this.gameOver = false;
    this.inBossIntro = false;
    this.roomDecor = [];
    this.endTitle = 'death.title';
    this.won = false;
    this.dropRng = new Rng(`${this.seed}:drops:${this.depth}`);
    this.clock = new GameClock();
    // A restart after death would otherwise inherit the paused world.
    this.physics.resume();
  }

  private rollFloor() {
    ({ floor: this.floor, boss: this.boss, roomItems: this.roomItems } = setUpFloor(this.seed, this.depth, this.items));
  }

  /** Physics groups, the player and the systems that run the room. */
  private createWorld(data: RunData) {
    this.cameras.main.setBackgroundColor(this.phase.palette.background);
    this.layout = new RoomLayout(this);
    this.obstacles = new RoomObstacles(this);
    this.enemies = this.physics.add.group();
    this.orbs = this.physics.add.group({ classType: HostileOrb, maxSize: ORB_POOL_SIZE });
    const stats = this.currentStats();
    this.player = new Player(this, this.clock, tileX(DOOR_COL), tileY(DOOR_ROW), stats);
    if (data.health !== undefined) this.player.health = Math.min(stats.maxHealth, data.health);
    this.drops = new RoomDrops(this);
    this.pedestals = new Pedestals(this);
    this.piles = new BonePiles(this);
    this.puddles = new BloodPuddles(this);
    this.spawner = new EnemySpawner(this);
    this.combat = new Combat(this);
    this.rewards = new RoomRewards(this);
    this.shops = new ShopRooms(this);
    this.banners = new Banner(this);
    this.eventDirector = new RoomEventDirector(this, eventHost(this));
    this.chainShock = new ChainShock(this, this, new Rng(`${this.seed}:chain:${this.depth}`));
    this.beamWeapon = new BeamWeapon(this, this, this.chainShock);
    this.shots = new PlayerShots(this, this.chainShock);
  }

  /** Every living boss in the room, for the HUD's bar. */
  get bossHealth(): BossHealth {
    return this.combat.bossHealth;
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
    const { solid, pits } = this.obstacles;
    const { walls, doorBlocks } = this.layout;
    p.add.collider(this.player, [walls, doorBlocks, solid, pits]);
    p.add.collider(this.enemies, [walls, doorBlocks, solid]);
    p.add.collider(this.enemies, pits, undefined, (e) => !(e as Enemy).def.flies);
    p.add.collider(this.enemies, this.enemies, undefined, (a, b) => !(a as Enemy).def.ghost && !(b as Enemy).def.ghost);
    const { bolts, hit } = this.shots;
    this.piles.collide(this.player, bolts);
    p.add.collider(bolts, [walls, doorBlocks, solid], (bolt) => (bolt as Bolt).burst());
    p.add.overlap(bolts, this.enemies, (b, e) => hit(b as Bolt, e as Enemy));
    p.add.collider(this.orbs, [walls, doorBlocks, solid], (orb) => (orb as HostileOrb).release());
    p.add.overlap(this.player, this.orbs, (_, o) => {
      const orb = o as HostileOrb;
      if (!orb.active) return;
      orb.release();
      this.hurtPlayer(orb.damage);
    });
    p.add.overlap(this.player, this.enemies, (_, e) => {
      const enemy = e as Enemy;
      if (enemy.harmful) this.hurtPlayer(enemy.contactDamage);
    });
  }

  /** Hurts the player unless god mode is on; at 0 HP the run ends with `cause`. */
  hurtPlayer(damage: number, cause: MessageKey = 'death.title') {
    if (this.cheats.god) return;
    if (this.player.hurt(damage) && this.player.health <= 0) this.die(cause);
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
    this.updatePlayer(time);
    const enemies = this.enemyGroup();
    this.obstacles.herd(enemies);
    for (const enemy of enemies) enemy.chase(this.player, time);
    this.combat.applyWallSlams(enemies);
    this.beamWeapon.update(this.player, time);
    this.chainShock.update(time);
    this.combat.updateBossHealth(enemies);
    this.shots.update(enemies, delta);
    this.piles.update(time);
    this.puddles.update(time);
    this.drops.update(delta / 1000);
    this.pedestals.update();
    this.eventDirector.update();
    this.updateRoomState();
  }

  private updatePlayer(time: number) {
    this.player.move();
    if (this.player.wantsSwing()) swingKey(this);
    const shot = this.player.tryShoot(time);
    this.shots.launch(shot.bolts);
    if (shot.beam) this.beamWeapon.fire(shot.beam, this.player.stats, time);
    const feet = (this.player.body as Phaser.Physics.Arcade.Body).center;
    this.obstacles.follow(feet.x, feet.y);
    // Spikes hurt on every step, as often as the player's invulnerability lets them.
    const spikes = this.obstacles.damageAt(feet.x, feet.y);
    if (spikes > 0) this.hurtPlayer(spikes, 'death.spikes');
  }

  private updateRoomState() {
    const room = this.room;
    if (!room.cleared && this.enemiesLeft() === 0 && !this.eventDirector.holdsClear()) this.clearRoom();
    if (this.layout.hasWayOut(room)) this.checkDoorExit();
  }

  // ---------------------------------------------------------------- rooms

  enterRoom(room: RoomNode, via?: Dir) {
    this.drops.leave(this.room);
    this.room = room;
    room.visited = true;
    this.clearRoomObjects();
    this.layout.build(room);
    this.obstacles.build(room.obstacles, this.phase);
    const entry = via ? ENTRY[DIRS[via].opposite] : { col: DOOR_COL, row: DOOR_ROW };
    this.player.teleport(tileX(entry.col), tileY(entry.row));
    this.drops.restore(room);
    this.populateRoom(room);
  }

  /** Everything the last room left in the scene. */
  private clearRoomObjects() {
    this.roomDecor.forEach((o) => o.destroy());
    this.roomDecor = [];
    this.pedestals.clear();
    this.piles.clear();
    this.enemies.clear(true, true);
    this.shots.clear();
    for (const orb of this.orbs.getChildren() as HostileOrb[]) orb.release();
    this.beamWeapon.stop();
    this.chainShock.clear();
  }

  /** Its event, or its enemies; and whatever it holds that hasn't been taken. */
  private populateRoom(room: RoomNode) {
    const eventSpawned = this.eventDirector.enter(room);
    if (!room.cleared && !eventSpawned) this.spawner.fill(room);
    this.rewards.restore(room);
    if (room.type === 'shop') this.shops.spawn(room);
  }

  startBossIntro(boss: EnemyDef, x: number, y: number) {
    this.inBossIntro = true;
    (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.physics.pause();
    const pose = (on: boolean) => this.enemyGroup().forEach((enemy) => enemy.def.boss && enemy.introPose(on));
    const data: BossIntroData = { name: boss.name, x, y, pose };
    this.scene.launch('boss-intro', data);
    this.scene.bringToTop('boss-intro');
  }

  /** Called by BossIntroScene once it has put the camera back. */
  endBossIntro() {
    this.inBossIntro = false;
    this.physics.resume();
  }

  private clearRoom() {
    const room = this.room;
    room.cleared = true;
    this.roomsCleared++;
    this.drive = chargeDrive(this.drive, this.driveMax);
    this.layout.openCleared(room);
    this.eventDirector.onClear(room);
    if (room.type === 'boss') this.rewards.bossRewards(room);
  }

  private checkDoorExit() {
    const dir = exitSide(this.player.x, this.player.y);
    if (!dir) return;
    const next = this.floor.neighbor(this.room, dir);
    if (!next || this.layout.isShut(dir)) return;

    this.transitioning = true;
    (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.cameras.main.fadeOut(90, 7, 6, 13);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.enterRoom(next, dir);
      this.cameras.main.fadeIn(110, 7, 6, 13);
      this.transitioning = false;
    });
  }

  /** Cracked rocks `struck` picks crumble; now and then one hides a coin. */
  breakRocks(struck: (x: number, y: number) => boolean) {
    for (const { x, y } of this.obstacles.breakWhere(struck)) this.drops.rubble(x, y);
  }

  // ---------------------------------------------------------------- items and stats

  grantItem(item: Item) {
    this.items.push(item);
    this.refreshStats();
    if (item.fullHeal) this.player.health = this.player.stats.maxHealth;
    this.banner(t(item.name), t(item.description));
  }

  private currentStats(): PlayerStats {
    const stats = computeStats(BASE_STATS, this.items);
    return { ...stats, maxHealth: stats.maxHealth - this.maxHealthLost, ...this.cheats.stats };
  }

  /** Recomputes the player's stats and passes on the ones enemies read. */
  refreshStats() {
    this.player.setStats(this.currentStats());
    for (const enemy of this.enemyGroup()) enemy.speedScale = this.player.stats.enemySpeed;
  }

  // ---------------------------------------------------------------- strike and event hosts

  enemyGroup(): readonly Enemy[] {
    return this.enemies.getChildren() as Enemy[];
  }

  liveEnemies(): Enemy[] {
    return this.enemyGroup().filter((e) => e.active && e.harmful);
  }

  strikeEnemy(enemy: Enemy, damage: number, fromX: number, fromY: number, knockback: number) {
    this.combat.strike(enemy, damage, fromX, fromY, knockback);
  }

  /** Bone piles count: they get back up. */
  enemiesLeft(): number {
    return this.enemies.countActive() + this.piles.count;
  }

  /** A blood altar's price: max HP gone for the rest of the run. */
  loseMaxHealth(amount: number) {
    this.maxHealthLost += amount;
    this.refreshStats();
  }

  banner(title: string, subtitle?: string) {
    this.banners.show(title, subtitle);
  }

  keep(object: { destroy(): void }) {
    this.roomDecor.push(object);
  }

  // ---------------------------------------------------------------- floors and the run

  /** Through the boss's portal: the next floor, or the end of the run after the last. */
  nextFloor() {
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
  carryOver(depth: number): RunData {
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

  /** Rolls a fresh run in place; the HUD keeps running. A seed is replayed only by typing it on the title. */
  restartRun() {
    this.scene.restart(newRun());
  }

  /** What the debug console can change. */
  debugTarget(): DebugTarget {
    return debugTarget(this);
  }

  die(title: MessageKey = 'death.title') {
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
}
