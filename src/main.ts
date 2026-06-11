import * as THREE from 'three';
import './style.css';
import { initI18n, t } from '@/core/i18n';

/**
 * Punto de entrada — tarea 1.1 (scaffold) + 1.1b (i18n).
 * Esto es un sanity-check del stack Three.js: un cubo girando que confirma
 * renderer + loop + resize. La escena real del juego (campo, arco, luces,
 * cámara detrás del tiro) llega en la tarea 1.2 y reemplaza este placeholder.
 */

// i18n primero: detecta idioma del navegador y fija el locale (fallback es).
initI18n();
document.title = t('app.title');

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
if (!canvas) {
  throw new Error('No se encontró el canvas #game-canvas');
}

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0e14);

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
camera.position.set(0, 0, 4);

const cube = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0x2ecf6b }),
);
scene.add(cube);

const ambient = new THREE.AmbientLight(0xffffff, 0.4);
const key = new THREE.DirectionalLight(0xffffff, 1.2);
key.position.set(2, 3, 4);
scene.add(ambient, key);

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  cube.rotation.x += dt * 0.6;
  cube.rotation.y += dt * 0.9;
  renderer.render(scene, camera);
});
