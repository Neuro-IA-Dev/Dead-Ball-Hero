import * as THREE from 'three';
import { AimVisuals } from '@/render/aim';
import { ContactSelector } from '@/render/contact-selector';
import { BallTrail } from '@/render/ball-trail';
import { NetRipple } from '@/render/net-ripple';
import { FreeKickCameraRig } from '@/render/free-kick-camera';
import { GoalkeeperActor, KickerActor } from '@/render/actors';
import { BarrierActor } from '@/render/barrier';
import type { TrajectoryPreviewMode } from '@/render/trajectory-preview';
import { Flight } from '@/game/flight';
import { DEFAULT_KICKER, DIEGO, TRAINING_RIGHT_FOOT, type Kicker } from '@/game/kicker';
import { ShotMachine, type ShotPhase, type ShotInput } from '@/game/shot-machine';
import {
  DEFAULT_GOALKEEPER_CONFIG,
  GoalkeeperController,
  estimateFromDebug,
  type GoalkeeperConfig,
} from '@/game/goalkeeper';
import {
  solveShotIntent,
  shotIntentFromInput,
  shotTypeLabelKey,
  optimalPowerCenter,
  perfectPowerWindow,
  isPerfectPower,
  launchToBallState,
  type SolveContext,
} from '@/game/shot-solver';
import type { ShotLaunch, ShotIntent } from '@/game/shot-model';
import { BALL_RADIUS, GOAL_HALF_WIDTH, GOAL_DEPTH } from '@/core/field';
import {
  buildBarrierCollider,
  raiseBarrier,
  type BarrierColliderConfig,
  type BarrierSetup,
  type ShotEvent,
} from '@/core/collisions';
import { Hud } from '@/ui/hud';
import { DebugOverlay } from '@/ui/debug-overlay';
import { t } from '@/core/i18n';
import { MAGNUS_S } from '@/core/physics';
import {
  playKick,
  playPerfect,
  playPost,
  playCrowd,
  playWhistle,
  playWhoosh,
  playNet,
  playGroan,
} from '@/core/audio';
import { techniqueTipKey, postShotTipKey } from '@/game/coach';
import type { LevelSpec } from '@/game/level';
import { LevelSession, type ShotOutcome, type SessionStatus } from '@/game/level-session';

const AIM_X_LIMIT = GOAL_HALF_WIDTH + 2;
const AIM_Y_MIN = 0.7;
const AIM_Y_MAX = 2.0;
const MAX_AIM_SPEED = (GOAL_HALF_WIDTH * 2) / 1.2;
const AIM_RAMP_S = 0.6;

const CONTACT_POINTER_SENS = 0.006;
const CONTACT_KEY_STEP = 0.12;

const HIT_STOP_MS = 70;
const SHAKE_MS = 200;
const SHAKE_MAG = 0.05;
const POST_ZOOM_MS = 220;
const POST_ZOOM_DEG = 6;
const RESULT_WAIT_MS = 1200;
const REPLAY_MAX_MS = 2000;
const REPLAY_HOLD_MS = 350;
/** Golpe de cámara en el impacto (zoom-in que se abre) — punch del remate. */
const STRIKE_MS = 200;
const STRIKE_ZOOM_DEG = 5;
/** Deformación (pop) del balón al ser golpeado. */
const SQUASH_MS = 130;
const SQUASH_AMT = 0.16;
/** Giro visual del balón (rodadura por velocidad + spin de la receta). */
const ROLL_FACTOR = 0.22;
const SPIN_FACTOR = 0.4;
/** Cuánto se elevan los jugadores de la barrera al saltar (m), para la colisión. */
const WALL_JUMP_RISE = 0.55;

type ResultMode = 'none' | 'wait' | 'replay';

