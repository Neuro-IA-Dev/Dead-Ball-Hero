import * as THREE from 'three';
import { BALL_RADIUS } from '@/core/field';

/**
 * Selector de contacto EN EL MUNDO 3D — tarea 1.9b.3, recuadrado en 1.9c.3.
 * Grupo Three.js anclado al CENTRO del balón (su origen = centro del balón, de
 * modo que el contacto (0,0) coincide en pantalla con el centro del balón).
 * Billboard hacia la cámara con leve inclinación. Grilla romboidal verde +
 * punto rojo + cruz. La etiqueta del tipo de golpe es HTML (HUD), aparte.
 *
 * Coordenadas de contacto: [-1,1] por eje, limitadas al rombo (|x|+|y| ≤ 1).
 */

/** Semieje del overlay ≈ 1.55× el radio del balón para que se sienta "sobre" él. */
const SIZE = 0.48 * BALL_RADIUS;
const SURFACE_DEPTH = BALL_RADIUS * 0.98;
const FRONT_OFFSET = BALL_RADIUS * 0.16;
const TILT = 0;
const GREEN = 0x39ff88;

function clampContact(x: number, y: number): { x: number; y: number } {
  const cx = Math.max(-1, Math.min(1, x));
  const cy = Math.max(-1, Math.min(1, y));
  const len = Math.hypot(cx, cy);
  if (len <= 1) return { x: cx, y: cy };
  return { x: cx / len, y: cy / len };
}

export class ContactSelector {
  readonly group: THREE.Group;
  private dot: THREE.Mesh;
  private cross: THREE.Group;
  private ball: THREE.Object3D;

  constructor(scene: THREE.Scene, ball: THREE.Object3D) {
    this.ball = ball;
    this.group = new THREE.Group();
    this.group.add(makeHalo(), makeSeams());

    this.dot = new THREE.Mesh(
      new THREE.CircleGeometry(0.026, 20),
      new THREE.MeshBasicMaterial({ color: 0xff3b3b, depthTest: false }),
    );
    this.dot.renderOrder = 12;
    this.cross = makeCross();
    this.group.add(this.dot, this.cross);

    scene.add(this.group);
    this.setContact(0, 0);
    this.setVisible(false);
  }

  setVisible(v: boolean): void {
    this.group.visible = v;
  }

  setContact(x: number, y: number): void {
    const c = clampContact(x, y);
    const sx = c.x * SIZE;
    const sy = c.y * SIZE;
    const radial = Math.min(1, (sx * sx + sy * sy) / (BALL_RADIUS * BALL_RADIUS));
    const surfaceZ = Math.sqrt(Math.max(0, 1 - radial));
    this.dot.position.set(sx, sy, surfaceZ * SURFACE_DEPTH);
    this.cross.position.set(sx, sy, surfaceZ * SURFACE_DEPTH + 0.01);
  }

  /** Re-ancla al centro del balón y orienta el billboard (cada frame). */
  update(camera: THREE.Camera): void {
    this.ball.getWorldPosition(this.group.position);
    const camDir = camera.getWorldDirection(new THREE.Vector3()).normalize();
    this.group.position.addScaledVector(camDir, -FRONT_OFFSET);
    this.group.quaternion.copy(camera.quaternion);
    this.group.rotateX(TILT);
  }

  /** Centro del selector en el mundo (= centro del balón). Para QA de centrado. */
  getCenterWorld(target: THREE.Vector3): THREE.Vector3 {
    return target.copy(this.group.position);
  }
}

function makeHalo(): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.CircleGeometry(SIZE * 0.96, 24),
    new THREE.MeshBasicMaterial({
      color: GREEN,
      transparent: true,
      opacity: 0.025,
      depthTest: false,
    }),
  );
}

function makeSeams(): THREE.LineSegments {
  const pts: number[] = [];
  const n = 3;
  for (let i = 1; i < n; i++) {
    const t = -SIZE + (2 * SIZE * i) / n;
    const chord = Math.sqrt(Math.max(0, SIZE * SIZE - t * t));
    pts.push(-chord, t, 0, chord, t, 0);
    pts.push(t, -chord, 0, t, chord, 0);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const ls = new THREE.LineSegments(
    geo,
    new THREE.LineBasicMaterial({
      color: GREEN,
      transparent: true,
      opacity: 0.1,
      depthTest: false,
    }),
  );
  ls.renderOrder = 11;
  return ls;
}

function makeCross(): THREE.Group {
  const g = new THREE.Group();
  const s = 0.018;
  const pts = [-s, 0, 0, s, 0, 0, 0, -s, 0, 0, s, 0];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const ls = new THREE.LineSegments(
    geo,
    new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false }),
  );
  ls.renderOrder = 13;
  g.add(ls);
  return g;
}
