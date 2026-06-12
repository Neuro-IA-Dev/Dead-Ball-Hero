import * as THREE from 'three';
import type { ShotInput } from '@/game/shot-machine';
import { TRAINING_RIGHT_FOOT, type Kicker } from '@/game/kicker';
import { traceTrajectory, KNUCKLE_DRAG_CD, type BallState } from '@/core/ballistics';
import type { BarrierColliderConfig } from '@/core/collisions';
import { speedForPower, MAX_CURVE_SPIN, MAX_TOPSPIN } from '@/core/physics';
import { type ShotDebugInfo, type ShotIntent, type ShotLaunch, type ShotType } from '@/game/shot-model';

const UP = new THREE.Vector3(0, 1, 0);

export type ContactType =
  | 'chanfle_interior'
  | 'chanfle_exterior'
  | 'picada'
  | 'raso'
  | 'normal';

export interface ShotRecipe {
  launchAngleDeg: number;
  minAngleDeg: number;
  maxAngleDeg: number;
  idealPower: number;
  idealPowerWindow: number;
  dragCd: number;
  sideSpin: number;
  topSpin: number;
  magnusScale: number;
  groundBounceScale: number;
  dispersionBase: number;
  targetBiasY?: number;
  targetClampY?: { min: number; max: number };
}

export const SHOT_RECIPES: Record<ShotType, ShotRecipe> = {
  natural: {
    launchAngleDeg: 13.5,
    minAngleDeg: 8,
    maxAngleDeg: 19,
    idealPower: 3.0,
    idealPowerWindow: 0.25,
    dragCd: 0.28,
    sideSpin: 0,
    topSpin: 0,
    magnusScale: 0.92,
    groundBounceScale: 1,
    dispersionBase: 1,
  },
  inside_curve: {
    launchAngleDeg: 16.5,
    minAngleDeg: 12,
    maxAngleDeg: 21,
    idealPower: 3.0,
    idealPowerWindow: 0.25,
    dragCd: 0.3,
    sideSpin: 82,
    topSpin: -12,
    magnusScale: 1.28,
    groundBounceScale: 1,
    dispersionBase: 0.9,
  },
  outside_curve: {
    launchAngleDeg: 15.5,
    minAngleDeg: 11,
    maxAngleDeg: 20,
    idealPower: 3.0,
    idealPowerWindow: 0.25,
    dragCd: 0.31,
    sideSpin: 84,
    topSpin: -8,
    magnusScale: 1.2,
    groundBounceScale: 1,
    dispersionBase: 1.02,
  },
  topspin: {
    launchAngleDeg: 19.5,
    minAngleDeg: 15,
    maxAngleDeg: 24,
    idealPower: 3.1,
    idealPowerWindow: 0.3,
    dragCd: 0.32,
    sideSpin: 4,
    topSpin: -66,
    magnusScale: 0.94,
    groundBounceScale: 0.9,
    dispersionBase: 1,
    targetBiasY: -0.06,
  },
  driven_low: {
    launchAngleDeg: -1.1,
    minAngleDeg: -1.3,
    maxAngleDeg: -0.25,
    idealPower: 2,
    idealPowerWindow: 0.25,
    dragCd: 0.27,
    sideSpin: 0,
    topSpin: -40,
    magnusScale: 0.34,
    groundBounceScale: 0.08,
    dispersionBase: 0.92,
    targetBiasY: -0.28,
    targetClampY: { min: 0.1, max: 0.4 },
  },
  knuckle: {
    launchAngleDeg: 14,
    minAngleDeg: 10,
    maxAngleDeg: 18,
    idealPower: 3.7,
    idealPowerWindow: 0.35,
    dragCd: KNUCKLE_DRAG_CD,
    sideSpin: 0,
    topSpin: 0,
    magnusScale: 0.35,
    groundBounceScale: 0.95,
    dispersionBase: 1.12,
  },
};

const SIDE_THRESHOLD = 0.45;
const PICADA_THRESHOLD = 0.45;
const RASO_THRESHOLD = -0.45;
const KNUCKLE_X_THRESHOLD = 0.2;
const KNUCKLE_Y_THRESHOLD = 0.12;
const KNUCKLE_POWER_THRESHOLD = 3.2;

const POWER_MISS_FULL_BARS = 1.4;
const PRE_RELIEF = 0.75;
const BASE_ANGLE_SIGMA = 0.04;
const SPEED_WOBBLE = 0.28;
const SPIN_WOBBLE = 10;

