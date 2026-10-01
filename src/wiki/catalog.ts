import { POOL_DEPTH } from '../combat/balance';
import { ENEMIES, type EnemyAttack, type EnemyDef } from '../combat/enemies';
import { ITEMS } from '../combat/items';
import { type Item, type ItemPool, baseId } from '../combat/stats';
import { PHASES, type PhaseDef } from '../floor/phases';
import { EVENT_CHANCE, EVENT_TUNING, ROOM_EVENTS, type RoomEventId } from '../floor/roomEvents';
import type { MessageKey } from '../i18n';

/** A sentence to translate; a param that is itself a key is translated first. */
export interface Line {
  key: MessageKey;
  params?: Record<string, string | number | { key: MessageKey }>;
}

export interface PhaseEntry {
  def: PhaseDef;
  firstFloor: number;
  lastFloor: number;
  enemies: EnemyEntry[];
  bosses: EnemyEntry[];
  /** Floor the phase's item pool opens on, when one opens inside it. */
  itemsFrom?: number;
}

export interface EnemyEntry {
  def: EnemyDef;
  /** First floor it can turn up on. */
  fromFloor: number;
  /** Set on bosses: the last floor they guard. */
  lastFloor?: number;
  lines: Line[];
}

export interface ItemVersion {
  item: Item;
  /** Chance of this version when its base is rolled, in %. */
  odds: number;
}

export interface ItemEntry {
  base: ItemVersion;
  variants: ItemVersion[];
  fromFloor: number;
  maxCopies?: number;
}

export interface EventEntry {
  id: RoomEventId;
  name: MessageKey;
  text: Line;
}

/** Phases in run order, each with the enemies first met in it. */
export function phaseEntries(phases: readonly PhaseDef[] = PHASES): PhaseEntry[] {
  const entries: PhaseEntry[] = [];
  let firstFloor = 1;
  for (const def of phases) {
    const lastFloor = firstFloor + def.floors - 1;
    entries.push({
      def,
      firstFloor,
      lastFloor,
      enemies: phaseEnemies(def, firstFloor),
      bosses: def.bosses.map((boss) => ({ def: boss, fromFloor: firstFloor, lastFloor, lines: enemyLines(boss) })),
      itemsFrom: poolOpening(firstFloor, lastFloor),
    });
    firstFloor = lastFloor + 1;
  }
  return entries;
}

/** Room enemies by first floor, each followed by what it splits into. */
function phaseEnemies(phase: PhaseDef, firstFloor: number): EnemyEntry[] {
  const sorted = [...phase.enemies].sort((a, b) => a.minDepth - b.minDepth);
  const entries: EnemyEntry[] = [];
  for (const { def, minDepth } of sorted) {
    const fromFloor = Math.max(firstFloor, minDepth);
    entries.push({ def, fromFloor, lines: enemyLines(def) });
    const child = def.split && enemyById(def.split.id);
    if (child) entries.push({ def: child, fromFloor, lines: [splitFrom(def), ...enemyLines(child)] });
  }
  return entries;
}

function poolOpening(firstFloor: number, lastFloor: number): number | undefined {
  return Object.values(POOL_DEPTH).find((floor) => floor >= firstFloor && floor <= lastFloor);
}

export function enemyById(id: string): EnemyDef | undefined {
  return ENEMIES.find((def) => def.id === id);
}

/** What an enemy does, attacks first, then how it moves and dies. */
export function enemyLines(def: EnemyDef): Line[] {
  const lines = def.attacks.map(attackLine);
  if (def.boss) lines.push({ key: 'wiki.trait.boss' });
  if (def.fury) {
    lines.push({ key: 'wiki.trait.fury', params: { pct: pct(def.fury.hpShare), damage: def.fury.dash.damage } });
  }
  if (def.revive) {
    lines.push({ key: 'wiki.trait.revive', params: { s: seconds(def.revive.delayMs), pct: pct(def.revive.hpShare) } });
  }
  if (def.fade) lines.push({ key: 'wiki.trait.fade' });
  if (def.blink) lines.push({ key: 'wiki.trait.blink' });
  if (def.anchored) lines.push({ key: 'wiki.trait.anchored' });
  if (def.axisWalk) lines.push({ key: 'wiki.trait.axis-walk' });
  if (def.ghost) lines.push({ key: 'wiki.trait.ghost' });
  const child = def.split && enemyById(def.split.id);
  if (def.split && child) {
    lines.push({ key: 'wiki.trait.split', params: { count: def.split.count, name: { key: child.name } } });
  }
  return lines;
}

