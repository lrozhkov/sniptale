import { scheduleStepBadgeRecalculation } from '../../frame-dom-driver/timing';
import { invalidateFrameCache } from '../../highlighter';
import { useFrameUIStore } from '../state/frame-ui.store';
import type { UseFrameMutationActionHelperOptions } from './types';

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
    useFrameUIStore.getState().dismissFrame(frameId);

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
