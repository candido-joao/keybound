import Phaser from 'phaser';
import { COLORS, GAME_H, GAME_W } from '../config';
import { SEED_MAX_LENGTH, normalizeSeed } from '../core/rng';
import { newRun } from '../core/run';
import { KEY_TITLE_ART } from '../entities/Player';
import { LOCALE_NAMES, getLocale, nextLocale, t } from '../i18n';
import { chooseLocale } from '../i18n/apply';
import { usingTouch } from '../input/touch';
import { hintKey, onTap } from './tap';

interface TitleData {
  /** Kept across the restart that redraws the screen in a new language. */
  seedInput?: string;
}

const CURSOR_BLINK_MS = 450;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const SEED_BOX: Box = { x: GAME_W / 2, y: 282, w: 260, h: 38 };

export class TitleScene extends Phaser.Scene {
  private seedInput = '';
  private seedText!: Phaser.GameObjects.Text;
  private cursorOn = true;

  constructor() {
    super('title');
  }

  /** Build the localized title screen, restore the typed seed, and register its keyboard shortcuts. */
  create(data: TitleData) {
    this.seedInput = data.seedInput ?? '';
    this.cursorOn = true;
    const cx = GAME_W / 2;
    const style = { fontFamily: 'monospace', color: COLORS.text, stroke: '#000', strokeThickness: 4 };

    this.addTitleKey(cx, 110);
    this.add.text(cx, 110, 'KEYBOUND', { ...style, fontSize: '56px', strokeThickness: 6 }).setOrigin(0.5);
    this.add.text(cx, 160, t('title.tagline'), { ...style, fontSize: '15px', color: COLORS.textDim }).setOrigin(0.5);

    this.add
      .text(cx, 250, t('title.seed-label'), { ...style, fontSize: '13px', color: COLORS.textMuted })
      .setOrigin(0.5);
    const { x, y, w, h } = SEED_BOX;
    this.add.rectangle(x, y, w, h, 0x000000, 0.5).setStrokeStyle(2, COLORS.wallEdge);
    this.addSeedField();
    this.seedText = this.add.text(x, y, '', { ...style, fontSize: '20px' }).setOrigin(0.5);
    this.add
      .text(cx, 318, t(hintKey('title.seed-hint')), { ...style, fontSize: '12px', color: COLORS.textMuted })
      .setOrigin(0.5);

    const start = this.add.text(cx, 380, t(hintKey('title.start')), { ...style, fontSize: '22px' }).setOrigin(0.5);
    onTap(start, () => this.startRun());
    this.tweens.add({ targets: start, alpha: 0.4, duration: 700, yoyo: true, repeat: -1 });

    const controls = usingTouch() ? 'title.controls-touch' : 'title.controls';
    this.add.text(cx, 470, t(controls), { ...style, fontSize: '13px', color: COLORS.textDim }).setOrigin(0.5);
    const muted = { ...style, fontSize: '13px', color: COLORS.textMuted };
    const language = t(hintKey('title.language'), { language: LOCALE_NAMES[getLocale()] });
    onTap(this.add.text(cx - 24, 500, language, muted).setOrigin(1, 0.5), () => this.cycleLocale());
    this.add.text(cx, 500, '·', muted).setOrigin(0.5);
    onTap(this.add.text(cx + 24, 500, t(hintKey('title.wiki')), muted).setOrigin(0, 0.5), () => this.openWiki());

    this.drawSeed();
    this.time.addEvent({ delay: CURSOR_BLINK_MS, loop: true, callback: () => this.blink() });

    const keyboard = this.input.keyboard!;
    // Key capture stops Tab from moving browser focus, and F1 from opening the browser's help.
    keyboard.addKey('TAB');
    keyboard.addKey('F1');
    keyboard.on('keydown', (event: KeyboardEvent) => this.onKey(event));
  }

  /** Behind the logo's last letters; the art comes tilted, the baked key has to be turned. */
  private addTitleKey(cx: number, y: number): Phaser.GameObjects.Image {
    if (this.textures.exists(KEY_TITLE_ART)) return this.add.image(cx + 190, y, KEY_TITLE_ART).setScale(0.75);
    return this.add
      .image(cx + 150, y + 8, 'key')
      .setScale(2.5)
      .setAngle(-35);
  }

