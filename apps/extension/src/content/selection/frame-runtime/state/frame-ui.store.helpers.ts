import type { StateCreator } from 'zustand';
import {
  createFrameUICacheActions,
  createFrameUIVisibilityActions,
} from './frame-ui.store.actions';
import type { FrameUIState } from './frame-ui.store.types';

type FrameStoreSet = Parameters<StateCreator<FrameUIState>>[0];
type FrameStoreGet = Parameters<StateCreator<FrameUIState>>[1];

export function createFrameUIActions(set: FrameStoreSet, get: FrameStoreGet) {
  return {
    ...createFrameUIVisibilityActions(set, get),
    ...createFrameUICacheActions(set, get),
  };
}

export function createFrameUIComputed(get: FrameStoreGet) {
  return {
    isUIActive: () => {
      const state = get();
      return state.activeFrameId !== null || state.popoverFrameId !== null;
    },
    isPopoverOpenFor: (frameId: string) => get().popoverFrameId === frameId,
    isTooltipVisibleFor: (frameId: string) => get().activeFrameId === frameId,
  };
}
