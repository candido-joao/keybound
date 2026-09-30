import type Phaser from 'phaser';
import type { DropKind } from '../combat/drops';
import type { EnemyDef } from '../combat/enemies';
import { COLORS, DOOR_COL, DOOR_ROW, GAME_W, LABEL_RANGE, ROOM_Y, TILE, tileX, tileY } from '../config';
import { Rng } from '../core/rng';
import type { RoomNode } from '../floor/FloorGenerator';
import {
  EVENT_TUNING,
  type RoomEventId,
  cursedDef,
  darkRain,
  darkWaveCount,
  miniBossPaysItem,
  miniBossRain,
  timedChallengeMs,
  twinRain,
} from '../floor/roomEvents';
import { t } from '../i18n';

/** What the director needs from GameScene; kept narrow so events don't reach into the scene's internals. */
export interface EventHost {
  readonly seed: string;
  readonly depth: number;
  readonly player: Phaser.GameObjects.Sprite;
  now(): number;
  enemiesLeft(): number;
  /**
   * Rolls and spawns a normal room's enemies; `wave` gives each dark-room wave its own roll.
   * Without `transform`, a few may turn up cursed; with it, it applies to all of them.
   */
  spawnWave(room: RoomNode, wave: number, transform?: (def: EnemyDef) => EnemyDef): void;
  spawnTwins(): void;
  /** Rolls a plain enemy for this room and spawns it grown into a mini boss. */
  spawnMiniBoss(room: RoomNode): void;
  /** Scatters drops over the room. */
  rainDrops(kinds: readonly DropKind[]): void;
  /**
   * Takes the altar's price from max and current HP, then turns the altar into a pedestal
   * holding a rolled item; kills a player who couldn't pay.
   */
  payAltar(room: RoomNode, rng: Rng): void;
  /** The pedestal a paid altar left behind, until its item is taken. */
  placeAltarPedestal(room: RoomNode): void;
  /** Rolls an item onto a pedestal at the room's center; false when the pool has nothing left. */
  placeRewardItem(room: RoomNode, rng: Rng): boolean;
  banner(title: string, subtitle?: string): void;
  /** Owned by the room: destroyed on room change. */
  keep(object: { destroy(): void }): void;
}

/** A dark room's cover follows the player; above enemies and orbs, under labels and banners. */
const DARKNESS_DEPTH = 40;
const TIMER_DEPTH = 60;
/** On the top wall, two tiles right of center, clear of the top door. */
const TIMER_X = GAME_W / 2 + TILE * 2;

/**
 * Runs the room events: the Phaser side of `floor/roomEvents`. GameScene calls `enter` on
 * every room change, `update` every frame, and asks it before declaring a room clear.
 */
