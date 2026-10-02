import Phaser from 'phaser';
import { COLORS } from '../config';
import type { Stick } from '../input/pad';
import { PAD_LAYOUT, pad, usingTouch } from '../input/touch';
import type { GameScene } from './GameScene';

const RING_ALPHA = 0.35;
const IDLE_ALPHA = 0.15;
const KNOB_RADIUS = 20;

/**
 * Overlay launched with the HUD: feeds touches to the shared pad and draws the sticks and
 * the pause button. Scene-level pointer events only, so overlays above still get their taps.
 */
export class TouchScene extends Phaser.Scene {
  private graphics!: Phaser.GameObjects.Graphics;
  /** Pad state only changes on pointer events; the drawing follows on the next update. */
  private dirty = true;
  private shown = false;

  constructor() {
    super('touch');
  }

  create() {
    this.graphics = this.add.graphics();
    this.dirty = true;
    this.shown = false;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown(p));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onMove(p));
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => this.onUp(p));
    this.input.on('pointerupoutside', (p: Phaser.Input.Pointer) => this.onUp(p));
    this.events.once('shutdown', () => pad.releaseAll());
  }

  update() {
    const show = usingTouch() && this.playable;
    if (show !== this.shown) {
      this.shown = show;
      this.graphics.setVisible(show);
      this.dirty = true;
    }
    if (!show || !this.dirty) return;
    this.dirty = false;
    this.draw();
  }

  /** Not while an overlay (pause, summary) sits over the run. */
  private get playable(): boolean {
    return this.scene.isActive('game') && !this.scene.isActive('summary');
  }

  private onDown(p: Phaser.Input.Pointer) {
    if (!p.wasTouch || !this.playable) return;
    this.dirty = true;
    const button = pad.press(p.id, p.x, p.y);
    if (button === 'pause') (this.scene.get('game') as GameScene).requestPause();
  }

  private onMove(p: Phaser.Input.Pointer) {
    if (!p.isDown) return;
    pad.drag(p.id, p.x, p.y);
    this.dirty = true;
  }

  private onUp(p: Phaser.Input.Pointer) {
    pad.release(p.id);
    this.dirty = true;
  }

  private draw() {
    const g = this.graphics;
    g.clear();
    this.drawStick(pad.move);
    this.drawStick(pad.aim);
    this.drawPause();
  }

  private drawStick(stick: Stick) {
    const g = this.graphics;
    const alpha = stick.active ? RING_ALPHA : IDLE_ALPHA;
    g.lineStyle(3, COLORS.wallEdge, alpha * 2);
    g.fillStyle(0x000000, alpha);
    g.fillCircle(stick.baseX, stick.baseY, PAD_LAYOUT.radius);
    g.strokeCircle(stick.baseX, stick.baseY, PAD_LAYOUT.radius);
    g.fillStyle(COLORS.bolt, alpha * 2);
    g.fillCircle(stick.baseX + stick.knobX, stick.baseY + stick.knobY, KNOB_RADIUS);
  }

  private drawPause() {
    const g = this.graphics;
    const { x, y, r } = PAD_LAYOUT.buttons.pause;
    const alpha = pad.isHeld('pause') ? RING_ALPHA * 2 : RING_ALPHA;
    g.fillStyle(0x000000, alpha);
    g.fillCircle(x, y, r);
    g.lineStyle(2, COLORS.wallEdge, alpha * 2);
    g.strokeCircle(x, y, r);
    g.fillStyle(0xffffff, alpha * 2);
    g.fillRect(x - 8, y - 9, 5, 18);
    g.fillRect(x + 3, y - 9, 5, 18);
  }
}
