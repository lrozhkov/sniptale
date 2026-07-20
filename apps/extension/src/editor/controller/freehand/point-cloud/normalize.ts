import type { FreehandPointRecord } from '../points';
import { measureBounds } from '../metrics';
import { POINT_CLOUD_SIZE } from './constants';
import { resamplePointCloud } from './sampling';

export function normalizePointCloud(
  points: readonly FreehandPointRecord[],
  targetSize = POINT_CLOUD_SIZE
): FreehandPointRecord[] {
  const resampled = resamplePointCloud(points, targetSize);
  const bounds = measureBounds(resampled);
  const scale = Math.max(bounds.width, bounds.height, 1);
  const centroid = resampled.reduce(
    (total, point) => ({
      x: total.x + point.x / resampled.length,
      y: total.y + point.y / resampled.length,
    }),
    { x: 0, y: 0 }
  );

  return resampled.map((point) => ({
    x: (point.x - centroid.x) / scale,
    y: (point.y - centroid.y) / scale,
  }));
}