export function classifyContact(
  contact: { x: number; y: number },
  kicker: Kicker,
): ContactType {
  if (Math.abs(contact.x) > SIDE_THRESHOLD) {
    const interiorSign = kicker.foot === 'R' ? 1 : -1;
    return Math.sign(contact.x) === interiorSign
      ? 'chanfle_interior'
      : 'chanfle_exterior';
  }
  if (contact.y > PICADA_THRESHOLD) return 'picada';
  if (contact.y < RASO_THRESHOLD) return 'raso';
  return 'normal';
}

export function detectShotType(
  contact: { x: number; y: number },
  power: number,
  kicker: Kicker,
): ShotType {
  if (
    Math.abs(contact.x) <= KNUCKLE_X_THRESHOLD &&
    Math.abs(contact.y) <= KNUCKLE_Y_THRESHOLD &&
    power >= KNUCKLE_POWER_THRESHOLD &&
    kicker.knu >= 50
  ) {
    return 'knuckle';
  }
  switch (classifyContact(contact, kicker)) {
    case 'chanfle_interior':
      return 'inside_curve';
    case 'chanfle_exterior':
      return 'outside_curve';
    case 'picada':
      return 'topspin';
    case 'raso':
      return 'driven_low';
    default:
      return 'natural';
  }
}

export function shotTypeLabelKey(shotType: ShotType): ContactType | 'knuckle' {
  switch (shotType) {
    case 'inside_curve':
      return 'chanfle_interior';
    case 'outside_curve':
      return 'chanfle_exterior';
    case 'topspin':
      return 'picada';
    case 'driven_low':
      return 'raso';
    case 'knuckle':
      return 'knuckle';
    default:
      return 'normal';
  }
}

export function optimalPowerCenter(
  contact: { x: number; y: number },
  kicker: Kicker,
  powerGuess?: number,
): number {
  return SHOT_RECIPES[detectShotType(contact, powerGuess ?? 2.75, kicker)].idealPower;
}

export function perfectPowerWindow(
  contact: { x: number; y: number },
  kicker: Kicker,
  powerGuess?: number,
): number {
  return SHOT_RECIPES[detectShotType(contact, powerGuess ?? 2.75, kicker)].idealPowerWindow;
}

export function isPerfectPower(
  power: number,
  contact: { x: number; y: number },
  kicker: Kicker,
): boolean {
  const center = optimalPowerCenter(contact, kicker, power);
  return Math.abs(power - center) <= perfectPowerWindow(contact, kicker, power);
}

export function shotIntentFromInput(
  input: ShotInput,
  ctx: SolveContext,
): ShotIntent {
  const aimAzimuthDeg = THREE.MathUtils.radToDeg(
    Math.atan2(input.aim.x - ctx.ballPos.x, ctx.ballPos.z),
  );
  return {
    aimAzimuthDeg,
    contactX: input.contact.x,
    contactY: input.contact.y,
    powerBars: input.power,
    shotType: detectShotType(input.contact, input.power, ctx.kicker),
    foot: ctx.kicker.foot === 'L' ? 'left' : 'right',
    aimTarget: { x: input.aim.x, y: input.aim.y },
  };
}

export function directionFromAzimuthAndElevation(
  baseDirectionToGoal: THREE.Vector3,
  aimAzimuthDeg: number,
  elevationDeg: number,
): THREE.Vector3 {
  const horizontal = new THREE.Vector3(baseDirectionToGoal.x, 0, baseDirectionToGoal.z)
    .normalize()
    .applyAxisAngle(UP, THREE.MathUtils.degToRad(-aimAzimuthDeg));
  return horizontal
    .clone()
    .multiplyScalar(Math.cos(THREE.MathUtils.degToRad(elevationDeg)))
    .addScaledVector(UP, Math.sin(THREE.MathUtils.degToRad(elevationDeg)))
    .normalize();
}

function recipeForIntent(intent: ShotIntent): ShotRecipe {
  return SHOT_RECIPES[intent.shotType];
}

function sampleGoalPlane(samples: THREE.Vector3[]): { x: number; y: number } | null {
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!;
    const b = samples[i]!;
    if (a.z > 0 && b.z <= 0) {
      const t = a.z / (a.z - b.z);
      return {
        x: THREE.MathUtils.lerp(a.x, b.x, t),
        y: THREE.MathUtils.lerp(a.y, b.y, t),
      };
    }
  }
  return null;
}

