import Phaser from 'phaser';
import { COLORS, TILE } from '../config';
import { SWING, inSwing, swingTouchesBox } from '../combat/swing';
import { SWING_FX, SWING_FX_FRAME } from '../entities/keyArt';
import { PILE_RADIUS } from './BonePiles';
import type { GameScene } from './GameScene';

/**
 * Spends a drive charge on a short blow from the key's grip: it shoves and lightly hurts what
 * it touches, opens any door it hits, locked or held shut by the fight, and breaks cracked rocks.
 */
export function swingKey(game: GameScene) {
  const { player } = game;
  if (game.drive < 1 || player.swinging) return;
  game.drive--;
  const aim = player.startSwing();
  const { x, y, stats } = player;
  showSwing(game, x, y, aim);
  const enemies = game.enemyGroup();
  // Backwards, since a hit can kill and take the enemy out of the list.
  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];
    if (!enemy.active || !enemy.hittable) continue;
    const radius = (enemy.body as Phaser.Physics.Arcade.Body).halfWidth;
    if (!inSwing(enemy.x - x, enemy.y - y, aim, radius)) continue;
    game.combat.strike(enemy, stats.damage * SWING.damageShare, x, y, SWING.knockback * stats.knockback);
  }
  game.layout.swingAt(x, y, aim);
  game.breakRocks((rx, ry) => swingTouchesBox(rx - x, ry - y, aim, TILE / 2, TILE / 2));
  // The full blow of the key scatters bones outright.
  game.piles.strikeWhere((px, py) => inSwing(px - x, py - y, aim, PILE_RADIUS), Infinity);
}

/** The crescent rides the fan's far edge, turned to the aim. */
function showSwing(game: GameScene, x: number, y: number, aim: number) {
  if (!game.textures.exists(SWING_FX)) {
    showSwingArc(game, x, y, aim);
    return;
  }
  const scale = (SWING.reach * 2) / SWING_FX_FRAME.height;
  // The sheet's frames are right-aligned: their front edge sits half a frame ahead of center.
  const ahead = SWING.reach - (SWING_FX_FRAME.width / 2) * scale;
  const fx = game.add
    .sprite(x + Math.cos(aim) * ahead, y + Math.sin(aim) * ahead, SWING_FX)
    .setRotation(aim)
    .setScale(scale)
    .setDepth(11);
  fx.play(SWING_FX).once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => fx.destroy());
}

/** Fallback without the sheet: a fading stroke along the fan's edge. */
function showSwingArc(game: GameScene, x: number, y: number, aim: number) {
  const arc = game.add.graphics().setDepth(11);
  arc.lineStyle(6, COLORS.bolt, 0.9);
  arc.beginPath();
  arc.arc(x, y, SWING.reach - 6, aim - SWING.arc / 2, aim + SWING.arc / 2);
  arc.strokePath();
  game.tweens.add({ targets: arc, alpha: 0, duration: SWING.durationMs, onComplete: () => arc.destroy() });
}
