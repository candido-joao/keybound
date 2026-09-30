import type { PlayerStats } from '../combat/stats';
import { MAX_DEPTH } from '../core/run';

export type StatName = keyof PlayerStats;

/** Ids the console accepts and completes, by argument kind. */
export interface Catalog {
  item: readonly string[];
  enemy: readonly string[];
  drop: readonly string[];
  stat: readonly StatName[];
}

export type ArgKind = keyof Catalog | 'int' | 'number';

export interface ArgSpec {
  name: string;
  kind: ArgKind;
  optional?: boolean;
  /** Inclusive bounds for numeric kinds. */
  min?: number;
  max?: number;
}

export type ArgValue = string | number;

/** What commands can change in a run. GameScene provides it; tests use a fake. */
export interface DebugTarget {
  depth(): number;
  health(): number;
  maxHealth(): number;
  god(): boolean;
  markSeeded(): void;
  give(itemId: string, count: number): void;
  /** Returns false when no copy was held. */
  take(itemId: string): boolean;
  /** Puts `itemId` on a pedestal near the player, to pick up like a room reward. */
  placeItem(itemId: string): void;
  setHealth(hp: number): void;
  setGod(on: boolean): void;
  setStat(name: StatName, value: number): void;
  spawn(enemyId: string, count: number): void;
  spawnBoss(): void;
  /** Drops `count` of `dropId` around the player. */
  drop(dropId: string, count: number): void;
  /** Returns how many enemies died. */
  killAll(): number;
  goToFloor(depth: number): void;
  revealMap(): void;
}

export interface Command {
  name: string;
  args: readonly ArgSpec[];
  summary: string;
  /** Changes the run, so the run stops counting. False for help and clear. */
  cheat: boolean;
  /** Empties the console log instead of printing. */
  clears?: boolean;
  run(target: DebugTarget, args: readonly ArgValue[]): string[];
}

export interface ExecResult {
  lines: string[];
  clear: boolean;
}

const MAX_COUNT = 99;
const MAX_SPAWN = 30;
const MAX_HP = 9999;

const hpLine = (t: DebugTarget) => `hp ${t.health()}/${t.maxHealth()}`;
const times = (n: number) => (n > 1 ? ` x${n}` : '');

// Commands and replies stay in English: this is a developer tool, a documented exception to i18n.
export const COMMANDS: readonly Command[] = [
  {
    name: 'give',
    args: [
      { name: 'item', kind: 'item' },
      { name: 'n', kind: 'int', optional: true, min: 1, max: MAX_COUNT },
    ],
    summary: 'add an item, n copies',
    cheat: true,
    run: (t, [id, n = 1]) => {
      t.give(String(id), Number(n));
      return [`gave ${id}${times(Number(n))}`];
    },
  },
  {
    name: 'take',
    args: [{ name: 'item', kind: 'item' }],
    summary: 'remove one copy of an item',
    cheat: true,
    run: (t, [id]) => [t.take(String(id)) ? `took ${id}` : `no ${id} held`],
  },
  {
    name: 'pedestal',
    args: [{ name: 'item', kind: 'item' }],
    summary: 'place an item pedestal near you',
    cheat: true,
    run: (t, [id]) => {
      t.placeItem(String(id));
      return [`pedestal with ${id}`];
    },
  },
  {
    name: 'hp',
    args: [{ name: 'n', kind: 'int', min: 1, max: MAX_HP }],
    summary: 'set current hp',
    cheat: true,
    run: (t, [n]) => {
      t.setHealth(Number(n));
      return [hpLine(t)];
    },
  },
  {
    name: 'maxhp',
    args: [{ name: 'n', kind: 'int', min: 1, max: MAX_HP }],
    summary: 'set max hp',
    cheat: true,
    run: (t, [n]) => {
      t.setStat('maxHealth', Number(n));
      return [hpLine(t)];
    },
  },
  {
    name: 'heal',
    args: [],
    summary: 'refill hp',
    cheat: true,
    run: (t) => {
      t.setHealth(t.maxHealth());
      return [hpLine(t)];
    },
  },
  {
    name: 'god',
    args: [],
    summary: 'toggle taking no damage',
    cheat: true,
    run: (t) => {
      t.setGod(!t.god());
      return [`god mode ${t.god() ? 'on' : 'off'}`];
    },
  },
  {
    name: 'stat',
    args: [
      { name: 'name', kind: 'stat' },
      { name: 'value', kind: 'number', min: 0 },
    ],
    summary: 'override a player stat, past its limits',
    cheat: true,
    run: (t, [name, value]) => {
      t.setStat(name as StatName, Number(value));
      return [`${name} = ${value}`];
    },
  },
  {
    name: 'spawn',
    args: [
      { name: 'enemy', kind: 'enemy' },
      { name: 'n', kind: 'int', optional: true, min: 1, max: MAX_SPAWN },
    ],
    summary: 'spawn enemies in this room',
    cheat: true,
    run: (t, [id, n = 1]) => {
      t.spawn(String(id), Number(n));
      return [`spawned ${id}${times(Number(n))}`];
    },
  },
  {
    name: 'drop',
    args: [
      { name: 'drop', kind: 'drop' },
      { name: 'n', kind: 'int', optional: true, min: 1, max: MAX_SPAWN },
    ],
    summary: 'drop pickups around you',
    cheat: true,
    run: (t, [id, n = 1]) => {
      t.drop(String(id), Number(n));
      return [`dropped ${id}${times(Number(n))}`];
    },
  },
  {
    name: 'boss',
    args: [],
    summary: "spawn this floor's boss",
    cheat: true,
    run: (t) => {
      t.spawnBoss();
      return ['boss spawned'];
    },
  },
  {
    name: 'kill',
    args: [],
    summary: 'kill every enemy in the room',
    cheat: true,
    run: (t) => [`killed ${t.killAll()}`],
  },
  {
    name: 'floor',
    args: [{ name: 'n', kind: 'int', min: 1, max: MAX_DEPTH }],
    summary: 'jump to floor n, keeping items',
    cheat: true,
    run: (t, [n]) => {
      t.goToFloor(Number(n));
      return [`floor ${n}`];
    },
  },
  {
    name: 'next',
    args: [],
    summary: 'go to the next floor',
    cheat: true,
    run: (t) => {
      const depth = Math.min(MAX_DEPTH, t.depth() + 1);
      t.goToFloor(depth);
      return [`floor ${depth}`];
    },
  },
  {
    name: 'reveal',
    args: [],
    summary: 'show the whole map',
    cheat: true,
    run: (t) => {
      t.revealMap();
      return ['map revealed'];
    },
  },
  {
    name: 'help',
    args: [],
    summary: 'list commands',
    cheat: false,
    run: () => COMMANDS.map((c) => `${usage(c).padEnd(24)} ${c.summary}`),
  },
  {
    name: 'clear',
    args: [],
    summary: 'clear the log',
    cheat: false,
    clears: true,
    run: () => [],
  },
];