interface CanonicalSeed {
  aim: { x: number; y: number };
  contact: { x: number; y: number };
  power: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export class Game {
  private machine = new ShotMachine();
  private aimVisuals: AimVisuals;
  private contactSelector: ContactSelector;
  private trail: BallTrail;
  private netRipple: NetRipple;
  private hud: Hud;
  private debug: DebugOverlay;
  private kicker: Kicker = DEFAULT_KICKER;
  private kickerActor: KickerActor;
  private goalkeeper: GoalkeeperActor;
  private goalkeeperController: GoalkeeperController;
  private goalkeeperConfig: GoalkeeperConfig = { ...DEFAULT_GOALKEEPER_CONFIG };
  private barrierActor: BarrierActor;
  private barrierSetup: BarrierSetup | null = null;
  private barrierCollider: BarrierColliderConfig | undefined;
  private wallJumpChance = 0;

  private ballStart: THREE.Vector3;
  private flight: Flight | null = null;
  private cameraRig: FreeKickCameraRig;
  private canonicalSeed: CanonicalSeed | null = null;
  private activeShotType: ShotLaunch['shotType'] | null = null;

  private raycaster = new THREE.Raycaster();
  private goalPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  private clock = new THREE.Clock();
  private spacePressed = false;
  /** El input del tiro solo responde con un nivel activo (no en el menú). */
  private inputEnabled = false;

  private aimKeys = { left: false, right: false, up: false, down: false };
  private aimHold = 0;

  private hitStopMs = 0;
  private shakeMs = 0;
  private postZoomMs = 0;
  private strikeMs = 0;
  private ballSquashMs = 0;
  private aimCount = 0;
  private lastLaunch: ShotLaunch | null = null;
  private flightTime = 0;

  // --- Loop de niveles (1.13–1.16) ---
  private session: LevelSession | null = null;
  private currentLevel: LevelSpec | null = null;
  private lastStatus: SessionStatus | null = null;
  private levelFinished = false;
  private levelPanelShown = false;
  private aidLine = DIEGO.line;
  /** El controlador externo (App) persiste el progreso al cerrar un nivel. */
  onLevelResolved?: (status: SessionStatus, level: LevelSpec) => void;
  /** El controlador externo decide qué pasa al pulsar "Siguiente". */
  onRequestNext?: () => void;
  /** El controlador externo abre el menú al pulsarlo. */
  onRequestMenu?: () => void;
  private samples: { p: THREE.Vector3; t: number }[] = [];
  private resultMode: ResultMode = 'none';
  private resultElapsed = 0;
  private readonly baseFov: number;
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
    private renderFrame: () => void = () => this.renderer.render(this.scene, this.camera),
  ) {
    this.applyUrlScenario();
    this.ballStart = ball.position.clone();
    this.barrierCollider = buildBarrierCollider(this.ballStart, this.barrierSetup);
    this.baseFov = camera.fov;
    this.aimVisuals = new AimVisuals(scene);
    this.contactSelector = new ContactSelector(scene, this.ball);
    this.trail = new BallTrail(scene);
    this.netRipple = new NetRipple(net);
    this.hud = new Hud(hudRoot);
    this.debug = new DebugOverlay(hudRoot);
    this.kickerActor = new KickerActor(scene);
    this.goalkeeper = new GoalkeeperActor(scene);
    this.goalkeeperController = new GoalkeeperController(this.goalkeeperConfig);
    this.barrierActor = new BarrierActor(scene);
    this.barrierActor.setBarrier(this.barrierCollider, this.ballStart);
    this.cameraRig = new FreeKickCameraRig(
      camera,
      this.ballStart,
      this.kicker.foot === 'L' ? 'left' : 'right',
    );
    this.machine.onPhaseChange = (phase) => this.onPhase(phase);
    this.machine.onPowerReleased = (power) => this.onPowerReleased(power);
    this.machine.setRunupMs(this.kicker.runupMs);
    this.kickerActor.setKicker(this.kicker, this.ballStart);
    this.seedCanonicalIfNeeded();
    this.bindInput();
    this.onPhase('AIMING');
  }

  start(): void {
    this.renderer.setAnimationLoop(() => this.frame());
  }

  /** Modo sandbox de QA (URL ?canonical/?wall/?keeper): juega sin menú ni nivel. */
  enableSandbox(): void {
    this.inputEnabled = true;
  }

