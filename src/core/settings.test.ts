import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSettings, parseConsoleParam, parseSettings, saveSettings } from './settings';

describe('parseSettings', () => {
  it('reads the console flag', () => {
    expect(parseSettings({ version: 1, locale: 'es', console: true })).toEqual({
      locale: 'es',
      console: true,
      stickMode: 'floating',
    });
  });

  it('keeps the console off for saves from before the flag', () => {
    expect(parseSettings({ version: 1, locale: 'pt-BR' })).toEqual({
      locale: 'pt-BR',
      console: false,
      stickMode: 'floating',
    });
  });

  it('reads the stick mode, falling back to floating', () => {
    expect(parseSettings({ version: 1, locale: null, stickMode: 'fixed' }).stickMode).toBe('fixed');
    expect(parseSettings({ version: 1, locale: null, stickMode: 'wobbly' }).stickMode).toBe('floating');
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

describe('loadSettings', () => {
  const DEFAULTS = { locale: null, console: false, stickMode: 'floating' };
  const storage = (raw: string | null) => ({ getItem: () => raw, setItem: vi.fn() });

  afterEach(() => vi.unstubAllGlobals());

  it('reads back what was saved', () => {
    const saved = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => saved.set(key, value),
    });
    saveSettings({ locale: 'es', console: true, stickMode: 'fixed' });
    expect(loadSettings()).toEqual({ locale: 'es', console: true, stickMode: 'fixed' });
  });

  it.each([
    ['nothing saved', null],
    ['broken JSON', '{nope'],
    ['another version', JSON.stringify({ version: 99, console: true })],
    ['not an object', '42'],
  ])('falls back to the defaults on %s', (_, raw) => {
    vi.stubGlobal('localStorage', storage(raw));
    expect(loadSettings()).toEqual(DEFAULTS);
  });

  it('falls back to the defaults when storage is blocked, and saving does not throw', () => {
    const blocked = () => {
      throw new Error('blocked');
    };
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked });
    expect(loadSettings()).toEqual(DEFAULTS);
    expect(() => saveSettings(DEFAULTS as never)).not.toThrow();
  });
});