export function findCommand(name: string, commands: readonly Command[] = COMMANDS): Command | undefined {
  return commands.find((c) => c.name === name);
}

/** "give <item> [n]" */
export function usage(command: Command): string {
  return [command.name, ...command.args.map(argLabel)].join(' ');
}

export function argLabel(arg: ArgSpec): string {
  return arg.optional ? `[${arg.name}]` : `<${arg.name}>`;
}

/** Words of a command line, lowercased; runs of spaces count as one. */
export function tokenize(input: string): string[] {
  return input.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

/** Runs one line. Never throws: bad input comes back as a reply line. */
export function execute(input: string, target: DebugTarget, catalog: Catalog): ExecResult {
  const [name, ...words] = tokenize(input);
  if (!name) return { lines: [], clear: false };

  const command = findCommand(name);
  if (!command) return { lines: [`unknown command: ${name} (try help)`], clear: false };

  const parsed = parseArgs(command, words, catalog);
  if (typeof parsed === 'string') return { lines: [parsed], clear: false };

  if (command.cheat) target.markSeeded();
  return { lines: command.run(target, parsed), clear: command.clears === true };
}

/** Parsed values, or the error line to print. */
export function parseArgs(command: Command, words: readonly string[], catalog: Catalog): ArgValue[] | string {
  const required = command.args.filter((a) => !a.optional).length;
  if (words.length < required || words.length > command.args.length) return `usage: ${usage(command)}`;

  const values: ArgValue[] = [];
  for (let i = 0; i < words.length; i++) {
    const value = parseArg(command.args[i], words[i], catalog);
    if (value === undefined) return invalidArg(command.args[i], words[i]);
    values.push(value);
  }
  return values;
}

function parseArg(arg: ArgSpec, word: string, catalog: Catalog): ArgValue | undefined {
  if (arg.kind === 'int' || arg.kind === 'number') return parseNumber(arg, word);
  // Words arrive lowercased; ids like maxHealth keep their catalog casing.
  return (catalog[arg.kind] as readonly string[]).find((id) => id.toLowerCase() === word);
}

function parseNumber(arg: ArgSpec, word: string): number | undefined {
  // Number('') is 0 and Number('0x10') is 16; only plain decimals are accepted.
  if (!/^-?\d+(\.\d+)?$/.test(word)) return undefined;
  const n = Number(word);
  if (arg.kind === 'int' && !Number.isInteger(n)) return undefined;
  if (arg.min !== undefined && n < arg.min) return undefined;
  if (arg.max !== undefined && n > arg.max) return undefined;
  return n;
}

function invalidArg(arg: ArgSpec, word: string): string {
  if (arg.kind !== 'int' && arg.kind !== 'number') return `unknown ${arg.kind}: ${word}`;
  const kind = arg.kind === 'int' ? 'a whole number' : 'a number';
  const range = arg.max === undefined ? ` >= ${arg.min ?? 0}` : ` from ${arg.min ?? 0} to ${arg.max}`;
  return `${arg.name} must be ${kind}${range}`;
}
