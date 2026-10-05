import type Phaser from 'phaser';
import { BONE_PILE, ENEMIES } from '../combat/enemies';
import { PLACEHOLDER_BODY, type PlaceholderColors, placeholderColors } from '../combat/placeholderArt';
import { COLORS, TILE } from '../config';
import { obstacleDef, obstacleTexture } from '../floor/obstacles';
import { PHASES, type PhaseDef, floorTexture, wallTexture } from '../floor/phases';

type Draw = (g: Phaser.GameObjects.Graphics) => void;

/** Draws into one reused Graphics and saves each drawing as a texture. */
class Baker {
  readonly g: Phaser.GameObjects.Graphics;
  private readonly scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.g = scene.make.graphics({}, false);
  }

  bake(key: string, w: number, h: number, draw: Draw) {
    this.g.clear();
    draw(this.g);
    this.g.generateTexture(key, w, h);
  }

  /** Art that loaded keeps its key; only the missing ones are drawn. */
  bakeMissing(key: string, w: number, h: number, draw: Draw) {
    if (!this.scene.textures.exists(key)) this.bake(key, w, h, draw);
  }

  destroy() {
    this.g.destroy();
  }
}

/**
 * Generated stand-ins for art that isn't there yet, or never loaded. Real art under the same
 * key replaces them without touching the code that uses them.
 */
export function bakeFallbackArt(scene: Phaser.Scene) {
  const baker = new Baker(scene);
  for (const phase of PHASES) bakePhaseArt(baker, phase);
  bakeHazards(baker);
  bakeDoors(baker);
  bakeActors(baker);
  bakePickups(baker);
  baker.destroy();
}

/** Floor, wall and rocks in the phase's own colors. */
function bakePhaseArt(baker: Baker, phase: PhaseDef) {
  const { floor, floorAlt, wall, wallEdge } = phase.palette;
  baker.bake(floorTexture(phase), TILE, TILE, (g) => {
    g.fillStyle(floor).fillRect(0, 0, TILE, TILE);
    g.fillStyle(floorAlt).fillRect(2, 2, TILE - 4, TILE - 4);
    g.fillStyle(floor).fillRect(TILE / 2 - 1, 2, 2, TILE - 4);
  });
  baker.bake(wallTexture(phase), TILE, TILE, (g) => {
    g.fillStyle(wall).fillRect(0, 0, TILE, TILE);
    g.lineStyle(2, wallEdge).strokeRect(1, 1, TILE - 2, TILE - 2);
    g.fillStyle(wallEdge).fillRect(6, TILE / 2 - 1, TILE - 12, 2);
  });
  const rock: Draw = (g) => drawRock(g, wall, wallEdge);
  baker.bakeMissing(obstacleTexture(obstacleDef('rock'), phase.id), TILE, TILE, rock);
  baker.bakeMissing(obstacleTexture(obstacleDef('cracked'), phase.id), TILE, TILE, (g) => {
    rock(g);
    drawCrack(g);
  });
}

function drawRock(g: Phaser.GameObjects.Graphics, wall: number, wallEdge: number) {
  g.fillStyle(0x000000, 0.35).fillEllipse(TILE / 2, TILE - 9, TILE - 10, 12);
  g.fillStyle(wall).fillRoundedRect(5, 6, TILE - 10, TILE - 13, 10);
  g.fillStyle(wallEdge).fillRoundedRect(10, 9, TILE - 24, 9, 4);
  g.lineStyle(2, wallEdge).strokeRoundedRect(5, 6, TILE - 10, TILE - 13, 10);
}

/** A zigzag split down the face: this one gives way to a swing. */
function drawCrack(g: Phaser.GameObjects.Graphics) {
  g.lineStyle(3, 0x0c0a16).beginPath();
  g.moveTo(TILE / 2 - 2, 8)
    .lineTo(TILE / 2 + 5, 17)
    .lineTo(TILE / 2 - 4, 25)
    .lineTo(TILE / 2 + 3, TILE - 9);
  g.moveTo(TILE / 2 - 4, 25).lineTo(12, 30);
  g.strokePath();
}

