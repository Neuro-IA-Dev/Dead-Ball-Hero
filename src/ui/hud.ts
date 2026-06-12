import { t } from '@/core/i18n';
import type { ShotEvent } from '@/core/collisions';
import type { SessionStatus } from '@/game/level-session';

export interface LevelStatusView {
  name: string;
  attemptsLeft: number;
  goalsScored: number;
  goalsNeeded: number;
  minute?: number;
  scoreHome?: number;
  scoreAway?: number;
}

export interface LevelPanelHandlers {
  onRetry: () => void;
  onNext: () => void;
  onMenu: () => void;
}

/**
 * HUD overlay (HTML/CSS) sobre el canvas.
 * - hint de fase + mensaje de resultado
 * - etiqueta del tipo de golpe (1.9b.3): franja inferior en mayúsculas; el
 *   selector de contacto en sí vive en el mundo 3D (`render/contact-selector`).
 * - barra única de potencia (sin timing).
 * Todos los textos pasan por `t()` (CLAUDE.md).
 */
export class Hud {
  private root: HTMLElement;
  private hintEl: HTMLElement;
  private messageEl: HTMLElement;
  private contactLabelEl: HTMLElement;
  private coachEl: HTMLElement;
  private statusEl: HTMLElement;
  private statusName: HTMLElement;
  private statusGoals: HTMLElement;
  private statusAttempts: HTMLElement;
  private statusScenario: HTMLElement;
  private panel: LevelPanel;
  readonly power: PowerBar;

  constructor(root: HTMLElement) {
    this.root = root;
    this.statusEl = el('div', 'hud-status');
    this.statusName = el('div', 'status-name');
    this.statusScenario = el('div', 'status-scenario');
    this.statusGoals = el('div', 'status-goals');
    this.statusAttempts = el('div', 'status-attempts');
    const statusRight = el('div', 'status-right');
    statusRight.append(this.statusGoals, this.statusAttempts);
    const statusLeft = el('div', 'status-left');
    statusLeft.append(this.statusName, this.statusScenario);
    this.statusEl.append(statusLeft, statusRight);

    this.hintEl = el('div', 'hud-hint');
    this.messageEl = el('div', 'hud-message');
    this.contactLabelEl = el('div', 'contact-label');
    this.coachEl = el('div', 'coach-line');
    this.power = new PowerBar();
    this.panel = new LevelPanel();
    this.root.append(
      this.statusEl,
      this.hintEl,
      this.messageEl,
      this.contactLabelEl,
      this.coachEl,
      this.power.root,
      this.panel.root,
    );
  }

  /** Barra de estado del nivel (nombre, goles, intentos, contexto). */
  setStatus(s: LevelStatusView | null): void {
    if (!s) {
      this.statusEl.classList.remove('show');
      return;
    }
    this.statusName.textContent = s.name;
    this.statusGoals.textContent = t('hud.goals', { scored: s.goalsScored, needed: s.goalsNeeded });
    this.statusAttempts.textContent = t('hud.attemptsLeft', { n: s.attemptsLeft });
    if (s.minute != null && (s.scoreHome != null || s.scoreAway != null)) {
      this.statusScenario.textContent = `${t('hud.minute', { min: s.minute })} · ${s.scoreHome ?? 0}-${s.scoreAway ?? 0}`;
      this.statusScenario.classList.add('show');
    } else {
      this.statusScenario.classList.remove('show');
    }
    this.statusEl.classList.add('show');
  }

  showLevelPanel(status: SessionStatus, handlers: LevelPanelHandlers): void {
    this.panel.show(status, handlers);
  }

  hideLevelPanel(): void {
    this.panel.hide();
  }

  setHint(text: string): void {
    this.hintEl.textContent = text;
  }

  /** Consejo del entrenador (técnica al apuntar, diagnóstico tras el tiro). */
  setCoach(text: string | null): void {
    if (!text) {
      this.coachEl.classList.remove('show');
      this.coachEl.textContent = '';
      return;
    }
    this.coachEl.textContent = text;
    this.coachEl.classList.add('show');
  }

  /** Etiqueta del tipo de golpe (mayúsculas) o null para ocultarla. */
  setContactType(text: string | null): void {
    if (!text) {
      this.contactLabelEl.classList.remove('show');
      this.contactLabelEl.textContent = '';
      return;
    }
    this.contactLabelEl.textContent = text;
    this.contactLabelEl.classList.add('show');
  }

  setResult(event: ShotEvent | null): void {
    if (!event) {
      this.messageEl.classList.remove('show');
      this.messageEl.textContent = '';
      return;
    }
    this.messageEl.textContent = t(resultKey(event));
    this.messageEl.classList.toggle('is-goal', event === 'GOAL');
    this.messageEl.classList.add('show');
  }
}

