import { enUS } from './en-US';
import { es } from './es';
import { type MessageKey, type Messages, ptBR } from './pt-BR';

export type { MessageKey } from './pt-BR';

const MESSAGES = { 'pt-BR': ptBR, 'en-US': enUS, es } satisfies Record<string, Messages>;

export type Locale = keyof typeof MESSAGES;

/** In cycling order. */
export const LOCALES = Object.keys(MESSAGES) as Locale[];

/** Each language named in itself, so a player can find theirs in any locale. */
export const LOCALE_NAMES: Record<Locale, string> = {
  'pt-BR': 'Português',
  'en-US': 'English',
  es: 'Español',
};

const FALLBACK_LOCALE: Locale = 'en-US';

let current: Locale = FALLBACK_LOCALE;

export function getLocale(): Locale {
  return current;
}

export function setLocale(locale: Locale) {
  current = locale;
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && value in MESSAGES;
}

/** First supported language in the player's preference list; any "es-*" maps to es, any "pt-*" to pt-BR. */
export function detectLocale(preferred: readonly string[]): Locale {
  for (const tag of preferred) {
    const lang = tag.toLowerCase().split('-')[0];
    if (lang === 'pt') return 'pt-BR';
    if (lang === 'es') return 'es';
    if (lang === 'en') return 'en-US';
  }
  return FALLBACK_LOCALE;
}

export function nextLocale(locale: Locale): Locale {
  return LOCALES[(LOCALES.indexOf(locale) + 1) % LOCALES.length];
}

/** "Andar {n}" + { n: 3 } -> "Andar 3". Unknown placeholders are left as is. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const text = MESSAGES[current][key];
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}
