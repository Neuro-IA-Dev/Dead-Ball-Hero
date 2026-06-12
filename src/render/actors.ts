import * as THREE from 'three';
import type { ShotPhase } from '@/game/shot-machine';
import type { Kicker } from '@/game/kicker';
import { BALL_RADIUS, GOAL_HEIGHT } from '@/core/field';

const UP = new THREE.Vector3(0, 1, 0);

function easeInQuad(t: number): number {
  return t * t;
}

function smoothstep(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

export class KickerActor {
  readonly group = new THREE.Group();
  private readonly hips = new THREE.Group();
  private readonly kickLeg = new THREE.Mesh();
  private readonly plantLeg = new THREE.Mesh();
  private readonly leftArm = new THREE.Mesh();
  private readonly rightArm = new THREE.Mesh();
  private readonly kitMat: THREE.MeshStandardMaterial;

  /** Pose de espera (varios pasos detrás del balón) y de plantado (al contacto). */
  private readonly standPos = new THREE.Vector3();
  private readonly plantPos = new THREE.Vector3();
  private side = -1;

  constructor(scene: THREE.Scene) {
    this.kitMat = new THREE.MeshStandardMaterial({
      color: 0xf2d84a,
      roughness: 0.82,
      metalness: 0,
    });
    this.build();
    scene.add(this.group);
  }

  setKicker(kicker: Kicker, ballPos: THREE.Vector3): void {
    const toGoal = new THREE.Vector3(-ballPos.x, 0, -ballPos.z).normalize();
    const back = toGoal.clone().multiplyScalar(-1);
    const right = new THREE.Vector3().crossVectors(toGoal, UP).normalize();
    this.side = kicker.foot === 'R' ? -1 : 1;

    // Espera: ~2.8 m detrás y al costado del pie hábil (aproximación diagonal).
    this.standPos
      .copy(ballPos)
      .addScaledVector(back, 2.8)
      .addScaledVector(right, 1.05 * this.side);
    this.standPos.y = 0;
    // Plantado al contacto: junto al balón, pie de apoyo a un lado.
    this.plantPos
      .copy(ballPos)
      .addScaledVector(back, 0.5)
      .addScaledVector(right, 0.34 * this.side);
    this.plantPos.y = 0;

    this.group.position.copy(this.standPos);
    this.group.lookAt(ballPos.x, BALL_RADIUS, ballPos.z);
    this.kitMat.color.set(kicker.foot === 'R' ? 0xf2d84a : 0x7fd7ff);

    this.kickLeg.position.x = 0.07 * this.side;
    this.plantLeg.position.x = -0.08 * this.side;
    this.resetPose();
  }

  private resetPose(): void {
    this.group.position.copy(this.standPos);
    this.hips.rotation.x = 0;
    this.kickLeg.rotation.x = 0;
    this.plantLeg.rotation.x = 0;
    this.leftArm.rotation.x = 0;
    this.rightArm.rotation.x = 0;
  }

  update(phase: ShotPhase, runupProgress: number): void {
    switch (phase) {
      case 'RUNUP':
        this.animateRunup(runupProgress);
        break;
      case 'FLIGHT':
      case 'RESULT':
        // Plantado con la pierna en el follow-through.
        this.group.position.copy(this.plantPos);
        this.hips.rotation.x = 0.06;
        this.kickLeg.rotation.x = -1.15;
        this.plantLeg.rotation.x = 0.18;
        this.leftArm.rotation.x = 0.5;
        this.rightArm.rotation.x = -0.5;
        break;
      default:
        // AIMING / CONTACT / POWERING: espera con leve balanceo de peso.
        this.group.position.copy(this.standPos);
        this.hips.rotation.x = 0;
        this.kickLeg.rotation.x = 0;
        this.plantLeg.rotation.x = 0;
        this.leftArm.rotation.x = 0;
        this.rightArm.rotation.x = 0;
        break;
    }
  }

  /** Carrera: traslada de standPos→plantPos acelerando + zancadas + golpe. */
  private animateRunup(p: number): void {
    // Traslación con aceleración (arranca lento, llega rápido).
    this.group.position.lerpVectors(this.standPos, this.plantPos, easeInQuad(p));

    const RUN_END = 0.62; // hasta aquí corre; luego planta y patea
    if (p < RUN_END) {
      // Zancadas: piernas y brazos en oposición + bobbing del torso.
      const stride = (p / RUN_END) * Math.PI * 3;
      const s = Math.sin(stride);
      this.kickLeg.rotation.x = 0.7 * s;
      this.plantLeg.rotation.x = -0.7 * s;
      this.leftArm.rotation.x = -0.6 * s;
      this.rightArm.rotation.x = 0.6 * s;
      this.hips.rotation.x = -0.05;
      this.group.position.y = Math.abs(Math.sin(stride)) * 0.05;
    } else {
      // Windup + swing: la pierna se carga atrás y barre hasta el contacto (p→1).
      const q = (p - RUN_END) / (1 - RUN_END); // 0..1
      this.group.position.y = 0;
      // Cargada atrás (rotación +) en el primer tercio, barrido a follow-through (−).
      const swing = q < 0.32 ? 0.95 * (q / 0.32) : THREE.MathUtils.lerp(0.95, -1.3, (q - 0.32) / 0.68);
      this.kickLeg.rotation.x = swing;
      this.plantLeg.rotation.x = 0.12 - smoothstep(q) * 0.06;
      this.hips.rotation.x = 0.05 - swing * 0.08;
      this.leftArm.rotation.x = 0.4 * smoothstep(q);
      this.rightArm.rotation.x = -0.4 * smoothstep(q);
    }
  }

  private build(): void {
    const skin = new THREE.MeshStandardMaterial({ color: 0xc48a5a, roughness: 0.86 });
    const shorts = new THREE.MeshStandardMaterial({ color: 0x11141a, roughness: 0.8 });
    const socks = new THREE.MeshStandardMaterial({ color: 0xf5f1dc, roughness: 0.8 });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.46, 0.16), this.kitMat);
    torso.position.y = 0.86;
    torso.castShadow = true;

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 18, 14), skin);
    head.position.y = 1.18;
    head.castShadow = true;

    const hip = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.15), shorts);
    hip.position.y = 0.57;
    this.hips.add(hip);

    const legGeo = new THREE.CylinderGeometry(0.035, 0.045, 0.48, 10);
    this.kickLeg.geometry = legGeo;
    this.kickLeg.material = socks;
    this.kickLeg.position.set(0.08, 0.32, 0);
    this.kickLeg.castShadow = true;
    this.plantLeg.geometry = legGeo.clone();
    this.plantLeg.material = socks;
    this.plantLeg.position.set(-0.08, 0.32, 0);
    this.plantLeg.castShadow = true;

    const armGeo = new THREE.CylinderGeometry(0.026, 0.032, 0.42, 10);
    this.leftArm.geometry = armGeo;
    this.leftArm.material = skin;
    this.leftArm.position.set(-0.2, 0.82, 0);
    this.leftArm.rotation.z = -0.35;
    this.rightArm.geometry = armGeo.clone();
    this.rightArm.material = skin;
    this.rightArm.position.set(0.2, 0.82, 0);
    this.rightArm.rotation.z = 0.35;

    this.group.add(
      torso,
      head,
      this.hips,
      this.kickLeg,
      this.plantLeg,
      this.leftArm,
      this.rightArm,
    );
  }
}

