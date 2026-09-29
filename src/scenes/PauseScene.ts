import Phaser from 'phaser';
import { summarizeItems } from '../combat/stats';
import { COLORS, GAME_H, GAME_W } from '../config';
import { randomSeed } from '../core/rng';
import { LOCALE_NAMES, getLocale, nextLocale, t } from '../i18n';
import { chooseLocale } from '../i18n/apply';
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
    this.add.text(cx, cy - 90, t('pause.title'), { ...style, fontSize: '28px', strokeThickness: 5 }).setOrigin(0.5);
    this.add
      .text(cx, cy - 40, t('pause.seed', { seed: game.seed }), { ...style, fontSize: '15px', color: COLORS.textDim })
      .setOrigin(0.5);
    if (game.items.length > 0) {
      this.add
        .text(cx, cy - 4, summarizeItems(game.items), {
          ...style,
          fontSize: '12px',
          color: COLORS.textMuted,
          align: 'center',
          wordWrap: { width: 560 },
        })
        .setOrigin(0.5, 0);
    }
    this.add
      .text(cx, cy + 84, t('pause.language', { language: LOCALE_NAMES[getLocale()] }), {
        ...style,
        fontSize: '13px',
        color: COLORS.textMuted,
      })
      .setOrigin(0.5);
    this.add.text(cx, cy + 110, t('pause.hint'), { ...style, fontSize: '13px', color: COLORS.textDim }).setOrigin(0.5);

    const keyboard = this.input.keyboard!;
    keyboard.once('keydown-ESC', () => this.close());
    keyboard.once('keydown-R', () => this.close({ seed: randomSeed() }));
    keyboard.once('keydown-L', () => this.cycleLocale());
  }

  private cycleLocale() {
    chooseLocale(nextLocale(getLocale()));
    // Redraws this overlay in the new language; GameScene stays paused underneath.
    this.scene.restart();
  }

  private close(restart?: RunData) {
    this.scene.stop();
    const game = this.scene.get('game') as GameScene;
    if (restart) {
      game.scene.restart(restart);
      return;
    }
    // Phaser already reset the game scene's keys when it paused.
    game.scene.resume();
  }
}
