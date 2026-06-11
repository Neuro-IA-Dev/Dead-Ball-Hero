import * as THREE from 'three';
import { traceTrajectory, DEFAULT_DRAG_CD } from '@/core/ballistics';
import { buildInitialState } from '@/game/shot-solver';
import type { Kicker } from '@/game/kicker';
import type { ShotInput } from '@/game/shot-machine';

/**
 * Línea de proyección del apuntado — tarea 1.6, reworkeada en 1.9b.2.
 *
 * Sale DESDE EL BALÓN y muestra el primer tramo de la trayectoria REAL (con la
 * comba y la elevación del contacto actual), recalculada en vivo. Su longitud
 * es la fracción `line` del pateador (más línea = más fácil apuntar). NO hay
 * retícula sobre el arco: el gesto correcto es alinear la línea sobre/al
 * costado de la barrera.
 */

/** Potencia nominal para previsualizar antes de cargar la barra. */
export const PREVIEW_POWER = 3;

export interface AimPreview {
  azimuth: number;
  contact: { x: number; y: number };
  power: number;
}

export class AimVisuals {
  readonly line: THREE.Line;
  private lineGeom: THREE.BufferGeometry;
  private lastKey = '';

  constructor(scene: THREE.Scene) {
    this.lineGeom = new THREE.BufferGeometry();
    this.line = new THREE.Line(
      this.lineGeom,
      new THREE.LineDashedMaterial({
        color: 0x39ff88, // verde, como en el referente
        dashSize: 0.35,
        gapSize: 0.2,
        transparent: true,
        opacity: 0.95,
      }),
    );
    this.line.frustumCulled = false;
    scene.add(this.line);
  }

  setVisible(v: boolean): void {
    this.line.visible = v;
  }

  /**
   * Recalcula la línea con el apuntado/contacto/potencia actuales.
   * @param lineFraction fracción [0..1] del vuelo a mostrar (stat LÍNEA).
   */
  update(
    ballPos: THREE.Vector3,
    preview: AimPreview,
    kicker: Kicker,
    lineFraction: number,
  ): void {
    const key = `${preview.azimuth.toFixed(3)}|${preview.contact.x.toFixed(2)}|${preview.contact.y.toFixed(2)}|${preview.power.toFixed(2)}`;
    if (key === this.lastKey) return;
    this.lastKey = key;

    const input: ShotInput = {
      aim: { azimuth: preview.azimuth },
      contact: preview.contact,
      power: preview.power,
    };
    const initial = buildInitialState(input, { ballPos, kicker });
    const { samples } = traceTrajectory(initial, {
      dragCd: DEFAULT_DRAG_CD,
      stop: (s) => s.pos.z <= 0,
    });

    const count = Math.max(2, Math.floor(samples.length * lineFraction));
    this.lineGeom.setFromPoints(samples.slice(0, count));
    this.line.computeLineDistances(); // necesario para el material dashed
  }
}
