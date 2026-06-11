import * as THREE from 'three';
import { AimVisuals, PREVIEW_POWER } from '@/render/aim';
import { Flight } from '@/game/flight';
import { DEFAULT_KICKER, type Kicker } from '@/game/kicker';
import { ShotMachine, type ShotPhase, AZIMUTH_LIMIT } from '@/game/shot-machine';
import { solveShot, horizontalAzimuthDir } from '@/game/shot-solver';
import { DEFAULT_DRAG_CD } from '@/core/ballistics';
import { Hud } from '@/ui/hud';
import { t } from '@/core/i18n';
import { playKick } from '@/core/audio';

/**
 * Controlador de juego — orquesta la `ShotMachine` con la escena, el input y
 * el HUD.
 *
 * Flujo (edición 26, sin timing verde):
 * AIMING→CONTACT→POWERING→RUNUP→FLIGHT→RESULT. Una sola barra de potencia.
 * Apuntado por azimut: el puntero/teclas rotan la dirección y la cámara orbita.
 */

const KEY_AZIMUTH_STEP = 0.03;

// Cámara de apuntado (encuadre tipo referente: baja, detrás y al costado).
const CAM_BACK = 5;
const CAM_HEIGHT = 1.7;
const CAM_SIDE = 1.6;
const CAM_SIDE_SIGN = 1; // a la derecha de la dirección de tiro (QA 1.9b.6)
const LOOK_HEIGHT = 1.0;

const UP = new THREE.Vector3(0, 1, 0);

export class Game {
  private machine = new ShotMachine();
  private aimVisuals: AimVisuals;
  private hud: Hud;
  private kicker: Kicker = DEFAULT_KICKER;

  private ballStart: THREE.Vector3;
  private flight: Flight | null = null;

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
    this.machine.setRunupMs(this.kicker.runupMs);
    this.bindInput();
    this.onPhase('AIMING');
    this.updateAimCamera();
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
      case 'CONTACT':
      case 'POWERING':
        this.updateAimCamera();
        this.updateProjection();
        if (this.machine.phase === 'POWERING') {
          this.hud.power.setValue(this.machine.power);
        }
        break;
      case 'RUNUP':
        this.updateAimCamera();
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

  /** Cámara baja detrás del balón, orbitando con el azimut. */
  private updateAimCamera(): void {
    const horiz = horizontalAzimuthDir(this.ballStart, this.machine.aim.azimuth);
    const lateral = new THREE.Vector3().crossVectors(horiz, UP).normalize();
    this.camera.position
      .copy(this.ballStart)
      .addScaledVector(horiz, -CAM_BACK)
      .addScaledVector(UP, CAM_HEIGHT)
      .addScaledVector(lateral, CAM_SIDE * CAM_SIDE_SIGN);
    const dist = Math.hypot(this.ballStart.x, this.ballStart.z);
    const target = this.ballStart.clone().addScaledVector(horiz, dist);
    target.y = LOOK_HEIGHT;
    this.camera.lookAt(target);
  }

  private updateProjection(): void {
    const power =
      this.machine.phase === 'POWERING' ? this.machine.power : PREVIEW_POWER;
    this.aimVisuals.update(
      this.ballStart,
      {
        azimuth: this.machine.aim.azimuth,
        contact: this.machine.contact,
        power,
      },
      this.kicker,
      this.kicker.line,
    );
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
        this.hud.setResult(null);
        this.hud.setHint(t('hud.hintAim'));
        break;
      case 'CONTACT':
        this.aimVisuals.setVisible(true);
        this.hud.contact.reset();
        this.hud.contact.setVisible(true);
        this.hud.setHint(t('hud.hintContact'));
        break;
      case 'POWERING':
        this.aimVisuals.setVisible(true);
        this.hud.contact.setVisible(false);
        this.hud.power.setVisible(true);
        this.hud.setHint(t('hud.hintPower'));
        break;
      case 'RUNUP':
        this.aimVisuals.setVisible(false);
        this.hud.setHint('');
        break;
      case 'FLIGHT':
        this.launch();
        this.aimVisuals.setVisible(false);
        this.hud.power.setVisible(false);
        playKick();
        break;
      case 'RESULT':
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

  /** Azimut absoluto desde la X del puntero (centro pantalla = recto). */
  private azimuthFromPointer(clientX: number): void {
    if (this.machine.phase !== 'AIMING') return;
    const norm = (clientX / window.innerWidth) * 2 - 1; // [-1,1]
    this.machine.setAzimuth(norm * AZIMUTH_LIMIT);
  }

  private bindInput(): void {
    this.canvas.addEventListener('pointermove', (e) =>
      this.azimuthFromPointer(e.clientX),
    );
    // pointerdown/up en window para que también funcione sobre el HUD.
    window.addEventListener('pointerdown', (e) => {
      this.azimuthFromPointer(e.clientX);
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
          this.machine.nudgeAzimuth(-KEY_AZIMUTH_STEP);
          break;
        case 'ArrowRight':
          this.machine.nudgeAzimuth(KEY_AZIMUTH_STEP);
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
