import { createLogger } from '@sniptale/platform/observability/logger';
import { scheduleStepBadgeRecalculation } from '../../frame-dom-driver/timing';
import { invalidateFrameCache } from '../../highlighter';
import { useFrameUIStore } from '../state/frame-ui.store';
import type { UseFrameMutationActionHelperOptions } from './types';

const logger = createLogger({ namespace: 'ContentFrameMutations' });

export function createRemoveFrameHandler({
  framesRef,
  linkedElementsRef,
  recalculateStepBadgesRef,
  setFrames,
}: Pick<
  UseFrameMutationActionHelperOptions,
  'framesRef' | 'linkedElementsRef' | 'recalculateStepBadgesRef' | 'setFrames'
>) {
  return (frameId: string) => {
    resetFrameUiIfNeeded(frameId);

    const hadStepBadge = framesRef.current.find((frame) => frame.id === frameId)?.stepBadge
      ?.enabled;
    setFrames((prev) => prev.filter((frame) => frame.id !== frameId));
    linkedElementsRef.current.delete(frameId);
    invalidateFrameCache();

    if (hadStepBadge) {
      scheduleStepBadgeRecalculation(recalculateStepBadgesRef, frameId);
    }
  };
}

function resetFrameUiIfNeeded(frameId: string) {
  const storeState = useFrameUIStore.getState();
  if (storeState.activeFrameId !== frameId && storeState.popoverFrameId !== frameId) {
    return;
  }

  logger.log('Resetting UI store state for deleted frame', frameId);
  storeState.forceHideTooltip();
}
