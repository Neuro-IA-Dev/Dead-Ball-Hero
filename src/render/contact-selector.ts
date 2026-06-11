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

/** Semieje del rombo ≈ 2.5× el radio del balón. */
const SIZE = 2.5 * BALL_RADIUS;
const TILT = -Math.PI / 5; // inclinación del billboard (~36°)
const GREEN = 0x39ff88;

function clampDiamond(x: number, y: number): { x: number; y: number } {
  const cx = Math.max(-1, Math.min(1, x));
  const cy = Math.max(-1, Math.min(1, y));
  const m = Math.abs(cx) + Math.abs(cy);
  if (m <= 1) return { x: cx, y: cy };
  return { x: cx / m, y: cy / m };
}

export class ContactSelector {
  readonly group: THREE.Group;
  private dot: THREE.Mesh;
  private cross: THREE.Group;
  private ball: THREE.Object3D;

  constructor(scene: THREE.Scene, ball: THREE.Object3D) {
    this.ball = ball;
    this.group = new THREE.Group();
    this.group.add(makeGrid(), makeDiamond());

    this.dot = new THREE.Mesh(
      new THREE.CircleGeometry(0.04, 20),
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
    const c = clampDiamond(x, y);
    this.dot.position.set(c.x * SIZE, c.y * SIZE, 0.012);
    this.cross.position.set(c.x * SIZE, c.y * SIZE, 0.014);
  }

  /** Re-ancla al centro del balón y orienta el billboard (cada frame). */
  update(camera: THREE.Camera): void {
    this.ball.getWorldPosition(this.group.position);
    this.group.quaternion.copy(camera.quaternion);
    this.group.rotateX(TILT);
  }

  /** Centro del selector en el mundo (= centro del balón). Para QA de centrado. */
  getCenterWorld(target: THREE.Vector3): THREE.Vector3 {
    return target.copy(this.group.position);
  }
}

function makeGrid(): THREE.LineSegments {
  const pts: number[] = [];
  const n = 5;
  for (let i = 0; i < n; i++) {
    const t = -SIZE + (2 * SIZE * i) / (n - 1);
    pts.push(-SIZE, t, 0, SIZE, t, 0);
    pts.push(t, -SIZE, 0, t, SIZE, 0);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const ls = new THREE.LineSegments(
    geo,
    new THREE.LineBasicMaterial({
      color: GREEN,
      transparent: true,
      opacity: 0.3,
      depthTest: false,
    }),
  );
  ls.renderOrder = 11;
  return ls;
}

function makeDiamond(): THREE.LineLoop {
  const pts = [SIZE, 0, 0, 0, SIZE, 0, -SIZE, 0, 0, 0, -SIZE, 0];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const loop = new THREE.LineLoop(
    geo,
    new THREE.LineBasicMaterial({
      color: GREEN,
      transparent: true,
      opacity: 0.85,
      depthTest: false,
    }),
  );
  loop.renderOrder = 11;
  return loop;
}

function makeCross(): THREE.Group {
  const g = new THREE.Group();
  const s = 0.035;
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