  private applyUrlScenario(): void {
    const params = new URLSearchParams(window.location.search);
    this.applyWallScenario(params);
    this.applyKeeperScenario(params);
    if (params.get('canonical') !== '1') return;
    this.kicker = TRAINING_RIGHT_FOOT;
    this.ball.position.set(0, BALL_RADIUS, 25);
    const azimuthDeg = -6;
    const aimX = Math.tan(THREE.MathUtils.degToRad(azimuthDeg)) * this.ball.position.z;
    this.canonicalSeed = {
      aim: { x: aimX, y: 1.45 },
      contact: { x: 0.65, y: 0.05 },
      power: 2.85,
    };
  }

  private applyWallScenario(params: URLSearchParams): void {
    const wallParam = params.get('wall') ?? params.get('barrier');
    if (!wallParam || wallParam === '0' || wallParam === 'off') return;

    const parsedPlayers = Number(wallParam);
    const players = Number.isFinite(parsedPlayers)
      ? Math.round(clamp(parsedPlayers, 1, 6))
      : 4;
    const distanceParam = params.get('wallDistance');
    const parsedDistance = distanceParam == null ? Number.NaN : Number(distanceParam);
    this.barrierSetup = {
      players,
      distance: Number.isFinite(parsedDistance) ? clamp(parsedDistance, 6, 12) : 9.15,
    };
    const jumpParam = params.get('wallJump');
    const parsedJump = jumpParam == null ? Number.NaN : Number(jumpParam);
    this.wallJumpChance = Number.isFinite(parsedJump) ? clamp(parsedJump, 0, 1) : 0;
  }

  private applyKeeperScenario(params: URLSearchParams): void {
    const keeperParam = params.get('keeper');
    const delayParam = params.get('keeperDelay');
    const speedParam = params.get('keeperSpeed');
    const reactionDelay = delayParam == null ? Number.NaN : Number(delayParam);
    const diveSpeed = speedParam == null ? Number.NaN : Number(speedParam);

    this.goalkeeperConfig = {
      ...this.goalkeeperConfig,
      enabled: keeperParam !== '0' && keeperParam !== 'off',
      reactionDelay: Number.isFinite(reactionDelay)
        ? clamp(reactionDelay, 0.12, 0.9)
        : this.goalkeeperConfig.reactionDelay,
      diveSpeed: Number.isFinite(diveSpeed)
        ? clamp(diveSpeed, 1.6, 6.5)
        : this.goalkeeperConfig.diveSpeed,
    };
  }

  private seedCanonicalIfNeeded(): void {
    if (!this.canonicalSeed) return;
    this.machine.seed(this.canonicalSeed);
  }

  private frame(): void {
    const dt = this.clock.getDelta();
    this.update(dt);
    this.renderFrame();
  }

  private update(dt: number): void {
    this.machine.update(dt * 1000);
    this.kickerActor.update(this.machine.phase, this.machine.runupProgress);
    this.goalkeeper.update(dt);
    this.barrierActor.update(dt);
    switch (this.machine.phase) {
      case 'AIMING':
        this.updateAimKeys(dt);
        this.updateAimingState(dt);
        break;
      case 'CONTACT':
      case 'POWERING':
        this.updateAimingState(dt);
        if (this.machine.phase === 'POWERING') this.hud.power.setValue(this.machine.power);
        break;
      case 'RUNUP':
        this.updateRunup(dt);
        break;
      case 'FLIGHT':
        this.updateFlight(dt);
        break;
      case 'RESULT':
        this.updateResult(dt);
        break;
    }
  }

  private currentPreview(): { input: ShotInput; intent: ShotIntent; launch: ShotLaunch } {
    const input = this.previewInput();
    const ctx = this.solveContext();
    const intent = shotIntentFromInput(input, ctx);
    const launch = solveShotIntent(
      intent,
      ctx,
      { applyDispersion: false },
    );
    return { input, intent, launch };
  }