/**
 * Barra de potencia de 5 segmentos (1.8). Muestra el llenado [1..5] y una
 * banda de "zona óptima" (~2.5–3.5 barras). El brillo de "potencia perfecta"
 * por tipo de golpe se añade en 1.9b.4.
 */
export class PowerBar {
  readonly root: HTMLElement;
  private fill: HTMLElement;
  private optimal: HTMLElement;

  constructor() {
    this.root = el('div', 'power-bar');
    const track = el('div', 'power-track');
    this.fill = el('div', 'power-fill');
    track.append(this.fill);
    // Ventana de "potencia perfecta" del tipo de golpe (se ubica con setOptimal).
    this.optimal = el('div', 'power-optimal');
    track.append(this.optimal);
    // Divisores de los 5 segmentos.
    for (let i = 1; i < 5; i++) {
      const d = el('div', 'power-divider');
      d.style.left = `${(i / 4) * 100}%`;
      track.append(d);
    }
    this.root.append(track);
    this.setOptimal(2.75, 0.5);
  }

  setVisible(v: boolean): void {
    this.root.classList.toggle('show', v);
  }

  /** `bars` en [1..5]. */
  setValue(bars: number): void {
    this.fill.style.width = `${frac(bars) * 100}%`;
  }

  /** Ubica la banda óptima: `center` barras ± `half` barras. */
  setOptimal(center: number, half: number): void {
    const lo = frac(center - half);
    const hi = frac(center + half);
    this.optimal.style.left = `${lo * 100}%`;
    this.optimal.style.width = `${(hi - lo) * 100}%`;
  }

  /** Brillo dorado de "potencia perfecta" al soltar. */
  flashPerfect(): void {
    this.root.classList.remove('perfect');
    // Reinicia la animación.
    void this.root.offsetWidth;
    this.root.classList.add('perfect');
  }
}

/**
 * Panel de resultado del nivel (1.15): título, estrellas 1–3 y botones
 * Reintentar / Siguiente. Es el único elemento interactivo del HUD
 * (`pointer-events: auto`).
 */
class LevelPanel {
  readonly root: HTMLElement;
  private titleEl: HTMLElement;
  private starsEl: HTMLElement;
  private retryBtn: HTMLButtonElement;
  private nextBtn: HTMLButtonElement;
  private menuBtn: HTMLButtonElement;
  private handlers: LevelPanelHandlers | null = null;

  constructor() {
    this.root = el('div', 'level-panel');
    const card = el('div', 'level-card');
    this.titleEl = el('div', 'level-title');
    this.starsEl = el('div', 'level-stars');
    const buttons = el('div', 'level-buttons');
    this.menuBtn = button('btn btn-ghost', t('common.back'), () => this.handlers?.onMenu());
    this.retryBtn = button('btn btn-secondary', t('common.retry'), () => this.handlers?.onRetry());
    this.nextBtn = button('btn btn-primary', t('common.next'), () => this.handlers?.onNext());
    buttons.append(this.menuBtn, this.retryBtn, this.nextBtn);
    card.append(this.titleEl, this.starsEl, buttons);
    this.root.append(card);
  }

  show(status: SessionStatus, handlers: LevelPanelHandlers): void {
    this.handlers = handlers;
    this.titleEl.textContent = status.passed
      ? t('result.levelComplete')
      : t('result.levelFailed');
    this.titleEl.classList.toggle('is-win', status.passed);
    this.starsEl.replaceChildren();
    for (let i = 1; i <= 3; i++) {
      const star = el('span', i <= status.stars ? 'star on' : 'star');
      star.textContent = '★';
      this.starsEl.append(star);
    }
    // Tras fallar no hay "siguiente": solo reintentar.
    this.nextBtn.style.display = status.passed ? '' : 'none';
    this.root.classList.add('show');
  }

  hide(): void {
    this.root.classList.remove('show');
  }
}

/** Fracción [0..1] del recorrido de la barra para `bars` en [1..5]. */
function frac(bars: number): number {
  return Math.max(0, Math.min(1, (bars - 1) / 4));
}

function resultKey(event: ShotEvent): string {
  switch (event) {
    case 'GOAL':
      return 'result.goal';
    case 'POST':
      return 'result.post';
    case 'CROSSBAR':
      return 'result.crossbar';
    case 'SAVED':
      return 'result.saved';
    case 'WALL':
      return 'result.wall';
    case 'OUT':
      return 'result.out';
  }
}

function el(tag: string, className: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

function button(className: string, label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = className;
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}
