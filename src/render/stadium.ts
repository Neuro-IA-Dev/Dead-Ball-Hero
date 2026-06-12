import * as THREE from 'three';
import { GOAL_HEIGHT } from '@/core/field';

/**
 * Ambiente del estadio nocturno (mejora gráfica): tribunas con multitud
 * instanciada de colores, torres de iluminación con focos que florecen con el
 * bloom, pantalla del estadio con el logo y vallas publicitarias.
 *
 * El público es vibrante low-poly: `InstancedMesh` con `MeshBasicMaterial`
 * (color plano por instancia) — barato y estilizado. Se anima con un leve
 * balanceo colectivo vía `onBeforeRender` (sin tocar el loop del juego).
 */

const CROWD_PALETTE = [
  0xf4f4f4, 0xd9d9d9, 0xe23b3b, 0x2b67ff, 0xf2c33a, 0x2ecf6b, 0xff7a2f, 0x9b6cff, 0x18324a,
  0xffffff,
];

interface CrowdBlock {
  rows: number;
  cols: number;
  /** Esquina inferior-cercana del bloque. */
  origin: THREE.Vector3;
  /** Vector a lo ancho del bloque (todo el ancho). */
  across: THREE.Vector3;
  /** Vector que sube y retrocede la grada (todo el alto). */
  rake: THREE.Vector3;
}

function buildCrowd(blocks: CrowdBlock[]): THREE.InstancedMesh {
  const total = blocks.reduce((s, b) => s + b.rows * b.cols, 0);
  const geo = new THREE.BoxGeometry(0.32, 0.52, 0.3);
  const mat = new THREE.MeshBasicMaterial({ toneMapped: false });
  const mesh = new THREE.InstancedMesh(geo, mat, total);
  mesh.frustumCulled = false;

  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const color = new THREE.Color();
  const scale = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  let i = 0;

  for (const block of blocks) {
    for (let r = 0; r < block.rows; r++) {
      const v = block.rows > 1 ? r / (block.rows - 1) : 0;
      for (let c = 0; c < block.cols; c++) {
        const u = block.cols > 1 ? (c + 0.5) / block.cols : 0.5;
        pos
          .copy(block.origin)
          .addScaledVector(block.across, u)
          .addScaledVector(block.rake, v);
        pos.x += (Math.random() - 0.5) * 0.18;
        pos.z += (Math.random() - 0.5) * 0.18;
        pos.y += (Math.random() - 0.5) * 0.06;
        const h = 0.8 + Math.random() * 0.5;
        scale.set(1, h, 1);
        m.compose(pos, quat, scale);
        mesh.setMatrixAt(i, m);
        color.setHex(CROWD_PALETTE[(Math.random() * CROWD_PALETTE.length) | 0]!);
        mesh.setColorAt(i, color);
        i++;
      }
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  // Balanceo colectivo sutil (vida sin coste por instancia).
  const baseY = 0;
  mesh.onBeforeRender = () => {
    mesh.position.y = baseY + Math.sin(performance.now() * 0.0011) * 0.05;
  };
  return mesh;
}

function buildFloodlight(x: number, z: number, lookAt: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a3038, roughness: 0.7, metalness: 0.3 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 22, 8), poleMat);
  pole.position.set(x, 11, z);
  g.add(pole);

  const headW = 5;
  const headH = 2.2;
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(headW, headH, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x12161c, roughness: 0.6 }),
  );
  panel.position.set(x, 22.5, z);
  panel.lookAt(lookAt);
  g.add(panel);

  // Lámparas emisivas (florecen con el bloom).
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff6e0, toneMapped: false });
  const lampGeo = new THREE.PlaneGeometry(0.8, 0.8);
  for (let lx = 0; lx < 5; lx++) {
    for (let ly = 0; ly < 2; ly++) {
      const lamp = new THREE.Mesh(lampGeo, lampMat);
      lamp.position.set(
        x + (lx - 2) * 0.92,
        22.5 + (ly - 0.5) * 0.95,
        z,
      );
      lamp.lookAt(lookAt);
      lamp.position.addScaledVector(new THREE.Vector3().subVectors(lookAt, lamp.position).normalize(), 0.25);
      g.add(lamp);
    }
  }
  return g;
}

