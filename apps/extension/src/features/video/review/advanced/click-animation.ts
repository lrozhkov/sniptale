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
  patch: Partial<ReviewClickStyle> | null
): ReviewClickAnimation[] {
  const selected = new Set(ids);
  const values = new Map(current.map((item) => [item.id, item]));
  for (const id of selected) {
    if (patch === null) values.delete(id);
    else {
      const value = { ...REVIEW_CLICK_DEFAULT, ...values.get(id), ...patch, id };
      if (patch.gestureAppearance === 'area' && !value.gestureArea)
        value.gestureArea = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
      values.set(id, value);
    }
  }
  const result = parseReviewClickAnimations([...values.values()]);
  if (!result) throw new Error('Click presentation is invalid.');
  return result;
}