export class RoomEventDirector {
  private scene: Phaser.Scene;
  private host: EventHost;
  private room?: RoomNode;
  private darkness?: Phaser.GameObjects.Image;
  private darkWaves = 0;
  /** Waves spawned so far in the dark room. */
  private wave = 0;
  private nextWaveAt = Infinity;
  private timer?: Phaser.GameObjects.Text;
  private timedEndsAt = Infinity;
  private timedLost = false;
  private shownSeconds = -1;
  /** Drops from kills during a running challenge; beating the clock pays them again. */
  private timedDrops: DropKind[] = [];
  /** The unpaid altar's hint, shown only up close like a pedestal's. */
  private altarLabel?: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, host: EventHost) {
    this.scene = scene;
    this.host = host;
  }

  /** Returns true when the event spawned the room's enemies itself. */
  enter(room: RoomNode): boolean {
    this.reset(room);
    if (room.event === 'altar') this.placeAltarOrPedestal(room);
    if (!room.event || room.cleared) return false;
    return this.start(room.event, room);
  }

  /** A dark room isn't clear while waves remain, even with no enemy left standing. */
  holdsClear(): boolean {
    return this.room?.event === 'dark' && this.wave < this.darkWaves;
  }

  update() {
    this.darkness?.setPosition(this.host.player.x, this.host.player.y);
    this.updateTimer();
    this.updateWaves();
    this.updateAltarLabel();
  }

  /** Records the drops of a kill, for the challenge's bonus. */
  onDrops(kinds: readonly DropKind[]) {
    if (this.room?.event !== 'timed' || this.timedLost || this.room.cleared) return;
    this.timedDrops.push(...kinds);
  }

  onClear(room: RoomNode) {
    if (room.event === 'dark') this.liftDarkness();
    if (room.event === 'timed') this.endChallenge();
    if (room.event === 'twin') this.host.rainDrops(twinRain());
    if (room.event === 'miniboss') this.payMiniBoss(room);
  }

  private payMiniBoss(room: RoomNode) {
    const rng = this.eventRng(room, 'reward');
    if (miniBossPaysItem(rng) && this.host.placeRewardItem(room, rng)) return;
    this.host.rainDrops(miniBossRain());
  }

  private reset(room: RoomNode) {
    this.room = room;
    this.darkness = undefined;
    this.darkWaves = 0;
    this.wave = 0;
    this.nextWaveAt = Infinity;
    this.timer = undefined;
    this.timedEndsAt = Infinity;
    this.timedLost = false;
    this.shownSeconds = -1;
    this.timedDrops = [];
    this.altarLabel = undefined;
  }

  private start(id: RoomEventId, room: RoomNode): boolean {
    if (id === 'dark') return this.startDark(room);
    if (id === 'cursed') return this.startCursed(room);
    if (id === 'timed') return this.startTimed();
    if (id === 'miniboss') {
      this.host.spawnMiniBoss(room);
      return true;
    }
    if (id === 'twin') {
      this.host.spawnTwins();
      return true;
    }
    // A quiet room: no enemies, so it clears at once and the choice is the only thing in it.
    // The hint is already written over the altar.
    this.host.banner(t('event.altar.name'));
    return true;
  }

  // ---------------------------------------------------------------- dark room

  /** No warning at the door: the lights go out once the player is in. */
  private startDark(room: RoomNode): boolean {
    this.darkWaves = darkWaveCount(this.eventRng(room));
    this.darkness = this.scene.add.image(this.host.player.x, this.host.player.y, 'darkness').setDepth(DARKNESS_DEPTH);
    this.host.keep(this.darkness);
    this.spawnNextWave(room);
    return true;
  }

  private spawnNextWave(room: RoomNode) {
    this.host.spawnWave(room, this.wave);
    this.wave++;
    this.nextWaveAt = Infinity;
  }

  private updateWaves() {
    const room = this.room;
    if (!room || !this.holdsClear() || this.host.enemiesLeft() > 0) return;
    if (this.nextWaveAt === Infinity) {
      this.nextWaveAt = this.host.now() + EVENT_TUNING.dark.waveGapMs;
      return;
    }
    if (this.host.now() >= this.nextWaveAt) this.spawnNextWave(room);
  }

  private liftDarkness() {
    const darkness = this.darkness;
    if (darkness)
      this.scene.tweens.add({ targets: darkness, alpha: 0, duration: 500, onComplete: () => darkness.destroy() });
    this.darkness = undefined;
    this.host.banner(t('event.dark.cleared'));
    this.host.rainDrops(darkRain(this.darkWaves));
  }

  // ---------------------------------------------------------------- cursed room

  private startCursed(room: RoomNode): boolean {
    this.host.banner(t('event.cursed.name'), t('event.cursed.hint'));
    this.host.spawnWave(room, 0, cursedDef);
    return true;
  }

  // ---------------------------------------------------------------- timed challenge

  private startTimed(): boolean {
    this.host.banner(t('event.timed.name'), t('event.timed.hint'));
    this.timedEndsAt = this.host.now() + timedChallengeMs(this.host.depth);
    this.timer = this.scene.add
      .text(TIMER_X, ROOM_Y + TILE / 2, '', {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: COLORS.text,
        stroke: '#000',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(TIMER_DEPTH);
    this.host.keep(this.timer);
    return false;
  }

  /** Redraws only when the shown second changes. */
  private updateTimer() {
    const timer = this.timer;
    if (!timer || this.timedLost || this.room?.cleared) return;
    const left = this.timedEndsAt - this.host.now();
    if (left <= 0) {
      this.loseChallenge(timer);
      return;
    }
    const seconds = Math.ceil(left / 1000);
    if (seconds === this.shownSeconds) return;
    this.shownSeconds = seconds;
    timer.setText(String(seconds)).setColor(seconds <= 5 ? '#e8435a' : COLORS.text);
  }

  /** Running out only loses the bonus; the room plays on. */
  private loseChallenge(timer: Phaser.GameObjects.Text) {
    this.timedLost = true;
    this.timedDrops = [];
    timer.setText(t('event.timed.lost')).setColor(COLORS.textMuted);
    this.scene.tweens.add({ targets: timer, alpha: 0, delay: 1200, duration: 500 });
  }

  private endChallenge() {
    if (this.timedLost) return;
    this.timer?.destroy();
    this.host.banner(t('event.timed.won'));
    this.host.rainDrops(this.timedDrops);
  }

  // ---------------------------------------------------------------- blood altar

  private placeAltarOrPedestal(room: RoomNode) {
    if (!room.altarPaid) {
      this.placeAltar(room);
      return;
    }
    if (!room.itemTaken) this.host.placeAltarPedestal(room);
  }

  /** Above the room's center, clear of where the player enters. Optional: just don't touch it. */
  private placeAltar(room: RoomNode) {
    const x = tileX(DOOR_COL);
    const y = tileY(DOOR_ROW - 2);
    const altar = this.scene.add.image(x, y, 'altar').setDepth(3);
    this.scene.physics.add.existing(altar, true);
    const label = this.scene.add
      .text(x, y - 26, t('event.altar.hint'), {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: COLORS.textDim,
        stroke: '#000',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1)
      .setDepth(50)
      .setVisible(false);
    this.altarLabel = label;
    this.host.keep(altar);
    this.host.keep(label);

    const touch = this.scene.physics.add.overlap(this.host.player, altar, () => {
      touch.active = false;
      label.destroy();
      this.altarLabel = undefined;
      altar.destroy();
      this.scene.cameras.main.flash(200, 120, 10, 20);
      this.host.payAltar(room, this.eventRng(room, 'altar'));
    });
    this.host.keep(touch);
  }

  private updateAltarLabel() {
    const label = this.altarLabel;
    if (!label) return;
    const { x, y } = this.host.player;
    const near = (label.x - x) ** 2 + (label.y - y) ** 2 < LABEL_RANGE * LABEL_RANGE;
    if (label.visible !== near) label.setVisible(near);
  }

  private eventRng(room: RoomNode, purpose = 'event'): Rng {
    return new Rng(`${this.host.seed}:${purpose}:${this.host.depth}:${room.x},${room.y}`);
  }
}