  /** Dispatch title shortcuts or normalize seed input while respecting the seed length limit. */
  private onKey(event: KeyboardEvent) {
    if (event.key === 'Enter') return this.startRun();
    // The seed field takes its own typing, from the phone's keyboard.
    if (event.target instanceof HTMLInputElement) return;
    if (event.key === 'Tab') return this.cycleLocale();
    if (event.key === 'F1') return this.openWiki();
    if (event.key === 'Backspace') return this.setSeedInput(this.seedInput.slice(0, -1));
    if (event.key.length !== 1 || this.seedInput.length >= SEED_MAX_LENGTH) return;
    this.setSeedInput(normalizeSeed(this.seedInput + event.key));
  }

  /**
   * Phones only open their keyboard when a real input is tapped, so a see-through one lies
   * over the seed box and takes the typing; the canvas keeps drawing the seed. It goes away
   * with the scene.
   */
  private addSeedField() {
    const field = document.createElement('input');
    Object.assign(field, { type: 'text', maxLength: SEED_MAX_LENGTH, autocomplete: 'off', spellcheck: false });
    field.setAttribute('autocapitalize', 'characters');
    field.setAttribute('enterkeyhint', 'go');
    // 16 px keeps iOS from zooming in on focus.
    field.style.cssText = 'position:fixed;opacity:0;font-size:16px;border:0;padding:0;margin:0';
    // Keys typed on the canvas change the seed too; pick it up when the field takes over.
    field.addEventListener('focus', () => (field.value = this.seedInput));
    field.addEventListener('input', () => {
      field.value = normalizeSeed(field.value);
      this.setSeedInput(field.value);
    });
    document.body.append(field);

    const place = () => this.placeOver(field, SEED_BOX);
    place();
    this.scale.on('resize', place);
    this.events.once('shutdown', () => {
      this.scale.off('resize', place);
      field.remove();
    });
  }

  /** Lines an HTML element up with a box in game coordinates, wherever the canvas is scaled to. */
  private placeOver(element: HTMLElement, box: Box) {
    const bounds = this.scale.canvasBounds;
    const sx = bounds.width / GAME_W;
    const sy = bounds.height / GAME_H;
    Object.assign(element.style, {
      left: `${bounds.left + (box.x - box.w / 2) * sx}px`,
      top: `${bounds.top + (box.y - box.h / 2) * sy}px`,
      width: `${box.w * sx}px`,
      height: `${box.h * sy}px`,
    });
  }

  private setSeedInput(value: string) {
    this.seedInput = value;
    this.cursorOn = true;
    this.drawSeed();
  }

  private blink() {
    this.cursorOn = !this.cursorOn;
    this.drawSeed();
  }

  private drawSeed() {
    if (!this.seedInput) {
      this.seedText.setText(t('title.seed-random')).setColor(COLORS.textMuted);
      return;
    }
    const cursor = this.cursorOn && this.seedInput.length < SEED_MAX_LENGTH ? '_' : ' ';
    this.seedText.setText(this.seedInput + cursor).setColor(COLORS.text);
  }

  private cycleLocale() {
    chooseLocale(nextLocale(getLocale()));
    this.scene.restart({ seedInput: this.seedInput } satisfies TitleData);
  }

  /** In a new tab, so the title and its typed seed are still here on the way back. */
  private openWiki() {
    window.open(`${import.meta.env.BASE_URL}wiki/`, '_blank', 'noopener');
  }

  private startRun() {
    // Phones hide the browser bars only in fullscreen, and only from a tap or key press like this one.
    if (usingTouch() && !this.scale.isFullscreen) {
      // Keep the seed field and rotation overlay in fullscreen alongside the canvas.
      this.scale.fullscreenTarget = document.documentElement;
      this.scale.startFullscreen();
    }
    this.scene.start('game', newRun(this.seedInput || undefined));
  }
}
