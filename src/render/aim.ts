import * as THREE from 'three';
import { traceTrajectory, DEFAULT_DRAG_CD } from '@/core/ballistics';
import { buildInitialState, dispersionSigma } from '@/game/shot-solver';
import type { Kicker } from '@/game/kicker';
import type { ShotInput } from '@/game/shot-machine';

/**
 * Ayudas visuales del apuntado — tarea 1.6, revertidas al modelo de RETÍCULA
 * en 1.9c.1.
 *
 * - **Retícula circular** (anillo verde) sobre el plano del arco (z=0) en el
 *   punto apuntado. Su radio crece con la dispersión esperada del tiro.
 * - **Línea de proyección** (verde, punteada) que sale DEL BALÓN y muestra el
 *   primer tramo de la trayectoria REAL hacia la retícula (con la comba del
 *   contacto incluida), recortada al stat LÍNEA del pateador.
 *
 * Regla de oro (CLAUDE.md): lo que se mueve al apuntar es LA MIRA y LA LÍNEA,
 * jamás el escenario.
 */

const RETICLE_BASE_RADIUS = 0.45; // m
const RETICLE_SPREAD_K = 14; // m de radio extra por rad de sigma

export class AimVisuals {
  readonly reticle: THREE.Group;
  readonly line: THREE.Line;
  private ring: THREE.Mesh;
  private lineGeom: THREE.BufferGeometry;
  private lastKey = '';

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
    this.reticle.add(this.ring, dot);
    this.reticle.renderOrder = 10;

    this.lineGeom = new THREE.BufferGeometry();
    this.line = new THREE.Line(
      this.lineGeom,
      new THREE.LineDashedMaterial({
        color: 0x39ff88,
        dashSize: 0.35,
        gapSize: 0.2,
        transparent: true,
        opacity: 0.95,
        depthTest: false,
      }),
    );
    this.line.frustumCulled = false;
    this.line.renderOrder = 9;

    scene.add(this.reticle, this.line);
  }

  setVisible(v: boolean): void {
    this.reticle.visible = v;
    this.line.visible = v;
  }

  /**
   * Actualiza retícula y línea con el apuntado/contacto/potencia actuales.
   * @param lineFraction fracción [0..1] del vuelo a mostrar (stat LÍNEA).
   */
  update(
    ballPos: THREE.Vector3,
    input: ShotInput,
    kicker: Kicker,
    lineFraction: number,
  ): void {
    // Retícula: posición siempre (barato); radio según dispersión.
    this.reticle.position.set(input.aim.x, input.aim.y, 0.02);
    const radius = RETICLE_BASE_RADIUS + RETICLE_SPREAD_K * dispersionSigma(input, kicker);
    const s = radius / RETICLE_BASE_RADIUS;
    this.ring.scale.set(s, s, 1);

    // Línea: recalcular solo si cambió algo (la bisección es cara).
    const key = `${input.aim.x.toFixed(2)}|${input.aim.y.toFixed(2)}|${input.contact.x.toFixed(2)}|${input.contact.y.toFixed(2)}|${input.power.toFixed(2)}`;
    if (key === this.lastKey) return;
    this.lastKey = key;

    const initial = buildInitialState(input, { ballPos, kicker });
    const { samples } = traceTrajectory(initial, {
      dragCd: DEFAULT_DRAG_CD,
      stop: (st) => st.pos.z <= 0,
    });
    const count = Math.max(2, Math.floor(samples.length * lineFraction));
    this.lineGeom.setFromPoints(samples.slice(0, count));
    this.line.computeLineDistances(); // necesario para el material dashed
  }
}

function makeRingGeometry(radius: number): THREE.RingGeometry {
  return new THREE.RingGeometry(radius * 0.82, radius, 40);
}
