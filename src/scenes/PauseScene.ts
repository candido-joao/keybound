import Phaser from 'phaser';
import { summarizeItems } from '../combat/stats';
import { COLORS, GAME_H, GAME_W } from '../config';
import { randomSeed } from '../core/rng';
import type { GameScene, RunData } from './GameScene';

/** Overlay launched by GameScene on Esc; GameScene stays paused underneath. */
export class PauseScene extends Phaser.Scene {
  constructor() {
    super('pause');
  }

  create() {
    const game = this.scene.get('game') as GameScene;
    const cx = GAME_W / 2;
    const cy = GAME_H / 2;
    const style = { fontFamily: 'monospace', color: COLORS.text, stroke: '#000', strokeThickness: 4 };

    this.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.65).setOrigin(0);
    this.add.text(cx, cy - 90, 'Pausado', { ...style, fontSize: '28px', strokeThickness: 5 }).setOrigin(0.5);
    this.add.text(cx, cy - 40, `seed ${game.seed}`, { ...style, fontSize: '15px', color: '#b8b0d8' }).setOrigin(0.5);
    if (game.items.length > 0) {
      this.add
        .text(cx, cy - 4, summarizeItems(game.items), { ...style, fontSize: '12px', color: '#9d95c4', align: 'center', wordWrap: { width: 560 } })
        .setOrigin(0.5, 0);
    }
    this.add.text(cx, cy + 110, 'Esc continuar   ·   R nova run', { ...style, fontSize: '13px', color: '#b8b0d8' }).setOrigin(0.5);

    const keyboard = this.input.keyboard!;
    keyboard.once('keydown-ESC', () => this.close());
    keyboard.once('keydown-R', () => this.close({ seed: randomSeed() }));
  }

  private close(restart?: RunData) {
    this.scene.stop();
    const game = this.scene.get('game') as GameScene;
    if (restart) game.scene.restart(restart);
    else game.resumeFromPause();
  }
}
