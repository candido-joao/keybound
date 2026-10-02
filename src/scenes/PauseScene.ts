import Phaser from 'phaser';
import { summarizeItems } from '../combat/stats';
import { COLORS, GAME_H, GAME_W } from '../config';
import { LOCALE_NAMES, getLocale, nextLocale, t } from '../i18n';
import { chooseLocale } from '../i18n/apply';
import { nextStickMode } from '../input/pad';
import { pad, setStickMode, usingTouch } from '../input/touch';
import { returnToTitle } from './navigation';
import { hintKey, onTap } from './tap';
import type { GameScene } from './GameScene';

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
    const muted = { ...style, fontSize: '13px', color: COLORS.textMuted };
    const language = t(hintKey('pause.language'), { language: LOCALE_NAMES[getLocale()] });
    onTap(this.add.text(cx, cy + 70, language, muted).setOrigin(0.5), () => this.cycleLocale());
    // Only touch play has sticks to set.
    if (usingTouch()) {
      const sticks = t('pause.sticks', { mode: t(`sticks.${pad.mode}`) });
      onTap(this.add.text(cx, cy + 98, sticks, muted).setOrigin(0.5), () => this.cycleStickMode());
    }

    const action = { ...style, fontSize: '14px', color: COLORS.textDim };
    const row = cy + 140;
    onTap(this.add.text(cx - 170, row, t(hintKey('pause.resume')), action).setOrigin(0.5), () => this.close());
    onTap(this.add.text(cx, row, t(hintKey('pause.new-run')), action).setOrigin(0.5), () => this.close(true));
    onTap(this.add.text(cx + 170, row, t(hintKey('pause.menu')), action).setOrigin(0.5), () => returnToTitle(this));

    const keyboard = this.input.keyboard!;
    keyboard.once('keydown-ESC', () => this.close());
    keyboard.once('keydown-R', () => this.close(true));
    keyboard.once('keydown-Q', () => returnToTitle(this));
    keyboard.once('keydown-L', () => this.cycleLocale());
  }

  private cycleStickMode() {
    setStickMode(nextStickMode(pad.mode));
    this.scene.restart();
  }

  private cycleLocale() {
    chooseLocale(nextLocale(getLocale()));
    // Redraws this overlay in the new language; GameScene stays paused underneath.
    this.scene.restart();
  }

  private close(newRun = false) {
    this.scene.stop();
    const game = this.scene.get('game') as GameScene;
    if (newRun) {
      game.restartRun(false);
      return;
    }
    // Phaser already reset the game scene's keys when it paused.
    game.scene.resume();
  }
}
