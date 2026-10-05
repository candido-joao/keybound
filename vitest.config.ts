import { defineConfig } from 'vitest/config';
import { PHASER_LAYER } from './layers.js';

/** Pure of Phaser but drawing on the DOM or a canvas; checked by looking at it, like the Phaser layer. */
const BROWSER_ONLY = [
  'src/wiki/main.ts',
  'src/wiki/render.ts',
  'src/wiki/sprites.ts',
  'src/wiki/swingDemo.ts',
  'src/input/touch.ts',
  'src/ui/hpGauge.ts',
];

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      // Pure game logic only: the Phaser layer is checked by playing, not by unit tests.
      include: ['src/**/*.ts'],
      exclude: [...PHASER_LAYER, ...BROWSER_ONLY, 'src/**/*.test.ts', 'src/i18n/**'],
      reporter: ['text-summary'],
      // Just under today's numbers: new logic comes with tests, or the run fails.
      thresholds: { lines: 90, statements: 90, branches: 85, functions: 80 },
    },
  },
});
