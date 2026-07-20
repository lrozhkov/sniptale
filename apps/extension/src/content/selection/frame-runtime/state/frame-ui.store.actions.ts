import type { StateCreator } from 'zustand';
import { createLogger } from '@sniptale/platform/observability/logger';
import type { EffectMode } from '../../../../features/highlighter/contracts';
import type { FrameUIState } from './frame-ui.store.types';
import { createOpenPopoverAction } from './frame-ui.store.visibility.helpers';

type FrameStoreSet = Parameters<StateCreator<FrameUIState>>[0];
type FrameStoreGet = Parameters<StateCreator<FrameUIState>>[1];

const DEFAULT_EFFECT_MODE: EffectMode = 'border';
const logger = createLogger({ namespace: 'ContentFrameUiStore' });

export function createFrameUIVisibilityActions(set: FrameStoreSet, get: FrameStoreGet) {
  return {
    showTooltip: (frameId: string) => {
      const state = get();
      if (state.popoverFrameId && state.popoverFrameId !== frameId) {
        logger.warn('Cannot show tooltip: popover open for different frame');
        return;
      }

      if (state.activeFrameId === frameId) {
        return;
      }

      logger.debug('showTooltip', frameId);
      set({ activeFrameId: frameId });
    },

    hideTooltip: (frameId: string) => {
      const state = get();
      if (state.activeFrameId !== frameId) {
        return;
      }

      if (state.popoverFrameId) {
        logger.debug('hideTooltip blocked: popover open', frameId);
        return;
      }

      logger.debug('hideTooltip', frameId);
      set({ activeFrameId: null });
    },

    forceHideTooltip: () => {
      logger.debug('forceHideTooltip');
      set({ activeFrameId: null, popoverFrameId: null });
    },

    openPopover: createOpenPopoverAction(set, get),

    closePopover: () => {
      logger.debug('closePopover');
      set({ popoverFrameId: null });
    },
  };
}

export function createFrameUICacheActions(set: FrameStoreSet, get: FrameStoreGet) {
  return {
    updateEffectModeCache: (frameId: string, mode: EffectMode) => {
      set((state) => ({
        effectModeCache: {
          ...state.effectModeCache,
          [frameId]: mode,
        },
      }));
    },

    getEffectMode: (frameId: string) => get().effectModeCache[frameId] || DEFAULT_EFFECT_MODE,

    reset: () => {
      logger.debug('reset');
      set({
        activeFrameId: null,
        popoverFrameId: null,
        effectModeCache: {},
      });
    },
  };
}
