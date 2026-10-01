import { chooseLocale, initLocale } from '../i18n/apply';
import { renderWiki } from './render';
import { forgetDetached, startAnimation } from './sprites';
import './wiki.css';

const root = document.getElementById('wiki')!;

// Shares the game's saved language, so a pick here carries over to the game and back.
initLocale();
render();
startAnimation();

/** Rebuild the localized page, discard detached sprite registrations, and restore the hash target. */
function render() {
  renderWiki(root, (locale) => {
    chooseLocale(locale);
    render();
  });
  forgetDetached();
  scrollToHash();
}

/** The page is built after load, so a deep link has nothing to land on until now. */
function scrollToHash() {
  if (!location.hash) return;
  document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
}
