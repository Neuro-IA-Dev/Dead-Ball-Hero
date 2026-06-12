import * as THREE from 'three';
import { BALL_RADIUS } from '@/core/field';

const PANEL_FORWARD = new THREE.Vector3(0, 0, 1);

export function createBall(): THREE.Mesh {
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_RADIUS, 64, 48),
    new THREE.MeshStandardMaterial({
      color: 0xfaf5e7,
      roughness: 0.68,
      metalness: 0,
      emissive: 0x8a8067,
      emissiveIntensity: 0.38,
    }),
  );
  shell.castShadow = true;
  shell.receiveShadow = true;
  shell.position.set(0, BALL_RADIUS, 20);

  addClassicPanels(shell);
  addSubtleSeams(shell);
  return shell;
}

function addClassicPanels(ball: THREE.Mesh): void {
  const source = new THREE.IcosahedronGeometry(1, 0);
  const positions = source.getAttribute('position');
  const seen = new Set<string>();

  const panelGeo = new THREE.CircleGeometry(BALL_RADIUS * 0.125, 5);
  panelGeo.rotateZ(Math.PI / 5);

  const panelMat = new THREE.MeshStandardMaterial({
    color: 0x2f2c27,
    roughness: 0.86,
    metalness: 0,
    emissive: 0x080807,
    emissiveIntensity: 0.16,
  });
  const stitchMat = new THREE.LineBasicMaterial({
    color: 0xe0ddd2,
    transparent: true,
    opacity: 0.82,
  });

  for (let i = 0; i < positions.count; i++) {
    const normal = new THREE.Vector3().fromBufferAttribute(positions, i).normalize();
    const key = `${normal.x.toFixed(3)}:${normal.y.toFixed(3)}:${normal.z.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const panel = new THREE.Mesh(panelGeo, panelMat);
    panel.position.copy(normal).multiplyScalar(BALL_RADIUS * 1.006);
    panel.quaternion.setFromUnitVectors(PANEL_FORWARD, normal);
    ball.add(panel);

    const stitchPoints = Array.from({ length: 5 }, (_, idx) => {
      const a = Math.PI / 5 + (idx / 5) * Math.PI * 2;
      return new THREE.Vector3(
        Math.cos(a) * BALL_RADIUS * 0.123,
        Math.sin(a) * BALL_RADIUS * 0.123,
        0.0015,
      );
    });
    panel.add(
      new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(stitchPoints),
        stitchMat,
      ),
    );
  }
}

function addSubtleSeams(ball: THREE.Mesh): void {
  const seamMat = new THREE.LineBasicMaterial({
    color: 0xc9c5bb,
    transparent: true,
    opacity: 0.45,
  });

  const latitudes = [-0.68, -0.32, 0, 0.32, 0.68];
  for (const t of latitudes) {
    const y = BALL_RADIUS * t;
    const r = Math.sqrt(Math.max(0, BALL_RADIUS * BALL_RADIUS - y * y)) * 1.001;
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      points.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
    }
    ball.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), seamMat));
  }
}
