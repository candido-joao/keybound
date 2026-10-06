import { describe, expect, it } from 'vitest';
import { type Catalog, type DebugTarget, type StatName, COMMANDS, execute, tokenize } from './commands';

const CATALOG: Catalog = {
  item: ['quickcast', 'vital-shard'],
  enemy: ['shadow', 'shadow-colossus'],
  drop: ['currency', 'heal'],
  event: ['dark', 'twin'],
  stat: ['speed', 'maxHealth'],
};

/** Creates an isolated command target with observable state so tests need no running game scene. */
function fakeTarget() {
  const state = {
    depth: 2,
    health: 40,
    maxHealth: 60,
    god: false,
    drive: 1,
    driveMax: 1,
    seeded: false,
    items: [] as string[],
    stats: {} as Partial<Record<StatName, number>>,
    spawned: [] as string[],
    dropped: [] as string[],
    enemyHealth: 100,
    pedestals: [] as string[],
    floor: 0,
    revealed: false,
    event: '',
  };
  const target: DebugTarget = {
    depth: () => state.depth,
    health: () => state.health,
    maxHealth: () => state.maxHealth,
    god: () => state.god,
    markSeeded: () => (state.seeded = true),
    give: (id, n) => state.items.push(...Array<string>(n).fill(id)),
    take: (id) => {
      const i = state.items.lastIndexOf(id);
      if (i < 0) return false;
      state.items.splice(i, 1);
      return true;
    },
    placeItem: (id) => state.pedestals.push(id),
    setHealth: (hp) => (state.health = Math.min(hp, state.maxHealth)),
    setGod: (on) => (state.god = on),
    drive: () => state.drive,
    driveMax: () => state.driveMax,
    setDrive: (n) => {
      state.drive = n;
      state.driveMax = Math.max(state.driveMax, n);
    },
    setStat: (name, value) => {
      state.stats[name] = value;
      if (name === 'maxHealth') state.maxHealth = value;
    },
    spawn: (id, n) => state.spawned.push(`${id}x${n}`),
    spawnBoss: () => state.spawned.push('boss'),
    drop: (id, n) => state.dropped.push(`${id}x${n}`),
    killAll: () => 3,
    setEnemyHealth: (percent) => {
      state.enemyHealth = percent;
      return 2;
    },
    goToFloor: (depth) => (state.floor = depth),
    goToBossRoom: () => true,
    revealMap: () => (state.revealed = true),
    startEvent: (id) => {
      state.event = id;
      return id !== 'twin';
    },
  };
  return { state, target };
}

describe('tokenize', () => {
  it('lowercases and collapses spaces', () => {
    expect(tokenize('  GIVE   quickcast 2 ')).toEqual(['give', 'quickcast', '2']);
  });

  it('returns nothing for a blank line', () => {
    expect(tokenize('   ')).toEqual([]);
  });
});

