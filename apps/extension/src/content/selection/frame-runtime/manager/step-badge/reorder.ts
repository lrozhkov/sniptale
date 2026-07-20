import type { FrameData } from '../../../../../features/highlighter/contracts';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { scheduleStepBadgeRecalculation } from './update';
import { sortFramesByStoredStepBadgeOrder } from './order';

type FrameSetter = Dispatch<SetStateAction<FrameData[]>>;

export function sortFramesForStepBadgeReorder(frames: FrameData[], orderMap: Map<string, number>) {
  return sortFramesByStoredStepBadgeOrder(
    frames.filter((frame) => frame.stepBadge?.enabled && frame.stepBadge.auto !== false),
    orderMap,
    (a, b) => a.y - b.y || a.x - b.x
  );
}

export function initializeMissingStepBadgeOrders(
  framesWithBadges: FrameData[],
  orderMap: Map<string, number>
) {
  framesWithBadges.forEach((frame, badgeIndex) => {
    if (!orderMap.has(frame.id)) {
      orderMap.set(frame.id, badgeIndex);
    }
  });
}

export function createReorderStepBadge(params: {
  setFrames: FrameSetter;
  stepBadgeOrderRef: MutableRefObject<Map<string, number>>;
  recalculateStepBadgesRef: MutableRefObject<() => void>;
}) {
  const { setFrames, stepBadgeOrderRef, recalculateStepBadgesRef } = params;

  return (frameId: string, direction: 'up' | 'down') => {
    setFrames((prev) => {
      const orderMap = stepBadgeOrderRef.current;
      const framesWithBadges = sortFramesForStepBadgeReorder(prev, orderMap);
      const index = framesWithBadges.findIndex((frame) => frame.id === frameId);
      const targetIndex = direction === 'up' ? index - 1 : index + 1;

      if (index === -1 || targetIndex < 0 || targetIndex >= framesWithBadges.length) {
        return prev;
      }

      initializeMissingStepBadgeOrders(framesWithBadges, orderMap);

      const currentFrame = framesWithBadges[index];
      const neighborFrame = framesWithBadges[targetIndex];
      if (!currentFrame || !neighborFrame) {
        return prev;
      }

      const currentId = currentFrame.id;
      const neighborId = neighborFrame.id;
      const currentOrder = orderMap.get(currentId) ?? index;
      const neighborOrder = orderMap.get(neighborId) ?? targetIndex;

      orderMap.set(currentId, neighborOrder);
      orderMap.set(neighborId, currentOrder);
      scheduleStepBadgeRecalculation(recalculateStepBadgesRef);

      return prev;
    });
  };
}
