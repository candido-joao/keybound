import { GAME_H, GAME_W } from '../config';
import { loadSettings, saveSettings } from '../core/settings';
import { type PadLayout, type StickMode, VirtualPad } from './pad';

/** The side columns beside the room hold the sticks; the minimap doubles as the map button. */
export const PAD_LAYOUT: PadLayout = {
  width: GAME_W,
  height: GAME_H,
  radius: 46,
  deadzone: 0.2,
  moveHome: { x: 62, y: GAME_H - 80 },
  aimHome: { x: GAME_W - 62, y: GAME_H - 80 },
  buttons: {
    pause: { x: GAME_W - 40, y: 128, r: 26 },
    map: { x: GAME_W - 70, y: 44, r: 44 },
  },
};

/** One pad for the whole session: the touch scene feeds it, the player and HUD read it. */
export const pad = new VirtualPad(PAD_LAYOUT, loadSettings().stickMode);

/** Touch controls show on touch screens, and from the first touch on any other. */
let touching = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

export function usingTouch(): boolean {
  return touching;
}

export function setUsingTouch(on: boolean) {
  touching = on;
  if (!on) pad.releaseAll();
}

export function setStickMode(mode: StickMode) {
  pad.releaseAll();
  pad.mode = mode;
  saveSettings({ ...loadSettings(), stickMode: mode });
}
