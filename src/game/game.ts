import * as THREE from 'three';
import { AimVisuals } from '@/render/aim';
import { ContactSelector } from '@/render/contact-selector';
import { BallTrail } from '@/render/ball-trail';
import { NetRipple } from '@/render/net-ripple';
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
import { GOAL_HALF_WIDTH, GOAL_DEPTH, BALL_RADIUS } from '@/core/field';
import { Hud } from '@/ui/hud';
import { DebugOverlay } from '@/ui/debug-overlay';
import { t } from '@/core/i18n';
import { playKick, playPerfect, playPost, playCrowd } from '@/core/audio';

/**
 * Controlador de juego — orquesta la `ShotMachine` con la escena, el input,
 * el HUD y el "juice" del disparo (1.9c.4).
 *
 * Flujo (edición 26): AIMING→CONTACT→POWERING→RUNUP→FLIGHT→RESULT.
 * Apuntado por RETÍCULA; cámara casi fija con seguimiento amortiguado.
 */

// Rango de la retícula sobre el plano del arco.
const AIM_X_LIMIT = GOAL_HALF_WIDTH + 2;
const AIM_Y_MIN = 0.2;
const AIM_Y_MAX = 2.6;
const MAX_AIM_SPEED = (GOAL_HALF_WIDTH * 2) / 1.2; // ~palo a palo en 1.2 s
const AIM_RAMP_S = 0.6;

const CONTACT_POINTER_SENS = 0.006;
const CONTACT_KEY_STEP = 0.12;

// Cámara fija + seguimiento amortiguado (1.9c.2).
const CAM_BACK = 5.5;
const CAM_HEIGHT = 1.9;
const CAM_LOOK_HEIGHT = 1.0;
const CAM_FOLLOW_FACTOR = 0.2;
const CAM_TAU = 0.25;
const CAM_YAW_CAP = (10 * Math.PI) / 180;
const CAM_PITCH_CAP = (4 * Math.PI) / 180;

// Juice (1.9c.4).
const HIT_STOP_MS = 70;
const SHAKE_MS = 200;
const SHAKE_MAG = 0.05; // m (≈ pocos px)
const POST_ZOOM_MS = 220;
const POST_ZOOM_DEG = 6;
const RESULT_WAIT_MS = 1200; // auto-reset (no gol), saltable
const REPLAY_MAX_MS = 2000; // repetición de gol, saltable
const REPLAY_HOLD_MS = 350;

const UP = new THREE.Vector3(0, 1, 0);

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function yawOf(v: THREE.Vector3): number {
  return Math.atan2(v.x, -v.z);
}
function pitchOf(v: THREE.Vector3): number {
  return Math.atan2(v.y, Math.hypot(v.x, v.z));
}

type ResultMode = 'none' | 'wait' | 'replay';

export class Game {
  private machine = new ShotMachine();
  private aimVisuals: AimVisuals;
  private contactSelector: ContactSelector;
  private trail: BallTrail;
  private netRipple: NetRipple;
  private hud: Hud;
  private debug: DebugOverlay;
  private kicker: Kicker = DEFAULT_KICKER;

  private ballStart: THREE.Vector3;
  private flight: Flight | null = null;

  private raycaster = new THREE.Raycaster();
  private goalPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  private clock = new THREE.Clock();
  private spacePressed = false;

  // Cámara.
  private camBasePos = new THREE.Vector3();
  private camBaseLook = new THREE.Vector3();
  private camBaseFwd = new THREE.Vector3();
  private camYaw = 0;
  private camPitch = 0;
  private baseFov: number;

  // Teclas de apuntado.
  private aimKeys = { left: false, right: false, up: false, down: false };
  private aimHold = 0;

  // Juice.
  private hitStopMs = 0;
  private shakeMs = 0;
  private postZoomMs = 0;
  private flightTime = 0;
  private samples: { p: THREE.Vector3; t: number }[] = [];
  private resultMode: ResultMode = 'none';
  private resultElapsed = 0;
  private replayCamPos = new THREE.Vector3(2.5, 1.9, -GOAL_DEPTH - 4);
  private replayCamLook = new THREE.Vector3(0, 1.1, 7);

  constructor(
    private renderer: THREE.WebGLRenderer,
    private scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
    private ball: THREE.Mesh,
    private canvas: HTMLCanvasElement,
    hudRoot: HTMLElement,
    net: THREE.LineSegments,
  ) {
    this.ballStart = ball.position.clone();
    this.baseFov = camera.fov;
    this.aimVisuals = new AimVisuals(scene);
    this.contactSelector = new ContactSelector(scene, this.ball);
    this.trail = new BallTrail(scene);
    this.netRipple = new NetRipple(net);
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
    this.resetCamera();
  }

