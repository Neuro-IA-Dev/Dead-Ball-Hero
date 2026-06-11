import * as THREE from 'three';
import { AimVisuals } from '@/render/aim';
import { ContactSelector } from '@/render/contact-selector';
import { Flight } from '@/game/flight';
import { DEFAULT_KICKER, type Kicker } from '@/game/kicker';
import { ShotMachine, type ShotPhase, type ShotInput } from '@/game/shot-machine';
import {
  solveShot,
  buildInitialState,
  dispersionSigma,
  classifyContact,
  optimalPowerCenter,
  isPerfectPower,
  PERFECT_POWER_HALF,
} from '@/game/shot-solver';
import { DEFAULT_DRAG_CD, traceTrajectory } from '@/core/ballistics';
import { GOAL_HALF_WIDTH } from '@/core/field';
import { Hud } from '@/ui/hud';
import { DebugOverlay } from '@/ui/debug-overlay';
import { t } from '@/core/i18n';
import { playKick, playPerfect } from '@/core/audio';

/**
 * Controlador de juego — orquesta la `ShotMachine` con la escena, el input y
 * el HUD.
 *
 * Flujo (edición 26): AIMING→CONTACT→POWERING→RUNUP→FLIGHT→RESULT.
 * Apuntado por RETÍCULA (1.9c): el puntero/teclas mueven la mira en el plano
 * del arco; la cámara queda casi fija (el seguimiento amortiguado es 1.9c.2).
 */

// Rango de la retícula sobre el plano del arco.
const AIM_X_LIMIT = GOAL_HALF_WIDTH + 2; // ±2 m de margen fuera de los palos
const AIM_Y_MIN = 0.2;
const AIM_Y_MAX = 2.6;
// Movimiento con teclas: cruzar el ancho del arco (~7.3 m) en ~1.2 s a tope.
const MAX_AIM_SPEED = (GOAL_HALF_WIDTH * 2) / 1.2; // m/s
const AIM_RAMP_S = 0.6; // rampa cuadrática hasta velocidad máxima

const CONTACT_POINTER_SENS = 0.006; // por píxel de arrastre
const CONTACT_KEY_STEP = 0.12; // WASD

// Cámara fija (broadcast detrás del balón).
const CAM_BACK = 5.5;
const CAM_HEIGHT = 1.9;
const CAM_LOOK_HEIGHT = 1.0;
// Seguimiento amortiguado de la retícula (1.9c.2): casi fija, jamás gira 1:1.
const CAM_FOLLOW_FACTOR = 0.2; // fracción del offset a la retícula
const CAM_TAU = 0.25; // s, suavizado exponencial
const CAM_YAW_CAP = (10 * Math.PI) / 180; // ±10°
const CAM_PITCH_CAP = (4 * Math.PI) / 180; // ±4°

const UP = new THREE.Vector3(0, 1, 0);

