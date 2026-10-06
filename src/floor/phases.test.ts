import { describe, expect, it } from 'vitest';
import { rollRoomEnemies } from '../combat/enemies';
import { Rng } from '../core/rng';
import { PHASES, RUN_FLOORS, floorBoss, isFinalFloor, isPhaseStart, phaseAt } from './phases';

describe('phases', () => {
  it('split an 8-floor run into 3, 3 and 2 floors', () => {
    expect(RUN_FLOORS).toBe(8);
    const ids = Array.from({ length: 8 }, (_, i) => phaseAt(i + 1).id);
    expect(ids).toEqual(['crypt', 'crypt', 'crypt', 'garden', 'garden', 'garden', 'clock-tower', 'clock-tower']);
  });

  it('keep floors past the end in the last phase', () => {
    expect(phaseAt(9)).toBe(PHASES[PHASES.length - 1]);
    expect(phaseAt(99)).toBe(PHASES[PHASES.length - 1]);
  });

  it('start on floors 1, 4 and 7', () => {
    const starts = Array.from({ length: 10 }, (_, i) => i + 1).filter(isPhaseStart);
    expect(starts).toEqual([1, 4, 7]);
  });

  it('end the run on floor 8', () => {
    expect(isFinalFloor(7)).toBe(false);
    expect(isFinalFloor(8)).toBe(true);
  });

  it('have enemies, and a boss for every floor', () => {
    for (const phase of PHASES) {
      expect(rollRoomEnemies(new Rng(phase.id), 5, phase.enemies)).toHaveLength(5);
      expect(phase.bosses.length).toBeGreaterThanOrEqual(phase.floors);
    }
  });
});

describe('floorBoss', () => {
  const SEEDS = Array.from({ length: 200 }, (_, i) => `BOSS${i}`);
  const lineup = (seed: string) => Array.from({ length: RUN_FLOORS }, (_, i) => floorBoss(seed, i + 1).id);

  it('rolls the same bosses for the same seed', () => {
    expect(lineup('SAME')).toEqual(lineup('SAME'));
  });

  it("takes each floor's boss from its phase", () => {
    for (let depth = 1; depth <= RUN_FLOORS; depth++) expect(phaseAt(depth).bosses).toContain(floorBoss('S', depth));
  });

  it('never meets a boss twice in a run', () => {
    for (const seed of SEEDS) expect(new Set(lineup(seed)).size, seed).toBe(RUN_FLOORS);
  });

  it('meets every boss across runs, and seldom the same lineup', () => {
    const lineups = SEEDS.map(lineup);
    expect(new Set(lineups.flat())).toEqual(new Set(PHASES.flatMap((p) => p.bosses.map((b) => b.id))));
    expect(new Set(lineups.map((l) => l.join())).size).toBeGreaterThan(SEEDS.length * 0.9);
  });

  it('starts the order over on floors past the pool', () => {
    const last = PHASES[PHASES.length - 1];
    expect(last.bosses).toContain(floorBoss('S', 99));
  });
});