function effectiveAimTargetForIntent(
  intent: ShotIntent,
  recipe: ShotRecipe,
): { x: number; y: number } | undefined {
  if (!intent.aimTarget) return undefined;
  let y = intent.aimTarget.y + (recipe.targetBiasY ?? 0);
  if (intent.shotType === 'driven_low') {
    y -= Math.max(0, -intent.contactY - 0.45) * 0.08;
  }
  if (recipe.targetClampY) {
    y = THREE.MathUtils.clamp(y, recipe.targetClampY.min, recipe.targetClampY.max);
  }
  return { x: intent.aimTarget.x, y };
}

function initialElevationGuess(
  intent: ShotIntent,
  recipe: ShotRecipe,
  target: { x: number; y: number } | undefined,
): number {
  const targetY = target?.y ?? 1.35;
  const targetLift = (targetY - 1.35) * (intent.shotType === 'driven_low' ? 1.05 : 4.2);
  const powerLift = (intent.powerBars - recipe.idealPower) * (intent.shotType === 'driven_low' ? 0.25 : 1.1);
  const contactLift = intent.contactY * (intent.shotType === 'driven_low' ? 0.35 : 1.8);
  return THREE.MathUtils.clamp(
    recipe.launchAngleDeg + targetLift + powerLift + contactLift,
    recipe.minAngleDeg,
    recipe.maxAngleDeg,
  );
}

function solveLaunchVectorForIntent(
  intent: ShotIntent,
  ctx: SolveContext,
  solveSpeed: number,
  recipe: ShotRecipe,
  spin: THREE.Vector3,
): { direction: THREE.Vector3; elevationDeg: number; effectiveAimTarget: { x: number; y: number } | null } {
  const baseDirectionToGoal = new THREE.Vector3(-ctx.ballPos.x, 0, -ctx.ballPos.z).normalize();
  const target = effectiveAimTargetForIntent(intent, recipe);
  let azimuthDeg = target
    ? THREE.MathUtils.radToDeg(Math.atan2(target.x - ctx.ballPos.x, ctx.ballPos.z))
    : intent.aimAzimuthDeg;
  let elevationDeg = initialElevationGuess(intent, recipe, target ?? undefined);

  if (!target) {
    return {
      direction: directionFromAzimuthAndElevation(baseDirectionToGoal, azimuthDeg, elevationDeg),
      elevationDeg,
      effectiveAimTarget: null,
    };
  }

  const distance = Math.max(
    8,
    ctx.ballPos.distanceTo(new THREE.Vector3(target.x, ctx.ballPos.y, 0)),
  );

  for (let i = 0; i < 8; i++) {
    const direction = directionFromAzimuthAndElevation(baseDirectionToGoal, azimuthDeg, elevationDeg);
    const trace = traceTrajectory(
      { pos: ctx.ballPos.clone(), vel: direction.clone().multiplyScalar(solveSpeed), spin: spin.clone() },
      {
        dragCd: recipe.dragCd,
        magnusScale: recipe.magnusScale,
        stop: (s) => s.pos.z <= -1 || s.pos.y < -0.2,
      },
    );
    const cross = sampleGoalPlane(trace.samples);
    if (!cross) break;

    const errorX = target.x - cross.x;
    const errorY = target.y - cross.y;
    azimuthDeg += THREE.MathUtils.radToDeg(Math.atan2(errorX, distance)) * 0.92;
    elevationDeg += errorY * (intent.shotType === 'driven_low' ? 0.72 : 1.95);
    elevationDeg = THREE.MathUtils.clamp(elevationDeg, recipe.minAngleDeg, recipe.maxAngleDeg);

    if (Math.abs(errorX) < 0.03 && Math.abs(errorY) < 0.03) break;
  }

  return {
    direction: directionFromAzimuthAndElevation(baseDirectionToGoal, azimuthDeg, elevationDeg),
    elevationDeg,
    effectiveAimTarget: target,
  };
}

