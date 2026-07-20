import { queryAllContentUiElements } from '../../../platform/dom-host';
import { createLogger } from '@sniptale/platform/observability/logger';
import { scheduleFrameClearCompletion } from '../../frame-dom-driver/timing';
import { invalidateFrameCache } from '../../highlighter';
import { useFrameUIStore } from '../state/frame-ui.store';
import type { MutableRef, UseFrameMutationActionHelperOptions } from './types';

const logger = createLogger({ namespace: 'ContentFrameMutations' });

export function createClearFramesHandler({
  isClearingRef,
  rootsRef,
  containerRef,
  linkedElementsRef,
  setFrames,
}: Pick<
  UseFrameMutationActionHelperOptions,
  'isClearingRef' | 'rootsRef' | 'containerRef' | 'linkedElementsRef' | 'setFrames'
>) {
  return () => {
    isClearingRef.current = true;

    useFrameUIStore.getState().reset();
    rootsRef.current.forEach((root) => {
      try {
        root.unmount();
      } catch (error) {
        logger.error('Error unmounting root', error);
      }
    });
    rootsRef.current.clear();
    removeFrameContainer(containerRef);
    removeFrameOverlays();

    linkedElementsRef.current.clear();
    setFrames([]);
    invalidateFrameCache();

    scheduleFrameClearCompletion(isClearingRef);

    logger.log('All frames cleared');
  };
}

function removeFrameContainer(containerRef: MutableRef<HTMLDivElement | null>) {
  if (!containerRef.current) {
    return;
  }

  containerRef.current.remove();
  containerRef.current = null;
}

function removeFrameOverlays() {
  queryAllContentUiElements('.sniptale-focus-overlay, .sniptale-blur-overlay').forEach((node) => {
    node.remove();
  });
  queryAllContentUiElements('svg[id^="sniptale-blur-filters-"]').forEach((node) => {
    node.remove();
  });
}
