import { BASE_STATS } from '../combat/balance';
import { PHASES, RUN_FLOORS } from '../floor/phases';
import { LOCALES, LOCALE_NAMES, type Locale, type MessageKey, getLocale, t } from '../i18n';
import {
  type EnemyEntry,
  type ItemEntry,
  type ItemVersion,
  type Line,
  type PhaseEntry,
  eventEntries,
  eventOdds,
  itemPools,
  phaseEntries,
  pct,
} from './catalog';
import { enemySprite, itemIcon, phaseShot } from './sprites';

type Child = Node | string | undefined;

/** Build an element with optional classes, appending strings as text and omitting undefined children. */
function el(tag: string, className?: string, ...children: Child[]): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const child of children) if (child !== undefined) node.append(child);
  return node;
}

/** Translate a catalog sentence after resolving any parameters that are themselves message keys. */
function line({ key, params }: Line): string {
  if (!params) return t(key);
  const resolved: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(params)) resolved[name] = typeof value === 'object' ? t(value.key) : value;
  return t(key, resolved);
}

/** Format a numeric RGB color as a six-digit CSS hex value, preserving leading zeroes. */
const css = (color: number) => `#${color.toString(16).padStart(6, '0')}`;

const NAV: readonly [string, MessageKey][] = [
  ['phases', 'wiki.nav.phases'],
  ['enemies', 'wiki.nav.enemies'],
  ['items', 'wiki.nav.items'],
  ['events', 'wiki.nav.events'],
];

/** Replace the wiki contents and document title in the current locale; delegate language changes to the caller. */
export function renderWiki(root: HTMLElement, onLocale: (locale: Locale) => void) {
  document.title = t('wiki.title');
  const phases = phaseEntries();
  root.replaceChildren(
    header(onLocale),
    el('main', 'content', phasesSection(phases), enemiesSection(phases), itemsSection(), eventsSection()),
    el('footer', 'footer', t('wiki.footer')),
  );
}

/** Build section navigation and language controls alongside the link back to the game. */
function header(onLocale: (locale: Locale) => void): HTMLElement {
  const logo = document.createElement('img');
  logo.className = 'logo';
  logo.alt = '';
  logo.src = `${import.meta.env.BASE_URL}weapons/key-title.png`;
  const play = el('a', 'play', t('wiki.play'));
  play.setAttribute('href', import.meta.env.BASE_URL);
  const nav = el('nav', 'nav', ...NAV.map(([id, key]) => anchor(`#${id}`, t(key))));
  return el(
    'header',
    'header',
    el(
      'div',
      'brand',
      logo,
      el('div', undefined, el('h1', undefined, 'Keybound'), el('p', 'tagline', t('wiki.tagline'))),
    ),
    nav,
    el('div', 'actions', languagePicker(onLocale), play),
  );
}

/** Create a link whose label is appended as text. */
function anchor(href: string, text: string): HTMLElement {
  const a = el('a', undefined, text);
  a.setAttribute('href', href);
  return a;
}

/** A new locale needs its flag's letters added to the Flags font range in wiki.css. */
const LOCALE_FLAGS: Record<Locale, string> = { 'pt-BR': '🇧🇷', 'en-US': '🇺🇸', es: '🇪🇸' };

/** Select the current supported locale and report subsequent choices to the caller. */
function languagePicker(onLocale: (locale: Locale) => void): HTMLElement {
  const select = document.createElement('select');
  select.className = 'language';
  select.setAttribute('aria-label', 'Language');
  for (const locale of LOCALES) {
    const option = document.createElement('option');
    option.value = locale;
    option.textContent = `${LOCALE_FLAGS[locale]} ${LOCALE_NAMES[locale]}`;
    option.selected = locale === getLocale();
    select.append(option);
  }
  select.addEventListener('change', () => onLocale(select.value as Locale));
  return select;
}

/** Create a localized section with a stable id for hash navigation. */
function section(id: string, title: MessageKey, intro: string, ...children: Child[]): HTMLElement {
  const node = el('section', 'section', el('h2', undefined, t(title)), el('p', 'intro', intro), ...children);
  node.id = id;
  return node;
}

/** Format inclusive floor bounds, using the singular label when both bounds match. */
function floorRange(first: number, last: number): string {
  if (first === last) return t('floor.label', { n: first });
  return t('wiki.floor-range', { first, last });
}

/** Colors each phase block with the phase's own floor and walls. */
function phaseStyle(node: HTMLElement, entry: PhaseEntry) {
  const { background, floor, floorAlt, wall, wallEdge } = entry.def.palette;
  node.style.setProperty('--phase-bg', css(background));
  node.style.setProperty('--phase-floor', css(floor));
  node.style.setProperty('--phase-floor-alt', css(floorAlt));
  node.style.setProperty('--phase-wall', css(wall));
  node.style.setProperty('--phase-edge', css(wallEdge));
}

/** Render phases in catalog order with an introduction based on the run’s floor count. */
function phasesSection(phases: readonly PhaseEntry[]): HTMLElement {
  const intro = t('wiki.phases.intro', { floors: RUN_FLOORS, phases: PHASES.length });
  return section('phases', 'wiki.nav.phases', intro, el('div', 'phases', ...phases.map(phaseCard)));
}

