import * as THREE from 'three';

/**
 * Contexto de render — tarea 1.2.
 * Crea renderer + escena + cámara y gestiona el resize. El loop lo conduce
 * quien lo use (main / game), para no acoplar render con la lógica de juego.
 */
export interface RenderContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Llamar al cambiar el tamaño de la ventana. */
  resize: () => void;
  dispose: () => void;
}

export function createRenderContext(canvas: HTMLCanvasElement): RenderContext {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();

  // Cámara "broadcast" detrás del punto de tiro (mira hacia el arco en z=0).
  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 500);

  function resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  window.addEventListener('resize', resize);
  resize();

  function dispose(): void {
    window.removeEventListener('resize', resize);
    renderer.dispose();
  }

  return { renderer, scene, camera, resize, dispose };
}
