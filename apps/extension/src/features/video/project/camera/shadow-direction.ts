import { isRecord, isBoundedNumber } from '../validation/primitives';

/** Camera shadow direction is authored in scene space; hidden modes retain the fixed angle. */
export interface CameraShadowDirection {
  mode: 'classic' | 'angle' | 'center' | 'nearest-edge';
  angle: number;
}
export interface CameraShadowVector {
  x: number;
  y: number;
}

export function isCameraShadowDirection(value: unknown): value is CameraShadowDirection {
  return (
    isRecord(value) &&
    Object.keys(value).every((key) => key === 'mode' || key === 'angle') &&
    (value['mode'] === 'classic' ||
      value['mode'] === 'angle' ||
      value['mode'] === 'center' ||
      value['mode'] === 'nearest-edge') &&
    isBoundedNumber(value['angle'], 0, 360) &&
    value['angle'] < 360
  );
}

/** Resolve each evaluated window independently so seeking and exporting share the same direction. */
export function resolveCameraShadowVector(
  direction: CameraShadowDirection | undefined,
  window: { x: number; y: number; width: number; height: number },
  scene: { width: number; height: number }
): CameraShadowVector | undefined {
  if (!direction || direction.mode === 'classic') return undefined;
  if (direction.mode === 'angle') {
    const radians = (direction.angle * Math.PI) / 180;
    return { x: Math.cos(radians), y: Math.sin(radians) };
  }
  const x = window.x + window.width / 2;
  const y = window.y + window.height / 2;
  const band = Math.min(scene.width, scene.height) * 0.05;
  if (direction.mode === 'center') {
    const dx = scene.width / 2 - x,
      dy = scene.height / 2 - y;
    const distance = Math.hypot(dx, dy);
    const divisor = Math.max(distance, band);
    return divisor > 0 ? { x: dx / divisor, y: dy / divisor } : { x: 0, y: 0 };
  }
  const edges = [
    { distance: x, x: -1, y: 0 },
    { distance: scene.width - x, x: 1, y: 0 },
    { distance: y, x: 0, y: -1 },
    { distance: scene.height - y, x: 0, y: 1 },
  ];
  const nearest = Math.min(...edges.map((edge) => edge.distance));
  const weighted = edges.map((edge) => ({
    ...edge,
    weight: band > 0 ? Math.max(0, 1 - (edge.distance - nearest) / band) : 0,
  }));
  const total = weighted.reduce((sum, edge) => sum + edge.weight, 0);
  return total > 0
    ? {
        x: weighted.reduce((sum, edge) => sum + edge.x * edge.weight, 0) / total,
        y: weighted.reduce((sum, edge) => sum + edge.y * edge.weight, 0) / total,
      }
    : { x: 0, y: 0 };
}

/** Compensate camera-local rotation/scale; viewport raster transforms remain outside this matrix. */
export function cameraShadowLocalOffset(
  vector: CameraShadowVector,
  distance: number,
  matrix: { a: number; b: number; c: number; d: number }
): CameraShadowVector | null {
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
  if (!Number.isFinite(determinant) || determinant === 0) return null;
  const x = ((matrix.d * vector.x - matrix.c * vector.y) * distance) / determinant;
  const y = ((matrix.a * vector.y - matrix.b * vector.x) * distance) / determinant;
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}