function bakeHazards(baker: Baker) {
  baker.bakeMissing(obstacleDef('pit').texture, TILE, TILE, (g) => {
    g.fillStyle(0x000000, 0.45).fillRoundedRect(2, 2, TILE - 4, TILE - 4, 8);
    g.fillStyle(0x030207).fillRoundedRect(5, 5, TILE - 10, TILE - 10, 7);
    g.fillStyle(0x000000).fillRoundedRect(9, 12, TILE - 18, TILE - 19, 5);
  });
  baker.bakeMissing(obstacleDef('spikes').texture, TILE, TILE, (g) => {
    // No plate: staggered rows of points coming straight out of the floor, each over its hole.
    for (let row = 0; row < 4; row++) drawSpikeRow(g, row);
  });
}

/** One staggered row of spike points, each over its hole. */
function drawSpikeRow(g: Phaser.GameObjects.Graphics, row: number) {
  const shift = row % 2 === 0 ? 0 : 7;
  const y = 14 + row * 10;
  for (let x = 10 + shift; x < TILE - 4; x += 14) {
    g.fillStyle(0x07060d, 0.7).fillEllipse(x, y, 11, 4);
    g.fillStyle(0x6b6f80).fillTriangle(x - 4, y, x + 4, y, x, y - 12);
    g.fillStyle(0xcfd6e6).fillTriangle(x - 1, y - 1, x + 1, y - 1, x, y - 11);
  }
}

function bakeDoors(baker: Baker) {
  baker.bake('door', TILE, TILE, (g) => {
    g.fillStyle(0x0c0a16).fillRect(0, 0, TILE, TILE);
    g.fillStyle(COLORS.door).fillRect(4, 4, TILE - 8, TILE - 8);
    g.fillStyle(0x5c4719).fillRect(TILE / 2 - 2, 4, 4, TILE - 8);
    g.fillStyle(COLORS.shadowEye).fillCircle(TILE / 2, TILE / 2, 5);
  });

  // Iron bands and a keyhole: only a key swing opens it.
  baker.bake('door-locked', TILE, TILE, (g) => {
    g.fillStyle(0x0c0a16).fillRect(0, 0, TILE, TILE);
    g.fillStyle(COLORS.door).fillRect(4, 4, TILE - 8, TILE - 8);
    g.fillStyle(0x6b6f80)
      .fillRect(4, 11, TILE - 8, 5)
      .fillRect(4, TILE - 16, TILE - 8, 5);
    g.fillStyle(0xcfd6e6).fillCircle(TILE / 2, TILE / 2 - 2, 6);
    g.fillStyle(0x0c0a16)
      .fillCircle(TILE / 2, TILE / 2 - 3, 2.5)
      .fillTriangle(TILE / 2 - 2.5, TILE / 2 - 2, TILE / 2 + 2.5, TILE / 2 - 2, TILE / 2, TILE / 2 + 4);
  });
}

/** The hero, the key, both kinds of shot and every enemy still without art. */
function bakeActors(baker: Baker) {
  baker.bake('player', 32, 36, (g) => {
    // Cloak, head, spiky hair.
    g.fillStyle(0x2f3f8f).fillRoundedRect(6, 18, 20, 16, 5);
    g.fillStyle(0xf2d3b3).fillCircle(16, 13, 9);
    g.fillStyle(0x5a3a22)
      .fillTriangle(6, 10, 12, 0, 16, 8)
      .fillTriangle(12, 8, 20, -1, 24, 9)
      .fillTriangle(20, 9, 28, 3, 26, 13);
    g.fillStyle(0x1b1830).fillRect(12, 13, 3, 3).fillRect(18, 13, 3, 3);
  });
  baker.bake('key', 44, 14, (g) => {
    // Handle guard, shaft, bit at the tip.
    g.fillStyle(0xf2c14e).fillRoundedRect(0, 1, 9, 12, 3);
    g.fillStyle(0xcfd6e6).fillRect(9, 5, 28, 4);
    g.fillStyle(0xcfd6e6).fillRect(33, 5, 4, 9).fillRect(38, 5, 4, 9).fillRect(36, 10, 6, 4);
    g.fillStyle(COLORS.bolt).fillCircle(4, 7, 2);
  });
  bakeShots(baker);
  bakeEnemies(baker);
}

