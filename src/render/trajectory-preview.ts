import * as THREE from 'three';
import { traceTrajectory } from '@/core/ballistics';
import type { BarrierColliderConfig } from '@/core/collisions';
import {
  solveShotIntent,
  shotIntentFromInput,
  launchToBallState,
  optimalPowerCenter,
  type SolveContext,
} from '@/game/shot-solver';
import { TRAINING_RIGHT_FOOT, type Kicker } from '@/game/kicker';
import type { ShotInput } from '@/game/shot-machine';

const MIN_POINTS = 4;
const MAX_POINTS = 22;
const GOAL_PLANE_Z = 0;
const PREVIEW_FALL_LIMIT = 0.3;

export type TrajectoryPreviewMode = 'aim_only' | 'shot_real';

export class TrajectoryPreview {
  private readonly scene: THREE.Scene;
  private readonly root = new THREE.Group();
  private readonly core: THREE.Mesh;
  private readonly glow: THREE.Mesh;
  private readonly coreMat: THREE.MeshBasicMaterial;
  private readonly glowMat: THREE.MeshBasicMaterial;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    this.coreMat = new THREE.MeshBasicMaterial({
      color: 0xf6ffe8,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
    });
    this.glowMat = new THREE.MeshBasicMaterial({
      color: 0xbfffcb,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    });

    this.core = new THREE.Mesh(new THREE.BufferGeometry(), this.coreMat);
    this.glow = new THREE.Mesh(new THREE.BufferGeometry(), this.glowMat);
    this.core.renderOrder = 9;
    this.glow.renderOrder = 8;
    this.root.add(this.glow, this.core);
    this.scene.add(this.root);
    this.setVisible(false);
  }

  setVisible(visible: boolean): void {
    this.root.visible = visible;
  }

  update(
    ballPos: THREE.Vector3,
    input: ShotInput,
    kicker: Kicker,
    lineFraction: number,
    mode: TrajectoryPreviewMode,
    barrier?: BarrierColliderConfig,
  ): void {
    const points =
      mode === 'aim_only'
        ? buildAimPreview(ballPos, input, kicker, barrier)
        : buildShotPreview(ballPos, input, kicker, lineFraction, barrier);
    this.setPalette(mode);

    if (points.length < 2) {
      this.setVisible(false);
      return;
    }

    this.replaceGeometry(this.core, makeTube(points, 0.028, 0.014));
    this.replaceGeometry(this.glow, makeTube(points, 0.05, 0.018));
    this.setVisible(true);
  }

  dispose(): void {
    this.scene.remove(this.root);
    this.core.geometry.dispose();
    this.glow.geometry.dispose();
  }

  private replaceGeometry(mesh: THREE.Mesh, next: THREE.BufferGeometry): void {
    mesh.geometry.dispose();
    mesh.geometry = next;
  }

  private setPalette(mode: TrajectoryPreviewMode): void {
    if (mode === 'aim_only') {
      this.coreMat.color.set(0x39ff88);
      this.glowMat.color.set(0x39ff88);
      this.coreMat.opacity = 0.82;
      this.glowMat.opacity = 0.18;
      return;
    }
    this.coreMat.color.set(0xf6ffe8);
    this.glowMat.color.set(0xbfffcb);
    this.coreMat.opacity = 0.88;
    this.glowMat.opacity = 0.22;
  }
}

function buildShotPreview(
  ballPos: THREE.Vector3,
  input: ShotInput,
  kicker: Kicker,
  lineFraction: number,
  barrier?: BarrierColliderConfig,
): THREE.Vector3[] {
  const ctx = makeSolveContext(ballPos, kicker, barrier);
  const intent = shotIntentFromInput(input, ctx);
  const launch = solveShotIntent(intent, ctx, { applyDispersion: false });
  const trace = traceTrajectory(launchToBallState(ballPos, launch), {
    dragCd: launch.dragCd,
    magnusScale: launch.magnusScale,
    groundBounceScale: launch.groundBounceScale,
    ...(barrier ? { barrier } : {}),
    detectCollision: true,
    bouncePosts: false,
    stop: (state) => state.pos.z <= -2 || state.pos.y < -0.1,
  });

  return selectPreviewSamples(trace.samples, THREE.MathUtils.clamp(lineFraction, 0.52, 0.92));
}

function buildAimPreview(
  ballPos: THREE.Vector3,
  input: ShotInput,
  kicker?: Kicker,
  barrier?: BarrierColliderConfig,
): THREE.Vector3[] {
  const resolvedKicker = kicker ?? TRAINING_RIGHT_FOOT;
  const ctx = makeSolveContext(ballPos, resolvedKicker, barrier);
  const aimingInput: ShotInput = {
    aim: input.aim,
    contact: input.contact,
    power: optimalPowerCenter(input.contact, resolvedKicker, input.power),
  };
  const launch = solveShotIntent(shotIntentFromInput(aimingInput, ctx), ctx, { applyDispersion: false });
  const trace = traceTrajectory(launchToBallState(ballPos, launch), {
    dragCd: launch.dragCd,
    magnusScale: launch.magnusScale,
    groundBounceScale: launch.groundBounceScale,
    ...(barrier ? { barrier } : {}),
    detectCollision: true,
    bouncePosts: false,
    stop: (state) => state.pos.z <= -1 || state.pos.y < -0.1,
  });
  return selectPreviewSamples(trace.samples, 0.88);
}

function makeSolveContext(
  ballPos: THREE.Vector3,
  kicker: Kicker,
  barrier?: BarrierColliderConfig,
): SolveContext {
  return barrier ? { ballPos, kicker, barrier } : { ballPos, kicker };
}

function selectPreviewSamples(samples: THREE.Vector3[], fraction: number): THREE.Vector3[] {
  if (samples.length === 0) return [];
  const maxIndex = Math.max(1, Math.floor((samples.length - 1) * fraction));
  const picked: THREE.Vector3[] = [];
  const startY = samples[0]!.y;

  for (let i = 0; i <= maxIndex; i++) {
    const sample = samples[i]!;
    picked.push(sample.clone());
    if (sample.z <= GOAL_PLANE_Z) break;
    if (i > 8 && sample.y < startY + PREVIEW_FALL_LIMIT) break;
  }

  if (picked.length <= MAX_POINTS) return picked;

  const reduced: THREE.Vector3[] = [];
  for (let i = 0; i < MAX_POINTS; i++) {
    const t = i / (MAX_POINTS - 1);
    const idx = Math.min(picked.length - 1, Math.round(t * (picked.length - 1)));
    reduced.push(picked[idx]!.clone());
  }
  return reduced;
}

function makeTube(points: THREE.Vector3[], radius: number, lift: number): THREE.BufferGeometry {
  const lifted = points.map((point, index) => {
    const bias = 1 - index / Math.max(1, points.length - 1);
    return point.clone().addScaledVector(new THREE.Vector3(0, 1, 0), lift * bias);
  });
  if (lifted.length < MIN_POINTS) {
    while (lifted.length < MIN_POINTS) lifted.push(lifted[lifted.length - 1]!.clone());
  }
  const curve = new THREE.CatmullRomCurve3(lifted, false, 'centripetal');
  return new THREE.TubeGeometry(curve, Math.max(10, lifted.length * 3), radius, 10, false);
}