export function contactToSpin(
  intentOrContact: ShotIntent | { x: number; y: number },
  kicker: Kicker,
  shotType?: ShotType,
): THREE.Vector3 {
  const intent: ShotIntent =
    'powerBars' in intentOrContact
      ? intentOrContact
      : {
          aimAzimuthDeg: 0,
          contactX: intentOrContact.x,
          contactY: intentOrContact.y,
          powerBars: 2.75,
          shotType: shotType ?? detectShotType(intentOrContact, 2.75, kicker),
          foot: kicker.foot === 'L' ? 'left' : 'right',
        };
  const recipe = recipeForIntent(intent);
  const curveScale = kicker.cur / 100;
  const knuckleScale = kicker.knu / 100;
  const sideMag =
    recipe.sideSpin *
    THREE.MathUtils.clamp(0.04 + Math.pow(Math.abs(intent.contactX), 0.85) * 1.7, 0, 1.55) *
    (intent.shotType === 'knuckle' ? knuckleScale : curveScale);
  const topMag =
    Math.abs(recipe.topSpin) *
    THREE.MathUtils.clamp(0.18 + Math.abs(intent.contactY) * 1.05, 0.18, 1.15) *
    (intent.shotType === 'knuckle' ? knuckleScale : 1);

  const sideSign = Math.sign(intent.contactX || (intent.foot === 'left' ? -1 : 1));
  const topSign = Math.sign(recipe.topSpin);

  return new THREE.Vector3(
    THREE.MathUtils.clamp(topMag * topSign, -MAX_TOPSPIN, MAX_TOPSPIN),
    THREE.MathUtils.clamp(sideMag * sideSign, -MAX_CURVE_SPIN, MAX_CURVE_SPIN),
    0,
  );
}

export function dispersionSigma(input: ShotInput, kicker: Kicker): number {
  const shotType = detectShotType(input.contact, input.power, kicker);
  const recipe = SHOT_RECIPES[shotType];
  const powerMiss = Math.max(
    0,
    Math.abs(input.power - recipe.idealPower) - recipe.idealPowerWindow,
  );
  const err = powerMiss / POWER_MISS_FULL_BARS;
  const precMult = 1 - (kicker.pre / 100) * PRE_RELIEF;
  return err * precMult * BASE_ANGLE_SIGMA * recipe.dispersionBase;
}

export interface SolveContext {
  ballPos: THREE.Vector3;
  kicker: Kicker;
  barrier?: BarrierColliderConfig;
  rng?: () => number;
}

function gaussian(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function maxHeightAndTime(samples: THREE.Vector3[], dt: number): { maxHeight: number; timeToGoal: number | null } {
  let maxHeight = 0;
  let timeToGoal: number | null = null;
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i]!;
    if (sample.y > maxHeight) maxHeight = sample.y;
    if (timeToGoal == null && sample.z <= 0) timeToGoal = i * dt;
  }
  return { maxHeight, timeToGoal };
}

function predictOutcome(
  state: BallState,
  recipe: ShotRecipe,
  barrier?: BarrierColliderConfig,
): Pick<ShotDebugInfo, 'arcCross' | 'estimatedResult' | 'barrierHeight' | 'maxHeight' | 'timeToGoal'> {
  const trace = traceTrajectory(state, {
    dragCd: recipe.dragCd,
    magnusScale: recipe.magnusScale,
    groundBounceScale: recipe.groundBounceScale,
    ...(barrier ? { barrier } : {}),
    detectCollision: true,
    stop: (s) => s.pos.z <= -3 || s.pos.y < -0.1,
  });
  const barrierZ =
    barrier && barrier.players.length > 0
      ? barrier.players.reduce((sum, player) => sum + player.z, 0) / barrier.players.length
      : 9.15;
  const barrierTrace = traceTrajectory(state, {
    dragCd: recipe.dragCd,
    magnusScale: recipe.magnusScale,
    groundBounceScale: recipe.groundBounceScale,
    stop: (s) => s.pos.z <= barrierZ || s.pos.y < -0.1,
  });
  const { maxHeight, timeToGoal } = maxHeightAndTime(
    trace.samples,
    trace.time / Math.max(1, trace.samples.length - 1),
  );
  return {
    arcCross: trace.cross ? { x: trace.cross.x, y: trace.cross.y } : { x: trace.final.pos.x, y: trace.final.pos.y },
    estimatedResult: trace.event ?? 'OUT',
    barrierHeight: trace.event === 'WALL' && trace.cross ? trace.cross.y : barrierTrace.final.pos.y,
    maxHeight,
    timeToGoal,
  };
}

