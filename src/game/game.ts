import * as THREE from 'three';
import { AimVisuals } from '@/render/aim';
import { Flight } from '@/game/flight';
import { DEFAULT_KICKER, type Kicker } from '@/game/kicker';
import { ShotMachine, type ShotPhase } from '@/game/shot-machine';
import { solveShot } from '@/game/shot-solver';
import { DEFAULT_DRAG_CD } from '@/core/ballistics';
import { Hud } from '@/ui/hud';
import { t } from '@/core/i18n';
import { playKick, playGreen } from '@/core/audio';

/**
 * Controlador de juego — orquesta la `ShotMachine` con la escena, el input y
 * el HUD.
 *
 * Estado: 1.6 apuntado · 1.7 contacto. Flujo completo de la FSM cableado
 * (AIMING→CONTACT→POWERING→TIMING→FLIGHT→RESULT). El HUD de potencia/timing
 * llega en 1.8 y el mapeo real input→velocidad+spin en 1.9 (hoy: solver TEMP
 * que sólo usa mira + potencia).
 */

const AIM_X_LIMIT = 6; // se puede apuntar afuera del palo (comba/trivela)
const AIM_Y_MIN = 0.15;
const AIM_Y_MAX = 3.0;
const KEY_AIM_STEP = 0.12;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export class Game {
  private machine = new ShotMachine();
  private aimVisuals: AimVisuals;
  private hud: Hud;
  private kicker: Kicker = DEFAULT_KICKER;

  private ballStart: THREE.Vector3;
  private flight: Flight | null = null;

  private raycaster = new THREE.Raycaster();
  private goalPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  private clock = new THREE.Clock();
  private spacePressed = false;

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
    this.hud.contact.onChange = (x, y) => this.machine.setContact(x, y);
    this.machine.onPhaseChange = (phase) => this.onPhase(phase);
    this.bindInput();
    this.onPhase('AIMING');
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
    this.machine.update(dt * 1000);

    switch (this.machine.phase) {
      case 'AIMING':
        this.aimVisuals.update(this.ballStart, this.machine.aim, this.kicker.line);
        break;
      case 'POWERING':
        this.hud.power.setValue(this.machine.power);
        break;
      case 'TIMING':
        this.hud.power.setValue(this.machine.power);
        this.hud.timing.setProgress(this.machine.timingProgress);
        break;
      case 'FLIGHT':
        if (this.flight) {
          this.flight.step(dt);
          this.ball.position.copy(this.flight.position);
          this.spinBall(dt);
          if (this.flight.done) this.machine.resolveFlight();
        }
        break;
      default:
        break;
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

  // --- Reacción a cambios de fase -----------------------------------------

  private onPhase(phase: ShotPhase): void {
    switch (phase) {
      case 'AIMING':
        this.flight = null;
        this.ball.position.copy(this.ballStart);
        this.aimVisuals.setVisible(true);
        this.hud.contact.setVisible(false);
        this.hud.power.setVisible(false);
        this.hud.timing.setVisible(false);
        this.hud.setResult(null);
        this.hud.setHint(t('hud.hintAim'));
        break;
      case 'CONTACT':
        this.aimVisuals.setVisible(false);
        this.hud.contact.reset();
        this.hud.contact.setVisible(true);
        this.hud.setHint(t('hud.hintContact'));
        break;
      case 'POWERING':
        this.hud.contact.setVisible(false);
        this.hud.power.setVisible(true);
        this.hud.timing.setVisible(false);
        this.hud.setHint(t('hud.hintPower'));
        break;
      case 'TIMING':
        this.hud.timing.setVisible(true);
        this.hud.setHint(t('hud.hintTiming'));
        break;
      case 'FLIGHT':
        this.launch();
        this.hud.power.setVisible(false);
        this.hud.timing.flash(this.machine.getInput().green);
        this.hud.setHint('');
        playKick();
        if (this.machine.getInput().green) playGreen();
        break;
      case 'RESULT':
        this.hud.timing.setVisible(false);
        this.hud.setResult(this.flight?.event ?? 'OUT');
        this.hud.setHint(t('hud.tapToContinue'));
        break;
    }
  }

  /** Mapeo input→velocidad+spin (1.9) y arranque del vuelo. */
  private launch(): void {
    const input = this.machine.getInput();
    const initial = solveShot(input, {
      ballPos: this.ballStart,
      kicker: this.kicker,
    });
    this.flight = new Flight(initial, { dragCd: DEFAULT_DRAG_CD });
  }

  // --- Input ---------------------------------------------------------------

  private press(): void {
    if (this.machine.phase === 'RESULT') this.machine.reset();
    else this.machine.press();
  }

  private release(): void {
    this.machine.release();
  }

  private aimFromPointer(clientX: number, clientY: number): void {
    if (this.machine.phase !== 'AIMING') return;
    const ndc = new THREE.Vector2(
      (clientX / window.innerWidth) * 2 - 1,
      -((clientY / window.innerHeight) * 2 - 1),
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.goalPlane, hit)) {
      this.machine.setAim(
        clamp(hit.x, -AIM_X_LIMIT, AIM_X_LIMIT),
        clamp(hit.y, AIM_Y_MIN, AIM_Y_MAX),
      );
    }
  }

  private nudgeAim(dx: number, dy: number): void {
    if (this.machine.phase !== 'AIMING') return;
    const a = this.machine.aim;
    this.machine.setAim(
      clamp(a.x + dx, -AIM_X_LIMIT, AIM_X_LIMIT),
      clamp(a.y + dy, AIM_Y_MIN, AIM_Y_MAX),
    );
  }

  private bindInput(): void {
    this.canvas.addEventListener('pointermove', (e) =>
      this.aimFromPointer(e.clientX, e.clientY),
    );
    // pointerdown/up en window para que también funcione sobre el HUD.
    window.addEventListener('pointerdown', (e) => {
      this.aimFromPointer(e.clientX, e.clientY);
      this.press();
    });
    window.addEventListener('pointerup', () => this.release());

    window.addEventListener('keydown', (e) => {
      switch (e.code) {
        case 'Space':
        case 'Enter':
          e.preventDefault();
          if (!this.spacePressed) {
            this.spacePressed = true;
            this.press();
          }
          break;
        case 'ArrowLeft':
          this.nudgeAim(-KEY_AIM_STEP, 0);
          break;
        case 'ArrowRight':
          this.nudgeAim(KEY_AIM_STEP, 0);
          break;
        case 'ArrowUp':
          this.nudgeAim(0, KEY_AIM_STEP);
          break;
        case 'ArrowDown':
          this.nudgeAim(0, -KEY_AIM_STEP);
          break;
        default:
          break;
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        this.spacePressed = false;
        this.release();
      }
    });
  }
}
