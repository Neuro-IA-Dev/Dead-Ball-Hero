import * as THREE from 'three';
import { AimVisuals } from '@/render/aim';
import { Flight } from '@/game/flight';
import { DEFAULT_KICKER, type Kicker } from '@/game/kicker';
import { DEFAULT_DRAG_CD, type BallState } from '@/core/ballistics';
import { speedForPower } from '@/core/physics';
import { Hud } from '@/ui/hud';
import { t } from '@/core/i18n';

/**
 * Controlador de juego — orquesta apuntado, disparo y vuelo sobre la escena.
 *
 * Estado de la tarea: 1.6 (apuntado). El flujo todavía es simplificado
 * (apuntar → disparar), con un lanzamiento TEMPORAL recto. La secuencia
 * completa (contacto 1.7, potencia/timing 1.8 vía ShotMachine) y el mapeo
 * real a velocidad+spin (1.9) se integran en las siguientes tareas.
 */

type LocalPhase = 'AIM' | 'FLIGHT' | 'RESULT';

const AIM_X_LIMIT = 6; // se puede apuntar afuera del palo (para comba/trivela)
const AIM_Y_MIN = 0.15;
const AIM_Y_MAX = 3.0;
const KEY_AIM_STEP = 0.12;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export class Game {
  private aimVisuals: AimVisuals;
  private hud: Hud;
  private kicker: Kicker = DEFAULT_KICKER;

  private ballStart: THREE.Vector3;
  private aim = { x: 0, y: 1.1 };
  private phase: LocalPhase = 'AIM';
  private flight: Flight | null = null;

  private raycaster = new THREE.Raycaster();
  private goalPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  private clock = new THREE.Clock();

  constructor(
    private renderer: THREE.WebGLRenderer,
    private scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
    private ball: THREE.Mesh,
    private canvas: HTMLCanvasElement,
    hudRoot: HTMLElement,
  ) {
    this.ballStart = ball.position.clone();
    this.aimVisuals = new AimVisuals(scene);
    this.hud = new Hud(hudRoot);
    this.bindInput();
    this.enterAim();
  }

  start(): void {
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // --- Bucle ---------------------------------------------------------------

  private frame(): void {
    const dt = this.clock.getDelta();
    this.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  private update(dt: number): void {
    if (this.phase === 'AIM') {
      this.aimVisuals.update(this.ballStart, this.aim, this.kicker.line);
    } else if (this.phase === 'FLIGHT' && this.flight) {
      this.flight.step(dt);
      this.ball.position.copy(this.flight.position);
      this.spinBall(dt);
      if (this.flight.done) this.enterResult();
    }
  }

  private spinBall(dt: number): void {
    const spin = this.flight?.state.spin;
    if (!spin) return;
    const speed = spin.length();
    if (speed > 1e-4) {
      this.ball.rotateOnAxis(spin.clone().normalize(), speed * dt * 0.15);
    }
  }

  // --- Fases ---------------------------------------------------------------

  private enterAim(): void {
    this.phase = 'AIM';
    this.flight = null;
    this.ball.position.copy(this.ballStart);
    this.aimVisuals.setVisible(true);
    this.hud.setResult(null);
    this.hud.setHint(t('hud.hintAim'));
  }

  private enterResult(): void {
    this.phase = 'RESULT';
    this.aimVisuals.setVisible(false);
    this.hud.setResult(this.flight?.event ?? 'OUT');
    this.hud.setHint(t('hud.tapToContinue'));
  }

  /** TEMP (1.6): lanzamiento recto a la mira con potencia/sin spin fijos.
   *  Se reemplaza por el solver (1.9) que mapea contacto+potencia+timing. */
  private launchTemp(): void {
    const target = new THREE.Vector3(this.aim.x, this.aim.y, 0);
    const dir = target.clone().sub(this.ballStart).normalize();
    const initial: BallState = {
      pos: this.ballStart.clone(),
      vel: dir.multiplyScalar(speedForPower(3)),
      spin: new THREE.Vector3(0, 0, 0),
    };
    this.flight = new Flight(initial, { dragCd: DEFAULT_DRAG_CD });
    this.phase = 'FLIGHT';
    this.aimVisuals.setVisible(false);
    this.hud.setHint('');
  }

  // --- Acciones de input ---------------------------------------------------

  private onShoot(): void {
    if (this.phase === 'AIM') this.launchTemp();
    else if (this.phase === 'RESULT') this.enterAim();
  }

  private aimFromPointer(clientX: number, clientY: number): void {
    if (this.phase !== 'AIM') return;
    const ndc = new THREE.Vector2(
      (clientX / window.innerWidth) * 2 - 1,
      -((clientY / window.innerHeight) * 2 - 1),
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.goalPlane, hit)) {
      this.aim.x = clamp(hit.x, -AIM_X_LIMIT, AIM_X_LIMIT);
      this.aim.y = clamp(hit.y, AIM_Y_MIN, AIM_Y_MAX);
    }
  }

  // --- Input binding -------------------------------------------------------

  private bindInput(): void {
    this.canvas.addEventListener('pointermove', (e) =>
      this.aimFromPointer(e.clientX, e.clientY),
    );
    this.canvas.addEventListener('pointerdown', (e) => {
      this.aimFromPointer(e.clientX, e.clientY);
      this.onShoot();
    });

    window.addEventListener('keydown', (e) => {
      switch (e.code) {
        case 'Space':
        case 'Enter':
          e.preventDefault();
          this.onShoot();
          break;
        case 'ArrowLeft':
          this.aim.x = clamp(this.aim.x - KEY_AIM_STEP, -AIM_X_LIMIT, AIM_X_LIMIT);
          break;
        case 'ArrowRight':
          this.aim.x = clamp(this.aim.x + KEY_AIM_STEP, -AIM_X_LIMIT, AIM_X_LIMIT);
          break;
        case 'ArrowUp':
          this.aim.y = clamp(this.aim.y + KEY_AIM_STEP, AIM_Y_MIN, AIM_Y_MAX);
          break;
        case 'ArrowDown':
          this.aim.y = clamp(this.aim.y - KEY_AIM_STEP, AIM_Y_MIN, AIM_Y_MAX);
          break;
        default:
          break;
      }
    });
  }
}
