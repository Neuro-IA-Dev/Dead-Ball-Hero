import { t } from '@/core/i18n';
import type { ShotEvent } from '@/core/collisions';

/**
 * HUD overlay (HTML/CSS) — se monta sobre el canvas.
 * 1.6: hint de fase + mensaje de resultado.
 * 1.7 añade la grilla de contacto; 1.8 la barra de potencia y el timing.
 * Todos los textos pasan por `t()` (prohibido hardcodear, CLAUDE.md).
 */
export class Hud {
  private root: HTMLElement;
  private hintEl: HTMLElement;
  private messageEl: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
    this.hintEl = el('div', 'hud-hint');
    this.messageEl = el('div', 'hud-message');
    this.root.append(this.hintEl, this.messageEl);
  }

  setHint(text: string): void {
    this.hintEl.textContent = text;
  }

  /** Mensaje grande de resultado (o null para ocultarlo). */
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
