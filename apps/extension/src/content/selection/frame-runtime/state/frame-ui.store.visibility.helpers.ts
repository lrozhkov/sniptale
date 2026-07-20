import type { StateCreator } from 'zustand';
import { createLogger } from '@sniptale/platform/observability/logger';
import type { FrameUIState } from './frame-ui.store.types';

type FrameStoreSet = Parameters<StateCreator<FrameUIState>>[0];
type FrameStoreGet = Parameters<StateCreator<FrameUIState>>[1];
const logger = createLogger({ namespace: 'ContentFrameUiStore' });

export function createOpenPopoverAction(set: FrameStoreSet, get: FrameStoreGet) {
  return (frameId: string) => {
    const state = get();
    logger.debug('openPopover called', {
      frameId,
      currentActiveFrameId: state.activeFrameId,
      currentPopoverFrameId: state.popoverFrameId,
    });

    if (state.activeFrameId !== frameId) {
      logger.debug('openPopover auto-setting activeFrameId', frameId);
      set({ activeFrameId: frameId, popoverFrameId: frameId });
      return;
    }

    logger.debug('openPopover succeeded', frameId);
    set({ popoverFrameId: frameId });
  };
}
