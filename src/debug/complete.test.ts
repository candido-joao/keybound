import { describe, expect, it } from 'vitest';
import type { Catalog } from './commands';
import { commonPrefix, complete } from './complete';

const CATALOG: Catalog = {
  item: ['swift-boots', 'seeker-rune', 'quickcast'],
  enemy: ['shadow', 'shadow-colossus'],
  drop: ['currency', 'heal'],
  stat: ['speed', 'spread', 'maxHealth'],
};

describe('complete', () => {
  it('finishes a unique command name with a space', () => {
    expect(complete('gi', CATALOG)).toEqual({ completed: 'give ', ghost: 've', matches: [] });
  });

  it('stops at the common prefix when several commands match', () => {
    const result = complete('h', CATALOG);
    expect(result.completed).toBe('h');
    expect(result.matches).toEqual(['heal', 'help', 'hp']);
    expect(result.ghost).toBe('eal');
  });

  it('lists every command for an empty line', () => {
    const result = complete('', CATALOG);
    expect(result.matches).toContain('give');
    expect(result.ghost).toBe('');
  });

  it('shows the missing arguments after a command and a space', () => {
    expect(complete('give ', CATALOG).ghost).toBe('<item> [n]');
    expect(complete('give quickcast ', CATALOG).ghost).toBe('[n]');
  });

  it('completes item ids', () => {
    expect(complete('give sw', CATALOG).completed).toBe('give swift-boots ');
  });

  it('completes enemies up to the shared prefix', () => {
    const result = complete('spawn sh', CATALOG);
    expect(result.completed).toBe('spawn shadow');
    expect(result.matches).toEqual(['shadow', 'shadow-colossus']);
  });

  it('completes stat names', () => {
    expect(complete('stat spr', CATALOG).completed).toBe('stat spread ');
  });

  it('completes camelCase stat names from lowercase input', () => {
    expect(complete('stat maxh', CATALOG).completed).toBe('stat maxHealth ');
  });

  it('matches regardless of case and keeps what was typed before the word', () => {
    expect(complete('GIVE QU', CATALOG).completed).toBe('GIVE quickcast ');
  });

  it('leaves numbers and unknown commands alone', () => {
    expect(complete('give quickcast 2', CATALOG)).toEqual({ completed: 'give quickcast 2', ghost: '', matches: [] });
    expect(complete('fly a', CATALOG)).toEqual({ completed: 'fly a', ghost: '', matches: [] });
  });

  it('adds nothing past the last argument', () => {
    expect(complete('take quickcast ', CATALOG)).toEqual({ completed: 'take quickcast ', ghost: '', matches: [] });
  });
});

describe('commonPrefix', () => {
  it('finds the shared start', () => {
    expect(commonPrefix(['shadow', 'shadow-colossus', 'shade'])).toBe('shad');
    expect(commonPrefix([])).toBe('');
  });
});