function splitFrom(parent: EnemyDef): Line {
  return { key: 'wiki.trait.split-from', params: { name: { key: parent.name } } };
}

export function attackLine(attack: EnemyAttack): Line {
  if (attack.kind === 'dash' && attack.align !== undefined) return { key: 'wiki.attack.charge' };
  if (attack.kind === 'dash') {
    return { key: 'wiki.attack.dash', params: { s: seconds(attack.everyMs), ms: attack.telegraphMs } };
  }
  if (attack.kind === 'summon') {
    const minion = enemyById(attack.minionId);
    const name = minion ? { key: minion.name } : attack.minionId;
    return { key: 'wiki.attack.summon', params: { min: attack.min, max: attack.max, name } };
  }
  if (attack.kind === 'explode') return { key: 'wiki.attack.explode', params: { damage: attack.damage } };
  const { count, damage } = attack;
  if ((attack.shots ?? 1) > 1) return { key: 'wiki.attack.volley.burst', params: { shots: attack.shots!, damage } };
  if (count === 1) return { key: 'wiki.attack.volley.single', params: { damage } };
  // A fan this wide reaches all the way around.
  if (attack.spreadDeg >= 180) return { key: 'wiki.attack.volley.ring', params: { count, damage } };
  return { key: 'wiki.attack.volley.fan', params: { count, damage } };
}

/** Pure items in registry order, each with its variants and the odds of every version. */
export function itemEntries(items: readonly Item[] = ITEMS): ItemEntry[] {
  const entries: ItemEntry[] = [];
  for (const base of items) {
    if (base.base) continue;
    const group = items.filter((item) => baseId(item) === base.id);
    const total = group.reduce((sum, item) => sum + item.weight, 0);
    const version = (item: Item): ItemVersion => ({ item, odds: Math.round((item.weight / total) * 100) });
    entries.push({
      base: version(base),
      variants: group.filter((item) => item !== base).map(version),
      fromFloor: POOL_DEPTH[base.pool ?? 1],
      maxCopies: base.maxCopies,
    });
  }
  return entries;
}

/** Item pools in order of the floor they open on. */
export function itemPools(entries: readonly ItemEntry[] = itemEntries()): { fromFloor: number; items: ItemEntry[] }[] {
  const pools = (Object.keys(POOL_DEPTH).map(Number) as ItemPool[]).map((pool) => POOL_DEPTH[pool]);
  return pools.map((fromFloor) => ({ fromFloor, items: entries.filter((e) => e.fromFloor === fromFloor) }));
}

/** Names reuse the game's own keys where it has them. */
const EVENT_NAMES: Record<RoomEventId, MessageKey> = {
  dark: 'wiki.event.dark.name',
  cursed: 'event.cursed.name',
  altar: 'event.altar.name',
  timed: 'event.timed.name',
  miniboss: 'wiki.event.miniboss.name',
  twin: 'wiki.event.twin.name',
};

export function eventEntries(): EventEntry[] {
  return ROOM_EVENTS.map(({ id }) => ({ id, name: EVENT_NAMES[id], text: eventText(id) }));
}

function eventText(id: RoomEventId): Line {
  const { dark, cursed, altar, timed, miniboss, twin } = EVENT_TUNING;
  const texts: Record<RoomEventId, Line> = {
    dark: { key: 'wiki.event.dark.text', params: { min: dark.minWaves, max: dark.maxWaves } },
    cursed: {
      key: 'wiki.event.cursed.text',
      params: { hp: pct(cursed.hpScale), floor: cursed.strayMinDepth, pct: pct(cursed.strayChance) },
    },
    altar: { key: 'wiki.event.altar.text', params: { pct: pct(altar.maxHealthShare) } },
    timed: {
      key: 'wiki.event.timed.text',
      params: { base: seconds(timed.baseMs), per: seconds(timed.perFloorMs), max: seconds(timed.maxMs) },
    },
    miniboss: {
      key: 'wiki.event.miniboss.text',
      params: { hp: miniboss.hpScale, damage: miniboss.damageScale, pct: pct(miniboss.itemChance) },
    },
    twin: { key: 'wiki.event.twin.text', params: { pct: pct(twin.hpShare) } },
  };
  return texts[id];
}

export function eventOdds(): { normal: number; boss: number } {
  return { normal: pct(EVENT_CHANCE.normal), boss: pct(EVENT_CHANCE.boss) };
}

export function pct(share: number): number {
  return Math.round(share * 100);
}

export function seconds(ms: number): number {
  return Math.round(ms / 100) / 10;
}
