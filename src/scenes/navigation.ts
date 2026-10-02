import type Phaser from 'phaser';

/** Ends the run from an overlay: tears down the game and its HUD, then shows the title. */
export function returnToTitle(from: Phaser.Scene) {
  from.scene.stop('game');
  from.scene.stop('hud');
  from.scene.stop('touch');
  from.scene.start('title');
}