function makeScreenTexture(): THREE.CanvasTexture {
  const w = 512;
  const h = 220;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#060a12';
  ctx.fillRect(0, 0, w, h);
  // marco
  ctx.strokeStyle = '#1d3b52';
  ctx.lineWidth = 8;
  ctx.strokeRect(6, 6, w - 12, h - 12);
  // logo
  const grad = ctx.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, '#39ff88');
  grad.addColorStop(1, '#7fd7ff');
  ctx.fillStyle = grad;
  ctx.font = '900 70px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('DEAD BALL', w / 2, h / 2 - 34);
  ctx.fillText('HERO', w / 2, h / 2 + 42);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildScreen(): THREE.Mesh {
  const tex = makeScreenTexture();
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(15, 6.4), mat);
  screen.position.set(0, 14.5, -20.2);
  return screen;
}

function buildAdBoards(): THREE.Group {
  const g = new THREE.Group();
  const colors = [0x2b67ff, 0xe23b3b, 0xf2c33a, 0x2ecf6b, 0xff7a2f];
  const geo = new THREE.BoxGeometry(2.6, 0.9, 0.18);
  // Detrás de la línea de gol.
  let ci = 0;
  for (let x = -7.8; x <= 7.8; x += 2.7) {
    const mat = new THREE.MeshBasicMaterial({ color: colors[ci % colors.length]!, toneMapped: false });
    const board = new THREE.Mesh(geo, mat);
    board.position.set(x, 0.45, -0.55);
    g.add(board);
    ci++;
  }
  return g;
}

export function buildStadium(scene: THREE.Scene): THREE.Group {
  const group = new THREE.Group();

  // Estructura de tribunas (rampas oscuras bajo el público).
  const standMat = new THREE.MeshStandardMaterial({ color: 0x0e141d, roughness: 0.95 });
  const goalCenter = new THREE.Vector3(0, GOAL_HEIGHT, 0);

  // Multitud: detrás del arco (gran fondo) + dos laterales.
  const crowd = buildCrowd([
    {
      rows: 18,
      cols: 48,
      origin: new THREE.Vector3(-23, 2.2, -6),
      across: new THREE.Vector3(46, 0, 0),
      rake: new THREE.Vector3(0, 11, -18),
    },
    {
      rows: 16,
      cols: 42,
      origin: new THREE.Vector3(-35, 2.2, -12),
      across: new THREE.Vector3(0, 0, 44),
      rake: new THREE.Vector3(-14, 11, 0),
    },
    {
      rows: 16,
      cols: 42,
      origin: new THREE.Vector3(35, 2.2, -12),
      across: new THREE.Vector3(0, 0, 44),
      rake: new THREE.Vector3(14, 11, 0),
    },
  ]);
  group.add(crowd);

  // Rampas de soporte bajo cada bloque (oscuras, dan masa), fuera de la cancha.
  const backRamp = new THREE.Mesh(new THREE.BoxGeometry(50, 1.5, 20), standMat);
  backRamp.position.set(0, 6, -15);
  backRamp.rotation.x = -0.52;
  const leftRamp = new THREE.Mesh(new THREE.BoxGeometry(20, 1.5, 48), standMat);
  leftRamp.position.set(-39, 6, 10);
  leftRamp.rotation.z = 0.6;
  const rightRamp = leftRamp.clone();
  rightRamp.position.x = 39;
  rightRamp.rotation.z = -0.6;
  group.add(backRamp, leftRamp, rightRamp);

  // Torres de iluminación en las 4 esquinas (fuera del campo).
  group.add(
    buildFloodlight(-39, -22, goalCenter),
    buildFloodlight(39, -22, goalCenter),
    buildFloodlight(-39, 30, goalCenter),
    buildFloodlight(39, 30, goalCenter),
  );

  group.add(buildScreen(), buildAdBoards());

  scene.add(group);
  return group;
}
