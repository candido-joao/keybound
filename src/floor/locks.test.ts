import { describe, expect, it } from 'vitest';
import { LOCK_FROM_DEPTH, startsLocked } from './locks';

describe('startsLocked', () => {
  it('locks treasure rooms from the second floor on', () => {
    expect(startsLocked({ type: 'treasure' }, 1)).toBe(false);
    expect(startsLocked({ type: 'treasure' }, LOCK_FROM_DEPTH)).toBe(true);
  });

  it('never locks other rooms', () => {
    expect(startsLocked({ type: 'boss' }, 5)).toBe(false);
    expect(startsLocked({ type: 'normal' }, 5)).toBe(false);
  });
});
