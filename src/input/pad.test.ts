import { describe, expect, it } from 'vitest';
import { type PadLayout, VirtualPad, nextStickMode } from './pad';

const LAYOUT: PadLayout = {
  width: 960,
  height: 540,
  radius: 50,
  deadzone: 0.2,
  moveHome: { x: 70, y: 450 },
  aimHome: { x: 890, y: 450 },
  buttons: { pause: { x: 900, y: 130, r: 24 }, map: { x: 890, y: 44, r: 40 } },
};

describe('VirtualPad', () => {
  it('moves at full strength at the edge of a fixed stick', () => {
    const pad = new VirtualPad(LAYOUT, 'fixed');
    pad.press(1, 70, 450);
    pad.drag(1, 170, 450);
    expect(pad.moveX).toBeCloseTo(1);
    expect(pad.moveY).toBeCloseTo(0);
    expect(pad.move.knobX).toBe(50);
  });

  it('ignores a thumb resting inside the deadzone', () => {
    const pad = new VirtualPad(LAYOUT, 'fixed');
    pad.press(1, 75, 450);
    expect(pad.moveX).toBe(0);
  });

  it('scales input between the deadzone and the edge', () => {
    const pad = new VirtualPad(LAYOUT, 'fixed');
    pad.press(1, 70, 480);
    expect(pad.moveY).toBeCloseTo(0.5);
  });

  it('measures a fixed stick from its home, wherever the touch starts', () => {
    const pad = new VirtualPad(LAYOUT, 'fixed');
    pad.press(1, 300, 300);
    expect(pad.move.baseX).toBe(70);
    expect(pad.moveX).toBeGreaterThan(0);
  });

  it('starts a floating stick under the thumb, kept on screen', () => {
    const pad = new VirtualPad(LAYOUT, 'floating');
    pad.press(1, 300, 300);
    expect(pad.move.baseX).toBe(300);
    expect(pad.moveX).toBe(0);
    pad.release(1);
    pad.press(2, 10, 535);
    expect(pad.move.baseX).toBe(50);
    expect(pad.move.baseY).toBe(490);
  });

  it('sends the floating base home on release', () => {
    const pad = new VirtualPad(LAYOUT, 'floating');
    pad.press(1, 300, 300);
    pad.release(1);
    expect(pad.move.baseX).toBe(70);
    expect(pad.move.active).toBe(false);
  });

  it('drives each stick from its own half, with two thumbs at once', () => {
    const pad = new VirtualPad(LAYOUT, 'fixed');
    pad.press(1, 70, 400);
    pad.press(2, 940, 450);
    expect(pad.moveY).toBeLessThan(0);
    expect(pad.aimX).toBe(1);
    pad.release(1);
    expect(pad.moveY).toBe(0);
    expect(pad.aimX).toBe(1);
  });

  it('keeps a stick on its first touch', () => {
    const pad = new VirtualPad(LAYOUT, 'fixed');
    pad.press(1, 120, 450);
    pad.press(2, 20, 450);
    pad.drag(2, 20, 450);
    expect(pad.moveX).toBeGreaterThan(0);
  });

  it('aims along the dominant axis only', () => {
    const pad = new VirtualPad(LAYOUT, 'fixed');
    pad.press(1, 890 + 30, 450 - 40);
    expect([pad.aimX, pad.aimY]).toEqual([0, -1]);
    pad.drag(1, 890 - 40, 450 + 30);
    expect([pad.aimX, pad.aimY]).toEqual([-1, 0]);
  });

  it('does not aim inside the deadzone', () => {
    const pad = new VirtualPad(LAYOUT, 'fixed');
    pad.press(1, 892, 450);
    expect([pad.aimX, pad.aimY]).toEqual([0, 0]);
  });

  it('holds a button until its touch lifts, without moving a stick', () => {
    const pad = new VirtualPad(LAYOUT, 'fixed');
    expect(pad.press(1, 890, 44)).toBe('map');
    expect(pad.isHeld('map')).toBe(true);
    expect(pad.aim.active).toBe(false);
    pad.release(1);
    expect(pad.isHeld('map')).toBe(false);
  });

  it('drops everything on releaseAll', () => {
    const pad = new VirtualPad(LAYOUT, 'fixed');
    pad.press(1, 170, 450);
    pad.press(2, 900, 130);
    pad.releaseAll();
    expect(pad.moveX).toBe(0);
    expect(pad.isHeld('pause')).toBe(false);
  });
});

describe('nextStickMode', () => {
  it('toggles between fixed and floating', () => {
    expect(nextStickMode('fixed')).toBe('floating');
    expect(nextStickMode('floating')).toBe('fixed');
  });
});
