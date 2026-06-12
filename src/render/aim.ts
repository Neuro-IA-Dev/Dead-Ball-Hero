import * as THREE from 'three';
import type { BarrierColliderConfig } from '@/core/collisions';
import { dispersionSigma } from '@/game/shot-solver';
import { TrajectoryPreview, type TrajectoryPreviewMode } from '@/render/trajectory-preview';
import type { Kicker } from '@/game/kicker';
import type { ShotInput } from '@/game/shot-machine';

const RETICLE_BASE_RADIUS = 0.34;
const RETICLE_SPREAD_K = 8;

export class AimVisuals {
  readonly reticle: THREE.Group;
  readonly preview: TrajectoryPreview;
  private ring: THREE.Mesh;
  private lineEnabled = true;

  constructor(scene: THREE.Scene) {
    this.reticle = new THREE.Group();
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x39ff88,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthTest: false,
    });
    this.ring = new THREE.Mesh(makeRingGeometry(RETICLE_BASE_RADIUS), ringMat);
    const dot = new THREE.Mesh(
      new THREE.CircleGeometry(0.06, 16),
      new THREE.MeshBasicMaterial({ color: 0x39ff88, depthTest: false }),
    );
    this.reticle.add(this.ring, dot, makeReticleCross());
    this.reticle.renderOrder = 10;
    scene.add(this.reticle);

    this.preview = new TrajectoryPreview(scene);
    this.reticle.visible = false;
  }

  setVisible(v: boolean): void {
    this.reticle.visible = v;
    this.preview.setVisible(v && this.lineEnabled);
  }

  setLineEnabled(enabled: boolean): void {
    this.lineEnabled = enabled;
    this.preview.setVisible(enabled);
  }

  update(
    ballPos: THREE.Vector3,
    input: ShotInput,
    kicker: Kicker,
    lineFraction: number,
    previewMode: TrajectoryPreviewMode,
    barrier?: BarrierColliderConfig,
  ): void {
    this.reticle.position.set(input.aim.x, input.aim.y, 0.02);
    const sigmaInput =
      previewMode === 'aim_only'
        ? { ...input, power: Math.max(input.power, 3) }
        : input;
    const radius = RETICLE_BASE_RADIUS + RETICLE_SPREAD_K * dispersionSigma(sigmaInput, kicker);
    const s = radius / RETICLE_BASE_RADIUS;
    this.ring.scale.set(s, s, 1);
    if (this.lineEnabled) {
      this.preview.update(ballPos, input, kicker, lineFraction, previewMode, barrier);
    }
  }
}

function makeRingGeometry(radius: number): THREE.RingGeometry {
  return new THREE.RingGeometry(radius * 0.82, radius, 40);
}

function makeReticleCross(): THREE.LineSegments {
  const s = 0.11;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [-s, 0, 0, s, 0, 0, 0, -s, 0, 0, s, 0],
      3,
    ),
  );
  const lines = new THREE.LineSegments(
    geo,
    new THREE.LineBasicMaterial({ color: 0x39ff88, depthTest: false }),
  );
  lines.renderOrder = 10;
  return lines;
}
