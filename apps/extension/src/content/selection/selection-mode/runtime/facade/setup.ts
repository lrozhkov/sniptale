import type { SelectionModeRuntimeFacadeArgs } from './types';
import { createSelectionModeFacadeUi } from './ui';
import { createSelectionModeSizePanelSetup } from '../../ui/size-panel/runtime';

export function createSelectionModeRuntimeSetup(args: SelectionModeRuntimeFacadeArgs) {
  const setupSizePanelListeners = createSelectionModeSizePanelSetup({
    constrainSelection: args.constrainSelection,
    state: args.state,
    getAspectRatio: args.getAspectRatio,
    getCurrentSelection: args.getCurrentSelection,
    getMaintainAspectRatio: args.getMaintainAspectRatio,
    getMaxSelectionHeight: args.getMaxSelectionHeight,
    getMaxSelectionWidth: args.getMaxSelectionWidth,
    setAspectRatio: args.setAspectRatio,
    setCurrentSelection: args.setCurrentSelection,
    setMaintainAspectRatio: args.setMaintainAspectRatio,
    updateFinalFrame: args.updateFinalFrame,
  });

  const uiRuntime = createSelectionModeFacadeUi({
    cancelSelection: args.cancelSelection,
    confirmSelection: args.confirmSelection,
    getDom: args.getDom,
    getMaxSelectionHeight: args.getMaxSelectionHeight,
    getMaxSelectionWidth: args.getMaxSelectionWidth,
    onSetupSizePanelListeners: setupSizePanelListeners,
    resetToIdleState: args.resetToIdleState,
  });

  return {
    setupSizePanelListeners,
    uiRuntime,
  };
}
