import * as THREE from 'three';

/**
 * Estela sutil del balón en vuelo — tarea 1.9c.4. Guarda las posiciones
 * recientes (≤ 0.3 s) y las dibuja como una línea que se desvanece hacia la
 * cola (color → oscuro, que se funde con el fondo). Sin asignaciones por frame
 * más allá del rebuild de la geometría.
 */
const MAX_AGE_MS = 340;
const HEAD = new THREE.Color(0xeafff2);

export class BallTrail {
  readonly line: THREE.Line;
  private geom = new THREE.BufferGeometry();
  private samples: { p: THREE.Vector3; t: number }[] = [];

  constructor(scene: THREE.Scene) {
    this.line = new THREE.Line(
      this.geom,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.line.frustumCulled = false;
    this.line.renderOrder = 8;
    this.line.visible = false;
    scene.add(this.line);
  }

  clear(): void {
    this.samples.length = 0;
    this.line.visible = false;
  }

  /** Añade la posición actual del balón y reconstruye la estela. */
  push(pos: THREE.Vector3, nowMs: number): void {
    this.samples.push({ p: pos.clone(), t: nowMs });
    while (this.samples.length && nowMs - this.samples[0]!.t > MAX_AGE_MS) {
      this.samples.shift();
    }
    if (this.samples.length < 2) {
      this.line.visible = false;
      return;
    }

    const n = this.samples.length;
    const positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const s = this.samples[i]!;
      positions[i * 3] = s.p.x;
      positions[i * 3 + 1] = s.p.y;
      positions[i * 3 + 2] = s.p.z;
      const f = i / (n - 1); // 0 cola → 1 cabeza
      colors[i * 3] = HEAD.r * f;
      colors[i * 3 + 1] = HEAD.g * f;
      colors[i * 3 + 2] = HEAD.b * f;
    }
    this.geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.line.visible = true;
  }
}
