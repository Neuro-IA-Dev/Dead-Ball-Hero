import * as THREE from 'three';
import type { BarrierColliderConfig } from '@/core/collisions';

const JUMP_DURATION_MS = 650;
const JUMP_PEAK_M = 0.55;

export class BarrierActor {
  readonly group = new THREE.Group();
  private roots: THREE.Group[] = [];
  private jumpMs = 0;

  private readonly kit = new THREE.MeshStandardMaterial({
    color: 0x2b67ff,
    roughness: 0.8,
    metalness: 0,
  });
  private readonly dark = new THREE.MeshStandardMaterial({
    color: 0x11151c,
    roughness: 0.85,
    metalness: 0,
  });
  private readonly skin = new THREE.MeshStandardMaterial({
    color: 0xc98b5a,
    roughness: 0.86,
    metalness: 0,
  });
  private readonly marker = new THREE.MeshBasicMaterial({
    color: 0x9fffb8,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
  });

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
    this.group.visible = false;
  }

  setBarrier(barrier: BarrierColliderConfig | undefined, ballPos: THREE.Vector3): void {
    this.group.clear();
    this.roots = [];
    this.jumpMs = 0;
    this.group.visible = Boolean(barrier && barrier.players.length > 0);
    if (!barrier) return;

    for (const player of barrier.players) {
      const actor = this.buildPlayer(player.radius, player.height);
      actor.position.set(player.x, 0, player.z);
      actor.lookAt(ballPos.x, 0.92, ballPos.z);
      this.group.add(actor);
      this.roots.push(actor);
    }
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible && this.group.children.length > 0;
  }

  /** Dispara el salto de la barrera (sincronizado al remate). */
  jump(): void {
    this.jumpMs = JUMP_DURATION_MS;
  }

  /** Vuelve a dejar a los jugadores en el suelo. */
  settle(): void {
    this.jumpMs = 0;
    for (const r of this.roots) r.position.y = 0;
  }

  update(dt: number): void {
    if (this.jumpMs <= 0) return;
    const t = 1 - this.jumpMs / JUMP_DURATION_MS; // 0..1
    const lift = Math.sin(Math.min(1, t) * Math.PI) * JUMP_PEAK_M;
    for (const r of this.roots) r.position.y = lift;
    this.jumpMs -= dt * 1000;
    if (this.jumpMs <= 0) for (const r of this.roots) r.position.y = 0;
  }

  private buildPlayer(radius: number, height: number): THREE.Group {
    const root = new THREE.Group();
    const bodyHeight = Math.max(0.65, height * 0.46);
    const legHeight = Math.max(0.42, height * 0.32);
    const headRadius = Math.min(0.13, radius * 0.48);

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.72, radius * 0.8, bodyHeight, 10),
      this.kit,
    );
    body.position.y = legHeight + bodyHeight * 0.5;
    body.castShadow = true;

    const head = new THREE.Mesh(new THREE.SphereGeometry(headRadius, 14, 10), this.skin);
    head.position.y = Math.min(height - headRadius, legHeight + bodyHeight + headRadius * 1.2);
    head.castShadow = true;

    const legGeo = new THREE.CylinderGeometry(radius * 0.14, radius * 0.18, legHeight, 8);
    const leftLeg = new THREE.Mesh(legGeo, this.dark);
    leftLeg.position.set(-radius * 0.28, legHeight * 0.5, 0);
    const rightLeg = leftLeg.clone();
    rightLeg.position.x = radius * 0.28;

    const armGeo = new THREE.CylinderGeometry(radius * 0.11, radius * 0.13, bodyHeight * 0.86, 8);
    const leftArm = new THREE.Mesh(armGeo, this.kit);
    leftArm.position.set(-radius * 0.9, legHeight + bodyHeight * 0.48, radius * 0.05);
    leftArm.rotation.z = -0.24;
    const rightArm = leftArm.clone();
    rightArm.position.x = radius * 0.9;
    rightArm.rotation.z = 0.24;

    const footprint = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.85, radius + 0.07, 24),
      this.marker,
    );
    footprint.rotation.x = -Math.PI / 2;
    footprint.position.y = 0.012;
    footprint.renderOrder = 2;

    root.add(footprint, body, head, leftLeg, rightLeg, leftArm, rightArm);
    return root;
  }
}
