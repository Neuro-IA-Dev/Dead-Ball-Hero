import './style.css';
import { initI18n, t } from '@/core/i18n';
import { createRenderContext } from '@/render/renderer';
import { buildWorld } from '@/render/world';
import { createBall } from '@/render/ball';
import { Game } from '@/game/game';
import { App } from '@/game/app';

/**
 * Punto de entrada.
 * 1.1 scaffold · 1.1b i18n · 1.2 escena · 1.5 FSM · 1.6 apuntado ·
 * 1.13–1.16 loop de juego (niveles, sesión/estrellas, HUD, menú).
 */

// i18n primero: detecta idioma del navegador y fija el locale (fallback es).
initI18n();
document.title = t('app.title');

const appEl = document.querySelector<HTMLElement>('#app');
const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
const hudRoot = document.querySelector<HTMLElement>('#hud');
if (!appEl || !canvas || !hudRoot) {
  throw new Error('Faltan #app, #game-canvas o #hud en el DOM');
}

const { renderer, scene, camera, render } = createRenderContext(canvas);
const world = buildWorld(scene);

const ball = createBall();
scene.add(ball);

// La cámara la posiciona el Game (apuntado por retícula, casi fija).
const game = new Game(
  renderer,
  scene,
  camera,
  ball,
  canvas,
  hudRoot,
  world.net,
  render,
  world.setTimeOfDay,
);
game.start();

// El menú (App) elige el nivel y arranca el juego; arranca mostrando el menú.
new App(game, appEl);
