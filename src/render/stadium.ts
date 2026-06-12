import * as THREE from 'three';
import { GOAL_HEIGHT } from '@/core/field';

const CROWD_PALETTE = [
  0xf4f4f4, 0xd9d9d9, 0xe23b3b, 0x2b67ff, 0xf2c33a, 0x2ecf6b, 0xff7a2f, 0x7fd7ff, 0x18324a,
  0xffffff,
];

const SKIN_PALETTE = [0xf0c69a, 0xc98b5a, 0x8d5538, 0x5b3a2b];

interface CrowdBlock {
  rows: number;
  cols: number;
  origin: THREE.Vector3;
  across: THREE.Vector3;
  rake: THREE.Vector3;
}

function buildCrowd(blocks: CrowdBlock[]): THREE.Group {
  const group = new THREE.Group();
  const total = blocks.reduce((s, b) => s + b.rows * b.cols, 0);
  const bodyGeo = new THREE.BoxGeometry(0.3, 0.44, 0.24);
  const headGeo = new THREE.SphereGeometry(0.13, 8, 6);
  const bodyMat = new THREE.MeshBasicMaterial({ toneMapped: false });
  const headMat = new THREE.MeshBasicMaterial({ toneMapped: false });
  const bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, total);
  const heads = new THREE.InstancedMesh(headGeo, headMat, total);
  bodies.frustumCulled = false;
  heads.frustumCulled = false;

  const bodyMatrix = new THREE.Matrix4();
  const headMatrix = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const headPos = new THREE.Vector3();
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
        pos.y += (Math.random() - 0.5) * 0.04;

        const h = 0.78 + Math.random() * 0.45;
        scale.set(1, h, 1);
        bodyMatrix.compose(pos, quat, scale);
        bodies.setMatrixAt(i, bodyMatrix);
        color.setHex(CROWD_PALETTE[(Math.random() * CROWD_PALETTE.length) | 0]!);
        bodies.setColorAt(i, color);

        headPos.copy(pos).add(new THREE.Vector3(0, 0.34 + h * 0.17, 0.01));
        headMatrix.compose(headPos, quat, new THREE.Vector3(1, 1, 1));
        heads.setMatrixAt(i, headMatrix);
        color.setHex(SKIN_PALETTE[(Math.random() * SKIN_PALETTE.length) | 0]!);
        heads.setColorAt(i, color);
        i++;
      }
    }
  }

  bodies.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;
  if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
  if (heads.instanceColor) heads.instanceColor.needsUpdate = true;

  const animate = (): void => {
    group.position.y = Math.sin(performance.now() * 0.0011) * 0.035;
  };
  bodies.onBeforeRender = animate;
  heads.onBeforeRender = animate;
  group.add(bodies, heads);
  return group;
}

function buildFloodlight(x: number, z: number, lookAt: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a3038, roughness: 0.7, metalness: 0.3 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 22, 8), poleMat);
  pole.position.set(x, 11, z);
  pole.castShadow = true;
  g.add(pole);

  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(5.2, 2.35, 0.44),
    new THREE.MeshStandardMaterial({ color: 0x12161c, roughness: 0.58 }),
  );
  panel.position.set(x, 22.5, z);
  panel.lookAt(lookAt);
  panel.castShadow = true;
  g.add(panel);

  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff6e0, toneMapped: false });
  const lampGeo = new THREE.PlaneGeometry(0.82, 0.82);
  for (let lx = 0; lx < 5; lx++) {
    for (let ly = 0; ly < 2; ly++) {
      const lamp = new THREE.Mesh(lampGeo, lampMat);
      lamp.position.set(x + (lx - 2) * 0.92, 22.5 + (ly - 0.5) * 0.95, z);
      lamp.lookAt(lookAt);
      lamp.position.addScaledVector(new THREE.Vector3().subVectors(lookAt, lamp.position).normalize(), 0.25);
      g.add(lamp);
    }
  }
  return g;
}

