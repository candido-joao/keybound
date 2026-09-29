import { loadSettings, saveSettings } from '../core/settings';
import { type Locale, detectLocale, setLocale } from '.';

/** Saved choice first, then the browser's language list. */
export function initLocale() {
  const saved = loadSettings().locale;
  showLocale(saved ?? detectLocale(navigator.languages));
}

/** A player's explicit pick, kept across sessions. */
export function chooseLocale(locale: Locale) {
  showLocale(locale);
  saveSettings({ ...loadSettings(), locale });
}

function showLocale(locale: Locale) {
  setLocale(locale);
  document.documentElement.lang = locale;
}