export function solveShotIntent(
  intent: ShotIntent,
  ctx: SolveContext,
  options?: { applyDispersion?: boolean },
): ShotLaunch {
  const recipe = recipeForIntent(intent);
  const speed = speedForPower(intent.powerBars);
  const solveSpeed = speedForPower(recipe.idealPower);
  const spin = contactToSpin(intent, ctx.kicker);
  const solved = solveLaunchVectorForIntent(intent, ctx, solveSpeed, recipe, spin);
  const sigma = dispersionSigma(
    {
      aim: intent.aimTarget ?? { x: 0, y: 1.35 },
      contact: { x: intent.contactX, y: intent.contactY },
      power: intent.powerBars,
    },
    ctx.kicker,
  );

  const launch: ShotLaunch = {
    velocity: solved.direction.multiplyScalar(speed),
    spin,
    dragCd: recipe.dragCd,
    magnusScale: recipe.magnusScale,
    groundBounceScale: recipe.groundBounceScale,
    shotType: intent.shotType,
    perfectPower: isPerfectPower(intent.powerBars, { x: intent.contactX, y: intent.contactY }, ctx.kicker),
    debug: {
      aimAzimuthDeg: intent.aimAzimuthDeg,
      contactX: intent.contactX,
      contactY: intent.contactY,
      shotType: intent.shotType,
      powerBars: intent.powerBars,
      aimTarget: intent.aimTarget ? { ...intent.aimTarget } : null,
      effectiveAimTarget: solved.effectiveAimTarget ? { ...solved.effectiveAimTarget } : null,
      initialSpeed: speed,
      launchAngleDeg: solved.elevationDeg,
      spin: spin.clone(),
      dragCd: recipe.dragCd,
      magnusScale: recipe.magnusScale,
      sigma,
      arcCross: null,
      estimatedResult: 'PENDING',
      barrierHeight: null,
      maxHeight: 0,
      timeToGoal: null,
    },
  };

  if (options?.applyDispersion !== false && sigma > 0) {
    const rng = ctx.rng ?? Math.random;
    const dir = launch.velocity.clone().normalize();
    dir.applyAxisAngle(UP, gaussian(rng) * sigma);
    const lateral = new THREE.Vector3().crossVectors(dir, UP).normalize();
    dir.applyAxisAngle(lateral, gaussian(rng) * sigma * 0.75);
    const speedNoisy = speed * (1 + gaussian(rng) * sigma * SPEED_WOBBLE);
    launch.velocity.copy(dir.multiplyScalar(speedNoisy));
    launch.spin.x += gaussian(rng) * sigma * SPIN_WOBBLE;
    launch.spin.y += gaussian(rng) * sigma * SPIN_WOBBLE;
    launch.debug.initialSpeed = speedNoisy;
  }

  const predicted = predictOutcome(launchToBallState(ctx.ballPos, launch), recipe, ctx.barrier);
  launch.debug.arcCross = predicted.arcCross;
  launch.debug.estimatedResult = predicted.estimatedResult;
  launch.debug.barrierHeight = predicted.barrierHeight;
  launch.debug.maxHeight = predicted.maxHeight;
  launch.debug.timeToGoal = predicted.timeToGoal;
  return launch;
}

export function launchToBallState(ballPos: THREE.Vector3, launch: ShotLaunch): BallState {
  return {
    pos: ballPos.clone(),
    vel: launch.velocity.clone(),
    spin: launch.spin.clone(),
  };
}

export function buildInitialState(input: ShotInput, ctx: SolveContext): BallState {
  return launchToBallState(
    ctx.ballPos,
    solveShotIntent(shotIntentFromInput(input, ctx), ctx, { applyDispersion: false }),
  );
}

export function solveShot(input: ShotInput, ctx: SolveContext): BallState {
  return launchToBallState(ctx.ballPos, solveShotIntent(shotIntentFromInput(input, ctx), ctx));
}

export function solveLaunchDirection(
  ballPos: THREE.Vector3,
  aim: { x: number; y: number },
  speed: number,
): THREE.Vector3 {
  const intent: ShotIntent = {
    aimAzimuthDeg: THREE.MathUtils.radToDeg(Math.atan2(aim.x - ballPos.x, ballPos.z)),
    contactX: 0,
    contactY: 0,
    powerBars: THREE.MathUtils.clamp((speed - 12) / 5.35, 1, 5),
    shotType: 'natural',
    foot: 'right',
    aimTarget: { x: aim.x, y: aim.y },
  };
  const solved = solveLaunchVectorForIntent(
    intent,
    {
      ballPos,
      kicker: TRAINING_RIGHT_FOOT,
    },
    speed,
    SHOT_RECIPES.natural,
    new THREE.Vector3(),
  );
  return solved.direction;
}
