import { getAbsolutePosition } from '../../../../platform/frame';
import { createSelectionModeRuntimeState } from './helpers';
import { createSelectionModeHoverFrameHandlers } from './hover-frame';
import { createSelectionModeSetupListenerHandlers } from './listeners';
import type { SelectionModeRuntimeArgsInput } from './types';

export function createSelectionModeRuntimeArgs(args: SelectionModeRuntimeArgsInput) {
  const hoverFrameHandlers = createSelectionModeHoverFrameHandlers(args.refs);

  return {
    ...hoverFrameHandlers,
    createDragFrame: args.createDragFrame,
    getAbsolutePosition,
    getMaxSelectionHeight: args.getMaxSelectionHeight,
    getMaxSelectionWidth: args.getMaxSelectionWidth,
    minSelectionSize: args.minSelectionSize,
    setCleanupEventListeners: args.setCleanupEventListeners,
    setCleanupScrollListeners: args.setCleanupScrollListeners,
    setupListenerHandlers: createSelectionModeSetupListenerHandlers(args),
    showFinalFrame: args.showFinalFrame,
    state: createSelectionModeRuntimeState(args.refs),
    updateFinalFrame: args.updateFinalFrame,
    zIndexBase: args.zIndexBase,
  };
}
