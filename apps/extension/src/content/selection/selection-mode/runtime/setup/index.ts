import { createSelectionModeRuntimeArgs } from '../../session/runtime-state/args';
import { createSelectionModeMutableRefGetters } from './getters';
import { applySelectionModeMutableRefSetters } from './setters';
import type { SelectionModeRuntimeSetupArgs } from './types';

export { createSelectionModeMutableRefGetters } from './getters';
export { applySelectionModeMutableRefSetters } from './setters';

export function createSelectionModeMutableRefs(
  args: Parameters<typeof createSelectionModeMutableRefGetters>[0] &
    Parameters<typeof applySelectionModeMutableRefSetters>[1]
) {
  return applySelectionModeMutableRefSetters(createSelectionModeMutableRefGetters(args), args);
}

export function createSelectionModeRuntimeSetup(args: SelectionModeRuntimeSetupArgs) {
  return createSelectionModeRuntimeArgs({
    createDragFrame: args.createDragFrame,
    getMaxSelectionHeight: args.getMaxSelectionHeight,
    getMaxSelectionWidth: args.getMaxSelectionWidth,
    handleClick: args.handleClick,
    handleKeyDown: args.handleKeyDown,
    handleMouseDown: args.handleMouseDown,
    handleMouseLeave: args.handleMouseLeave,
    handleMouseMove: args.handleMouseMove,
    handleMouseUp: args.handleMouseUp,
    minSelectionSize: args.minSelectionSize,
    refs: args.mutableRefs,
    setCleanupEventListeners: args.setCleanupEventListeners,
    setCleanupScrollListeners: args.setCleanupScrollListeners,
    showFinalFrame: () => {
      args.createFinalElements();
      args.mutableRefs.currentState = 'confirmed';
      args.updateFinalFrame();
    },
    updateFinalFrame: args.updateFinalFrame,
    zIndexBase: args.zIndexBase,
  });
}
