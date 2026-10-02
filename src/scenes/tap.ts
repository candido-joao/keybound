import type Phaser from 'phaser';
import type { MessageKey } from '../i18n';
import { usingTouch } from '../input/touch';

/** Room around the words, so a thumb doesn't have to land on the letters. */
const TAP_PADDING = 12;

/** A tap (or click) on the object runs the action. */
export function onTap<T extends Phaser.GameObjects.Text | Phaser.GameObjects.Shape>(target: T, action: () => void): T {
  if ('setPadding' in target) target.setPadding(TAP_PADDING);
  target.setInteractive().on('pointerup', action);
  return target;
}

/** Messages that name a key and have a `-touch` variant without it. */
type KeyHint = { [K in MessageKey]: `${K}-touch` extends MessageKey ? K : never }[MessageKey];

/** On touch, the variant without key names: `pause.resume` becomes `pause.resume-touch`. */
export function hintKey(key: KeyHint): MessageKey {
  return usingTouch() ? `${key}-touch` : key;
}
