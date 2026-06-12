import * as THREE from 'three';
import type { BallState } from '@/core/ballistics';
import type { ShotIntent } from '@/game/shot-model';

const UP = new THREE.Vector3(0, 1, 0);

const CAM_BACK = 5.8;
const CAM_SIDE = 0.72;
const CAM_HEIGHT = 1.05;
const CAM_LOOK_HEIGHT = 1.0;
const CAM_FOLLOW_FACTOR = 0.05;
const CAM_TAU = 0.22;
const CAM_YAW_CAP = THREE.MathUtils.degToRad(3);
const CAM_PITCH_CAP = THREE.MathUtils.degToRad(2);

export class FreeKickCameraRig {
  private basePos = new THREE.Vector3();
  private baseLook = new THREE.Vector3();
  private baseForward = new THREE.Vector3();
  private yaw = 0;
  private pitch = 0;
  private flightPos = new THREE.Vector3();
  private flightLook = new THREE.Vector3();
  private readonly baseFov: number;

  private foot: 'left' | 'right';

  constructor(
    private camera: THREE.PerspectiveCamera,
    private ballStart: THREE.Vector3,
    foot: 'left' | 'right',
  ) {
    this.foot = foot;
    this.baseFov = camera.fov;
    this.computeBasePose(foot);
    this.reset();
  }

  /** Recoloca la plataforma a una nueva posición de balón (cambio de nivel). */
  setBallStart(ballStart: THREE.Vector3): void {
    this.ballStart.copy(ballStart);
    this.computeBasePose(this.foot);
    this.reset();
  }

  reset(): void {
    this.yaw = 0;
    this.pitch = 0;
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
    this.camera.position.copy(this.basePos);
    this.camera.lookAt(this.baseLook);
  }

  setFoot(foot: 'left' | 'right'): void {
    this.foot = foot;
    this.computeBasePose(foot);
    this.reset();
  }

  updateAimingCamera(intent: ShotIntent, dt: number): void {
    const targetYaw = THREE.MathUtils.clamp(
      THREE.MathUtils.degToRad(intent.aimAzimuthDeg) * CAM_FOLLOW_FACTOR,
      -CAM_YAW_CAP,
      CAM_YAW_CAP,
    );
    const targetPitch = THREE.MathUtils.clamp(
      intent.aimTarget ? (intent.aimTarget.y - CAM_LOOK_HEIGHT) * 0.025 : 0,
      -CAM_PITCH_CAP,
      CAM_PITCH_CAP,
    );
    const alpha = 1 - Math.exp(-dt / CAM_TAU);
    this.yaw += (targetYaw - this.yaw) * alpha;
    this.pitch += (targetPitch - this.pitch) * alpha;

    const forward = this.baseForward.clone().applyAxisAngle(UP, this.yaw);
    const right = new THREE.Vector3().crossVectors(forward, UP).normalize();
    forward.applyAxisAngle(right, this.pitch);

    this.camera.position.copy(this.basePos);
    this.camera.lookAt(this.basePos.clone().add(forward));
  }

  updateFlightCamera(ballState: BallState, dt: number): void {
    const speed = ballState.vel.length();
    const velocityDir =
      speed > 1e-4 ? ballState.vel.clone().normalize() : new THREE.Vector3(0, 0, -1);
    const desiredPos = ballState.pos
      .clone()
      .addScaledVector(velocityDir, -2.8)
      .add(new THREE.Vector3(0.45, 1.0, 0));
    const desiredLook = ballState.pos
      .clone()
      .addScaledVector(velocityDir, 3.4)
      .add(new THREE.Vector3(0, 0.15, 0));

    const alpha = 1 - Math.exp(-dt / 0.16);
    this.flightPos.lerpVectors(this.camera.position, desiredPos, alpha);
    this.flightLook.lerpVectors(this.flightLook, desiredLook, alpha);
    this.camera.position.copy(this.flightPos);
    this.camera.lookAt(this.flightLook);
  }

  updateGroundFlightCamera(dt: number): void {
    const alpha = 1 - Math.exp(-dt / 0.12);
    this.camera.position.lerp(this.basePos, alpha);
    this.camera.lookAt(this.baseLook);
  }

  private computeBasePose(foot: 'left' | 'right'): void {
    const toGoal = new THREE.Vector3(-this.ballStart.x, 0, -this.ballStart.z).normalize();
    const right = new THREE.Vector3().crossVectors(toGoal, UP).normalize();
    const side = foot === 'left' ? 1 : -1;
    this.basePos
      .copy(this.ballStart)
      .addScaledVector(toGoal, -CAM_BACK)
      .addScaledVector(right, CAM_SIDE * side)
      .addScaledVector(UP, CAM_HEIGHT);
    this.baseLook.set(0, CAM_LOOK_HEIGHT, 0);
    this.baseForward.copy(this.baseLook).sub(this.basePos).normalize();
    this.flightPos.copy(this.basePos);
    this.flightLook.copy(this.baseLook);
  }
}
