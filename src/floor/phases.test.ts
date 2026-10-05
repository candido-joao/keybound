import { describe, expect, it } from 'vitest';
import { rollRoomEnemies } from '../combat/enemies';
import { Rng } from '../core/rng';
import { PHASES, RUN_FLOORS, isFinalFloor, isPhaseStart, phaseAt, rollFloorBoss } from './phases';

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

  it('have enemies and at least one boss', () => {
    for (const phase of PHASES) {
      expect(rollRoomEnemies(new Rng(phase.id), 5, phase.enemies)).toHaveLength(5);
      expect(phase.bosses.length).toBeGreaterThan(0);
    }
  });

  it('roll the same boss for the same seed', () => {
    const phase = PHASES[1];
    expect(rollFloorBoss(new Rng('s'), phase)).toBe(rollFloorBoss(new Rng('s'), phase));
    expect(phase.bosses).toContain(rollFloorBoss(new Rng('s'), phase));
  });
});
