import Phaser from 'phaser';
import { ROOM_COLS, ROOM_H, ROOM_X, ROOM_Y, TILE } from '../config';
import { DROPS } from '../combat/drops';
import { ITEMS } from '../combat/items';
import type { DebugTarget } from '../debug/commands';
import { type RoomEventId, eventRoomType } from '../floor/roomEvents';
import type { GameScene } from './GameScene';

/** What the debug console can change. Commands run while the game scene is paused under the console. */
export function debugTarget(game: GameScene): DebugTarget {
  return {
    ...readouts(game),
    ...cheats(game),
    give: (itemId, count) => give(game, itemId, count),
    take: (itemId) => take(game, itemId),
    placeItem: (itemId) => placeItem(game, itemId),
    spawn: (enemyId, count) => game.spawner.debug(enemyId, count),
    spawnBoss: () => game.spawner.debug(game.boss.id, 1),
    drop: (dropId, count) => drop(game, dropId, count),
    killAll: () => killAll(game),
    setEnemyHealth: (percent) => setEnemyHealth(game, percent),
    goToFloor: (depth) => game.scene.restart(game.carryOver(depth)),
    startEvent: (eventId) => startEvent(game, eventId as RoomEventId),
  };
}

function readouts(game: GameScene) {
  return {
    depth: () => game.depth,
    health: () => game.player.health,
    maxHealth: () => game.player.stats.maxHealth,
    god: () => game.cheats.god,
    drive: () => game.drive,
    driveMax: () => game.driveMax,
  };
}

function cheats(
  game: GameScene,
): Pick<DebugTarget, 'markSeeded' | 'setHealth' | 'setGod' | 'setDrive' | 'setStat' | 'revealMap'> {
  return {
    markSeeded: () => {
      game.seeded = true;
    },
    setHealth: (hp) => {
      game.player.health = Math.min(hp, game.player.stats.maxHealth);
    },
    setGod: (on) => {
      game.cheats.god = on;
    },
    setDrive: (charges) => {
      game.driveMax = Math.max(game.driveMax, charges);
      game.drive = charges;
    },
    setStat: (name, value) => {
      game.cheats.stats[name] = value;
      game.refreshStats();
    },
    revealMap: () => {
      game.mapRevealed = true;
    },
  };
}

/** Replays the current room as `id`, when the room's type can hold it. */
function startEvent(game: GameScene, id: RoomEventId): boolean {
  const { room } = game;
  if (eventRoomType(id) !== room.type) return false;
  room.event = id;
  room.cleared = false;
  room.itemTaken = false;
  room.altarPaid = false;
  game.enterRoom(room);
  return true;
}

function give(game: GameScene, itemId: string, count: number) {
  const item = ITEMS.find((i) => i.id === itemId);
  if (!item) return;
  for (let i = 0; i < count; i++) game.items.push(item);
  game.refreshStats();
}

function take(game: GameScene, itemId: string): boolean {
  const index = game.items.findLastIndex((i) => i.id === itemId);
  if (index < 0) return false;
  game.items.splice(index, 1);
  game.refreshStats();
  return true;
}

/** Two tiles above the player, or below when that would be in the wall; never on the player, or it'd be taken at once. */
function placeItem(game: GameScene, itemId: string) {
  const item = ITEMS.find((i) => i.id === itemId);
  if (!item) return;
  const { player } = game;
  const col = Phaser.Math.Clamp(Math.floor((player.x - ROOM_X) / TILE), 1, ROOM_COLS - 2);
  const row = Math.floor((player.y - ROOM_Y) / TILE);
  game.pedestals.placeItem(col, row - 2 >= 1 ? row - 2 : row + 2, item);
}

function killAll(game: GameScene): number {
  let killed = 0;
  for (const enemy of [...game.enemyGroup()]) {
    if (!enemy.active) continue;
    game.combat.kill(enemy);
    killed++;
  }
  game.piles.crushAll();
  return killed;
}

/** Sets active enemies to a percentage of max HP, triggering fury as needed; returns their count. */
function setEnemyHealth(game: GameScene, percent: number): number {
  let changed = 0;
  for (const enemy of game.enemyGroup()) {
    if (!enemy.active) continue;
    enemy.setHealthShare(percent / 100);
    changed++;
  }
  return changed;
}

/** A tile below the player, or above near the bottom wall, so they aren't taken at once. */
function drop(game: GameScene, dropId: string, count: number) {
  const def = DROPS.find((d) => d.id === dropId);
  if (!def) return;
  const { player } = game;
  const below = player.y + TILE * 2 < ROOM_Y + ROOM_H;
  const y = below ? player.y + TILE : player.y - TILE;
  for (let i = 0; i < count; i++) game.drops.spawn(def.id, player.x, y);
}
