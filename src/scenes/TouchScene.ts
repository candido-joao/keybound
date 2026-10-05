import Phaser from 'phaser';
import { COLORS, GAME_H, GAME_W } from '../config';
import type { Circle, Stick } from '../input/pad';
import { PAD_LAYOUT, pad, usingTouch } from '../input/touch';
import type { GameScene } from './GameScene';

const RING_ALPHA = 0.35;
const IDLE_ALPHA = 0.15;
const KNOB_RADIUS = 20;

/**
 * Overlay launched with the HUD: feeds touches to the shared pad and draws the sticks and
 * the pause button. Both happen over the whole screen, not just the canvas: on a phone wider
 * than the game the thumbs rest in the black margins, and Phaser drops a touch that leaves
 * its canvas, freezing the stick. Phaser still gets every touch, so overlays keep their taps.
 */
export class TouchScene extends Phaser.Scene {
  private overlay!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  /** Pad state only changes on pointer events; the drawing follows on the next update. */
  private dirty = true;
  private shown = false;
  /** The swing button dims without charges; redrawn when that changes. */
  private drawnCharged = false;
  /** Canvas placement the overlay and pad were last fitted to. */
  private fitted = { x: NaN, y: NaN, width: NaN, height: NaN, screenW: NaN, screenH: NaN };

  constructor() {
    super('touch');
  }

  create() {
    this.overlay = document.getElementById('touch') as HTMLCanvasElement;
    this.ctx = this.overlay.getContext('2d')!;
    this.dirty = true;
    this.shown = false;
    this.fitted.width = NaN;
    window.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    this.events.once('shutdown', () => {
      window.removeEventListener('pointerdown', this.onDown);
      window.removeEventListener('pointermove', this.onMove);
      window.removeEventListener('pointerup', this.onUp);
      window.removeEventListener('pointercancel', this.onUp);
      pad.releaseAll();
      this.clear();
    });
  }

  update() {
    const game = this.scene.get('game') as GameScene;
    // Taken here, inside the game loop, rather than in the DOM event.
    if (pad.consume('pause')) game.requestPause();
    this.fit();
    const show = usingTouch() && this.playable;
    const charged = game.drive > 0;
    if (charged !== this.drawnCharged) {
      this.drawnCharged = charged;
      this.dirty = true;
    }
    if (show !== this.shown) {
      this.shown = show;
      this.dirty = true;
    }
    if (!this.dirty) return;
    this.dirty = false;
    this.clear();
    if (show) this.draw();
  }

  /** Only during play, outside transitions, boss intros and overlays. */
  private get playable(): boolean {
    return (
      this.scene.isActive('game') && !this.scene.isActive('summary') && (this.scene.get('game') as GameScene).canPause
    );
  }

  private readonly onDown = (e: PointerEvent) => {
    if (e.pointerType !== 'touch' || !this.playable) return;
    pad.press(e.pointerId, this.scale.transformX(e.pageX), this.scale.transformY(e.pageY));
    this.dirty = true;
  };

  private readonly onMove = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return;
    pad.drag(e.pointerId, this.scale.transformX(e.pageX), this.scale.transformY(e.pageY));
    this.dirty = true;
  };

  private readonly onUp = (e: PointerEvent) => {
    pad.release(e.pointerId);
    this.dirty = true;
  };

  /** Matches the overlay to the screen and the pad to the margins whenever the canvas moves. */
  private fit() {
    const bounds = this.scale.canvasBounds;
    const f = this.fitted;
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const same =
      f.x === bounds.x &&
      f.y === bounds.y &&
      f.width === bounds.width &&
      f.height === bounds.height &&
      f.screenW === screenW &&
      f.screenH === screenH;
    if (same || bounds.width === 0 || bounds.height === 0) return;
    Object.assign(f, { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, screenW, screenH });
    const dpr = window.devicePixelRatio || 1;
    this.overlay.width = Math.round(screenW * dpr);
    this.overlay.height = Math.round(screenH * dpr);
    pad.setView({
      left: this.scale.transformX(window.scrollX),
      top: this.scale.transformY(window.scrollY),
      right: this.scale.transformX(window.scrollX + screenW),
      bottom: this.scale.transformY(window.scrollY + screenH),
    });
    this.dirty = true;
  }

  private clear() {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
  }

  /** Draws in game coordinates, scaled and placed like the canvas, margins included. */
  private draw() {
    const f = this.fitted;
    const dpr = this.overlay.width / f.screenW;
    const sx = (dpr * f.width) / GAME_W;
    const sy = (dpr * f.height) / GAME_H;
    this.ctx.setTransform(sx, 0, 0, sy, dpr * (f.x - window.scrollX), dpr * (f.y - window.scrollY));
    this.drawStick(pad.move);
    this.drawStick(pad.aim);
    this.drawPause();
    this.drawSwing();
  }

  /** A small key across the button; faint while the drive is empty. */
  private drawSwing() {
    const ctx = this.ctx;
    const button = pad.button('swing');
    const { x, y } = button;
    const alpha = this.drawnCharged ? RING_ALPHA * (pad.isHeld('swing') ? 2 : 1) : IDLE_ALPHA;
    this.drawButton(button, alpha, COLORS.hpFrame);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x - 9, y + 9, 5, 0, Math.PI * 2);
    ctx.moveTo(x - 5, y + 5);
    ctx.lineTo(x + 11, y - 11);
    ctx.moveTo(x + 6, y - 6);
    ctx.lineTo(x + 10, y - 2);
    ctx.stroke();
  }

  private drawStick(stick: Stick) {
    const ctx = this.ctx;
    const alpha = stick.active ? RING_ALPHA : IDLE_ALPHA;
    this.drawButton({ x: stick.baseX, y: stick.baseY, r: PAD_LAYOUT.radius }, alpha, COLORS.wallEdge, 3);
    ctx.fillStyle = rgba(COLORS.bolt, alpha * 2);
    ctx.beginPath();
    ctx.arc(stick.baseX + stick.knobX, stick.baseY + stick.knobY, KNOB_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawPause() {
    const ctx = this.ctx;
    const button = pad.button('pause');
    const { x, y } = button;
    const alpha = pad.isHeld('pause') ? RING_ALPHA * 2 : RING_ALPHA;
    this.drawButton(button, alpha, COLORS.wallEdge);
    ctx.fillStyle = rgba(0xffffff, alpha * 2);
    ctx.fillRect(x - 8, y - 9, 5, 18);
    ctx.fillRect(x + 3, y - 9, 5, 18);
  }

  /** A dark disc with a ring; leaves the ring's stroke style set for any glyph on top. */
  private drawButton({ x, y, r }: Circle, alpha: number, ring: number, lineWidth = 2) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = rgba(0x000000, alpha);
    ctx.fill();
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = rgba(ring, alpha * 2);
    ctx.stroke();
  }
}

/** Converts a packed 0xRRGGBB color to a CSS canvas style, capping boosted opacity at 1. */
function rgba(color: number, alpha: number): string {
  return `rgba(${(color >> 16) & 0xff}, ${(color >> 8) & 0xff}, ${color & 0xff}, ${Math.min(1, alpha)})`;
}
