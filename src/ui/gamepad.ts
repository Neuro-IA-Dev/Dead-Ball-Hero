import { t } from '@/core/i18n';

/**
 * Mando Fantasma v1 (jugable + espejo) — feature insignia de CLAUDE.md.
 *
 * Un mando GENÉRICO en pantalla (silueta propia, etiquetas STICK-I / STICK-D /
 * DISPARO, sin símbolos registrados de ningún fabricante) que cumple doble rol:
 *  1. **Control táctil** en celular: stick-I apunta, stick-D elige el contacto,
 *     el botón DISPARO mantiene/suelta la potencia.
 *  2. **Espejo** en PC: refleja en vivo tus inputs (mira/contacto/potencia)
 *     aunque juegues con teclado/mouse.
 *
 * No toca Three.js: solo DOM/CSS. La lógica de tiro vive en `ShotMachine`/`Game`;
 * aquí solo se capturan gestos y se reflejan estados.
 */

export interface PhantomPadCallbacks {
  onPressStart: () => void;
  onPressEnd: () => void;
  onCycleKicker: () => void;
}

interface Vec2 {
  x: number;
  y: number;
}

export interface PadMirror {
  /** Deflexión [-1,1] a reflejar en el stick izquierdo (mira). */
  aim: Vec2;
  /** Deflexión [-1,1] del stick derecho (contacto). */
  contact: Vec2;
  /** Potencia [0,1] para el llenado del botón DISPARO. */
  power: number;
  /** Resalta el stick activo según la fase. */
  active: 'aim' | 'contact' | 'fire' | 'none';
}

/** Travel del pomo dentro del pozo (px). Debe coincidir con el CSS. */
const KNOB_TRAVEL = 30;

class Stick {
  readonly root: HTMLElement;
  private knob: HTMLElement;
  private deflection: Vec2 = { x: 0, y: 0 };
  private dragging = false;
  private pointerId: number | null = null;

  constructor(label: string, cssClass: string) {
    this.root = document.createElement('div');
    this.root.className = `pad-stick ${cssClass}`;
    const well = document.createElement('div');
    well.className = 'pad-well';
    this.knob = document.createElement('div');
    this.knob.className = 'pad-knob';
    well.append(this.knob);
    const tag = document.createElement('div');
    tag.className = 'pad-label';
    tag.textContent = label;
    this.root.append(well, tag);

    well.addEventListener('pointerdown', (e) => this.start(e, well));
    well.addEventListener('pointermove', (e) => this.move(e, well));
    well.addEventListener('pointerup', (e) => this.end(e, well));
    well.addEventListener('pointercancel', (e) => this.end(e, well));
  }

  private start(e: PointerEvent, well: HTMLElement): void {
    e.preventDefault();
    e.stopPropagation();
    this.dragging = true;
    this.pointerId = e.pointerId;
    well.setPointerCapture(e.pointerId);
    this.move(e, well);
  }

  private move(e: PointerEvent, well: HTMLElement): void {
    if (!this.dragging || e.pointerId !== this.pointerId) return;
    e.stopPropagation();
    const rect = well.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const r = rect.width / 2;
    let dx = (e.clientX - cx) / r;
    let dy = (e.clientY - cy) / r;
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    // Pantalla: y hacia abajo es positivo; en el juego "arriba" es +y.
    this.deflection = { x: dx, y: -dy };
    this.place(dx, dy);
  }

  private end(e: PointerEvent, well: HTMLElement): void {
    if (e.pointerId !== this.pointerId) return;
    e.stopPropagation();
    this.dragging = false;
    this.pointerId = null;
    if (well.hasPointerCapture(e.pointerId)) well.releasePointerCapture(e.pointerId);
    this.deflection = { x: 0, y: 0 };
    this.place(0, 0);
  }

  private place(nx: number, ny: number): void {
    this.knob.style.transform = `translate(${nx * KNOB_TRAVEL}px, ${ny * KNOB_TRAVEL}px)`;
  }

  /** Deflexión actual del gesto ([-1,1], y hacia arriba positivo). */
  value(): Vec2 {
    return this.deflection;
  }

  get isDragging(): boolean {
    return this.dragging;
  }

  /** Espejo: refleja un estado externo si el usuario NO está arrastrando. */
  mirror(v: Vec2): void {
    if (this.dragging) return;
    this.place(clamp(v.x, -1, 1), clamp(-v.y, -1, 1));
  }

  setActive(active: boolean): void {
    this.root.classList.toggle('active', active);
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export class PhantomPad {
  readonly root: HTMLElement;
  private left: Stick;
  private right: Stick;
  private fire: HTMLElement;
  private fireFill: HTMLElement;
  private switchKicker: HTMLButtonElement;

  constructor(parent: HTMLElement, cb: PhantomPadCallbacks) {
    this.root = document.createElement('div');
    this.root.className = 'phantom-pad';

    this.left = new Stick(t('hud.ghostAim'), 'pad-left');
    this.right = new Stick(t('hud.ghostContact'), 'pad-right');

    this.fire = document.createElement('div');
    this.fire.className = 'pad-fire';
    this.fireFill = document.createElement('div');
    this.fireFill.className = 'pad-fire-fill';
    const fireLabel = document.createElement('div');
    fireLabel.className = 'pad-fire-label';
    fireLabel.textContent = t('hud.ghostShot');
    this.fire.append(this.fireFill, fireLabel);

    this.switchKicker = document.createElement('button');
    this.switchKicker.type = 'button';
    this.switchKicker.className = 'pad-switch-kicker';
    this.switchKicker.textContent = t('hud.ghostPlayer');
    this.switchKicker.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      cb.onCycleKicker();
    });
    this.switchKicker.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    const press = (e: PointerEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      this.fire.classList.add('down');
      cb.onPressStart();
    };
    const release = (e: PointerEvent): void => {
      e.stopPropagation();
      this.fire.classList.remove('down');
      cb.onPressEnd();
    };
    this.fire.addEventListener('pointerdown', press);
    this.fire.addEventListener('pointerup', release);
    this.fire.addEventListener('pointercancel', release);

    const center = document.createElement('div');
    center.className = 'pad-center';
    center.append(this.switchKicker, this.fire);

    this.root.append(this.left.root, center, this.right.root);
    parent.append(this.root);
  }

  /** Deflexión del stick-I (mira), [-1,1]. */
  aimVector(): Vec2 {
    return this.left.value();
  }

  /** Deflexión del stick-D (contacto), [-1,1]. */
  contactVector(): Vec2 {
    return this.right.value();
  }

  /** Refleja el estado del juego en los pomos/botón (modo espejo). */
  setMirror(m: PadMirror): void {
    this.left.mirror(m.aim);
    this.right.mirror(m.contact);
    this.left.setActive(m.active === 'aim');
    this.right.setActive(m.active === 'contact');
    this.fire.classList.toggle('active', m.active === 'fire');
    this.fireFill.style.height = `${clamp(m.power, 0, 1) * 100}%`;
  }

  setVisible(v: boolean): void {
    this.root.classList.toggle('show', v);
  }
}