function makeScreenTexture(): THREE.CanvasTexture {
  const w = 640;
  const h = 280;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, '#08121f');
  bg.addColorStop(0.55, '#071623');
  bg.addColorStop(1, '#02050a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = '#244866';
  ctx.lineWidth = 10;
  ctx.strokeRect(8, 8, w - 16, h - 16);

  const scan = ctx.createLinearGradient(0, 0, w, 0);
  scan.addColorStop(0, 'rgba(57, 255, 136, 0.0)');
  scan.addColorStop(0.5, 'rgba(57, 255, 136, 0.24)');
  scan.addColorStop(1, 'rgba(127, 215, 255, 0.0)');
  for (let y = 28; y < h; y += 24) {
    ctx.fillStyle = scan;
    ctx.fillRect(28, y, w - 56, 2);
  }

  const title = ctx.createLinearGradient(0, 0, w, 0);
  title.addColorStop(0, '#39ff88');
  title.addColorStop(1, '#7fd7ff');
  ctx.fillStyle = title;
  ctx.font = '900 78px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('DEAD BALL', w / 2, h / 2 - 38);
  ctx.fillText('HERO', w / 2, h / 2 + 42);
  ctx.font = '800 24px system-ui, sans-serif';
  ctx.fillStyle = '#f5f9ff';
  ctx.fillText('PRACTICA EL GOLPE PERFECTO', w / 2, h - 34);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildScreen(): THREE.Mesh {
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(16.5, 7.2),
    new THREE.MeshBasicMaterial({ map: makeScreenTexture(), toneMapped: false }),
  );
  screen.position.set(0, 15.2, -21.2);
  return screen;
}

function makeAdTexture(label: string, bg: string, fg: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
  grad.addColorStop(0, bg);
  grad.addColorStop(1, '#061018');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.fillRect(0, 0, canvas.width, 16);
  ctx.fillRect(0, canvas.height - 16, canvas.width, 16);
  ctx.fillStyle = fg;
  ctx.font = '900 46px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, canvas.width / 2, canvas.height / 2 + 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildAdBoards(): THREE.Group {
  const g = new THREE.Group();
  const boards = [
    ['CURVA', '#1b63ff', '#ffffff'],
    ['BARRIO FC', '#df3131', '#ffffff'],
    ['HERO SPORTS', '#f1bb24', '#111111'],
    ['TIRO LIBRE', '#20b660', '#ffffff'],
    ['NOCHE', '#f16c20', '#ffffff'],
    ['CANCHA SUR', '#7fd7ff', '#071018'],
  ] as const;
  const geo = new THREE.PlaneGeometry(2.95, 0.92);
  for (let i = 0; i < boards.length; i++) {
    const [label, bg, fg] = boards[i]!;
    const board = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        map: makeAdTexture(label, bg, fg),
        toneMapped: false,
      }),
    );
    board.position.set(-8.05 + i * 3.22, 0.55, -0.64);
    g.add(board);
  }
  return g;
}

function buildSecurityFence(): THREE.LineSegments {
  const pts: number[] = [];
  const z = -4.2;
  const width = 28;
  const h = 3.2;
  for (let x = -width; x <= width; x += 0.8) {
    pts.push(x, 0.05, z, x, h, z);
  }
  for (let y = 0.35; y <= h; y += 0.42) {
    pts.push(-width, y, z, width, y, z);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.LineSegments(
    geo,
    new THREE.LineBasicMaterial({
      color: 0x8aa0b3,
      transparent: true,
      opacity: 0.22,
    }),
  );
}

export function buildStadium(scene: THREE.Scene): THREE.Group {
  const group = new THREE.Group();
  const standMat = new THREE.MeshStandardMaterial({ color: 0x0e141d, roughness: 0.95 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x111923, roughness: 0.84, metalness: 0.12 });
  const goalCenter = new THREE.Vector3(0, GOAL_HEIGHT, 0);

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

  const backRoof = new THREE.Mesh(new THREE.BoxGeometry(54, 1.2, 12), roofMat);
  backRoof.position.set(0, 17.2, -22.4);
  backRoof.rotation.x = -0.08;
  const leftRoof = new THREE.Mesh(new THREE.BoxGeometry(18, 1.1, 48), roofMat);
  leftRoof.position.set(-48, 16.7, 8);
  leftRoof.rotation.z = 0.2;
  const rightRoof = leftRoof.clone();
  rightRoof.position.x = 48;
  rightRoof.rotation.z = -0.2;
  group.add(backRoof, leftRoof, rightRoof);

  group.add(
    buildFloodlight(-39, -22, goalCenter),
    buildFloodlight(39, -22, goalCenter),
    buildFloodlight(-39, 30, goalCenter),
    buildFloodlight(39, 30, goalCenter),
    buildScreen(),
    buildAdBoards(),
    buildSecurityFence(),
  );

  scene.add(group);
  return group;
}
