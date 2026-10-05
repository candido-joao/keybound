import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import { PHASER_LAYER } from './layers.js';

/** Content tables and translations grow with the game, not with its logic; size limits skip them. */
const CONTENT = ['src/combat/enemies.ts', 'src/combat/items.ts', 'src/floor/phases.ts', 'src/i18n/**'];

const LOOP = ':matches(ForStatement, ForOfStatement, ForInStatement, WhileStatement, DoWhileStatement)';

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
        {
          selector: 'IfStatement IfStatement',
          message: 'No if inside an if: extract a function or use a guard clause.',
        },
        { selector: `${LOOP} ${LOOP}`, message: 'No loop inside a loop: extract a function or walk a flat list.' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Gameplay must use the seeded Rng. Same seed, same run.' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['src/**/*.ts'],
    ignores: ['src/**/*.test.ts', ...CONTENT],
    rules: {
      'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 40, skipBlankLines: true, skipComments: true }],
      // Six fits a point and a segment; past that, group what travels together.
      'max-params': ['error', 6],
      complexity: ['error', 10],
    },
  },
  {
    files: ['scripts/**'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['src/core/rng.ts'],
    rules: {
      // randomSeed() picks the seed itself; everything downstream is deterministic.
      'no-restricted-properties': 'off',
    },
  },
  {
    files: ['src/**/*.ts'],
    ignores: PHASER_LAYER,
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: [{ name: 'phaser', message: 'Pure game logic cannot depend on Phaser.' }] },
      ],
    },
  },
  prettier,
);
