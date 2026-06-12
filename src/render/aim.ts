import * as THREE from 'three';
import type { BarrierColliderConfig } from '@/core/collisions';
import { TrajectoryPreview, type TrajectoryPreviewMode } from '@/render/trajectory-preview';
import type { Kicker } from '@/game/kicker';
import type { ShotInput } from '@/game/shot-machine';

/**
 * Ayudas de apuntado. Decisión del usuario (2026-06-12): **se elimina la
 * retícula de caída** (el anillo/cruz sobre el arco) — no existe en el referente
 * y volvía trivial el tiro en PC. Se conserva el disparo y la **línea de
 * proyección** (que sí existe en el referente y cuyo largo escala con el stat
 * LÍNEA / la ayuda del nivel; en Acto 4 se apaga por completo).
 */
export class AimVisuals {
  readonly preview: TrajectoryPreview;
  private lineEnabled = true;

  constructor(scene: THREE.Scene) {
    this.preview = new TrajectoryPreview(scene);
  }

  setVisible(v: boolean): void {
    this.preview.setVisible(v && this.lineEnabled);
  }

  setLineEnabled(enabled: boolean): void {
    this.lineEnabled = enabled;
    this.preview.setVisible(enabled);
  }

  update(
    ballPos: THREE.Vector3,
    input: ShotInput,
    kicker: Kicker,
    lineFraction: number,
    previewMode: TrajectoryPreviewMode,
    barrier?: BarrierColliderConfig,
  ): void {
    if (this.lineEnabled) {
      this.preview.update(ballPos, input, kicker, lineFraction, previewMode, barrier);
    }
  }
}
