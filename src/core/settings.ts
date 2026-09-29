import { type Locale, isLocale } from '../i18n';

export interface Settings {
  /** Null until the player picks one; the browser language decides meanwhile. */
  locale: Locale | null;
}

const STORAGE_KEY = 'keybound.settings';
const VERSION = 1;
const DEFAULTS: Settings = { locale: null };

/** Never throws: storage can be blocked (private mode) or hold data from another version. */
export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return parseSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings: Settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION, ...settings }));
  } catch {
    // Settings are a convenience; losing them must not break the game.
  }
}

export function parseSettings(data: unknown): Settings {
  if (typeof data !== 'object' || data === null) return { ...DEFAULTS };
  const record = data as Record<string, unknown>;
  if (record.version !== VERSION) return { ...DEFAULTS };
  return { locale: isLocale(record.locale) ? record.locale : null };
}
