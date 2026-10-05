/**
 * Virtual gamepad for touch screens: two sticks and held buttons, fed with pointer
 * ids and positions in game coordinates. Holds no Phaser state, so it stays testable.
 */

export type StickMode = 'fixed' | 'floating';
export type PadButton = 'pause' | 'map' | 'swing';

const BUTTONS: readonly PadButton[] = ['pause', 'map', 'swing'];

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

/** The visible screen in game coordinates; wider than the game when it is letterboxed. */
export interface View {
  left: number;
  top: number;
  right: number;
  bottom: number;
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

  homeX: number;
  homeY: number;

  constructor(homeX: number, homeY: number) {
    this.homeX = homeX;
    this.homeY = homeY;
    this.baseX = homeX;
    this.baseY = homeY;
  }

  /** Moves the resting place; the stick must be released. */
  setHome(x: number, y: number) {
    this.homeX = x;
    this.homeY = y;
    this.baseX = x;
    this.baseY = y;
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
  private view: View;
  /** The layout's buttons, with the swing button following the aim stick to the screen edge. */
  private readonly buttons: Record<PadButton, Circle>;
  private readonly held: Record<PadButton, number> = { pause: FREE, map: FREE, swing: FREE };
  /** Presses not yet taken by `consume`, so a quick tap between two frames still counts. */
  private readonly tapped: Record<PadButton, boolean> = { pause: false, map: false, swing: false };

  /** Starts the view at the layout's own bounds, until `setView` narrows it to the screen. */
  constructor(layout: PadLayout, mode: StickMode) {
    this.layout = layout;
    this.mode = mode;
    this.move = new Stick(layout.moveHome.x, layout.moveHome.y);
    this.aim = new Stick(layout.aimHome.x, layout.aimHome.y);
    this.view = { left: 0, top: 0, right: layout.width, bottom: layout.height };
    this.buttons = { ...layout.buttons };
  }

  /**
   * Fits the pad to the visible screen: the sticks and the swing button keep their distance
   * from the bottom corners, so on a wide phone they sit in the margin under the thumbs.
   */
  setView(view: View) {
    const { moveHome, aimHome, buttons, width, height } = this.layout;
    const dx = view.right - width;
    const dy = view.bottom - height;
    this.releaseAll();
    this.view = view;
    this.move.setHome(moveHome.x + view.left, moveHome.y + dy);
    this.aim.setHome(aimHome.x + dx, aimHome.y + dy);
    this.buttons.swing = { ...buttons.swing, x: buttons.swing.x + dx, y: buttons.swing.y + dy };
  }

  /** Where a button is on screen, for hit tests and drawing. */
  button(button: PadButton): Circle {
    return this.buttons[button];
  }

  /** A new touch: a button under it, else the stick on its half of the screen. Returns the button pressed. */
  press(id: number, x: number, y: number): PadButton | undefined {
    const button = this.buttonAt(x, y);
    if (button) {
      this.held[button] = id;
      this.tapped[button] = true;
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
    for (const button of BUTTONS) if (this.held[button] === id) this.held[button] = FREE;
  }

  /** Drops every touch, as when the game pauses or the keyboard takes over. */
  releaseAll() {
    this.move.release();
    this.aim.release();
    for (const button of BUTTONS) {
      this.held[button] = FREE;
      this.tapped[button] = false;
    }
  }

  isHeld(button: PadButton): boolean {
    return this.held[button] !== FREE;
  }

  /** True once per press of the button. */
  consume(button: PadButton): boolean {
    const tapped = this.tapped[button];
    this.tapped[button] = false;
    return tapped;
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

  /** The button, if any, under a point in game coordinates. */
  private buttonAt(x: number, y: number): PadButton | undefined {
    const { buttons } = this;
    return BUTTONS.find((b) => Math.hypot(x - buttons[b].x, y - buttons[b].y) <= buttons[b].r);
  }

  /** Floating sticks start under the thumb, kept whole on screen. */
  private placeBase(stick: Stick, x: number, y: number) {
    const { radius } = this.layout;
    const { left, top, right, bottom } = this.view;
    stick.baseX = clamp(x, left + radius, right - radius);
    stick.baseY = clamp(y, top + radius, bottom - radius);
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
