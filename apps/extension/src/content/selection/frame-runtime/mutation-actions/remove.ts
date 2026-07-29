import { scheduleStepBadgeRecalculation } from '../../frame-dom-driver/timing';
import { invalidateFrameCache } from '../../highlighter';
import { useFrameUIStore } from '../state/frame-ui.store';
import type { UseFrameMutationActionHelperOptions } from './types';

export function createRemoveFrameHandler({
  framesRef,
  hostLayoutServiceRef,
  recalculateStepBadgesRef,
  setFrames,
}: Pick<
  UseFrameMutationActionHelperOptions,
  'framesRef' | 'hostLayoutServiceRef' | 'recalculateStepBadgesRef' | 'setFrames'
>) {
  return (frameId: string) => {
    useFrameUIStore.getState().dismissFrame(frameId);

    const hadStepBadge = framesRef.current.find((frame) => frame.id === frameId)?.stepBadge
      ?.enabled;
    const frames = framesRef.current.filter((frame) => frame.id !== frameId);
    framesRef.current = frames;
    setFrames(frames);
    hostLayoutServiceRef.current.unlink(frameId);
    invalidateFrameCache();

    if (hadStepBadge) {
      scheduleStepBadgeRecalculation(recalculateStepBadgesRef, frameId);
    }
  };
}
