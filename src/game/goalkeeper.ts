import type { ShotEvent } from '@/core/collisions';
import type { ShotDebugInfo } from '@/game/shot-model';

export interface GoalkeeperConfig {
  enabled: boolean;
  reactionDelay: number;
  diveSpeed: number;
  standingReachX: number;
  baseReachY: number;
  maxReachX: number;
  minReachY: number;
  maxReachY: number;
  saveZ: number;
  saveGrace: number;
}

export interface GoalkeeperEstimate {
  cross: { x: number; y: number } | null;
  estimatedResult: ShotEvent | 'PENDING';
  timeToGoal: number | null;
}

export interface GoalkeeperPlan {
  cross: { x: number; y: number };
  reactionAt: number;
  arrivalAt: number;
  timeToGoal: number;
  requiredDiveTime: number;
}

export type GoalkeeperStatus = 'idle' | 'waiting' | 'diving' | 'saved' | 'missed';

export const DEFAULT_GOALKEEPER_CONFIG: GoalkeeperConfig = {
  enabled: true,
  reactionDelay: 0.3,
  diveSpeed: 5.6,
  standingReachX: 0.85,
  baseReachY: 1.2,
  maxReachX: 2.75,
  minReachY: 0.12,
  maxReachY: 2.42,
  saveZ: 0.82,
  saveGrace: 0.06,
};

export function estimateFromDebug(debug: ShotDebugInfo): GoalkeeperEstimate {
  return {
    cross: debug.arcCross,
    estimatedResult: debug.estimatedResult,
    timeToGoal: debug.timeToGoal,
  };
}

export function planGoalkeeperDive(
  estimate: GoalkeeperEstimate,
  config: GoalkeeperConfig = DEFAULT_GOALKEEPER_CONFIG,
): GoalkeeperPlan | null {
  if (!config.enabled) return null;
  if (estimate.estimatedResult !== 'GOAL' || !estimate.cross || estimate.timeToGoal == null) {
    return null;
  }

  const cross = estimate.cross;
  if (
    Math.abs(cross.x) > config.maxReachX ||
    cross.y < config.minReachY ||
    cross.y > config.maxReachY
  ) {
    return null;
  }

  const lateralTravel = Math.max(0, Math.abs(cross.x) - config.standingReachX);
  const verticalTravel = Math.abs(cross.y - config.baseReachY) * 0.55;
  const requiredDiveTime = Math.hypot(lateralTravel, verticalTravel) / config.diveSpeed;
  const arrivalAt = config.reactionDelay + requiredDiveTime;

  if (arrivalAt > estimate.timeToGoal + config.saveGrace) return null;

  return {
    cross: { ...cross },
    reactionAt: config.reactionDelay,
    arrivalAt,
    timeToGoal: estimate.timeToGoal,
    requiredDiveTime,
  };
}

export class GoalkeeperController {
  status: GoalkeeperStatus = 'idle';
  plan: GoalkeeperPlan | null = null;

  private elapsed = 0;

  constructor(private readonly config: GoalkeeperConfig = DEFAULT_GOALKEEPER_CONFIG) {}

  reset(): void {
    this.status = 'idle';
    this.plan = null;
    this.elapsed = 0;
  }

  prepare(estimate: GoalkeeperEstimate): GoalkeeperPlan | null {
    this.reset();
    this.plan = planGoalkeeperDive(estimate, this.config);
    this.status = this.plan ? 'waiting' : 'idle';
    return this.plan;
  }

  update(dt: number): { startedDive: boolean } {
    if (!this.plan || this.status === 'idle' || this.status === 'saved' || this.status === 'missed') {
      return { startedDive: false };
    }

    this.elapsed += dt;
    if (this.status === 'waiting' && this.elapsed >= this.plan.reactionAt) {
      this.status = 'diving';
      return { startedDive: true };
    }
    if (this.status === 'diving' && this.elapsed > this.plan.timeToGoal + this.config.saveGrace) {
      this.status = 'missed';
    }

    return { startedDive: false };
  }

  canSave(ballZ: number): boolean {
    if (!this.plan || this.status !== 'diving') return false;
    return ballZ <= this.config.saveZ && this.elapsed + this.config.saveGrace >= this.plan.arrivalAt;
  }

  markSaved(): void {
    this.status = 'saved';
  }

  debugLine(): string {
    if (!this.plan) return this.config.enabled ? 'idle' : 'off';
    return `${this.status} ${this.plan.arrivalAt.toFixed(2)}s/${this.plan.timeToGoal.toFixed(2)}s`;
  }
}
