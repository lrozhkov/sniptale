import type { FreehandPointRecord } from '../points';

export interface DynamicStrokePoint extends FreehandPointRecord {
  width: number;
}

export interface DynamicStrokeVector {
  x: number;
  y: number;
}

export interface DynamicFreehandPathBuildOptions {
  smoothingIterationLimit?: number;
  smoothingStepPx?: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