export class GoalkeeperActor {
  readonly group = new THREE.Group();
  private readonly leftArm: THREE.Mesh;
  private readonly rightArm: THREE.Mesh;
  private targetX = 0;

  constructor(scene: THREE.Scene) {
    const kit = new THREE.MeshStandardMaterial({ color: 0xffd84f, roughness: 0.78 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x12151b, roughness: 0.84 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xb9784c, roughness: 0.86 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.62, 0.16), kit);
    body.position.y = 0.78;
    body.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), skin);
    head.position.y = 1.19;
    head.castShadow = true;

    const armGeo = new THREE.CylinderGeometry(0.028, 0.034, 0.7, 10);
    this.leftArm = new THREE.Mesh(armGeo, kit);
    this.leftArm.position.set(-0.34, 0.84, 0);
    this.leftArm.rotation.z = -0.95;
    this.rightArm = this.leftArm.clone();
    this.rightArm.position.x = 0.34;
    this.rightArm.rotation.z = 0.95;

    const legGeo = new THREE.CylinderGeometry(0.04, 0.05, 0.55, 10);
    const leftLeg = new THREE.Mesh(legGeo, dark);
    leftLeg.position.set(-0.08, 0.3, 0);
    const rightLeg = leftLeg.clone();
    rightLeg.position.x = 0.08;

    this.group.position.set(0, 0, -0.18);
    this.group.add(body, head, this.leftArm, this.rightArm, leftLeg, rightLeg);
    scene.add(this.group);
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  reset(): void {
    this.targetX = 0;
    this.group.position.set(0, 0, -0.18);
    this.leftArm.position.y = 0.84;
    this.rightArm.position.y = 0.84;
    this.leftArm.rotation.z = -0.95;
    this.rightArm.rotation.z = 0.95;
  }

  trackCross(cross: { x: number; y: number } | null | undefined): void {
    this.targetX = THREE.MathUtils.clamp(cross?.x ?? 0, -1.25, 1.25);
  }

  diveTo(cross: { x: number; y: number }): void {
    this.targetX = THREE.MathUtils.clamp(cross.x, -1.55, 1.55);
    const high = cross.y > GOAL_HEIGHT * 0.52;
    this.leftArm.rotation.z = this.targetX < 0 ? -1.55 : -0.65;
    this.rightArm.rotation.z = this.targetX > 0 ? 1.55 : 0.65;
    this.leftArm.position.y = high ? 1.06 : 0.82;
    this.rightArm.position.y = high ? 1.06 : 0.82;
  }

  update(dt: number): void {
    const alpha = 1 - Math.exp(-dt / 0.18);
    this.group.position.x += (this.targetX - this.group.position.x) * alpha;
  }
}
