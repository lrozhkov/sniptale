import type { PointLike } from '../types';
import { ELBOW_DEDUP_THRESHOLD } from './constants';
import { areCollinear, clonePoint, getDistance } from './points';

export function simplifyElbowPoints(points: PointLike[]): PointLike[] {
  const deduped: PointLike[] = [];
  points.forEach((point) => {
    const previous = deduped[deduped.length - 1];
    if (!previous || getDistance(previous, point) > ELBOW_DEDUP_THRESHOLD) {
      deduped.push(clonePoint(point));
    }
  });

  if (deduped.length === 1 && points.length >= 2) {
    const end = points[points.length - 1];
    return end ? [clonePoint(deduped[0]!), clonePoint(end)] : deduped;
  }

  if (deduped.length <= 2) {
    return deduped;
  }

  const simplified: PointLike[] = [];
  deduped.forEach((point) => {
    const previous = simplified[simplified.length - 1];
    const beforePrevious = simplified[simplified.length - 2];
    if (previous && beforePrevious && areCollinear(beforePrevious, previous, point)) {
      simplified[simplified.length - 1] = clonePoint(point);
      return;
    }

    simplified.push(clonePoint(point));
  });

  return simplified.length >= 2 ? simplified : deduped;
}
