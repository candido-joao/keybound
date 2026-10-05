import type Phaser from 'phaser';
import {
  COLORS,
  DOOR_COL,
  DOOR_ROW,
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
import { swingTouchesBox } from '../combat/swing';
import { DIRS, type Dir, type RoomNode, type RoomType } from '../floor/FloorGenerator';
import { WALL_CELLS, cellCol, cellRow } from '../floor/obstacles';
import { floorTexture, wallTexture } from '../floor/phases';
import type { GameScene } from './GameScene';

const CURSED_FLOOR_TINT = 0xc9a8ff;

/** Lintel color over each door, by the room it leads to. */
const DOOR_MARKER: Record<RoomType, number> = {
  start: COLORS.doorMarker,
  normal: COLORS.doorMarker,
  treasure: COLORS.treasure,
  boss: COLORS.boss,
  shop: COLORS.shop,
};

/** The current room's floor, walls and doors, and which doors stand shut. */
export class RoomLayout {
  readonly walls: Phaser.Physics.Arcade.StaticGroup;
  readonly doorBlocks: Phaser.Physics.Arcade.StaticGroup;
  private readonly game: GameScene;
  /** This room's closed doors by side, so a swing can open just the one it hits. */
  private readonly blockAt = new Map<Dir, Phaser.Physics.Arcade.Sprite>();
  /** Doors a swing opened mid fight; walking back into an uncleared room shuts them again. */
  private readonly swungOpen = new Set<Dir>();

  constructor(game: GameScene) {
    this.game = game;
    this.walls = game.physics.add.staticGroup();
    this.doorBlocks = game.physics.add.staticGroup();
  }

  /** Whether any way out is open: the room is clear, or a swing opened a door mid fight. */
  hasWayOut(room: RoomNode): boolean {
    return room.cleared || this.swungOpen.size > 0;
  }

  isShut(dir: Dir): boolean {
    return this.blockAt.has(dir);
  }

  build(room: RoomNode) {
    this.walls.clear(true, true);
    this.doorBlocks.clear(true, true);
    this.blockAt.clear();
    this.swungOpen.clear();
    const game = this.game;
    const floor = game.add
      .tileSprite(ROOM_X, ROOM_Y, ROOM_W, ROOM_H, floorTexture(game.phase))
      .setOrigin(0)
      .setDepth(0);
    if (isCursed(room)) floor.setTint(CURSED_FLOOR_TINT);
    game.keep(floor);
    const doors = new Set(game.floor.doors(room));
    for (const cell of WALL_CELLS) this.buildEdge(room, doors, cellCol(cell), cellRow(cell));
  }

  private buildEdge(room: RoomNode, doors: ReadonlySet<Dir>, col: number, row: number) {
    const door = doorAt(doors, col, row);
    if (!door) {
      this.walls.create(tileX(col), tileY(row), wallTexture(this.game.phase)).setDepth(1);
      return;
    }
    const neighbor = this.game.floor.neighbor(room, door)!;
    if (!room.cleared || neighbor.locked) this.closeDoor(door, col, row, neighbor);
    this.game.keep(this.doorMarker(col, row, door, neighbor));
  }

  /** Locked doors stay shut: only a swing opens them. */
  openCleared(room: RoomNode) {
    for (const dir of [...this.blockAt.keys()]) {
      if (!this.game.floor.neighbor(room, dir)?.locked) this.openDoor(dir);
    }
  }

  /** Opens whatever door the swing from (`x`, `y`) toward `aim` reaches, locked or held shut by the fight. */
  swingAt(x: number, y: number, aim: number) {
    for (const [dir, block] of [...this.blockAt]) {
      if (swingTouchesBox(block.x - x, block.y - y, aim, TILE / 2, TILE / 2)) this.unlockDoor(dir);
    }
  }

  private unlockDoor(dir: Dir) {
    const neighbor = this.game.floor.neighbor(this.game.room, dir);
    if (neighbor) neighbor.locked = false;
    this.openDoor(dir);
    this.swungOpen.add(dir);
    this.game.cameras.main.shake(90, 0.004);
  }

  private closeDoor(dir: Dir, col: number, row: number, neighbor: RoomNode) {
    const texture = neighbor.locked ? 'door-locked' : 'door';
    const block = this.doorBlocks.create(tileX(col), tileY(row), texture) as Phaser.Physics.Arcade.Sprite;
    this.blockAt.set(dir, block.setDepth(1));
  }

  private openDoor(dir: Dir) {
    const block = this.blockAt.get(dir);
    if (!block) return;
    this.blockAt.delete(dir);
    this.doorBlocks.remove(block, true, true);
  }

  /** Small colored lintel so boss/treasure doors read at a glance, and a cursed room can be avoided. */
  private doorMarker(col: number, row: number, dir: Dir, neighbor: RoomNode) {
    const color = isCursed(neighbor) ? COLORS.curse : DOOR_MARKER[neighbor.type];
    const horizontal = dir === 'up' || dir === 'down';
    const x = tileX(col) + DIRS[dir].dx * (TILE / 2 - 3);
    const y = tileY(row) + DIRS[dir].dy * (TILE / 2 - 3);
    const w = horizontal ? TILE + 12 : 6;
    const h = horizontal ? 6 : TILE + 12;
    return this.game.add.rectangle(x, y, w, h, color).setDepth(2);
  }
}

/** The edge cell each door sits in. */
const DOOR_CELL: Record<Dir, { col: number; row: number }> = {
  up: { col: DOOR_COL, row: 0 },
  down: { col: DOOR_COL, row: ROOM_ROWS - 1 },
  left: { col: 0, row: DOOR_ROW },
  right: { col: ROOM_COLS - 1, row: DOOR_ROW },
};

/** The door on this edge cell, if the room has one there. */
function doorAt(doors: ReadonlySet<Dir>, col: number, row: number): Dir | undefined {
  for (const dir of doors) {
    const cell = DOOR_CELL[dir];
    if (cell.col === col && cell.row === row) return dir;
  }
  return undefined;
}

/** A cursed room reads as cursed, from its doors and its floor, until it is cleared. */
function isCursed(room: RoomNode): boolean {
  return room.event === 'cursed' && !room.cleared;
}

/** Which room edge the player has walked into, if any. */
export function exitSide(x: number, y: number): Dir | undefined {
  const edge = TILE * 0.5;
  if (x < ROOM_X + edge) return 'left';
  if (x > ROOM_X + ROOM_W - edge) return 'right';
  if (y < ROOM_Y + edge) return 'up';
  if (y > ROOM_Y + ROOM_H - edge) return 'down';
  return undefined;
}
