import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

/** Pure game logic: must stay testable without a browser or Phaser. */
const PURE_LOGIC = [
  'src/combat/balance.ts',
  'src/combat/drops.ts',
  'src/combat/enemies.ts',
  'src/combat/itemPool.ts',
  'src/combat/placeholderArt.ts',
  'src/combat/ricochet.ts',
  'src/combat/stats.ts',
  'src/combat/swing.ts',
  'src/combat/volley.ts',
  'src/core/**',
  'src/debug/commands.ts',
  'src/debug/complete.ts',
  'src/debug/history.ts',
  'src/entities/heroSheet.ts',
  'src/entities/keyArt.ts',
  'src/floor/**',
  'src/i18n/**',
  'src/input/pad.ts',
  'src/ui/healthTrail.ts',
  'src/wiki/catalog.ts',
];

export default defineConfig(
  { ignores: ['dist'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: { globals: globals.browser },
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: 'IfStatement[alternate]', message: 'Use guard clauses and early return instead of else.' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Gameplay must use the seeded Rng. Same seed, same run.' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['src/core/rng.ts'],
    rules: {
      // randomSeed() picks the seed itself; everything downstream is deterministic.
      'no-restricted-properties': 'off',
    },
  },
  {
    files: PURE_LOGIC,
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: [{ name: 'phaser', message: 'Pure game logic cannot depend on Phaser.' }] },
      ],
    },
  },
  prettier,
);
