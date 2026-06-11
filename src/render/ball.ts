import * as THREE from 'three';
import { BALL_RADIUS } from '@/core/field';

/** Balón low-poly con paneles oscuros para que se note la rotación. */
export function createBall(): THREE.Mesh {
  const geo = new THREE.IcosahedronGeometry(BALL_RADIUS, 2);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.45,
    metalness: 0,
    flatShading: true,
  });
  const ball = new THREE.Mesh(geo, mat);
  ball.castShadow = true;
  ball.position.set(0, BALL_RADIUS, 20);
  return ball;
}
