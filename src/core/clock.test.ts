import { expect, it } from 'vitest';
import { GameClock } from './clock';

it('counts only the time it is ticked', () => {
  const clock = new GameClock();
  expect(clock.now).toBe(0);
  clock.tick(16);
  clock.tick(17);
  expect(clock.now).toBe(33);
});