  private solveContext(): SolveContext {
    return this.barrierCollider
      ? { ballPos: this.ballStart, kicker: this.kicker, barrier: this.barrierCollider }
      : { ballPos: this.ballStart, kicker: this.kicker };
  }

  private previewInput(): ShotInput {
    const contact = this.machine.contact;
    const power =
      this.machine.phase === 'POWERING'
        ? this.machine.power
        : this.canonicalSeed?.power ?? optimalPowerCenter(contact, this.kicker, this.machine.power);
    return { aim: this.machine.aim, contact, power };
  }

  private updateAimingState(dt: number): void {
    const preview = this.currentPreview();
    this.cameraRig.updateAimingCamera(preview.intent, dt);
    this.updateContactSelector(preview.launch.shotType);
    const previewMode: TrajectoryPreviewMode =
      this.machine.phase === 'AIMING' ? 'aim_only' : 'shot_real';
    this.aimVisuals.update(
      this.ballStart,
      preview.input,
      this.kicker,
      this.aidLine,
      previewMode,
      this.barrierCollider,
    );
    this.hud.setCoach(t(techniqueTipKey(preview.launch.shotType)));
    if (this.debug.enabled) this.updateDebug(preview.intent, preview.launch);
  }

  private updateRunup(dt: number): void {
    const preview = this.currentPreview();
    this.cameraRig.updateAimingCamera(preview.intent, dt);
    if (this.debug.enabled) this.updateDebug(preview.intent, preview.launch);
  }

  private updateFlight(dt: number): void {
    if (!this.flight) return;
    this.applyStrikePunch(dt);
    this.updateBallSquash(dt);
    if (this.hitStopMs > 0) {
      this.hitStopMs -= dt * 1000;
      return;
    }
    this.flight.step(dt);
    this.flightTime += dt;
    this.ball.position.copy(this.flight.position);
    const keeperUpdate = this.goalkeeperController.update(dt);
    if (keeperUpdate.startedDive && this.goalkeeperController.plan) {
      this.goalkeeper.diveTo(this.goalkeeperController.plan.cross);
    }
    this.tryKeeperSave();
    if (this.activeShotType === 'driven_low') {
      this.cameraRig.updateGroundFlightCamera(dt);
    } else {
      this.cameraRig.updateFlightCamera(this.flight.state, dt);
    }
    this.spinBall(dt);
    this.samples.push({ p: this.flight.position.clone(), t: this.flightTime });
    this.trail.push(this.ball.position, performance.now());
    if (this.flight.done) this.machine.resolveFlight();
  }

  private updateResult(dt: number): void {
    this.resultElapsed += dt * 1000;
    this.netRipple.update(dt);
    if (this.resultMode === 'replay') this.updateReplay(dt);
    else {
      this.applyShakeAndZoom(dt, this.replayCamPos, this.replayCamLook);
      if (this.resultElapsed >= RESULT_WAIT_MS) this.advanceAfterResult();
    }
  }

  private updateReplay(dt: number): void {
    const tSec = this.resultElapsed / 1000;
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
    if (this.resultElapsed >= REPLAY_MAX_MS || tSec > lastT + REPLAY_HOLD_MS / 1000) {
      this.advanceAfterResult();
    }
  }

