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
      session: args.session,
      setupRuntimeListeners: args.setupRuntimeListeners,
      uiRuntime,
    }),
    setupSizePanelListeners,
    zIndexBase: Z_INDEX_BASE,
  };
}
