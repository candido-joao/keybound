import { describe, expect, it } from 'vitest';
import { HISTORY_LIMIT, History, parseHistory } from './history';

describe('History', () => {
  it('walks back and forth and restores the draft', () => {
    const history = new History(['give quickcast', 'heal']);
    expect(history.up('sp')).toBe('heal');
    expect(history.up('heal')).toBe('give quickcast');
    expect(history.up('give quickcast')).toBe('give quickcast');
    expect(history.down('give quickcast')).toBe('heal');
    expect(history.down('heal')).toBe('sp');
    expect(history.down('sp')).toBe('sp');
  });

  it('skips blanks and repeats of the last line', () => {
    const history = new History();
    history.push('god');
    history.push('  god ');
    history.push('   ');
    history.push('heal');
    expect(history.all).toEqual(['god', 'heal']);
  });

  it('starts browsing from the newest line after a push', () => {
    const history = new History(['a']);
    history.up('');
    history.push('b');
    expect(history.up('')).toBe('b');
  });

  it('keeps only the newest lines', () => {
    const history = new History();
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) history.push(`hp ${i + 1}`);
    expect(history.all).toHaveLength(HISTORY_LIMIT);
    expect(history.all[0]).toBe('hp 6');
  });
});

describe('parseHistory', () => {
  it('reads saved entries', () => {
    expect(parseHistory({ version: 1, entries: ['god', 3, 'heal'] })).toEqual(['god', 'heal']);
  });

  it.each([null, 'god', { version: 2, entries: ['god'] }, { version: 1, entries: 'god' }])(
    'falls back to empty for %j',
    (data) => {
      expect(parseHistory(data)).toEqual([]);
    },
  );
});
