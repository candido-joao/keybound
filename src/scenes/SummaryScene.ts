import Phaser from 'phaser';
import { summarizeItems } from '../combat/stats';
import { COLORS, GAME_H, GAME_W } from '../config';
import { formatDuration } from '../core/run';
import { t } from '../i18n';
import { returnToTitle } from './navigation';
import { hintKey, onTap } from './tap';
import type { GameScene } from './GameScene';

/** Keeps a key still held from the fight from skipping the summary. */
const INPUT_DELAY_MS = 600;

/** End-of-run overlay launched by GameScene on death or victory; the frozen run stays visible underneath. */
export class SummaryScene extends Phaser.Scene {
  /** scene.stop only lands next step; without this, R and Esc in one frame would both run. */
  private leaving = false;

  constructor() {
    super('summary');
  }

  create() {
    this.leaving = false;
    const game = this.scene.get('game') as GameScene;
    const stats = game.runStats();
    const cx = GAME_W / 2;
    const style = { fontFamily: 'monospace', color: COLORS.text, stroke: '#000', strokeThickness: 4 };

    this.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.7).setOrigin(0);
    this.add.text(cx, 110, t(game.endTitle), { ...style, fontSize: '30px', strokeThickness: 5 }).setOrigin(0.5);
    this.add
      .text(cx, 158, t(game.won ? 'summary.victory' : 'summary.floor', { n: game.depth }), {
        ...style,
        fontSize: '18px',
        color: COLORS.textDim,
      })
      .setOrigin(0.5);

    const line = [
      t('summary.time', { time: formatDuration(stats.timeMs) }),
      t('summary.kills', { n: stats.kills }),
      t('summary.rooms', { n: stats.roomsCleared }),
    ].join('   ·   ');
    this.add.text(cx, 200, line, { ...style, fontSize: '15px' }).setOrigin(0.5);

    this.addItemsAndSeed(game, style);
    const action = { ...style, fontSize: '14px', color: COLORS.textDim };
    const buttons = [
      this.add.text(cx - 110, 430, t(hintKey('summary.new-run')), action).setOrigin(0.5),
      this.add.text(cx + 110, 430, t(hintKey('summary.menu')), action).setOrigin(0.5),
    ];

    this.time.delayedCall(INPUT_DELAY_MS, () => this.bindInput(game, buttons));
  }

  private addItemsAndSeed(game: GameScene, style: Phaser.Types.GameObjects.Text.TextStyle) {
    const cx = GAME_W / 2;
    const items = game.items.length > 0 ? summarizeItems(game.items) : t('summary.no-items');
    this.add
      .text(cx, 240, items, {
        ...style,
        fontSize: '12px',
        color: COLORS.textMuted,
        align: 'center',
        wordWrap: { width: 600 },
      })
      .setOrigin(0.5, 0);

    const seed = t('pause.seed', { seed: game.seed });
    this.add
      .text(cx, 380, game.seeded ? `${seed}  (${t('summary.seeded')})` : seed, {
        ...style,
        fontSize: '13px',
        color: COLORS.textDim,
      })
      .setOrigin(0.5);
  }

  private bindInput(game: GameScene, [newRun, menu]: Phaser.GameObjects.Text[]) {
    onTap(newRun, () => this.run(() => this.restart(game)));
    onTap(menu, () => this.run(() => returnToTitle(this)));
    this.input.keyboard!.on('keydown', (event: KeyboardEvent) => {
      // Auto-repeat means the key was held since the fight, not pressed here.
      if (event.repeat) return;
      const action = this.actionFor(event.key, game);
      if (action) this.run(action);
    });
  }

  private run(action: () => void) {
    if (this.leaving) return;
    this.leaving = true;
    action();
  }

  private actionFor(key: string, game: GameScene): (() => void) | undefined {
    if (key === 'r' || key === 'R' || key === 'Enter') return () => this.restart(game);
    if (key === 'Escape') return () => returnToTitle(this);
    return undefined;
  }

  private restart(game: GameScene) {
    this.scene.stop();
    game.restartRun();
  }
}
