import type { SelectionModeRuntimeFacadeArgs } from './types';
import { createSelectionModeFacadeUi } from './ui';
import { createSelectionModeSizePanelSetup } from '../../ui/size-panel/runtime';

export function createSelectionModeRuntimeSetup(args: SelectionModeRuntimeFacadeArgs) {
  const setupSizePanelListeners = createSelectionModeSizePanelSetup({
    constrainSelection: args.constrainSelection,
    getMaxSelectionHeight: args.getMaxSelectionHeight,
    getMaxSelectionWidth: args.getMaxSelectionWidth,
    session: args.session,
    updateFinalFrame: args.updateFinalFrame,
  });

  const uiRuntime = createSelectionModeFacadeUi({
    cancelSelection: args.cancelSelection,
    confirmSelection: args.confirmSelection,
    getDom: () => args.session.dom,
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
