import type {
  ScenarioPoint,
  ScenarioRect,
} from '@sniptale/runtime-contracts/scenario/types/geometry';
import type { TourPoint, TourRect } from '@sniptale/runtime-contracts/scenario/types/tour';

/** Proven crop in the same CSS coordinate space as recorded points; rotation is clockwise. */
export interface TourCaptureMapping {
  sourceRect: ScenarioRect;
  rotation: 0 | 90 | 180 | 270;
}

function validRect(rect: ScenarioRect): boolean {
  return (
    [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) &&
    rect.width > 0 &&
    rect.height > 0
  );
}
function rotate(point: TourPoint, rotation: TourCaptureMapping['rotation']): TourPoint {
  switch (rotation) {
    case 90:
      return { x: 1 - point.y, y: point.x };
    case 180:
      return { x: 1 - point.x, y: 1 - point.y };
    case 270:
      return { x: point.y, y: 1 - point.x };
    case 0:
      return point;
  }
}

/** Out-of-crop evidence is not clamped into a fabricated clickable target. DPR cancels in normalization. */
export function mapTourCapturePoint(
  point: ScenarioPoint | null,
  mapping: TourCaptureMapping
): TourPoint | null {
  const rect = mapping.sourceRect;
  if (!point || !validRect(rect) || ![0, 90, 180, 270].includes(mapping.rotation)) return null;
  const normalized = { x: (point.x - rect.x) / rect.width, y: (point.y - rect.y) / rect.height };
  if (
    ![normalized.x, normalized.y].every(
      (value) => Number.isFinite(value) && value >= 0 && value <= 1
    )
  )
    return null;
  return rotate(normalized, mapping.rotation);
}

/** Intersects the source target with the proven crop, then maps all corners through the same transform. */
export function mapTourCaptureRect(
  target: ScenarioRect | null,
  mapping: TourCaptureMapping
): TourRect | null {
  if (!target || !validRect(target) || !validRect(mapping.sourceRect)) return null;
  const crop = mapping.sourceRect;
  const left = Math.max(target.x, crop.x);
  const top = Math.max(target.y, crop.y);
  const right = Math.min(target.x + target.width, crop.x + crop.width);
  const bottom = Math.min(target.y + target.height, crop.y + crop.height);
  if (right <= left || bottom <= top) return null;
  const a = mapTourCapturePoint({ x: left, y: top }, mapping);
  const b = mapTourCapturePoint({ x: right, y: bottom }, mapping);
  if (!a || !b) return null;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.min(1 - x, Math.abs(a.x - b.x)),
    height: Math.min(1 - y, Math.abs(a.y - b.y)),
  };
}
