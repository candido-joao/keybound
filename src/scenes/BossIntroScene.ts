import Phaser from 'phaser';
import { COLORS, GAME_H, GAME_W } from '../config';
import { type MessageKey, t } from '../i18n';
import type { GameScene } from './GameScene';

export interface BossIntroData {
  name: MessageKey;
  x: number;
  y: number;
}

const BAR_H = 64;
const ZOOM = 1.5;
/** Camera effects only take EaseMap names; tween names like 'Sine.InOut' leave their ease undefined and throw. */
const CAMERA_EASE = 'Sine.easeInOut';
// Timeline, in ms from the start. The whole intro runs about 2.7 s.
const FOCUS_MS = 700;
const NAME_AT = 700;
const ROAR_AT = 950;
const RETURN_AT = 2100;
const RETURN_MS = 500;
const END_AT = 2700;

/**
 * Letterbox, camera push-in on the boss and its name, over a GameScene that holds
 * its clock and physics until `endBossIntro`. Runs on this scene's own timers.
 */
export class BossIntroScene extends Phaser.Scene {
  private finished = false;

  constructor() {
    super('boss-intro');
  }

  create(data: BossIntroData) {
    this.finished = false;
    const game = this.scene.get('game') as GameScene;
    const camera = game.cameras.main;

    const top = this.add.rectangle(0, -BAR_H, GAME_W, BAR_H, 0x000000).setOrigin(0);
    const bottom = this.add.rectangle(0, GAME_H, GAME_W, BAR_H, 0x000000).setOrigin(0);
    this.tweens.add({ targets: top, y: 0, duration: 300, ease: 'Quad.Out' });
    this.tweens.add({ targets: bottom, y: GAME_H - BAR_H, duration: 300, ease: 'Quad.Out' });

    camera.pan(data.x, data.y, FOCUS_MS, CAMERA_EASE);
    camera.zoomTo(ZOOM, FOCUS_MS, CAMERA_EASE);

    const name = this.add
      .text(GAME_W / 2, GAME_H - BAR_H / 2, t(data.name), {
        fontFamily: 'monospace',
        fontSize: '30px',
        color: COLORS.text,
        stroke: '#000',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setAlpha(0)
      .setScale(1.4);
    this.time.delayedCall(NAME_AT, () =>
      this.tweens.add({ targets: name, alpha: 1, scale: 1, duration: 300, ease: 'Back.Out' }),
    );
    this.time.delayedCall(ROAR_AT, () => camera.shake(400, 0.008));

    this.time.delayedCall(RETURN_AT, () => {
      this.tweens.add({ targets: name, alpha: 0, duration: RETURN_MS });
      this.tweens.add({ targets: top, y: -BAR_H, duration: RETURN_MS, ease: 'Quad.In' });
      this.tweens.add({ targets: bottom, y: GAME_H, duration: RETURN_MS, ease: 'Quad.In' });
      camera.pan(GAME_W / 2, GAME_H / 2, RETURN_MS, CAMERA_EASE);
      camera.zoomTo(1, RETURN_MS, CAMERA_EASE);
    });
    this.time.delayedCall(END_AT, () => this.finish());

    this.add
      .text(GAME_W - 16, GAME_H - 12, t('boss-intro.skip'), {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: COLORS.textMuted,
      })
      .setOrigin(1, 1);
    this.input.keyboard!.once('keydown-ENTER', () => this.finish());
  }

  /** Snaps the camera back, since a skip can land mid pan. */
  private finish() {
    if (this.finished) return;
    this.finished = true;
    const game = this.scene.get('game') as GameScene;
    const camera = game.cameras.main;
    camera.panEffect.reset();
    camera.zoomEffect.reset();
    camera.shakeEffect.reset();
    camera.setZoom(1);
    camera.centerOn(GAME_W / 2, GAME_H / 2);
    this.scene.stop();
    game.endBossIntro();
  }
}
