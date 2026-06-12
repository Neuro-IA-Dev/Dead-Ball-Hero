import * as THREE from 'three';
import type { ShotEvent } from '@/core/collisions';

export type ShotType =
  | 'natural'
  | 'inside_curve'
  | 'outside_curve'
  | 'topspin'
  | 'driven_low'
  | 'knuckle';

export interface ShotIntent {
  aimAzimuthDeg: number;
  contactX: number;
  contactY: number;
  powerBars: number;
  shotType: ShotType;
  foot: 'left' | 'right';
  aimTarget?: { x: number; y: number };
}

export interface ShotDebugInfo {
  aimAzimuthDeg: number;
  contactX: number;
  contactY: number;
  shotType: ShotType;
  powerBars: number;
  aimTarget: { x: number; y: number } | null;
  effectiveAimTarget: { x: number; y: number } | null;
  initialSpeed: number;
  launchAngleDeg: number;
  spin: THREE.Vector3;
  dragCd: number;
  magnusScale: number;
  sigma: number;
  arcCross: { x: number; y: number } | null;
  estimatedResult: ShotEvent | 'PENDING';
  barrierHeight: number | null;
  maxHeight: number;
  timeToGoal: number | null;
}

export interface ShotLaunch {
  velocity: THREE.Vector3;
  spin: THREE.Vector3;
  dragCd: number;
  magnusScale: number;
  groundBounceScale: number;
  shotType: ShotType;
  perfectPower: boolean;
  debug: ShotDebugInfo;
}
