import Phaser from 'phaser';
import { COLORS, GAME_W } from '../config';
import { SEED_MAX_LENGTH, normalizeSeed } from '../core/rng';
import { newRun } from '../core/run';
import { KEY_TITLE_ART } from '../entities/Player';
import { LOCALE_NAMES, getLocale, nextLocale, t } from '../i18n';
import { chooseLocale } from '../i18n/apply';

interface TitleData {
  /** Kept across the restart that redraws the screen in a new language. */
  seedInput?: string;
}

const CURSOR_BLINK_MS = 450;

export class TitleScene extends Phaser.Scene {
  private seedInput = '';
  private seedText!: Phaser.GameObjects.Text;
  private cursorOn = true;

  constructor() {
    super('title');
  }

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
    this.add.rectangle(cx, 282, 260, 38, 0x000000, 0.5).setStrokeStyle(2, COLORS.wallEdge);
    this.seedText = this.add.text(cx, 282, '', { ...style, fontSize: '20px' }).setOrigin(0.5);
    this.add
      .text(cx, 318, t('title.seed-hint'), { ...style, fontSize: '12px', color: COLORS.textMuted })
      .setOrigin(0.5);

    const start = this.add.text(cx, 380, t('title.start'), { ...style, fontSize: '22px' }).setOrigin(0.5);
    this.tweens.add({ targets: start, alpha: 0.4, duration: 700, yoyo: true, repeat: -1 });

    this.add.text(cx, 470, t('title.controls'), { ...style, fontSize: '13px', color: COLORS.textDim }).setOrigin(0.5);
    this.add
      .text(cx, 500, t('title.language', { language: LOCALE_NAMES[getLocale()] }), {
        ...style,
        fontSize: '13px',
        color: COLORS.textMuted,
      })
      .setOrigin(0.5);

    this.drawSeed();
    this.time.addEvent({ delay: CURSOR_BLINK_MS, loop: true, callback: () => this.blink() });

    const keyboard = this.input.keyboard!;
    // Key capture stops Tab from moving browser focus.
    keyboard.addKey('TAB');
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

  private onKey(event: KeyboardEvent) {
    if (event.key === 'Enter') return this.startRun();
    if (event.key === 'Tab') return this.cycleLocale();
    if (event.key === 'Backspace') return this.setSeedInput(this.seedInput.slice(0, -1));
    if (event.key.length !== 1 || this.seedInput.length >= SEED_MAX_LENGTH) return;
    this.setSeedInput(normalizeSeed(this.seedInput + event.key));
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

  private startRun() {
    this.scene.start('game', newRun(this.seedInput || undefined));
  }
}
