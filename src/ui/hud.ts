import { t } from '@/core/i18n';
import type { ShotEvent } from '@/core/collisions';

/**
 * HUD overlay (HTML/CSS) sobre el canvas.
 * 1.6: hint + resultado · 1.7: grilla de contacto · 1.8/1.9b: barra única de
 * potencia (sin timing). Todos los textos pasan por `t()` (CLAUDE.md).
 */
export class Hud {
  private root: HTMLElement;
  private hintEl: HTMLElement;
  private messageEl: HTMLElement;
  readonly contact: ContactPad;
  readonly power: PowerBar;

  constructor(root: HTMLElement) {
    this.root = root;
    this.hintEl = el('div', 'hud-hint');
    this.messageEl = el('div', 'hud-message');
    this.contact = new ContactPad();
    this.power = new PowerBar();
    this.root.append(
      this.hintEl,
      this.messageEl,
      this.contact.root,
      this.power.root,
    );
  }

  setHint(text: string): void {
    this.hintEl.textContent = text;
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
 * Grilla de contacto (1.7). Un balón grande en HUD con grilla 3×3; el
 * indicador define el punto de golpeo: X = curva izq/der, Y = elevación/raso.
 * Pointer-events activos solo en el pad.
 */
export class ContactPad {
  readonly root: HTMLElement;
  private dot: HTMLElement;
  private value = { x: 0, y: 0 };
  /** Callback al mover el contacto (normalizado [-1,1], y+ = arriba). */
  onChange?: (x: number, y: number) => void;

  constructor() {
    this.root = el('div', 'contact-pad');
    const ball = el('div', 'contact-ball');
    // Líneas de la grilla 3×3.
    for (const cls of ['gl gv1', 'gl gv2', 'gl gh1', 'gl gh2']) {
      ball.append(el('div', cls));
    }
    this.dot = el('div', 'contact-dot');
    ball.append(this.dot);
    this.root.append(ball);
    this.bind(ball);
    this.setValue(0, 0);
  }

  setVisible(v: boolean): void {
    this.root.classList.toggle('show', v);
  }

  reset(): void {
    this.setValue(0, 0);
  }

  private bind(ball: HTMLElement): void {
    const update = (e: PointerEvent): void => {
      const r = ball.getBoundingClientRect();
      const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
      const ny = -(((e.clientY - r.top) / r.height) * 2 - 1);
      this.setValue(nx, ny);
      this.onChange?.(this.value.x, this.value.y);
    };
    ball.addEventListener('pointermove', (e) => {
      if (this.root.classList.contains('show')) update(e);
    });
    ball.addEventListener('pointerdown', update);
  }

  private setValue(x: number, y: number): void {
    this.value.x = clamp(x, -1, 1);
    this.value.y = clamp(y, -1, 1);
    // Posición del punto (y invertida para CSS).
    this.dot.style.left = `${((this.value.x + 1) / 2) * 100}%`;
    this.dot.style.top = `${((1 - this.value.y) / 2) * 100}%`;
  }
}

/**
 * Barra de potencia de 5 segmentos (1.8). Muestra el llenado [1..5] y una
 * banda de "zona óptima" (~2.5–3.5 barras: el sweet spot de la curva clásica).
 */
export class PowerBar {
  readonly root: HTMLElement;
  private fill: HTMLElement;

  constructor() {
    this.root = el('div', 'power-bar');
    const track = el('div', 'power-track');
    this.fill = el('div', 'power-fill');
    track.append(this.fill);
    // Zona óptima 2.5–3.5 barras → (1.5/4)..(2.5/4) del recorrido.
    const optimal = el('div', 'power-optimal');
    optimal.style.left = `${(1.5 / 4) * 100}%`;
    optimal.style.width = `${(1 / 4) * 100}%`;
    track.append(optimal);
    // Divisores de los 5 segmentos.
    for (let i = 1; i < 5; i++) {
      const d = el('div', 'power-divider');
      d.style.left = `${(i / 4) * 100}%`;
      track.append(d);
    }
    this.root.append(track);
  }

  setVisible(v: boolean): void {
    this.root.classList.toggle('show', v);
  }

  /** `bars` en [1..5]. */
  setValue(bars: number): void {
    const tNorm = Math.max(0, Math.min(1, (bars - 1) / 4));
    this.fill.style.width = `${tNorm * 100}%`;
  }
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

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function el(tag: string, className: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}