/** Show a phase’s floor range, enemy and boss rosters, and any item-pool opening. */
function phaseCard(entry: PhaseEntry): HTMLElement {
  const name = t(entry.def.name);
  /** Group sprite links so each roster entry leads to its enemy details. */
  const roster = (entries: readonly EnemyEntry[]) => el('div', 'roster', ...entries.map((e) => rosterLink(e)));
  const card = el(
    'article',
    'phase',
    phaseShot(entry.def.id, name),
    el(
      'div',
      'phase-body',
      el('h3', undefined, name),
      el('p', 'muted', floorRange(entry.firstFloor, entry.lastFloor)),
      el('h4', undefined, t('wiki.phase.enemies')),
      roster(entry.enemies),
      el('h4', undefined, t('wiki.phase.boss')),
      roster(entry.bosses),
      entry.itemsFrom ? el('p', 'muted', t('wiki.phase.items', { n: entry.itemsFrom })) : undefined,
    ),
  );
  phaseStyle(card, entry);
  return card;
}

/** Link an enemy sprite to its detail card, using the translated name as the tooltip. */
function rosterLink(entry: EnemyEntry): HTMLElement {
  const link = anchor(`#enemy-${entry.def.id}`, '');
  link.className = 'roster-item';
  link.title = t(entry.def.name);
  link.append(enemySprite(entry.def));
  return link;
}

/** Group enemy and boss detail cards by phase and apply each phase’s palette. */
function enemiesSection(phases: readonly PhaseEntry[]): HTMLElement {
  const groups = phases.map((entry) => {
    const group = el(
      'div',
      'phase-group',
      el('h3', undefined, t(entry.def.name)),
      el('div', 'cards', ...[...entry.enemies, ...entry.bosses].map(enemyCard)),
    );
    phaseStyle(group, entry);
    return group;
  });
  return section('enemies', 'wiki.nav.enemies', t('wiki.enemies.intro'), ...groups);
}

/** Show availability, combat stats, and translated behavior under an enemy’s stable anchor id. */
function enemyCard({ def, fromFloor, lastFloor, lines }: EnemyEntry): HTMLElement {
  const floors = lastFloor ? floorRange(fromFloor, lastFloor) : t('wiki.enemy.from', { n: fromFloor });
  const stats = el(
    'dl',
    'stats',
    stat(t('wiki.enemy.hp'), `${def.hp} · ${t('wiki.enemy.hp-growth', { pct: pct(def.hpGrowth) })}`),
    stat(t('wiki.enemy.speed'), t('wiki.enemy.speed-value', { pct: pct(def.speed / BASE_STATS.speed) })),
    stat(t('wiki.enemy.contact'), String(def.contactDamage)),
  );
  const card = el(
    'article',
    def.boss ? 'card enemy boss' : 'card enemy',
    el('div', 'sprite-box', enemySprite(def)),
    el(
      'div',
      'card-body',
      el('h4', undefined, t(def.name)),
      el('p', 'muted', floors),
      stats,
      lines.length > 0 ? el('ul', 'lines', ...lines.map((l) => el('li', undefined, line(l)))) : undefined,
    ),
  );
  card.id = `enemy-${def.id}`;
  return card;
}

/** Pair a statistic’s label and value for insertion into a definition list. */
function stat(label: string, value: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  fragment.append(el('dt', undefined, label), el('dd', undefined, value));
  return fragment;
}

/** Group item cards by the floor on which their pool becomes available. */
function itemsSection(): HTMLElement {
  const pools = itemPools().map(({ fromFloor, items }) =>
    el(
      'div',
      'pool',
      el('h3', undefined, t('wiki.item.from', { n: fromFloor })),
      el('div', 'cards', ...items.map(itemCard)),
    ),
  );
  return section('items', 'wiki.nav.items', t('wiki.items.intro'), ...pools);
}

/** Show a base item’s effects, hint, copy limit, and variants with its shared icon. */
function itemCard(entry: ItemEntry): HTMLElement {
  const { base, variants, maxCopies } = entry;
  const tags = el(
    'p',
    'tags',
    variants.length > 0 ? el('span', 'tag', t('wiki.item.odds', { pct: base.odds })) : undefined,
    maxCopies ? el('span', 'tag', t('wiki.item.max-copies', { n: maxCopies })) : undefined,
  );
  const card = el(
    'article',
    'card item',
    el('div', 'icon-box', itemIcon(base.item)),
    el(
      'div',
      'card-body',
      el('h4', undefined, t(base.item.name)),
      el('p', undefined, t(base.item.description)),
      el('p', 'hint', `“${t(base.item.hint)}”`),
      tags,
      variants.length > 0 ? variantList(variants) : undefined,
    ),
  );
  card.style.setProperty('--item-color', css(base.item.color));
  card.id = `item-${base.item.id}`;
  return card;
}

/** Show variant names, effects, hints, and conditional odds within a base item group. */
function variantList(variants: readonly ItemVersion[]): HTMLElement {
  return el(
    'div',
    'variants',
    el('h5', undefined, t('wiki.item.variants')),
    ...variants.map(({ item, odds }) =>
      el(
        'div',
        'variant',
        el('strong', undefined, t(item.name)),
        el('span', 'tag', t('wiki.item.odds', { pct: odds })),
        el('p', undefined, t(item.description)),
        el('p', 'hint', `“${t(item.hint)}”`),
      ),
    ),
  );
}

/** Render room-event descriptions with stable anchors and the normal and boss event chances. */
function eventsSection(): HTMLElement {
  const cards = eventEntries().map(({ id, name, text }) => {
    const card = el(
      'article',
      'card event',
      el('div', 'card-body', el('h4', undefined, t(name)), el('p', undefined, line(text))),
    );
    card.id = `event-${id}`;
    return card;
  });
  return section('events', 'wiki.nav.events', t('wiki.events.intro', eventOdds()), el('div', 'cards', ...cards));
}