function bakeShots(baker: Baker) {
  baker.bake('bolt', 14, 14, (g) => {
    g.fillStyle(COLORS.bolt, 0.45).fillCircle(7, 7, 7);
    g.fillStyle(COLORS.bolt).fillCircle(7, 7, 4.5);
    g.fillStyle(COLORS.boltCore).fillCircle(7, 7, 2.5);
  });
  // Warm and dark, unlike the player's cyan bolts, so incoming shots read at a glance.
  baker.bake('hostile-orb', 14, 14, (g) => {
    g.fillStyle(0xe8435a, 0.35).fillCircle(7, 7, 7);
    g.fillStyle(0xb02a6a).fillCircle(7, 7, 4.5);
    g.fillStyle(0xffc4d6).fillCircle(7, 7, 2);
  });
}

/** Enemies without art yet, the Colossi among them, get the placeholder body. */
function bakeEnemies(baker: Baker) {
  const { size } = PLACEHOLDER_BODY;
  for (const def of ENEMIES) {
    const colors = placeholderColors(def);
    baker.bakeMissing(def.texture, size, size, (g) => drawPlaceholder(g, colors));
  }
  baker.bakeMissing(BONE_PILE, 32, 32, (g) => {
    g.fillStyle(0xb8ab84).fillEllipse(16, 24, 26, 10);
    g.fillStyle(0xd8cfb0).fillCircle(16, 18, 6);
  });
}

function drawPlaceholder(g: Phaser.GameObjects.Graphics, colors: PlaceholderColors) {
  const { body, horns, eyes, eyeRadius } = PLACEHOLDER_BODY;
  g.fillStyle(colors.body).fillEllipse(body.x, body.y, body.w, body.h);
  for (const h of horns) g.fillTriangle(h[0], h[1], h[2], h[3], h[4], h[5]);
  g.fillStyle(colors.eye);
  for (const [x, y] of eyes) g.fillCircle(x, y, eyeRadius);
}

/** What lies on the floor to be taken or used: drops, pedestals, the portal and the altar. */
function bakePickups(baker: Baker) {
  baker.bake('particle', 8, 8, (g) => {
    g.fillStyle(0xffffff).fillCircle(4, 4, 4);
  });
  baker.bake('pedestal', 40, 28, (g) => {
    g.fillStyle(0x4b4470).fillRect(4, 10, 32, 18);
    g.fillStyle(0x6d64a0).fillRect(0, 6, 40, 6);
  });
  // Fallback for items whose PNG is missing; tinted with the item's color.
  baker.bake('item', 24, 24, (g) => {
    g.fillStyle(0xffffff).fillCircle(12, 12, 10);
    g.fillStyle(0xffffff, 0.4).fillCircle(12, 12, 12);
  });
  bakeDrops(baker);
  bakeFixtures(baker);
}

function bakeDrops(baker: Baker) {
  baker.bake('drop-currency', 14, 14, (g) => {
    g.fillStyle(0x8a6d2f).fillCircle(7, 7, 7);
    g.fillStyle(COLORS.treasure).fillCircle(7, 7, 5.5);
    g.fillStyle(0xfff3c4).fillRect(5, 4, 2, 5);
  });
  baker.bake('drop-heal', 14, 14, (g) => {
    g.fillStyle(COLORS.hp, 0.4).fillCircle(7, 7, 7);
    g.fillStyle(COLORS.hp).fillCircle(7, 7, 5);
    g.fillStyle(0xffd0d8).fillCircle(5, 5, 1.8);
  });
}

function bakeFixtures(baker: Baker) {
  baker.bake('portal', 56, 56, (g) => {
    g.fillStyle(0x000000).fillCircle(28, 28, 26);
    g.lineStyle(4, COLORS.bolt).strokeCircle(28, 28, 24);
    g.lineStyle(2, 0xc77dff).strokeCircle(28, 28, 16);
  });
  baker.bake('altar', 40, 36, (g) => {
    g.fillStyle(0x3a2a3a).fillRect(2, 14, 36, 22);
    g.fillStyle(0x54404f).fillRect(0, 10, 40, 6);
    g.fillStyle(0x8e1b2e).fillRect(6, 11, 28, 3);
    g.fillStyle(0xe8435a).fillCircle(20, 6, 4).fillTriangle(16, 5, 24, 5, 20, -2);
  });
}
