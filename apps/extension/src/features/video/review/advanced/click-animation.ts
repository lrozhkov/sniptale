import type { ReviewTelemetryMarker } from '../telemetry';
import { parseReviewClickAnimations } from '../../project/action-feedback/validation';
import type { ReviewClickAnimation, ReviewClickStyle } from '../../project/action-feedback/types';
export type { ReviewClickAnimation, ReviewClickStyle } from '../../project/action-feedback/types';
export {
  REVIEW_CLICK_DEFAULT,
  REVIEW_CLICK_BOUNDS,
  parseReviewClickAnimations,
} from '../../project/action-feedback/validation';
import { REVIEW_CLICK_DEFAULT } from '../../project/action-feedback/validation';

/** One functional batch patch preserves untouched fields and never mutates recorded events. */
export function patchReviewClicks(
  current: readonly ReviewClickAnimation[],
  ids: readonly string[],
  patch: Partial<ReviewClickStyle> | null,
  markers: readonly ReviewTelemetryMarker[] = []
): ReviewClickAnimation[] {
  const selected = new Set(ids);
  const values = new Map(current.map((item) => [item.id, item]));
  for (const id of selected) {
    if (patch === null) values.delete(id);
    else {
      const value = { ...REVIEW_CLICK_DEFAULT, ...values.get(id), ...patch, id };
      if (patch.gestureAppearance === 'area' && !value.gestureArea) {
        const area = observedGestureArea(
          markers.find((marker) => marker.ref.kind === 'action' && marker.ref.id === id)
        );
        if (area) value.gestureArea = area;
      }
      values.set(id, value);
    }
  }
  const result = parseReviewClickAnimations([...values.values()]);
  if (!result) throw new Error('Click presentation is invalid.');
  return result;
}

// This initializes an authored effect, not a claim about a DOM selection rectangle.
function observedGestureArea(
  marker: ReviewTelemetryMarker | undefined
): ReviewClickStyle['gestureArea'] {
  const points = [
    ...(marker?.gesture?.path ?? []),
    ...(marker?.focusPoint ? [marker.focusPoint] : []),
  ];
  if (!points.length) return undefined;
  let left = 1,
    top = 1,
    right = 0,
    bottom = 0;
  for (const point of points) {
    left = Math.min(left, point.x);
    top = Math.min(top, point.y);
    right = Math.max(right, point.x);
    bottom = Math.max(bottom, point.y);
  }
  // A single observed point or a straight drag still needs a visible, editable frame.
  const width = Math.max(0.01, right - left),
    height = Math.max(0.01, bottom - top);
  return { x: Math.min(left, 1 - width), y: Math.min(top, 1 - height), width, height };
}
