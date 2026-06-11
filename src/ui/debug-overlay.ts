/**
 * Overlay de depuración — tarea 1.9b.6. Se activa con `?debug=1` en la URL.
 * Muestra en vivo azimut, contacto, potencia, sigma de dispersión y el punto
 * de cruce previsto en z=0. Sólo herramienta de QA; invisible en producción.
 */
export class DebugOverlay {
  readonly enabled: boolean;
  private el: HTMLElement | null = null;

  constructor(root: HTMLElement) {
    this.enabled =
      new URLSearchParams(window.location.search).get('debug') === '1';
    if (!this.enabled) return;
    this.el = document.createElement('pre');
    this.el.className = 'debug-overlay';
    root.append(this.el);
  }

  set(lines: string[]): void {
    if (this.el) this.el.textContent = lines.join('\n');
  }
}
