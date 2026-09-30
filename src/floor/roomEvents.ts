import type { DropKind } from '../combat/drops';
import { COLORS } from '../config';
import type { EnemyDef } from '../combat/enemies';
import { pickWeighted } from '../combat/itemPool';
import type { Rng } from '../core/rng';
import type { MessageKey } from '../i18n';
import type { RoomType } from './FloorGenerator';

export type RoomEventId = 'dark' | 'cursed' | 'altar' | 'timed' | 'miniboss' | 'twin';

/** The room types an event can take over. */
export type EventRoomType = Extract<RoomType, 'normal' | 'boss'>;

export interface RoomEventDef {
  id: RoomEventId;
  roomType: EventRoomType;
  weight: number;
}

export const ROOM_EVENTS: readonly RoomEventDef[] = [
  { id: 'dark', roomType: 'normal', weight: 1 },
  { id: 'cursed', roomType: 'normal', weight: 1 },
  { id: 'altar', roomType: 'normal', weight: 1 },
  { id: 'timed', roomType: 'normal', weight: 1 },
  { id: 'miniboss', roomType: 'normal', weight: 1 },
  { id: 'twin', roomType: 'boss', weight: 1 },
];

/** Chance that a room able to hold an event gets one; about 1 to 1.5 per floor. */
export const EVENT_CHANCE: Record<EventRoomType, number> = { normal: 0.15, boss: 0.05 };

export const EVENT_TUNING = {
  dark: { minWaves: 2, maxWaves: 3, waveGapMs: 1000, rainPerWave: { currency: 3, heal: 1 } },
  // Bigger and outlined in purple: more darkness in them.
  cursed: { hpScale: 1.5, sizeScale: 1.15, outline: COLORS.curse, strayChance: 0.08, strayMinDepth: 2 },
  // A share of the current max, so the price stays felt however much HP the player has built up.
  altar: { maxHealthShare: 0.25 },
  timed: { baseMs: 16000, perFloorMs: 2000, maxMs: 30000 },
  miniboss: {
    hpScale: 4,
    sizeScale: 1.6,
    // Slightly more than a plain touch: 10 becomes 13.
    damageScale: 1.3,
    summon: { everyMs: 5000, telegraphMs: 500, min: 2, max: 3, maxAlive: 6 },
    rain: { currency: 5, heal: 1 },
    // Now and then it leaves an item on a pedestal instead of the rain.
    itemChance: 0.15,
    // Looks cursed, to read as more darkness than a plain enemy; drops aren't doubled, the rain pays.
    outline: COLORS.curse,
  },
  twin: { hpShare: 0.55, scale: 0.8, desyncMs: 1000, rain: { currency: 8, heal: 2 } },
} as const;

export const TWIN_NAME: MessageKey = 'boss.shadow-colossus-twins';

/** A mini boss's name, by the plain enemy it grew from. */
const ELDER_NAMES: Record<string, MessageKey> = {
  shadow: 'enemy.shadow-elder',
  'shadow-caster': 'enemy.shadow-caster-elder',
};

/** Events for this floor, rolled once when it is generated. Same seed, same events. */
export function rollRoomEvents<T extends { type: RoomType }>(
  rng: Rng,
  rooms: Iterable<T>,
  table: readonly RoomEventDef[] = ROOM_EVENTS,
): Map<T, RoomEventId> {
  const events = new Map<T, RoomEventId>();
  for (const room of rooms) {
    if (room.type !== 'normal' && room.type !== 'boss') continue;
    if (!rng.chance(EVENT_CHANCE[room.type])) continue;
    const options = table.filter((e) => e.roomType === room.type);
    if (options.length === 0) continue;
    events.set(room, pickWeighted(rng, options).id);
  }
  return events;
}

export function eventRoomType(id: RoomEventId): EventRoomType {
  return ROOM_EVENTS.find((e) => e.id === id)!.roomType;
}

/** The dark room's wave count; the game never tells the player how many are left. */
export function darkWaveCount(rng: Rng): number {
  return rng.int(EVENT_TUNING.dark.minWaves, EVENT_TUNING.dark.maxWaves);
}

/** About 20 s, a little more on deeper floors where rooms hold more enemies. */
export function timedChallengeMs(depth: number): number {
  const { baseMs, perFloorMs, maxMs } = EVENT_TUNING.timed;
  return Math.min(maxMs, baseMs + perFloorMs * depth);
}

export function cursedDef(def: EnemyDef): EnemyDef {
  const { hpScale, sizeScale, outline } = EVENT_TUNING.cursed;
  return { ...def, hp: Math.round(def.hp * hpScale), scale: def.scale * sizeScale, outline, cursed: true };
}

/** From floor 2 on, any enemy of a plain room may turn up cursed among the others. */
export function curseStrays(rng: Rng, defs: readonly EnemyDef[], depth: number): EnemyDef[] {
  const { strayChance, strayMinDepth } = EVENT_TUNING.cursed;
  if (depth < strayMinDepth) return [...defs];
  return defs.map((def) => (rng.chance(strayChance) ? cursedDef(def) : def));
}

/**
 * A plain enemy grown into a mini boss: much tougher, bigger, hitting a little harder,
 * and between its usual attacks it calls in plain copies of itself.
 */
export function miniBossDef(def: EnemyDef): EnemyDef {
  const { hpScale, sizeScale, damageScale, summon, outline } = EVENT_TUNING.miniboss;
  return {
    ...def,
    name: ELDER_NAMES[def.id] ?? def.name,
    hp: Math.round(def.hp * hpScale),
    scale: def.scale * sizeScale,
    contactDamage: Math.round(def.contactDamage * damageScale),
    miniBoss: true,
    outline,
    attacks: [...def.attacks, { kind: 'summon', ...summon, minionId: def.id }],
  };
}

export function miniBossPaysItem(rng: Rng): boolean {
  return rng.chance(EVENT_TUNING.miniboss.itemChance);
}

export function miniBossRain(): DropKind[] {
  const { currency, heal } = EVENT_TUNING.miniboss.rain;
  return rain(currency, heal);
}

/** Smaller and frailer than a lone Colossus, with full damage. */
export function twinDef(def: EnemyDef): EnemyDef {
  const { hpShare, scale } = EVENT_TUNING.twin;
  return { ...def, name: TWIN_NAME, hp: Math.round(def.hp * hpShare), scale: def.scale * scale };
}

/** Max HP the altar takes from a player with `maxHealth`. */
export function altarCost(maxHealth: number): number {
  return Math.max(1, Math.round(maxHealth * EVENT_TUNING.altar.maxHealthShare));
}

/**
 * The altar takes its price in blood: off the max and off current HP alike.
 * Nothing stops a player too hurt to pay; `health` at 0 or below means greed killed them.
 */
export function payAltar(player: { health: number; maxHealth: number }): { health: number; cost: number } {
  const cost = altarCost(player.maxHealth);
  return { health: player.health - cost, cost };
}

export function darkRain(waves: number): DropKind[] {
  const { currency, heal } = EVENT_TUNING.dark.rainPerWave;
  return rain(currency * waves, heal * waves);
}

export function twinRain(): DropKind[] {
  const { currency, heal } = EVENT_TUNING.twin.rain;
  return rain(currency, heal);
}

function rain(currency: number, heal: number): DropKind[] {
  return [...Array<DropKind>(currency).fill('currency'), ...Array<DropKind>(heal).fill('heal')];
}
