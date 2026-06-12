import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GOALKEEPER_CONFIG,
  GoalkeeperController,
  planGoalkeeperDive,
  type GoalkeeperEstimate,
} from './goalkeeper';

const goalEstimate = (over: Partial<GoalkeeperEstimate>): GoalkeeperEstimate => ({
  cross: { x: 0, y: 1.1 },
  estimatedResult: 'GOAL',
  timeToGoal: 1.1,
  ...over,
});

describe('goalkeeper planner', () => {
  it('plans a save for a central reachable shot after reaction delay', () => {
    const plan = planGoalkeeperDive(goalEstimate({ cross: { x: 0.35, y: 1.2 } }));

    expect(plan).not.toBeNull();
    expect(plan!.reactionAt).toBeCloseTo(DEFAULT_GOALKEEPER_CONFIG.reactionDelay, 3);
    expect(plan!.arrivalAt).toBeLessThan(plan!.timeToGoal);
  });

  it('llega a un tiro semi-cruzado alcanzable (arquero reforzado)', () => {
    const plan = planGoalkeeperDive(goalEstimate({ cross: { x: 2.4, y: 1.2 } }));

    expect(plan).not.toBeNull();
  });

  it('no llega al ángulo lejano fuera de alcance', () => {
    const plan = planGoalkeeperDive(goalEstimate({ cross: { x: 3.3, y: 2.2 } }));

    expect(plan).toBeNull();
  });

  it('does not react to non-goal estimates', () => {
    const plan = planGoalkeeperDive(goalEstimate({ estimatedResult: 'WALL' }));

    expect(plan).toBeNull();
  });
});

describe('GoalkeeperController', () => {
  it('waits, dives, then can save near the goal line', () => {
    const controller = new GoalkeeperController({
      ...DEFAULT_GOALKEEPER_CONFIG,
      reactionDelay: 0.2,
      diveSpeed: 4,
    });

    controller.prepare(goalEstimate({ cross: { x: 0.7, y: 1.15 }, timeToGoal: 1 }));
    expect(controller.status).toBe('waiting');
    expect(controller.update(0.19).startedDive).toBe(false);
    expect(controller.status).toBe('waiting');
    expect(controller.update(0.02).startedDive).toBe(true);
    expect(controller.status).toBe('diving');
    expect(controller.canSave(1.4)).toBe(false);
    expect(controller.canSave(0.4)).toBe(true);
  });
});
