import { describe, expect, it } from 'vitest';
import { heroIdleFrame, heroRow } from './heroSheet';

const deg = (d: number) => (d * Math.PI) / 180;

describe('heroRow', () => {
  it.each([
    [0, 2, 'east'],
    [45, 1, 'south-east'],
    [90, 0, 'south'],
    [135, 7, 'south-west'],
    [180, 6, 'west'],
    [-180, 6, 'west, from the other side'],
    [-135, 5, 'north-west'],
    [-90, 4, 'north'],
    [-45, 3, 'north-east'],
  ])('faces %i° with row %i (%s)', (angle, row) => {
    expect(heroRow(deg(angle))).toBe(row);
  });

  it('snaps to the nearest direction', () => {
    expect(heroRow(deg(20))).toBe(heroRow(0));
    expect(heroRow(deg(25))).toBe(heroRow(deg(45)));
  });
});

describe('heroIdleFrame', () => {
  it('is the first frame of the row', () => {
    expect(heroIdleFrame(0)).toBe(0);
    expect(heroIdleFrame(3)).toBe(15);
  });
});
