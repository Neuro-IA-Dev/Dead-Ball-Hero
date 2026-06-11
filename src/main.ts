import './style.css';
import { initI18n, t } from '@/core/i18n';
import { createRenderContext } from '@/render/renderer';
import { buildWorld } from '@/render/world';
import { createBall } from '@/render/ball';
import { Game } from '@/game/game';

/**
 * Punto de entrada.
 * 1.1 scaffold · 1.1b i18n · 1.2 escena · 1.5 FSM · 1.6 apuntado.
 */

// i18n primero: detecta idioma del navegador y fija el locale (fallback es).
initI18n();
document.title = t('app.title');

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
const hudRoot = document.querySelector<HTMLElement>('#hud');
if (!canvas || !hudRoot) {
  throw new Error('Faltan #game-canvas o #hud en el DOM');
}

const { renderer, scene, camera } = createRenderContext(canvas);
buildWorld(scene);

const ball = createBall();
scene.add(ball);

// La cámara la posiciona el Game (orbital de apuntado, 1.9b.2).
const game = new Game(renderer, scene, camera, ball, canvas, hudRoot);
game.start();
