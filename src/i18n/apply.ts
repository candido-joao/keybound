import { loadSettings, saveSettings } from '../core/settings';
import { type Locale, detectLocale, setLocale, t } from '.';

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

/** Keeps game translations, the page language, and the optional rotation prompt in sync. */
function showLocale(locale: Locale) {
  setLocale(locale);
  document.documentElement.lang = locale;
  // Shown by CSS over the canvas while a phone is held upright.
  document.getElementById('rotate')?.replaceChildren(t('touch.rotate'));
}
