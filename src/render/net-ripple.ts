import * as THREE from 'three';
import { GOAL_DEPTH } from '@/core/field';

/**
 * Ondulación de la red al gol — tarea 1.9c.4. Desplaza los vértices del fondo
 * de la red (z ≈ -GOAL_DEPTH) hacia atrás con una onda amortiguada centrada en
 * el punto de impacto, y los restaura. Desplazamiento simple de vértices.
 */
const DURATION = 0.55; // s
const AMPLITUDE = 0.28; // m
const FALLOFF = 1.6; // m, radio de influencia del impacto

export class NetRipple {
  private base: Float32Array;
  private attr: THREE.BufferAttribute;
  private active = false;
  private t = 0;
  private impact = new THREE.Vector2();

  constructor(net: THREE.LineSegments) {
    this.base = net.userData.basePositions as Float32Array;
    this.attr = net.geometry.getAttribute('position') as THREE.BufferAttribute;
  }

  trigger(x: number, y: number): void {
    this.active = true;
    this.t = 0;
    this.impact.set(x, y);
  }

  update(dt: number): void {
    if (!this.active) return;
    this.t += dt;
    const arr = this.attr.array as Float32Array;
    const decay = Math.exp(-this.t / 0.18) * Math.max(0, 1 - this.t / DURATION);

    for (let i = 0; i < this.base.length; i += 3) {
      const bz = this.base[i + 2]!;
      // Solo el fondo de la red.
      if (bz > -GOAL_DEPTH + 0.05) {
        arr[i + 2] = bz;
        continue;
      }
      const dx = this.base[i]! - this.impact.x;
      const dy = this.base[i + 1]! - this.impact.y;
      const d = Math.hypot(dx, dy);
      const influence = Math.exp(-(d * d) / (FALLOFF * FALLOFF));
      const wave = Math.sin(this.t * 38 - d * 3);
      arr[i + 2] = bz - AMPLITUDE * influence * wave * decay;
    }
    this.attr.needsUpdate = true;

    if (this.t >= DURATION) {
      arr.set(this.base);
      this.attr.needsUpdate = true;
      this.active = false;
    }
  }
}
