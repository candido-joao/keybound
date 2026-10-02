import { describe, expect, it } from 'vitest';
import { parseConsoleParam, parseSettings } from './settings';

describe('parseSettings', () => {
  it('reads the console flag', () => {
    expect(parseSettings({ version: 1, locale: 'es', console: true })).toEqual({
      locale: 'es',
      console: true,
      stickMode: 'fixed',
    });
  });

  it('keeps the console off for saves from before the flag', () => {
    expect(parseSettings({ version: 1, locale: 'pt-BR' })).toEqual({
      locale: 'pt-BR',
      console: false,
      stickMode: 'fixed',
    });
  });

  it('reads the stick mode, falling back to fixed', () => {
    expect(parseSettings({ version: 1, locale: null, stickMode: 'floating' }).stickMode).toBe('floating');
    expect(parseSettings({ version: 1, locale: null, stickMode: 'wobbly' }).stickMode).toBe('fixed');
  });

  it('accepts only a real true', () => {
    expect(parseSettings({ version: 1, locale: null, console: 'yes' }).console).toBe(false);
  });
});

describe('parseConsoleParam', () => {
  it.each([
    ['?console', true],
    ['?console=on', true],
    ['?seed=ABC&console=1', true],
    ['?console=off', false],
    ['?console=OFF', false],
    ['?console=0', false],
    ['', undefined],
    ['?seed=ABC', undefined],
  ])('%s -> %s', (search, expected) => {
    expect(parseConsoleParam(search)).toBe(expected);
  });
});
