import Phaser from 'phaser';
import { COLORS, GAME_H, GAME_W } from './config';
import { initLocale } from './i18n/apply';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { HudScene } from './scenes/HudScene';
import { PauseScene } from './scenes/PauseScene';
import { SummaryScene } from './scenes/SummaryScene';
import { TitleScene } from './scenes/TitleScene';

initLocale();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: GAME_W,
  height: GAME_H,
  backgroundColor: COLORS.background,
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: { debug: new URLSearchParams(location.search).has('debug') },
  },
  scene: [BootScene, TitleScene, GameScene, HudScene, PauseScene, SummaryScene],
});

// Dev-only handle for debugging from the browser console.
if (import.meta.env.DEV) Object.assign(window, { game });
