import * as THREE from 'three';

/**
 * Selector de contacto EN EL MUNDO 3D — tarea 1.9b.3 (edición 26).
 * Anclado al balón: grilla romboidal verde semitransparente (billboard
 * inclinado ~45°), punto rojo que marca el contacto y una cruz/cursor.
 * La etiqueta de tipo de golpe es HTML (HUD), no parte de este objeto.
 *
 * Coordenadas de contacto: [-1,1] en cada eje. X = lado (interior/exterior),
 * Y = alto/bajo (picada/raso). Limitado al rombo (|x|+|y| ≤ 1).
 */

const SIZE = 0.5; // semieje del rombo en metros
const GREEN = 0x39ff88;

function clampDiamond(x: number, y: number): { x: number; y: number } {
  const cx = Math.max(-1, Math.min(1, x));
  const cy = Math.max(-1, Math.min(1, y));
  const m = Math.abs(cx) + Math.abs(cy);
  if (m <= 1) return { x: cx, y: cy };
  return { x: cx / m, y: cy / m }; // proyecta al borde del rombo
}

export class ContactSelector {
  readonly group: THREE.Group;
  private dot: THREE.Mesh;
  private cross: THREE.Group;

  constructor(scene: THREE.Scene, anchor: THREE.Vector3) {
    this.group = new THREE.Group();
    this.group.position.copy(anchor);
    this.group.add(makeGrid(), makeDiamond());

    this.dot = new THREE.Mesh(
      new THREE.CircleGeometry(0.05, 20),
      new THREE.MeshBasicMaterial({ color: 0xff3b3b }),
    );
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
    const px = c.x * SIZE;
    const py = c.y * SIZE;
    this.dot.position.set(px, py, 0.012);
    this.cross.position.set(px, py, 0.014);
  }

  /** Billboard hacia la cámara, inclinado ~45° hacia atrás (como el referente). */
  update(camera: THREE.Camera): void {
    this.group.quaternion.copy(camera.quaternion);
    this.group.rotateX(-Math.PI / 4);
  }
}

function makeGrid(): THREE.LineSegments {
  const pts: number[] = [];
  const n = 5;
  for (let i = 0; i < n; i++) {
    const tA = -SIZE + (2 * SIZE * i) / (n - 1);
    // Líneas paralelas a los lados del rombo (rotadas 45° → en ejes u±v).
    // Horizontales y verticales clipeadas por el rombo de makeDiamond().
    pts.push(-SIZE, tA, 0, SIZE, tA, 0);
    pts.push(tA, -SIZE, 0, tA, SIZE, 0);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.LineSegments(
    geo,
    new THREE.LineBasicMaterial({
      color: GREEN,
      transparent: true,
      opacity: 0.35,
      depthTest: false,
    }),
  );
}

function makeDiamond(): THREE.LineLoop {
  const pts = [SIZE, 0, 0, 0, SIZE, 0, -SIZE, 0, 0, 0, -SIZE, 0];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.LineLoop(
    geo,
    new THREE.LineBasicMaterial({
      color: GREEN,
      transparent: true,
      opacity: 0.8,
      depthTest: false,
    }),
  );
}

function makeCross(): THREE.Group {
  const g = new THREE.Group();
  const s = 0.04;
  const pts = [-s, 0, 0, s, 0, 0, 0, -s, 0, 0, s, 0];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.add(
    new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false }),
    ),
  );
  return g;
}
