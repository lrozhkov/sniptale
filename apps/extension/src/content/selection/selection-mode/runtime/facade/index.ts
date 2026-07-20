import { Z_INDEX_BASE } from '../../constants';
import { createSelectionModePublicApi } from './api';
import { createSelectionModeRuntimeSetup } from './setup';
import type { SelectionModeRuntimeFacade, SelectionModeRuntimeFacadeArgs } from './types';

export function createSelectionModeRuntimeFacade(
  args: SelectionModeRuntimeFacadeArgs
): SelectionModeRuntimeFacade {
  const { setupSizePanelListeners, uiRuntime } = createSelectionModeRuntimeSetup(args);

  return {
    uiRuntime,
    ...createSelectionModePublicApi({
      cleanup: args.cleanup,
      getIsActive: args.getIsActive,
      getRejectCallback: args.getRejectCallback,
      setIsActive: args.setIsActive,
      setCurrentState: args.setCurrentState,
      setRejectCallback: args.setRejectCallback,
      setResolveCallback: args.setResolveCallback,
      setAspectRatio: args.setAspectRatio,
      setCurrentSelection: args.setCurrentSelection,
      setMaintainAspectRatio: args.setMaintainAspectRatio,
      setupRuntimeListeners: args.setupRuntimeListeners,
      state: args.state,
      uiRuntime,
    }),
    setupSizePanelListeners,
    zIndexBase: Z_INDEX_BASE,
  };
}
