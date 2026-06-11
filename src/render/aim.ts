import * as THREE from 'three';
import {
  traceTrajectory,
  DEFAULT_DRAG_CD,
  type BallState,
} from '@/core/ballistics';
import { speedForPower } from '@/core/physics';

/**
 * Ayudas visuales del apuntado — tarea 1.6.
 * - Retícula sobre el plano del arco en el punto objetivo.
 * - Línea de trayectoria PARCIAL: su longitud es la fracción `line` del
 *   pateador (jugadores expertos ven más línea = más fácil apuntar).
 *
 * La previsualización usa un tiro nominal (potencia media, sin spin): es una
 * guía de dirección/altura, no el vuelo real (que depende de contacto/timing).
 */
const PREVIEW_POWER = 3;

export class AimVisuals {
  readonly reticle: THREE.Group;
  readonly line: THREE.Line;
  private lineGeom: THREE.BufferGeometry;

  constructor(scene: THREE.Scene) {
    this.reticle = makeReticle();
    this.lineGeom = new THREE.BufferGeometry();
    this.line = new THREE.Line(
      this.lineGeom,
      new THREE.LineDashedMaterial({
        color: 0x4fd1ff,
        dashSize: 0.4,
        gapSize: 0.25,
        transparent: true,
        opacity: 0.9,
      }),
    );
    scene.add(this.reticle, this.line);
  }

  setVisible(v: boolean): void {
    this.reticle.visible = v;
    this.line.visible = v;
  }

  /**
   * Actualiza retícula y línea.
   * @param ballPos posición actual del balón
   * @param aim punto objetivo sobre el plano del arco (z=0)
   * @param lineFraction fracción [0..1] del vuelo a mostrar (stat LÍNEA)
   */
  update(
    ballPos: THREE.Vector3,
    aim: { x: number; y: number },
    lineFraction: number,
  ): void {
    this.reticle.position.set(aim.x, aim.y, 0.02);

    const target = new THREE.Vector3(aim.x, aim.y, 0);
    const dir = target.clone().sub(ballPos).normalize();
    const initial: BallState = {
      pos: ballPos.clone(),
      vel: dir.multiplyScalar(speedForPower(PREVIEW_POWER)),
      spin: new THREE.Vector3(0, 0, 0),
    };
    const { samples } = traceTrajectory(initial, {
      dragCd: DEFAULT_DRAG_CD,
      stop: (s) => s.pos.z <= 0,
    });

    const count = Math.max(2, Math.floor(samples.length * lineFraction));
    const pts = samples.slice(0, count);
    this.lineGeom.setFromPoints(pts);
    this.line.computeLineDistances(); // necesario para el material dashed
  }
}

function makeReticle(): THREE.Group {
  const g = new THREE.Group();
  const ringGeo = new THREE.RingGeometry(0.22, 0.3, 24);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x4fd1ff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.95,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  const dotGeo = new THREE.CircleGeometry(0.05, 16);
  const dot = new THREE.Mesh(dotGeo, ringMat);
  g.add(ring, dot);
  return g;
}