  private applyShakeAndZoom(dt: number, pos: THREE.Vector3, look: THREE.Vector3): void {
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

  private updateDebug(intent: ShotIntent, launch: ShotLaunch): void {
    const v = launch.velocity;
    const spin = launch.spin;
    const cross = launch.debug.arcCross;
    this.debug.set([
      `aim ${launch.debug.aimTarget?.x.toFixed(2) ?? '--'}, ${launch.debug.aimTarget?.y.toFixed(2) ?? '--'}`,
      `effectiveAim ${launch.debug.effectiveAimTarget?.x.toFixed(2) ?? '--'}, ${launch.debug.effectiveAimTarget?.y.toFixed(2) ?? '--'}`,
      `aimAzimuthDeg ${intent.aimAzimuthDeg.toFixed(2)}`,
      `contactX ${intent.contactX.toFixed(2)}`,
      `contactY ${intent.contactY.toFixed(2)}`,
      `shotType ${intent.shotType}`,
      `powerBars ${intent.powerBars.toFixed(2)}`,
      `speed ${launch.debug.initialSpeed.toFixed(2)}`,
      `launchAngleDeg ${launch.debug.launchAngleDeg.toFixed(2)}`,
      `velocity ${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)}`,
      `spin ${spin.x.toFixed(2)}, ${spin.y.toFixed(2)}, ${spin.z.toFixed(2)}`,
      `dragCd ${launch.dragCd.toFixed(2)}`,
      `MAGNUS_S ${MAGNUS_S.toFixed(5)}`,
      `wall ${this.wallDebugLine()}`,
      `wallHeight ${launch.debug.barrierHeight?.toFixed(2) ?? '--'}`,
      `maxHeight ${launch.debug.maxHeight.toFixed(2)}`,
      `goalCross ${cross?.x.toFixed(2) ?? '--'}, ${cross?.y.toFixed(2) ?? '--'}`,
      `timeToGoal ${launch.debug.timeToGoal?.toFixed(2) ?? '--'}`,
      `result ${launch.debug.estimatedResult}`,
      `kickerFoot ${this.kicker.foot}`,
      `keeper ${this.goalkeeperController.debugLine()}`,
      `selErr ${this.contactCenterError()}`,
    ]);
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
    this.machine.setAim(clamp(x, -AIM_X_LIMIT, AIM_X_LIMIT), clamp(y, AIM_Y_MIN, AIM_Y_MAX));
  }

  private updateContactSelector(shotType: ShotLaunch['shotType']): void {
    const c = this.machine.contact;
    this.contactSelector.setContact(c.x, c.y);
    this.contactSelector.update(this.camera);
    this.hud.setContactType(t(`shot.${shotTypeLabelKey(shotType)}`));
  }

  private spinBall(dt: number): void {
    const state = this.flight?.state;
    if (!state) return;
    // Rodadura por velocidad: el balón "tumbla" hacia donde viaja (eje ⟂ a v).
    const v = state.vel;
    const speed = v.length();
    if (speed > 1e-3) {
      const rollAxis = new THREE.Vector3().crossVectors(v, THREE.Object3D.DEFAULT_UP).normalize();
      this.ball.rotateOnWorldAxis(rollAxis, (speed / BALL_RADIUS) * dt * ROLL_FACTOR * 0.05);
    }
    // Spin de la receta (comba/caída) — giro propio adicional.
    const spinMag = state.spin.length();
    if (spinMag > 1e-4) {
      this.ball.rotateOnWorldAxis(state.spin.clone().normalize(), spinMag * dt * SPIN_FACTOR);
    }
  }

  /** Golpe de cámara en el impacto: arranca con zoom-in y se abre. */
  private applyStrikePunch(dt: number): void {
    if (this.strikeMs <= 0) return;
    const f = this.strikeMs / STRIKE_MS; // 1 (contacto) → 0
    this.camera.fov = this.baseFov - STRIKE_ZOOM_DEG * f;
    this.camera.updateProjectionMatrix();
    this.strikeMs -= dt * 1000;
    if (this.strikeMs <= 0) {
      this.camera.fov = this.baseFov;
      this.camera.updateProjectionMatrix();
    }
  }

  /** Pop de deformación del balón al ser golpeado. */
  private updateBallSquash(dt: number): void {
    if (this.ballSquashMs <= 0) return;
    const f = this.ballSquashMs / SQUASH_MS; // 1 → 0
    this.ball.scale.setScalar(1 + SQUASH_AMT * f);
    this.ballSquashMs -= dt * 1000;
    if (this.ballSquashMs <= 0) this.ball.scale.setScalar(1);
  }

  private onPhase(phase: ShotPhase): void {
    switch (phase) {
      case 'AIMING':
        this.seedCanonicalIfNeeded();
        this.flight = null;
        this.activeShotType = null;
        this.resultMode = 'none';
        this.strikeMs = 0;
        this.ballSquashMs = 0;
        this.trail.clear();
        this.ball.position.copy(this.ballStart);
        this.ball.scale.setScalar(1);
        this.aimCount += 1;
        if (this.aimCount > 1) playWhistle();
        this.cameraRig.reset();
        this.kickerActor.setKicker(this.kicker, this.ballStart);
        this.goalkeeper.reset();
        this.goalkeeperController.reset();
        this.barrierActor.settle();
        this.barrierActor.setVisible(true);
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
      case 'POWERING': {
        this.aimVisuals.setVisible(true);
        this.contactSelector.setVisible(true);
        const center = optimalPowerCenter(this.machine.contact, this.kicker, this.machine.power);
        const half = perfectPowerWindow(this.machine.contact, this.kicker, this.machine.power);
        this.hud.power.setOptimal(center, half);
        this.hud.power.setVisible(true);
        this.hud.setHint(t('hud.hintPower'));
        break;
      }
      case 'RUNUP':
        this.aimVisuals.setVisible(false);
        this.contactSelector.setVisible(false);
        this.hud.setContactType(null);
        this.hud.setCoach(null);
        this.hud.setHint('');
        break;
      case 'FLIGHT':
        this.launch();
        this.aimVisuals.setVisible(false);
        this.contactSelector.setVisible(false);
        this.hud.setContactType(null);
        this.hud.power.setVisible(false);
        this.hitStopMs = this.activeShotType === 'driven_low' ? 25 : HIT_STOP_MS;
        this.strikeMs = STRIKE_MS;
        this.ballSquashMs = SQUASH_MS;
        this.flightTime = 0;
        this.samples.length = 0;
        this.trail.clear();
        playKick(this.machine.power);
        playWhoosh(this.lastLaunch?.debug.initialSpeed ?? 28);
        break;
      case 'RESULT':
        this.onResult();
        break;
    }
  }

  private onResult(): void {
    const event = this.flight?.event ?? 'OUT';
    this.resultElapsed = 0;
    // Cierra el punch de cámara por si el vuelo terminó antes de los 200 ms.
    this.strikeMs = 0;
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
    this.hud.setResult(event);
    this.hud.setHint(t('hud.tapToContinue'));
    this.showCoachDiagnosis(event);
    this.recordSessionShot(event);

    if (event === 'GOAL') {
      this.resultMode = 'replay';
      this.shakeMs = SHAKE_MS;
      playCrowd();
      playNet();
      const cross = this.flight?.cross;
      if (cross) this.netRipple.trigger(cross.x, cross.y);
    } else if (event === 'POST' || event === 'CROSSBAR') {
      this.resultMode = 'wait';
      this.postZoomMs = POST_ZOOM_MS;
      playPost();
      playGroan();
    } else {
      this.resultMode = 'wait';
      playGroan();
    }
  }

  /** Diagnóstico de una línea del entrenador, desde datos reales del tiro. */
  private showCoachDiagnosis(event: ShotEvent): void {
    const powerDelta =
      this.machine.power -
      optimalPowerCenter(this.machine.contact, this.kicker, this.machine.power);
    this.hud.setCoach(
      t(
        postShotTipKey({
          event,
          perfectPower: this.lastLaunch?.perfectPower ?? false,
          powerDelta,
          maxHeight: this.lastLaunch?.debug.maxHeight ?? 0,
        }),
      ),
    );
  }

  private onPowerReleased(power: number): void {
    if (isPerfectPower(power, this.machine.contact, this.kicker)) {
      this.hud.power.flashPerfect();
      playPerfect();
      navigator.vibrate?.(40);
    }
  }

  private launch(): void {
    const ctx = this.solveContext();
    const intent = shotIntentFromInput(this.machine.getInput(), ctx);
    const launch = solveShotIntent(intent, ctx);
    this.activeShotType = launch.shotType;
    this.lastLaunch = launch;
    this.goalkeeperController.prepare(estimateFromDebug(launch.debug));

    // La barrera salta con probabilidad del nivel: el balón rasante pasa por
    // debajo, pero el remate por arriba queda más difícil. Solo afecta el vuelo
    // real (el preview/arquero no conocen el salto de antemano).
    const jumps = Boolean(this.barrierCollider) && Math.random() < this.wallJumpChance;
    const flightBarrier =
      jumps && this.barrierCollider
        ? raiseBarrier(this.barrierCollider, WALL_JUMP_RISE)
        : this.barrierCollider;
    if (jumps) this.barrierActor.jump();

    this.flight = new Flight(launchToBallState(this.ballStart, launch), {
      dragCd: launch.dragCd,
      magnusScale: launch.magnusScale,
      groundBounceScale: launch.groundBounceScale,
      ...(flightBarrier ? { barrier: flightBarrier } : {}),
    });
  }

  /** Carga un nivel (posición, barrera, arquero, pateador, ayuda) y lo arranca. */
  loadLevel(level: LevelSpec): void {
    this.currentLevel = level;
    this.session = new LevelSession(level);
    this.lastStatus = null;
    this.levelFinished = false;
    this.levelPanelShown = false;
    this.canonicalSeed = null;
    this.aimCount = 0;

    this.kicker = DIEGO; // MVP: Diego (o forcedKicker, hoy siempre Diego)
    this.machine.setRunupMs(this.kicker.runupMs);

    this.ballStart.set(level.ball.x, BALL_RADIUS, level.ball.z);
    this.ball.position.copy(this.ballStart);

    this.barrierSetup = level.wall
      ? { players: level.wall.players, distance: level.wall.distance }
      : null;
    this.wallJumpChance = level.wall?.jumpChance ?? 0;
    this.barrierCollider = buildBarrierCollider(this.ballStart, this.barrierSetup);
    this.barrierActor.setBarrier(this.barrierCollider, this.ballStart);

    this.goalkeeperConfig = {
      ...this.goalkeeperConfig,
      enabled: level.keeper != null,
      reactionDelay: level.keeper
        ? clamp(level.keeper.reactionMs / 1000, 0.12, 0.9)
        : this.goalkeeperConfig.reactionDelay,
      diveSpeed: level.keeper
        ? clamp(level.keeper.diveSpeed, 1.6, 8)
        : this.goalkeeperConfig.diveSpeed,
    };
    this.goalkeeperController = new GoalkeeperController(this.goalkeeperConfig);
    this.goalkeeper.setVisible(level.keeper != null);

    this.aidLine = level.aidLineOverride ?? this.kicker.line;

    this.cameraRig.setBallStart(this.ballStart);
    this.cameraRig.setFoot(this.kicker.foot === 'L' ? 'left' : 'right');
    this.kickerActor.setKicker(this.kicker, this.ballStart);

    this.hud.hideLevelPanel();
    this.updateLevelHud();
    this.inputEnabled = true;
    this.machine.reset(); // → AIMING (onPhase configura el resto)
  }

  retryLevel(): void {
    if (this.currentLevel) this.loadLevel(this.currentLevel);
  }

  /** Oculta la UI de nivel (panel + estado) al volver al menú. */
  hideLevelUi(): void {
    this.inputEnabled = false;
    this.hud.hideLevelPanel();
    this.hud.setStatus(null);
  }

  private updateLevelHud(): void {
    if (!this.session || !this.currentLevel) {
      this.hud.setStatus(null);
      return;
    }
    const st = this.lastStatus ?? this.session.status();
    const sc = this.currentLevel.scenario;
    this.hud.setStatus({
      name: t(this.currentLevel.nameKey),
      attemptsLeft: st.attemptsLeft,
      goalsScored: st.goalsScored,
      goalsNeeded: st.goalsNeeded,
      ...(sc ? { minute: sc.minute, scoreHome: sc.scoreHome, scoreAway: sc.scoreAway } : {}),
    });
  }

  private recordSessionShot(event: ShotEvent): void {
    if (!this.session) return;
    const outcome: ShotOutcome = {
      event,
      perfectPower: this.lastLaunch?.perfectPower ?? false,
      shotType: this.lastLaunch?.shotType ?? 'natural',
      usedAidLine: this.aidLine > 0,
      cross: this.flight?.cross ?? null,
    };
    this.lastStatus = this.session.recordShot(outcome);
    this.levelFinished = this.lastStatus.finished;
    this.updateLevelHud();
  }

  /** Decide tras mostrar el resultado de un tiro: siguiente intento o panel. */
  private advanceAfterResult(): void {
    if (this.session && this.levelFinished) {
      if (!this.levelPanelShown && this.lastStatus) {
        this.levelPanelShown = true;
        this.hud.showLevelPanel(this.lastStatus, {
          onRetry: () => this.retryLevel(),
          onNext: () => this.onRequestNext?.(),
          onMenu: () => this.onRequestMenu?.(),
        });
        if (this.currentLevel) this.onLevelResolved?.(this.lastStatus, this.currentLevel);
      }
      return;
    }
    this.machine.reset();
  }

  private press(): void {
    if (!this.inputEnabled) return;
    if (this.machine.phase === 'RESULT') {
      // Con el panel de nivel abierto, el botón manda; ignorar el tap global.
      if (this.levelFinished) return;
      this.machine.reset();
    } else this.machine.press();
  }

  private release(): void {
    if (!this.inputEnabled) return;
    this.machine.release();
  }

  private aimFromPointer(clientX: number, clientY: number): void {
    if (!this.inputEnabled) return;
    if (this.machine.phase !== 'AIMING') return;
    const ndc = new THREE.Vector2(
      (clientX / window.innerWidth) * 2 - 1,
      -((clientY / window.innerHeight) * 2 - 1),
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.goalPlane, hit)) this.setAim(hit.x, hit.y);
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.inputEnabled) return;
    if (this.machine.phase === 'AIMING') this.aimFromPointer(e.clientX, e.clientY);
    else if (this.machine.phase === 'CONTACT') {
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
    if (!this.inputEnabled) return;
    switch (e.code) {
      case 'KeyQ':
        if (!e.repeat) this.switchKicker();
        break;
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
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    if (!this.inputEnabled) return;
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
    }
  }

