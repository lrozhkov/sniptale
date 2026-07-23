/**
 * Frame UI Store — Zustand store для управления состоянием tooltip/popover рамок
 *
 * Архитектура:
 * - Единый источник истины для UI состояния рамок
 * - Иерархия: tooltip (родитель) → popover (ребёнок)
 * - Popover не может быть открыт без tooltip
 *
 * Принципы:
 * - Store управляет только UI состоянием (tooltip, popover)
 * - Флаги highlighter.ts синхронизируются через useEffect в useFrameUIController
 */

import { create, type StateCreator } from 'zustand';
import { createLogger } from '@sniptale/platform/observability/logger';

export interface FrameUIState {
  activeFrameId: string | null;
  popoverFrameId: string | null;
  showTooltip: (frameId: string) => void;
  hideTooltip: (frameId: string) => void;
  forceHideTooltip: () => void;
  openPopover: (frameId: string) => void;
  closePopover: () => void;
  reset: () => void;
}

type FrameStoreSet = Parameters<StateCreator<FrameUIState>>[0];
type FrameStoreGet = Parameters<StateCreator<FrameUIState>>[1];

const logger = createLogger({ namespace: 'ContentFrameUiStore' });

function createOpenPopoverAction(set: FrameStoreSet, get: FrameStoreGet) {
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

function createFrameUIVisibilityActions(set: FrameStoreSet, get: FrameStoreGet) {
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

    reset: () => {
      logger.debug('reset');
      set({
        activeFrameId: null,
        popoverFrameId: null,
      });
    },
  };
}

export const useFrameUIStore = create<FrameUIState>((set, get) => ({
  activeFrameId: null,
  popoverFrameId: null,
  ...createFrameUIVisibilityActions(set, get),
}));
