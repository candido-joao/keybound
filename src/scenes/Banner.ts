import type Phaser from 'phaser';
import { COLORS, GAME_W, ROOM_H, ROOM_Y } from '../config';
import { type PhaseDef, isPhaseStart } from '../floor/phases';
import { t } from '../i18n';

/** Big centered title over the room. One at a time: a new one replaces whatever is still fading, so texts never pile up. */
export class Banner {
  private readonly scene: Phaser.Scene;
  private texts: Phaser.GameObjects.Text[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** A new phase is announced by name, with the floor under it. */
  showFloor(depth: number, phase: PhaseDef) {
    const floor = t('floor.label', { n: depth });
    if (isPhaseStart(depth)) {
      this.show(t(phase.name), floor);
      return;
    }
    this.show(floor);
  }

  show(title: string, subtitle = '', holdMs = 1400) {
    this.scene.tweens.killTweensOf(this.texts);
    for (const text of this.texts) text.destroy();
    const cx = GAME_W / 2;
    const cy = ROOM_Y + ROOM_H / 2 - 60;
    const t1 = this.line(cx, cy, title, '26px', COLORS.text, 5);
    const t2 = this.line(cx, cy + 30, subtitle, '14px', COLORS.textDim, 4);
    this.texts = [t1, t2];
    if (holdMs <= 0) return;
    this.scene.tweens.add({
      targets: [t1, t2],
      alpha: 0,
      delay: holdMs,
      duration: 400,
      onComplete: () => [t1, t2].forEach((t) => t.destroy()),
    });
  }

  private line(x: number, y: number, text: string, fontSize: string, color: string, stroke: number) {
    return this.scene.add
      .text(x, y, text, { fontFamily: 'monospace', fontSize, color, stroke: '#000', strokeThickness: stroke })
      .setOrigin(0.5)
      .setDepth(100);
  }
}
