// Shared by eslint.config.js (Phaser stays out of pure logic) and vitest.config.ts (coverage measures pure logic).

/**
 * The only code that may touch Phaser: scenes and the game objects they draw. Everything else is
 * pure game logic, testable without a browser, so a new file starts out pure.
 */
export const PHASER_LAYER = [
  'src/main.ts',
  'src/scenes/**',
  'src/entities/Bolt.ts',
  'src/entities/Enemy.ts',
  'src/entities/EnemyEyes.ts',
  'src/entities/EnemyFury.ts',
  'src/entities/EnemyOutline.ts',
  'src/entities/EnemyVolley.ts',
  'src/entities/HostileOrb.ts',
  'src/entities/Player.ts',
  'src/debug/DebugConsole.ts',
];
