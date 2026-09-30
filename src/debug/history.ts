const STORAGE_KEY = 'keybound.console-history';
const VERSION = 1;
export const HISTORY_LIMIT = 50;

/** Past command lines, oldest first, browsed with the arrow keys like a shell. */
export class History {
  private entries: string[];
  /** Index being shown; `entries.length` means the line being typed. */
  private cursor: number;
  /** The unsent line, restored when browsing comes back down past the newest entry. */
  private draft = '';

  constructor(entries: readonly string[] = []) {
    this.entries = entries.slice(-HISTORY_LIMIT);
    this.cursor = this.entries.length;
  }

  get all(): readonly string[] {
    return this.entries;
  }

  /** Records a sent line; blanks and repeats of the last one are skipped. */
  push(line: string) {
    const trimmed = line.trim();
    if (trimmed && trimmed !== this.entries[this.entries.length - 1]) this.entries.push(trimmed);
    if (this.entries.length > HISTORY_LIMIT) this.entries.shift();
    this.cursor = this.entries.length;
    this.draft = '';
  }

  /** Older line, or `current` when already at the oldest. */
  up(current: string): string {
    if (this.cursor === 0) return current;
    if (this.cursor === this.entries.length) this.draft = current;
    this.cursor--;
    return this.entries[this.cursor];
  }

  /** Newer line; past the newest comes back to the draft. */
  down(current: string): string {
    if (this.cursor === this.entries.length) return current;
    this.cursor++;
    return this.cursor === this.entries.length ? this.draft : this.entries[this.cursor];
  }
}

/** Never throws: storage can be blocked (private mode) or hold data from another version. */
export function loadHistory(): string[] {
  try {
    return parseHistory(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'));
  } catch {
    return [];
  }
}

export function saveHistory(entries: readonly string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION, entries }));
  } catch {
    // History is a convenience; losing it must not break the game.
  }
}

export function parseHistory(data: unknown): string[] {
  if (typeof data !== 'object' || data === null) return [];
  const record = data as Record<string, unknown>;
  if (record.version !== VERSION || !Array.isArray(record.entries)) return [];
  return record.entries.filter((e): e is string => typeof e === 'string').slice(-HISTORY_LIMIT);
}
