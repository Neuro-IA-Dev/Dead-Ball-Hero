import * as THREE from 'three';
import './style.css';
import { initI18n, t } from '@/core/i18n';
import { createRenderContext } from '@/render/renderer';
import { buildWorld } from '@/render/world';
import { createBall } from '@/render/ball';
import { BALL_RADIUS } from '@/core/field';

/**
 * Punto de entrada.
 * 1.1 scaffold · 1.1b i18n · 1.2 escena base.
 * El ciclo de tiro (estados, apuntado, contacto, potencia, física) se monta
 * encima de esta escena en las tareas 1.3+.
 */

// i18n primero: detecta idioma del navegador y fija el locale (fallback es).
initI18n();
document.title = t('app.title');

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
if (!canvas) {
  throw new Error('No se encontró el canvas #game-canvas');
}

const { renderer, scene, camera } = createRenderContext(canvas);
buildWorld(scene);

const ball = createBall();
scene.add(ball);

// Cámara broadcast: detrás del balón, mirando al arco (z = 0).
const shotZ = ball.position.z;
camera.position.set(0, 1.8, shotZ + 5);
camera.lookAt(0, 1.1, 0);

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  // Giro sutil de demostración hasta que la física tome el control (1.3+).
  ball.rotation.y += dt * 0.4;
  ball.position.y = BALL_RADIUS;
  renderer.render(scene, camera);
});
