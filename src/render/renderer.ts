import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/**
 * Contexto de render — tarea 1.2, mejorado con post-procesado (bloom) para el
 * look de estadio nocturno vibrante. El loop lo conduce quien lo use (Game) a
 * través de `render()`, que pasa por el EffectComposer.
 */
export interface RenderContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Renderiza un frame (escena → bloom → pantalla). */
  render: () => void;
  resize: () => void;
  dispose: () => void;
}

export function createRenderContext(canvas: HTMLCanvasElement): RenderContext {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.82;

  const scene = new THREE.Scene();

  // Iluminación basada en entorno (IBL): un PMREM neutro da gradientes suaves a
  // todos los MeshStandard → los jugadores ganan volumen y dejan de verse planos
  // ("muñecos"). Intensidad baja para no romper el clima nocturno.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.18;
  pmrem.dispose();

  // Cámara "broadcast" detrás del punto de tiro (mira hacia el arco en z=0).
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);

  // Post-procesado: render → bloom selectivo (solo lo brillante) → salida ACES.
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.16, // strength
    0.28, // radius
    0.94, // threshold: bloom solo en focos realmente intensos
  );
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  function resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  window.addEventListener('resize', resize);
  resize();

  function render(): void {
    composer.render();
  }

  function dispose(): void {
    window.removeEventListener('resize', resize);
    composer.dispose();
    renderer.dispose();
  }

  return { renderer, scene, camera, render, resize, dispose };
}
