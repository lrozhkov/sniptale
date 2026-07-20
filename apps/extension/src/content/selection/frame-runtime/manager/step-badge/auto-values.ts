import type { FrameData } from '../../../../../features/highlighter/contracts';
import { buildAutoStepBadgeValueMap, getAutoStepBadgeFrames } from './badges';

export function applyAutoStepBadgeValues(
  frames: FrameData[],
  orderMap: Map<string, number>,
  excludeFrameId?: string
) {
  const framesWithBadges = getAutoStepBadgeFrames(frames, orderMap, excludeFrameId);
  if (framesWithBadges.length === 0) {
    return frames;
  }

  const frameIdToValue = buildAutoStepBadgeValueMap(frames, orderMap, excludeFrameId);
  return frames.map((frame) => {
    if (
      frame.id === excludeFrameId ||
      !frame.stepBadge?.enabled ||
      frame.stepBadge.auto === false
    ) {
      return frame;
    }

    const value = frameIdToValue.get(frame.id);
    return value === undefined ? frame : { ...frame, stepBadge: { ...frame.stepBadge, value } };
  });
}
