import Phaser from 'phaser';
import { BASE_STATS } from '../combat/balance';
import { ENEMIES } from '../combat/enemies';
import { ITEMS } from '../combat/items';
import { COLORS } from '../config';
import type { GameScene } from '../scenes/GameScene';
import { type Catalog, type StatName, execute } from './commands';
import { complete } from './complete';
import { History, loadHistory, saveHistory } from './history';

const CATALOG: Catalog = {
  item: ITEMS.map((i) => i.id),
  enemy: ENEMIES.map((e) => e.id),
  stat: Object.keys(BASE_STATS) as StatName[],
};

/** Physical key left of 1: the same spot on every layout, whatever character it types. */
const TOGGLE_CODE = 'Backquote';
const LOG_LIMIT = 200;

const STYLE = `
.kb-console { position: fixed; inset: 0 0 auto 0; max-height: 45vh; display: flex; flex-direction: column;
  background: rgba(7, 6, 13, 0.92); border-bottom: 2px solid #544a7d; font: 14px/1.4 monospace;
  color: ${COLORS.text}; z-index: 10; cursor: auto; }
.kb-console[hidden] { display: none; }
.kb-console-log { overflow-y: auto; padding: 8px 12px 4px; white-space: pre-wrap; }
.kb-console-echo { color: ${COLORS.textMuted}; }
.kb-console-matches { padding: 0 12px; color: ${COLORS.textMuted}; min-height: 1.4em; }
.kb-console-line { position: relative; margin: 4px 12px 8px; }
.kb-console-line input, .kb-console-ghost { font: inherit; padding: 4px 6px; margin: 0; border: 1px solid #3a3358;
  width: 100%; box-sizing: border-box; letter-spacing: normal; }
.kb-console-line input { background: transparent; color: ${COLORS.text}; outline: none; position: relative; }
.kb-console-ghost { position: absolute; inset: 0; border-color: transparent; color: ${COLORS.textMuted};
  white-space: pre; overflow: hidden; pointer-events: none; opacity: 0.6; }
.kb-console-ghost span:first-child { visibility: hidden; }
`;

/**
 * Developer console: an HTML text box over the canvas. While it's open the run is paused
 * and every key goes to the console, never to the game.
 */
export class DebugConsole {
  private readonly game: Phaser.Game;
  private readonly history = new History(loadHistory());
  private readonly root: HTMLDivElement;
  private readonly log: HTMLDivElement;
  private readonly matches: HTMLDivElement;
  private readonly input: HTMLInputElement;
  private readonly typed: HTMLSpanElement;
  private readonly ghost: HTMLSpanElement;
  private open = false;

  constructor(game: Phaser.Game) {
    this.game = game;
    const style = document.createElement('style');
    style.textContent = STYLE;
    document.head.append(style);

    this.root = element('div', 'kb-console');
    this.root.hidden = true;
    this.log = element('div', 'kb-console-log');
    this.matches = element('div', 'kb-console-matches');
    const line = element('div', 'kb-console-line');
    const ghostLine = element('div', 'kb-console-ghost');
    this.typed = element('span', '');
    this.ghost = element('span', '');
    ghostLine.append(this.typed, this.ghost);
    this.input = element('input', '');
    this.input.spellcheck = false;
    this.input.autocomplete = 'off';
    line.append(ghostLine, this.input);
    this.root.append(this.log, this.matches, line);
    document.body.append(this.root);
    this.print('type help for commands', 'echo');

    // Capture phase: runs before Phaser's window listeners and before the text box itself.
    window.addEventListener('keydown', (e) => this.onWindowKey(e), true);
    this.input.addEventListener('keydown', (e) => this.onInputKey(e));
    // The game never sees keys typed here, including their release.
    this.input.addEventListener('keyup', (e) => e.stopPropagation());
    this.input.addEventListener('input', () => this.refreshCompletion());
    // A command like `floor` restarts the game scene, which comes back running: pause it again.
    game.events.on(Phaser.Core.Events.POST_STEP, () => this.holdPause());
  }

  private onWindowKey(event: KeyboardEvent) {
    if (event.code === TOGGLE_CODE) {
      event.preventDefault();
      event.stopPropagation();
      this.toggle();
      return;
    }
    if (!this.open || event.target === this.input) return;
    // Focus left the text box (a click on the page): keep the key from the game and take focus back.
    event.preventDefault();
    event.stopPropagation();
    this.input.focus();
  }

  private onInputKey(event: KeyboardEvent) {
    event.stopPropagation();
    if (event.key === 'Enter') return this.submit();
    if (event.key === 'Escape') return this.hide();
    if (event.key === 'Tab') {
      event.preventDefault();
      return this.setInput(complete(this.input.value, CATALOG).completed);
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      return this.setInput(this.history.up(this.input.value));
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      return this.setInput(this.history.down(this.input.value));
    }
  }

  private toggle() {
    if (this.open) return this.hide();
    this.show();
  }

  /** Opens only over a run in progress: not on menus, overlays or mid room change. */
  private show() {
    const scene = this.runningGame();
    if (!scene) return;
    scene.scene.pause();
    this.open = true;
    this.root.hidden = false;
    this.input.focus();
    this.refreshCompletion();
  }

  private hide() {
    this.open = false;
    this.root.hidden = true;
    this.input.blur();
    // Keys released while typing never reached Phaser, which would still hold them down.
    (this.game.scene.getScene('game') as GameScene | null)?.input.keyboard?.resetKeys();
    if (this.game.scene.isPaused('game')) this.game.scene.resume('game');
  }

  private holdPause() {
    if (this.open && this.game.scene.isActive('game')) this.game.scene.pause('game');
  }

  private runningGame(): GameScene | undefined {
    if (!this.game.scene.isActive('game')) return undefined;
    const scene = this.game.scene.getScene('game') as GameScene;
    return scene.canPause ? scene : undefined;
  }

  private submit() {
    const line = this.input.value;
    this.setInput('');
    if (!line.trim()) return;
    this.history.push(line);
    saveHistory(this.history.all);
    this.print(`> ${line}`, 'echo');

    const scene = this.game.scene.getScene('game') as GameScene;
    try {
      const result = execute(line, scene.debugTarget(), CATALOG);
      if (result.clear) this.log.replaceChildren();
      for (const reply of result.lines) this.print(reply);
    } catch (error) {
      // A command that breaks must not take the game down with it.
      this.print(`error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private setInput(value: string) {
    this.input.value = value;
    this.input.setSelectionRange(value.length, value.length);
    this.refreshCompletion();
  }

  private refreshCompletion() {
    const { ghost, matches } = complete(this.input.value, CATALOG);
    this.typed.textContent = this.input.value;
    this.ghost.textContent = ghost;
    this.matches.textContent = matches.join('  ');
  }

  private print(text: string, className = '') {
    const row = element('div', className && `kb-console-${className}`);
    row.textContent = text;
    this.log.append(row);
    while (this.log.childElementCount > LOG_LIMIT) this.log.firstElementChild?.remove();
    this.log.scrollTop = this.log.scrollHeight;
  }
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
  return el;
}
