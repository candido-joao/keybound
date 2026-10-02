/**
 * Virtual gamepad for touch screens: two sticks and held buttons, fed with pointer
 * ids and positions in game coordinates. Holds no Phaser state, so it stays testable.
 */

export type StickMode = 'fixed' | 'floating';
export type PadButton = 'pause' | 'map';

export interface Circle {
  x: number;
  y: number;
  r: number;
}

export interface PadLayout {
  width: number;
  height: number;
  /** How far the knob travels from the base. */
  radius: number;
  /** Share of the radius that reads as no input, so a resting thumb doesn't drift. */
  deadzone: number;
  moveHome: { x: number; y: number };
  aimHome: { x: number; y: number };
  buttons: Record<PadButton, Circle>;
}

const FREE = -1;

/** Returns the other stick placement mode for the pause menu's two-option cycle. */
export function nextStickMode(mode: StickMode): StickMode {
  return mode === 'fixed' ? 'floating' : 'fixed';
}

export class Stick {
  pointer = FREE;
  baseX: number;
  baseY: number;
  /** Knob offset from the base in px, clamped to the radius; for drawing. */
  knobX = 0;
  knobY = 0;
  /** Input after the deadzone, magnitude 0 to 1. */
  x = 0;
  y = 0;

  readonly homeX: number;
  readonly homeY: number;

  constructor(homeX: number, homeY: number) {
    this.homeX = homeX;
    this.homeY = homeY;
    this.baseX = homeX;
    this.baseY = homeY;
  }

  get active(): boolean {
    return this.pointer !== FREE;
  }

  /** Clears the input and sends the base home. */
  release() {
    this.pointer = FREE;
    this.baseX = this.homeX;
    this.baseY = this.homeY;
    this.knobX = 0;
    this.knobY = 0;
    this.x = 0;
    this.y = 0;
  }
}

export class VirtualPad {
  readonly layout: PadLayout;
  mode: StickMode;
  readonly move: Stick;
  readonly aim: Stick;
  private readonly held: Record<PadButton, number> = { pause: FREE, map: FREE };

  constructor(layout: PadLayout, mode: StickMode) {
    this.layout = layout;
    this.mode = mode;
    this.move = new Stick(layout.moveHome.x, layout.moveHome.y);
    this.aim = new Stick(layout.aimHome.x, layout.aimHome.y);
  }

  /** A new touch: a button under it, else the stick on its half of the screen. Returns the button pressed. */
  press(id: number, x: number, y: number): PadButton | undefined {
    const button = this.buttonAt(x, y);
    if (button) {
      this.held[button] = id;
      return button;
    }
    const stick = x < this.layout.width / 2 ? this.move : this.aim;
    if (stick.active) return undefined;
    stick.pointer = id;
    if (this.mode === 'floating') this.placeBase(stick, x, y);
    this.drag(id, x, y);
    return undefined;
  }

  drag(id: number, x: number, y: number) {
    if (this.move.pointer === id) this.steer(this.move, x, y);
    if (this.aim.pointer === id) this.steer(this.aim, x, y);
  }

  release(id: number) {
    if (this.move.pointer === id) this.move.release();
    if (this.aim.pointer === id) this.aim.release();
    if (this.held.pause === id) this.held.pause = FREE;
    if (this.held.map === id) this.held.map = FREE;
  }

  /** Drops every touch, as when the game pauses or the keyboard takes over. */
  releaseAll() {
    this.move.release();
    this.aim.release();
    this.held.pause = FREE;
    this.held.map = FREE;
  }

  isHeld(button: PadButton): boolean {
    return this.held[button] !== FREE;
  }

  get moveX(): number {
    return this.move.x;
  }

  get moveY(): number {
    return this.move.y;
  }

  /** Isaac shoots in 4 directions: the stick's dominant axis wins. */
  get aimX(): number {
    const { x, y } = this.aim;
    return Math.abs(x) >= Math.abs(y) ? Math.sign(x) : 0;
  }

  get aimY(): number {
    const { x, y } = this.aim;
    return Math.abs(y) > Math.abs(x) ? Math.sign(y) : 0;
  }

  private buttonAt(x: number, y: number): PadButton | undefined {
    const { pause, map } = this.layout.buttons;
    if (Math.hypot(x - pause.x, y - pause.y) <= pause.r) return 'pause';
    if (Math.hypot(x - map.x, y - map.y) <= map.r) return 'map';
    return undefined;
  }

  /** Floating sticks start under the thumb, kept whole on screen. */
  private placeBase(stick: Stick, x: number, y: number) {
    const { radius, width, height } = this.layout;
    stick.baseX = clamp(x, radius, width - radius);
    stick.baseY = clamp(y, radius, height - radius);
  }

  private steer(stick: Stick, x: number, y: number) {
    const { radius, deadzone } = this.layout;
    const dx = x - stick.baseX;
    const dy = y - stick.baseY;
    const dist = Math.hypot(dx, dy);
    const reach = Math.min(dist, radius);
    const ux = dist > 0 ? dx / dist : 0;
    const uy = dist > 0 ? dy / dist : 0;
    stick.knobX = ux * reach;
    stick.knobY = uy * reach;
    const share = reach / radius;
    const strength = share <= deadzone ? 0 : (share - deadzone) / (1 - deadzone);
    stick.x = ux * strength;
    stick.y = uy * strength;
  }
}

/** Bounds a floating base coordinate to the inclusive limits that keep its ring on screen. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