describe('execute', () => {
  it('runs a command with an optional count', () => {
    const { state, target } = fakeTarget();
    expect(execute('give quickcast 2', target, CATALOG).lines).toEqual(['gave quickcast x2']);
    expect(state.items).toEqual(['quickcast', 'quickcast']);
  });

  it('defaults an omitted optional count to 1', () => {
    const { state, target } = fakeTarget();
    execute('give vital-shard', target, CATALOG);
    expect(state.items).toEqual(['vital-shard']);
  });

  it('sets drive charges and raises the max to fit them', () => {
    const { state, target } = fakeTarget();
    expect(execute('drive 3', target, CATALOG).lines).toEqual(['drive 3/3']);
    expect(state.driveMax).toBe(3);
  });

  it('marks the run seeded on any cheat', () => {
    const { state, target } = fakeTarget();
    execute('heal', target, CATALOG);
    expect(state.seeded).toBe(true);
  });

  it('leaves the run alone for help and clear', () => {
    const { state, target } = fakeTarget();
    execute('help', target, CATALOG);
    expect(execute('clear', target, CATALOG).clear).toBe(true);
    expect(state.seeded).toBe(false);
  });

  it('lists every command in help', () => {
    const { target } = fakeTarget();
    expect(execute('help', target, CATALOG).lines).toHaveLength(COMMANDS.length);
  });

  it('rejects unknown commands without touching the run', () => {
    const { state, target } = fakeTarget();
    expect(execute('fly', target, CATALOG).lines).toEqual(['unknown command: fly (try help)']);
    expect(state.seeded).toBe(false);
  });

  it('drops pickups, one by default', () => {
    const { state, target } = fakeTarget();
    execute('drop heal', target, CATALOG);
    execute('drop currency 5', target, CATALOG);
    expect(state.dropped).toEqual(['healx1', 'currencyx5']);
    expect(state.seeded).toBe(true);
  });

  it('sets enemy hp as a percent', () => {
    const { state, target } = fakeTarget();
    expect(execute('enemyhp 35', target, CATALOG).lines).toEqual(['2 enemies at 35%']);
    expect(state.enemyHealth).toBe(35);
    expect(execute('enemyhp 0', target, CATALOG).lines).toEqual(['percent must be a whole number from 1 to 100']);
  });

  it('replays the room as an event, when it fits', () => {
    const { state, target } = fakeTarget();
    expect(execute('event dark', target, CATALOG).lines).toEqual(['event dark']);
    expect(state.event).toBe('dark');
    expect(execute('event twin', target, CATALOG).lines).toEqual(["twin doesn't fit this room"]);
  });

  it('rejects ids missing from the catalog', () => {
    const { state, target } = fakeTarget();
    expect(execute('spawn dragon', target, CATALOG).lines).toEqual(['unknown enemy: dragon']);
    expect(state.spawned).toEqual([]);
  });

  it('prints usage on a wrong argument count', () => {
    const { target } = fakeTarget();
    expect(execute('give', target, CATALOG).lines).toEqual(['usage: give <item> [n]']);
    expect(execute('heal now', target, CATALOG).lines).toEqual(['usage: heal']);
  });

  it.each(['0', '-1', '1.5', '100', '0x10', 'two'])('rejects %s as a give count', (n) => {
    const { state, target } = fakeTarget();
    expect(execute(`give quickcast ${n}`, target, CATALOG).lines).toEqual(['n must be a whole number from 1 to 99']);
    expect(state.items).toEqual([]);
  });

  it('accepts decimal stat values', () => {
    const { state, target } = fakeTarget();
    expect(execute('stat speed 212.5', target, CATALOG).lines).toEqual(['speed = 212.5']);
    expect(state.stats.speed).toBe(212.5);
  });

  it('finds camelCase stats typed in any case', () => {
    const { state, target } = fakeTarget();
    expect(execute('stat maxhealth 80', target, CATALOG).lines).toEqual(['maxHealth = 80']);
    expect(state.stats.maxHealth).toBe(80);
  });

  it('toggles god mode', () => {
    const { target } = fakeTarget();
    expect(execute('god', target, CATALOG).lines).toEqual(['god mode on']);
    expect(execute('god', target, CATALOG).lines).toEqual(['god mode off']);
  });

  it('reports hp after changing it', () => {
    const { target } = fakeTarget();
    expect(execute('hp 10', target, CATALOG).lines).toEqual(['hp 10/60']);
    expect(execute('maxhp 80', target, CATALOG).lines).toEqual(['hp 10/80']);
    expect(execute('heal', target, CATALOG).lines).toEqual(['hp 80/80']);
  });

  it('places a pedestal without granting the item', () => {
    const { state, target } = fakeTarget();
    expect(execute('pedestal quickcast', target, CATALOG).lines).toEqual(['pedestal with quickcast']);
    expect(state.pedestals).toEqual(['quickcast']);
    expect(state.items).toEqual([]);
  });

  it('reports a take of an item not held', () => {
    const { target } = fakeTarget();
    expect(execute('take quickcast', target, CATALOG).lines).toEqual(['no quickcast held']);
  });

  it('moves to the next floor', () => {
    const { state, target } = fakeTarget();
    expect(execute('next', target, CATALOG).lines).toEqual(['floor 3']);
    expect(state.floor).toBe(3);
  });

  it('ignores a blank line', () => {
    const { state, target } = fakeTarget();
    expect(execute('  ', target, CATALOG)).toEqual({ lines: [], clear: false });
    expect(state.seeded).toBe(false);
  });
});
