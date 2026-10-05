import Phaser from 'phaser';
import { COLORS, GAME_H, GAME_W } from './config';
import { loadSettings, parseConsoleParam, saveSettings } from './core/settings';
import { DebugConsole } from './debug/DebugConsole';
import { initLocale } from './i18n/apply';
import { setUsingTouch } from './input/touch';
import { BootScene } from './scenes/BootScene';
import { BossIntroScene } from './scenes/BossIntroScene';
import { GameScene } from './scenes/GameScene';
import { HudScene } from './scenes/HudScene';
import { PauseScene } from './scenes/PauseScene';
import { SummaryScene } from './scenes/SummaryScene';
import { TitleScene } from './scenes/TitleScene';
import { TouchScene } from './scenes/TouchScene';

initLocale();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: GAME_W,
  height: GAME_H,
  backgroundColor: COLORS.background,
  pixelArt: true,
  // Two thumbs on the sticks plus one on a button.
  input: { activePointers: 4 },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      debug: new URLSearchParams(location.search).has('debug'),
      // A few hundred bodies at most: scanning them beats keeping a spatial tree, which allocates on every query.
      useTree: false,
    },
  },
  scene: [BootScene, TitleScene, GameScene, HudScene, TouchScene, PauseScene, SummaryScene, BossIntroScene],
});

// Firefox opens Quick Find on ' and /. The game uses neither, and on ABNT2 ' is the console key itself.
const QUICK_FIND_KEYS = ["'", '/'];
window.addEventListener('keydown', (event) => {
  if (QUICK_FIND_KEYS.includes(event.key) && !(event.target instanceof HTMLInputElement)) event.preventDefault();
});

// The last device used decides: a touch shows the touch controls, a key press hides them.
window.addEventListener('pointerdown', (event) => {
  if (event.pointerType === 'touch') setUsingTouch(true);
});
window.addEventListener('keydown', (event) => {
  // Typing the seed on a phone's keyboard is still touch play.
  if (!(event.target instanceof HTMLInputElement)) setUsingTouch(false);
});

// Off by default, in production too; ?console turns it on and the choice is saved.
const consoleParam = parseConsoleParam(location.search);
const settings = loadSettings();
if (consoleParam !== undefined) {
  settings.console = consoleParam;
  saveSettings(settings);
}
// Decides from memory, not a reload: a failed save must not undo ?console for this session.
if (settings.console) new DebugConsole(game);

// Dev-only handle for debugging from the browser console.
if (import.meta.env.DEV) Object.assign(window, { game });
