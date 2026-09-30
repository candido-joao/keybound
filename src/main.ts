import Phaser from 'phaser';
import { COLORS, GAME_H, GAME_W } from './config';
import { loadSettings, parseConsoleParam, saveSettings } from './core/settings';
import { DebugConsole } from './debug/DebugConsole';
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

// Firefox opens Quick Find on ' and /. The game uses neither, and on ABNT2 ' is the console key itself.
const QUICK_FIND_KEYS = ["'", '/'];
window.addEventListener('keydown', (event) => {
  if (QUICK_FIND_KEYS.includes(event.key) && !(event.target instanceof HTMLInputElement)) event.preventDefault();
});

// Off by default, in production too; ?console turns it on and the choice is saved.
const consoleParam = parseConsoleParam(location.search);
if (consoleParam !== undefined) saveSettings({ ...loadSettings(), console: consoleParam });
if (loadSettings().console) new DebugConsole(game);

// Dev-only handle for debugging from the browser console.
if (import.meta.env.DEV) Object.assign(window, { game });