  private resetCamera(): void {
    this.camYaw = 0;
    this.camPitch = 0;
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
    this.camera.position.copy(this.camBasePos);
    this.camera.lookAt(this.camBaseLook);
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
        this.updateFlight(dt);
        break;
      case 'RESULT':
        this.updateResult(dt);
        break;
      default:
        break;
    }
  }

  private updateFlight(dt: number): void {
    if (!this.flight) return;
    // Micro hit-stop al golpear: congela ~70 ms para dar peso al impacto.
    if (this.hitStopMs > 0) {
      this.hitStopMs -= dt * 1000;
      return;
    }
    this.flight.step(dt);
    this.flightTime += dt;
    this.ball.position.copy(this.flight.position);
    this.spinBall(dt);
    this.samples.push({ p: this.flight.position.clone(), t: this.flightTime });
    this.trail.push(this.ball.position, performance.now());
    if (this.flight.done) this.machine.resolveFlight();
  }

  private updateResult(dt: number): void {
    this.resultElapsed += dt * 1000;
    this.netRipple.update(dt);

    if (this.resultMode === 'replay') {
      this.updateReplay(dt);
    } else {
      this.applyShakeAndZoom(dt, this.camBasePos, this.camBaseLook);
      if (this.resultElapsed >= RESULT_WAIT_MS) this.machine.reset();
    }
  }

  private updateReplay(dt: number): void {
    const tSec = this.resultElapsed / 1000;
    // Reproduce la trayectoria grabada en tiempo real.
    let idx = this.samples.length - 1;
    for (let i = 0; i < this.samples.length; i++) {
      if (this.samples[i]!.t >= tSec) {
        idx = i;
        break;
      }
    }
    this.ball.position.copy(this.samples[idx]!.p);
    this.trail.push(this.ball.position, performance.now());

    this.applyShakeAndZoom(dt, this.replayCamPos, this.replayCamLook);

    const lastT = this.samples[this.samples.length - 1]?.t ?? 0;
    const done =
      this.resultElapsed >= REPLAY_MAX_MS ||
      tSec > lastT + REPLAY_HOLD_MS / 1000;
    if (done) this.machine.reset();
  }

  /** Coloca la cámara en `pos→look` y le suma shake/zoom transitorios. */
  private applyShakeAndZoom(
    dt: number,
    pos: THREE.Vector3,
    look: THREE.Vector3,
  ): void {
    this.camera.position.copy(pos);
    if (this.shakeMs > 0) {
      const k = (this.shakeMs / SHAKE_MS) * SHAKE_MAG;
      this.camera.position.x += (Math.random() * 2 - 1) * k;
      this.camera.position.y += (Math.random() * 2 - 1) * k;
      this.shakeMs -= dt * 1000;
    }
    if (this.postZoomMs > 0) {
      const f = this.postZoomMs / POST_ZOOM_MS;
      this.camera.fov = this.baseFov - POST_ZOOM_DEG * f;
      this.camera.updateProjectionMatrix();
      this.postZoomMs -= dt * 1000;
      if (this.postZoomMs <= 0) {
        this.camera.fov = this.baseFov;
        this.camera.updateProjectionMatrix();
      }
    }
    this.camera.lookAt(look);
  }

  private updateAimCamera(dt: number): void {
    const aim = this.machine.aim;
    const toR = new THREE.Vector3(aim.x, aim.y, 0)
      .sub(this.camBasePos)
      .normalize();
    const yawOff = yawOf(toR) - yawOf(this.camBaseFwd);
    const pitchOff = pitchOf(toR) - pitchOf(this.camBaseFwd);

    const desiredYaw = clamp(CAM_FOLLOW_FACTOR * yawOff, -CAM_YAW_CAP, CAM_YAW_CAP);
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
    this.camera.position.copy(this.camBasePos);
    this.camera.lookAt(this.camBasePos.clone().add(fwd));
  }

  private updateAimKeys(dt: number): void {
    const k = this.aimKeys;
    if (!(k.left || k.right || k.up || k.down)) {
      this.aimHold = 0;
      return;
    }
    this.aimHold += dt;
    const ramp = Math.min(1, this.aimHold / AIM_RAMP_S);
    const step = MAX_AIM_SPEED * ramp * ramp * dt;
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
      `selErr  ${this.contactCenterError()}`,
    ]);
  }

  private contactCenterError(): string {
    const ballPx = this.projectPx(this.ball.position);
    const right = new THREE.Vector3().setFromMatrixColumn(
      this.camera.matrixWorld,
      0,
    );
    const edgePx = this.projectPx(
      this.ball.position.clone().addScaledVector(right, BALL_RADIUS),
    );
    const radiusPx = ballPx.distanceTo(edgePx);
    const selCenter = this.contactSelector.getCenterWorld(new THREE.Vector3());
    const errPx = ballPx.distanceTo(this.projectPx(selCenter));
    const pct = radiusPx > 0 ? (errPx / radiusPx) * 100 : 0;
    return `${errPx.toFixed(1)}px (${pct.toFixed(1)}% r)`;
  }

  private projectPx(world: THREE.Vector3): THREE.Vector2 {
    const v = world.clone().project(this.camera);
    return new THREE.Vector2(
      (v.x * 0.5 + 0.5) * window.innerWidth,
      (-v.y * 0.5 + 0.5) * window.innerHeight,
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
        this.resultMode = 'none';
        this.trail.clear();
        this.ball.position.copy(this.ballStart);
        this.resetCamera();
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
        this.hitStopMs = HIT_STOP_MS;
        this.flightTime = 0;
        this.samples.length = 0;
        this.trail.clear();
        playKick(this.machine.power);
        break;
      case 'RESULT':
        this.onResult();
        break;
    }
  }

  private onResult(): void {
    const event = this.flight?.event ?? 'OUT';
    this.resultElapsed = 0;
    this.hud.setResult(event);
    this.hud.setHint(t('hud.tapToContinue'));

    if (event === 'GOAL') {
      this.resultMode = 'replay';
      this.shakeMs = SHAKE_MS;
      playCrowd();
      const cross = this.flight?.cross;
      if (cross) this.netRipple.trigger(cross.x, cross.y);
    } else if (event === 'POST' || event === 'CROSSBAR') {
      this.resultMode = 'wait';
      this.postZoomMs = POST_ZOOM_MS;
      playPost();
    } else {
      this.resultMode = 'wait';
    }
  }

  private onPowerReleased(power: number): void {
    if (isPerfectPower(power, this.machine.contact, this.kicker)) {
      this.hud.power.flashPerfect();
      playPerfect();
      navigator.vibrate?.(40);
    }
  }

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
    if (this.machine.phase === 'RESULT') this.machine.reset(); // tap = saltar
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
      this.setAim(hit.x, hit.y);
    }
  }

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
