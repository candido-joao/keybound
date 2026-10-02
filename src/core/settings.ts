import { type Locale, isLocale } from '../i18n';
import type { StickMode } from '../input/pad';

export interface Settings {
  /** Null until the player picks one; the browser language decides meanwhile. */
  locale: Locale | null;
  /** Debug console available with the ' key. Off unless turned on with ?console. */
  console: boolean;
  /** Touch sticks: fixed in the corners, or floating under the thumb. */
  stickMode: StickMode;
}

const STORAGE_KEY = 'keybound.settings';
const VERSION = 1;
const DEFAULTS: Settings = { locale: null, console: false, stickMode: 'fixed' };

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
  return {
    locale: isLocale(record.locale) ? record.locale : null,
    console: record.console === true,
    // Saves from before the option read as the default.
    stickMode: record.stickMode === 'floating' ? 'floating' : 'fixed',
  };
}

const CONSOLE_OFF = ['off', '0', 'false'];

/** `?console` (or `=on`) turns the debug console on, `?console=off` turns it off; either is saved. Undefined when absent. */
export function parseConsoleParam(search: string): boolean | undefined {
  const value = new URLSearchParams(search).get('console');
  if (value === null) return undefined;
  return !CONSOLE_OFF.includes(value.toLowerCase());
}
