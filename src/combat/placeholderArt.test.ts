import { describe, expect, it } from 'vitest';
import { BRASS_TITAN, SHADOW } from './enemies';
import { PLACEHOLDER_BODY, eyeSpots, spriteScale } from './placeholderArt';

describe('spriteScale', () => {
  it('keeps the scale of art in the usual frames', () => {
    expect(spriteScale(SHADOW, 48)).toBe(SHADOW.scale);
  });

  it('draws own-sized art pixel for pixel, and its placeholder at the same size', () => {
    const art = spriteScale(BRASS_TITAN, BRASS_TITAN.frameSize!);
    const placeholder = spriteScale(BRASS_TITAN, PLACEHOLDER_BODY.size);
    expect(art).toBe(1);
    expect(placeholder * PLACEHOLDER_BODY.size).toBe(art * BRASS_TITAN.frameSize!);
  });
});

describe('eyeSpots', () => {
  it('glows on the placeholder only', () => {
    expect(eyeSpots(BRASS_TITAN, BRASS_TITAN.frameSize!)).toEqual([]);
    expect(eyeSpots(BRASS_TITAN, PLACEHOLDER_BODY.size)).toEqual([
      { x: -5, y: 1 },
      { x: 5, y: 1 },
    ]);
  });
});
