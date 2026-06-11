import { t } from '@/core/i18n';
import type { ShotEvent } from '@/core/collisions';

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
  readonly power: PowerBar;

  constructor(root: HTMLElement) {
    this.root = root;
    this.hintEl = el('div', 'hud-hint');
    this.messageEl = el('div', 'hud-message');
    this.contactLabelEl = el('div', 'contact-label');
    this.power = new PowerBar();
    this.root.append(
      this.hintEl,
      this.messageEl,
      this.contactLabelEl,
      this.power.root,
    );
  }

  setHint(text: string): void {
    this.hintEl.textContent = text;
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