/** Ángulo horizontal (alrededor de Y) de un vector respecto al eje −Z. */
function yawOf(v: THREE.Vector3): number {
  return Math.atan2(v.x, -v.z);
}
/** Ángulo de elevación de un vector unitario-ish. */
function pitchOf(v: THREE.Vector3): number {
  return Math.atan2(v.y, Math.hypot(v.x, v.z));
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export class Game {
  private machine = new ShotMachine();
  private aimVisuals: AimVisuals;
  private contactSelector: ContactSelector;
  private hud: Hud;
  private debug: DebugOverlay;
  private kicker: Kicker = DEFAULT_KICKER;

  private ballStart: THREE.Vector3;
  private flight: Flight | null = null;

  private raycaster = new THREE.Raycaster();
  private goalPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  private clock = new THREE.Clock();
  private spacePressed = false;

  // Cámara base + seguimiento amortiguado (1.9c.2).
  private camBasePos = new THREE.Vector3();
  private camBaseLook = new THREE.Vector3();
  private camBaseFwd = new THREE.Vector3();
  private camYaw = 0; // offset suavizado actual
  private camPitch = 0;

  // Teclas de apuntado mantenidas + rampa.
  private aimKeys = { left: false, right: false, up: false, down: false };
  private aimHold = 0;

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
    this.contactSelector = new ContactSelector(scene, this.ballStart);
    this.hud = new Hud(hudRoot);
    this.debug = new DebugOverlay(hudRoot);
    this.machine.onPhaseChange = (phase) => this.onPhase(phase);
    this.machine.onPowerReleased = (power) => this.onPowerReleased(power);
    this.machine.setRunupMs(this.kicker.runupMs);
    this.setupCamera();
    this.bindInput();
    this.onPhase('AIMING');
  }

  start(): void {
    this.renderer.setAnimationLoop(() => this.frame());
  }

  /** Cámara base fija: detrás del balón mirando al centro del arco. */
  private setupCamera(): void {
    const toGoal = new THREE.Vector3(
      -this.ballStart.x,
      0,
      -this.ballStart.z,
    ).normalize();
    this.camBasePos
      .copy(this.ballStart)
      .addScaledVector(toGoal, -CAM_BACK)
      .addScaledVector(UP, CAM_HEIGHT);
    this.camBaseLook.set(0, CAM_LOOK_HEIGHT, 0);
    this.camBaseFwd.copy(this.camBaseLook).sub(this.camBasePos).normalize();
    this.camera.position.copy(this.camBasePos);
    this.camera.lookAt(this.camBaseLook);
  }

  /**
   * Cámara casi fija: posición invariable; el yaw/pitch siguen a la retícula
   * con factor 0.2, suavizado exponencial (τ) y tope duro (±10°/±4°). El
   * escenario JAMÁS gira 1:1 con el input.
   */
  private updateAimCamera(dt: number): void {
    const aim = this.machine.aim;
    const toR = new THREE.Vector3(aim.x, aim.y, 0)
      .sub(this.camBasePos)
      .normalize();
    const yawOff = yawOf(toR) - yawOf(this.camBaseFwd);
    const pitchOff = pitchOf(toR) - pitchOf(this.camBaseFwd);

    const desiredYaw = clamp(
      CAM_FOLLOW_FACTOR * yawOff,
      -CAM_YAW_CAP,
      CAM_YAW_CAP,
    );
    const desiredPitch = clamp(
      CAM_FOLLOW_FACTOR * pitchOff,
      -CAM_PITCH_CAP,
      CAM_PITCH_CAP,
    );

    const alpha = 1 - Math.exp(-dt / CAM_TAU);
    this.camYaw += (desiredYaw - this.camYaw) * alpha;
    this.camPitch += (desiredPitch - this.camPitch) * alpha;

    const fwd = this.camBaseFwd.clone().applyAxisAngle(UP, this.camYaw);
    const right = new THREE.Vector3().crossVectors(fwd, UP).normalize();
    fwd.applyAxisAngle(right, this.camPitch);
    this.camera.lookAt(this.camBasePos.clone().add(fwd));
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
        this.updateAimKeys(dt);
        this.updateAimCamera(dt);
        this.updateContactSelector();
        this.updateProjection();
        if (this.debug.enabled) this.updateDebug();
        break;
      case 'CONTACT':
        this.updateAimCamera(dt);
        this.updateContactSelector();
        this.updateProjection();
        if (this.debug.enabled) this.updateDebug();
        break;
      case 'POWERING':
        this.updateAimCamera(dt);
        this.updateContactSelector();
        this.updateProjection();
        this.hud.power.setValue(this.machine.power);
        if (this.debug.enabled) this.updateDebug();
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

  /** Movimiento de la retícula con flechas mantenidas (rampa cuadrática). */
  private updateAimKeys(dt: number): void {
    const k = this.aimKeys;
    if (!(k.left || k.right || k.up || k.down)) {
      this.aimHold = 0;
      return;
    }
    this.aimHold += dt;
    const ramp = Math.min(1, this.aimHold / AIM_RAMP_S);
    const step = MAX_AIM_SPEED * ramp * ramp * dt; // cuadrática
    const a = this.machine.aim;
    let x = a.x;
    let y = a.y;
    if (k.left) x -= step;
    if (k.right) x += step;
    if (k.up) y += step;
    if (k.down) y -= step;
    this.setAim(x, y);
  }

  private setAim(x: number, y: number): void {
    this.machine.setAim(
      clamp(x, -AIM_X_LIMIT, AIM_X_LIMIT),
      clamp(y, AIM_Y_MIN, AIM_Y_MAX),
    );
  }

  private updateContactSelector(): void {
    const c = this.machine.contact;
    this.contactSelector.setContact(c.x, c.y);
    this.contactSelector.update(this.camera);
    this.hud.setContactType(t(`shot.${classifyContact(c, this.kicker)}`));
  }

  /** Input previsualizado: en POWERING usa la potencia real; si no, la óptima. */
  private previewInput(): ShotInput {
    const contact = this.machine.contact;
    const power =
      this.machine.phase === 'POWERING'
        ? this.machine.power
        : optimalPowerCenter(contact, this.kicker);
    return { aim: this.machine.aim, contact, power };
  }

  private updateProjection(): void {
    this.aimVisuals.update(
      this.ballStart,
      this.previewInput(),
      this.kicker,
      this.kicker.line,
    );
  }

  /** Overlay de QA: retícula, contacto, potencia, sigma, cruce previsto. */
  private updateDebug(): void {
    const input = this.machine.getInput();
    const type = classifyContact(input.contact, this.kicker);
    const sigma = dispersionSigma(input, this.kicker);
    const state = buildInitialState(input, {
      ballPos: this.ballStart,
      kicker: this.kicker,
    });
    const { final } = traceTrajectory(state, {
      dragCd: DEFAULT_DRAG_CD,
      stop: (s) => s.pos.z <= 0,
    });
    this.debug.set([
      `phase   ${this.machine.phase}`,
      `aim     x=${input.aim.x.toFixed(2)} y=${input.aim.y.toFixed(2)}`,
      `contact ${input.contact.x.toFixed(2)}, ${input.contact.y.toFixed(2)}  ${type}`,
      `power   ${input.power.toFixed(2)} (opt ${optimalPowerCenter(input.contact, this.kicker).toFixed(2)})`,
      `sigma   ${sigma.toFixed(4)} rad`,
      `cross   x=${final.pos.x.toFixed(2)}  y=${final.pos.y.toFixed(2)}`,
    ]);
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
        this.contactSelector.setVisible(true);
        this.hud.power.setVisible(false);
        this.hud.setResult(null);
        this.hud.setHint(t('hud.hintAim'));
        break;
      case 'CONTACT':
        this.aimVisuals.setVisible(true);
        this.contactSelector.setVisible(true);
        this.hud.setHint(t('hud.hintContact'));
        break;
      case 'POWERING':
        this.aimVisuals.setVisible(true);
        this.contactSelector.setVisible(true);
        this.hud.power.setOptimal(
          optimalPowerCenter(this.machine.contact, this.kicker),
          PERFECT_POWER_HALF,
        );
        this.hud.power.setVisible(true);
        this.hud.setHint(t('hud.hintPower'));
        break;
      case 'RUNUP':
        this.aimVisuals.setVisible(false);
        this.contactSelector.setVisible(false);
        this.hud.setContactType(null);
        this.hud.setHint('');
        break;
      case 'FLIGHT':
        this.launch();
        this.aimVisuals.setVisible(false);
        this.contactSelector.setVisible(false);
        this.hud.setContactType(null);
        this.hud.power.setVisible(false);
        playKick();
        break;
      case 'RESULT':
        this.hud.setResult(this.flight?.event ?? 'OUT');
        this.hud.setHint(t('hud.tapToContinue'));
        break;
    }
  }

  /** Feedback de "potencia perfecta" al soltar la barra (1.9b.4). */
  private onPowerReleased(power: number): void {
    if (isPerfectPower(power, this.machine.contact, this.kicker)) {
      this.hud.power.flashPerfect();
      playPerfect();
      navigator.vibrate?.(40);
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

  /** Mueve la retícula al punto del plano del arco bajo el puntero (absoluto). */
  private aimFromPointer(clientX: number, clientY: number): void {
    if (this.machine.phase !== 'AIMING') return;
    const ndc = new THREE.Vector2(
      (clientX / window.innerWidth) * 2 - 1,
      -((clientY / window.innerHeight) * 2 - 1),
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.goalPlane, hit)) {
      this.setAim(hit.x, hit.y);
    }
  }

  /** Pointer move: mira en AIMING, contacto (relativo) en CONTACT. */
  private onPointerMove(e: PointerEvent): void {
    if (this.machine.phase === 'AIMING') {
      this.aimFromPointer(e.clientX, e.clientY);
    } else if (this.machine.phase === 'CONTACT') {
      const c = this.machine.contact;
      this.machine.setContact(
        c.x + e.movementX * CONTACT_POINTER_SENS,
        c.y - e.movementY * CONTACT_POINTER_SENS,
      );
    }
  }

  private nudgeContact(dx: number, dy: number): void {
    const c = this.machine.contact;
    this.machine.setContact(c.x + dx, c.y + dy);
  }

  private bindInput(): void {
    this.canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
    // pointerdown/up en window para que también funcione sobre el HUD.
    window.addEventListener('pointerdown', (e) => {
      this.aimFromPointer(e.clientX, e.clientY);
      this.press();
    });
    window.addEventListener('pointerup', () => this.release());

    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));
  }

  private onKeyDown(e: KeyboardEvent): void {
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
        this.aimKeys.left = true;
        break;
      case 'ArrowRight':
        this.aimKeys.right = true;
        break;
      case 'ArrowUp':
        this.aimKeys.up = true;
        break;
      case 'ArrowDown':
        this.aimKeys.down = true;
        break;
      // WASD: punto de contacto (en CONTACT).
      case 'KeyA':
        this.nudgeContact(-CONTACT_KEY_STEP, 0);
        break;
      case 'KeyD':
        this.nudgeContact(CONTACT_KEY_STEP, 0);
        break;
      case 'KeyW':
        this.nudgeContact(0, CONTACT_KEY_STEP);
        break;
      case 'KeyS':
        this.nudgeContact(0, -CONTACT_KEY_STEP);
        break;
      default:
        break;
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    switch (e.code) {
      case 'Space':
      case 'Enter':
        this.spacePressed = false;
        this.release();
        break;
      case 'ArrowLeft':
        this.aimKeys.left = false;
        break;
      case 'ArrowRight':
        this.aimKeys.right = false;
        break;
      case 'ArrowUp':
        this.aimKeys.up = false;
        break;
      case 'ArrowDown':
        this.aimKeys.down = false;
        break;
      default:
        break;
    }
  }
}