  private contactCenterError(): string {
    const ballPx = this.projectPx(this.ball.position);
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const edgePx = this.projectPx(this.ball.position.clone().addScaledVector(right, BALL_RADIUS));
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

  private switchKicker(): void {
    if (this.machine.phase !== 'AIMING' && this.machine.phase !== 'CONTACT') return;
    const next = this.kicker.foot === 'L' ? TRAINING_RIGHT_FOOT : DIEGO;
    const currentContact = this.machine.contact;
    this.kicker = next;
    this.machine.setRunupMs(next.runupMs);
    this.machine.seed({
      contact: { x: -currentContact.x, y: currentContact.y },
      power: optimalPowerCenter(
        { x: -currentContact.x, y: currentContact.y },
        next,
        this.machine.power,
      ),
    });
    this.cameraRig.setFoot(next.foot === 'L' ? 'left' : 'right');
    this.kickerActor.setKicker(next, this.ballStart);
  }

  private wallDebugLine(): string {
    if (!this.barrierSetup || !this.barrierCollider) return 'off';
    return `${this.barrierSetup.players}@${this.barrierSetup.distance.toFixed(2)}m`;
  }

  private tryKeeperSave(): void {
    const plan = this.goalkeeperController.plan;
    if (!this.flight || !plan || !this.goalkeeperController.canSave(this.flight.position.z)) return;
    if (this.flight.done && this.flight.event !== 'GOAL') return;

    const cross = plan.cross;
    this.ball.position.set(cross.x, Math.max(BALL_RADIUS, cross.y), 0.12);
    this.flight.state.pos.copy(this.ball.position);
    this.goalkeeper.diveTo(cross);
    this.flight.forceFinish('SAVED', cross);
    this.goalkeeperController.markSaved();
  }
}
