import type Phaser from 'phaser';
import { DOOR_COL, ROOM_COLS, TILE, tileX, tileY } from '../config';
import type { Enemy, Point } from '../entities/Enemy';
import { FlowField } from '../floor/flowField';
import {
  CELLS,
  INTERIOR_CELLS,
  PIT_PARTS,
  PIT_QUARTERS,
  type ObstacleGrid,
  blocksAnyone,
  cellCol,
  cellIndex,
  cellRow,
  colAt,
  emptyGrid,
  nearestOpen,
  obstacleDef,
  obstacleTexture,
  obstacleVariant,
  pitFrame,
  passable,
  pitPiece,
  rowAt,
  straightPath,
} from '../floor/obstacles';
import type { PhaseDef } from '../floor/phases';

const RUBBLE_BITS = 7;

/**
 * The current room's obstacles: their bodies and sprites, and the way enemies find around
 * them. The grid is the room's own, so a rock broken here stays broken on the way back.
 */
export class RoomObstacles {
  /** Rock, cracked or not: stops everyone and every shot. */
  readonly solid: Phaser.Physics.Arcade.StaticGroup;
  /** Stop anyone on foot; shots and fliers go over. */
  readonly pits: Phaser.Physics.Arcade.StaticGroup;
  private readonly scene: Phaser.Scene;
  private grid: ObstacleGrid = emptyGrid();
  private rubbleColor = 0xffffff;
  /** Spikes: drawn only, nothing collides with them. */
  private decor: Phaser.GameObjects.Image[] = [];
  private readonly breakables = new Map<number, Phaser.Physics.Arcade.Sprite>();
  private readonly ground = new FlowField();
  private readonly air = new FlowField();
  /** False in a room nothing blocks: enemies go straight at the player, as before obstacles. */
  private steering = false;
  /** Cell the flow fields lead to; -1 forces a rebuild. */
  private targetCell = -1;
  private readonly waypoint: Point = { x: 0, y: 0 };
  private readonly spot: Point = { x: 0, y: 0 };
  private readonly held: Point = { x: 0, y: 0 };
  /** Enemies standing on each cell this frame, and as the flow fields were last built. */
  private readonly crowd = new Uint8Array(CELLS);
  private readonly builtCrowd = new Uint8Array(CELLS);

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.solid = scene.physics.add.staticGroup();
    this.pits = scene.physics.add.staticGroup();
  }

  build(grid: ObstacleGrid | undefined, phase: PhaseDef) {
    this.clear();
    this.grid = grid ?? emptyGrid();
    this.rubbleColor = phase.palette.wallEdge;
    for (const cell of INTERIOR_CELLS) this.place(cellCol(cell), cellRow(cell), phase);
    this.steering = blocksAnyone(this.grid);
    this.targetCell = -1;
  }

  private place(col: number, row: number, phase: PhaseDef) {
    const id = this.grid[cellIndex(col, row)];
    if (id === null) return;
    const def = obstacleDef(id);
    const look = obstacleTexture(def, phase.id, obstacleVariant(def, col, row));
    // A variant without art falls back to the first look, which always exists, baked if need be.
    const texture = this.scene.textures.exists(look) ? look : obstacleTexture(def, phase.id);
    const x = tileX(col);
    const y = tileY(row);
    if (def.solid) {
      this.placeRock(col, row, texture, def.breakable);
      return;
    }
    if (def.blocksWalk) {
      this.placePit(col, row, texture);
      return;
    }
    this.decor.push(this.scene.add.image(x, y, texture).setDepth(0.5));
  }

  /** Places a solid rock, flipped to face the room's middle, tracked if it can be broken. */
  private placeRock(col: number, row: number, texture: string, breakable: boolean) {
    const rock = this.solid.create(tileX(col), tileY(row), texture) as Phaser.Physics.Arcade.Sprite;
    // Turned to face the room's middle, like the layout mirrored around it.
    rock.setDepth(1).setFlipX(col > DOOR_COL);
    if (breakable) this.breakables.set(cellIndex(col, row), rock);
  }

  /** The body covers the tile; four quarter pieces draw it, so touching pits read as one hole. */
  private placePit(col: number, row: number, texture: string) {
    const x = tileX(col);
    const y = tileY(row);
    const body = this.pits.create(x, y, texture) as Phaser.Physics.Arcade.Sprite;
    body.setDepth(0.5);
    if (!this.scene.textures.exists(PIT_PARTS)) return;
    body.setVisible(false);
    for (const [dx, dy] of PIT_QUARTERS) this.placePitPiece(col, row, dx, dy);
  }

  /** Draws one of a pit tile's four quarter pieces, in the frame its neighbors call for. */
  private placePitPiece(col: number, row: number, dx: number, dy: number) {
    const offset = TILE / 4;
    const frame = pitFrame(pitPiece(this.grid, col, row, dx, dy), dx, dy);
    const piece = this.scene.add.image(tileX(col) + dx * offset, tileY(row) + dy * offset, PIT_PARTS, frame);
    this.decor.push(piece.setDepth(0.5));
  }

  private clear() {
    this.solid.clear(true, true);
    this.pits.clear(true, true);
    for (const image of this.decor) image.destroy();
    this.decor = [];
    this.breakables.clear();
  }

  /** Points the paths at the player's cell, rebuilt only when the player steps onto another. */
  follow(x: number, y: number) {
    if (!this.steering) return;
    const col = colAt(x);
    const row = rowAt(y);
    const cell = cellIndex(col, row);
    if (cell === this.targetCell) return;
    this.targetCell = cell;
    this.builtCrowd.set(this.crowd);
    this.ground.build(this.grid, false, col, row, this.crowd);
    this.air.build(this.grid, true, col, row, this.crowd);
  }

  /**
   * Keeps every enemy on the floor, then counts who stands where: a changed crowd repaths, so
   * the pack spreads out around obstacles and queues in a corridor instead of jamming it.
   */
  herd(enemies: readonly Enemy[]) {
    for (const enemy of enemies) this.keepInside(enemy);
    if (!this.steering) return;
    this.crowd.fill(0);
    for (const enemy of enemies) this.stand(enemy);
    if (this.crowdMoved()) this.targetCell = -1;
  }

  private stand(enemy: Enemy) {
    // Ghosts drift through the others, so they neither block nor queue.
    if (enemy.def.ghost) return;
    const { x, y } = (enemy.body as Phaser.Physics.Arcade.Body).center;
    const col = colAt(x);
    const row = rowAt(y);
    if (passable(this.grid, col, row, true)) this.crowd[cellIndex(col, row)]++;
  }

  private crowdMoved(): boolean {
    for (let cell = 0; cell < CELLS; cell++) {
      if (this.crowd[cell] !== this.builtCrowd[cell]) return true;
    }
    return false;
  }

  /**
   * Puts an enemy back on the floor when the pack shoved it into a wall, a rock or, on foot, a
   * pit: Arcade gives up separating a body pushed that deep, and one left past the wall locks the room.
   */
  private keepInside(enemy: Enemy) {
    const body = enemy.body as Phaser.Physics.Arcade.Body;
    const col = colAt(body.center.x);
    const row = rowAt(body.center.y);
    if (passable(this.grid, col, row, enemy.def.flies === true)) return;
    const open = nearestOpen(this.grid, col, row);
    body.reset(tileX(open.col), tileY(open.row));
  }

  /**
   * Where an enemy should head to reach `target`: the target itself while the way is straight,
   * else the next cell on the path around what's in between. Its own spot (stand still) when
   * that cell is taken and there's no short way around: it queues. The returned point is shared.
   */
  readonly steer = (enemy: Enemy, target: Point): Point => {
    if (!this.steering) return target;
    const flying = enemy.def.flies === true;
    const body = enemy.body as Phaser.Physics.Arcade.Body;
    const { x, y } = body.center;
    if (straightPath(this.grid, flying, body.center, target, body.halfWidth)) return target;
    const next = (flying ? this.air : this.ground).next(colAt(x), rowAt(y));
    if (next < 0) return target;
    if (!enemy.def.ghost && this.crowd[next] > 0) return this.hold(enemy);
    const col = next % ROOM_COLS;
    this.waypoint.x = tileX(col);
    this.waypoint.y = tileY((next - col) / ROOM_COLS);
    return this.waypoint;
  };

  private hold(enemy: Enemy): Point {
    this.held.x = enemy.x;
    this.held.y = enemy.y;
    return this.held;
  }

  /** HP lost standing here; 0 off spikes. */
  damageAt(x: number, y: number): number {
    const id = this.grid[cellIndex(colAt(x), rowAt(y))];
    if (!id) return 0;
    return obstacleDef(id).damage;
  }

  /** Nothing on this cell: enemies may spawn and land there. */
  isOpen(col: number, row: number): boolean {
    return this.grid[cellIndex(col, row)] === null;
  }

  /** Where something landing at (x, y) belongs: right there if the cell is open, else the nearest open cell. */
  snap(x: number, y: number): Point {
    const col = colAt(x);
    const row = rowAt(y);
    if (this.isOpen(col, row)) {
      this.spot.x = x;
      this.spot.y = y;
      return this.spot;
    }
    const open = nearestOpen(this.grid, col, row);
    this.spot.x = tileX(open.col);
    this.spot.y = tileY(open.row);
    return this.spot;
  }

  /** Breaks every cracked rock `struck` picks by its center; returns where each one stood. */
  breakWhere(struck: (x: number, y: number) => boolean): Point[] {
    const broken: Point[] = [];
    for (const [cell, rock] of this.breakables) {
      const { x, y } = rock;
      if (!struck(x, y)) continue;
      this.breakables.delete(cell);
      this.grid[cell] = null;
      this.solid.remove(rock, true, true);
      this.showRubble(x, y);
      broken.push({ x, y });
    }
    if (broken.length === 0) return broken;
    this.steering = blocksAnyone(this.grid);
    this.targetCell = -1;
    return broken;
  }

  private showRubble(x: number, y: number) {
    const scene = this.scene;
    for (let i = 0; i < RUBBLE_BITS; i++) {
      const bit = scene.add.image(x, y, 'particle').setTint(this.rubbleColor).setDepth(4);
      const angle = (i / RUBBLE_BITS) * Math.PI * 2;
      scene.tweens.add({
        targets: bit,
        x: x + Math.cos(angle) * 22,
        y: y + Math.sin(angle) * 22,
        alpha: 0,
        scale: 0.4,
        duration: 320,
        onComplete: () => bit.destroy(),
      });
    }
    scene.cameras.main.shake(80, 0.003);
  }
}
