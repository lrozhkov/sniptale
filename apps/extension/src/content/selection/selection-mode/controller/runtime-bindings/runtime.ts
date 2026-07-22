import { MIN_SELECTION_SIZE, Z_INDEX_BASE } from '../../constants';
import { createSelectionModeRuntimeGraphBindings } from '../../runtime/graph-bindings';
import type { SelectionModeSession } from '../../session';
import type { SelectionModeRuntimeFacade } from '../../runtime/facade/types';
import type { SelectionModeRuntimeGraphBindingsArgs } from '../../runtime/graph-bindings';

type SelectionModeRuntimeGraph = ReturnType<typeof createSelectionModeRuntimeGraphBindings>;
export function createSelectionModeRuntimeBindings(props: {
  cleanup: () => void;
  runtimeFacade: SelectionModeRuntimeFacade;
  session: SelectionModeSession;
  updateFinalFrame: () => void;
}): SelectionModeRuntimeGraph {
  const runtimeGraphArgs: SelectionModeRuntimeGraphBindingsArgs = {
    cleanup: props.cleanup,
    currentSelection: () => props.session.currentSelection,
    disableCursor: () => props.runtimeFacade.disableCursor(),
    getMaxSelectionHeight: () => window.innerHeight,
    getMaxSelectionWidth: () => window.innerWidth,
    getRejectCallback: () => props.session.rejectCallback,
    getResolveCallback: () => props.session.resolveCallback,
    minSelectionSize: MIN_SELECTION_SIZE,
    session: props.session,
    selectionModeUiRuntime: props.runtimeFacade.uiRuntime,
    setCleanupEventListeners: (cleanup) => {
      props.session.cleanupEventListeners = cleanup;
    },
    setCleanupScrollListeners: (cleanup) => {
      props.session.cleanupScrollListeners = cleanup;
    },
    updateFinalFrame: props.updateFinalFrame,
    zIndexBase: Z_INDEX_BASE,
  };

  return createSelectionModeRuntimeGraphBindings(runtimeGraphArgs);
}
