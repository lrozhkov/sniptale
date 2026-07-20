import { MIN_SELECTION_SIZE, Z_INDEX_BASE } from '../../constants';
import { createSelectionModeRuntimeGraphBindings } from '../../runtime/graph-bindings';
import { createSelectionModeSessionLocalSetters } from '../../session/locals/setters';
import type { SelectionModeSession } from '../../session/locals/helpers';
import type { SelectionModeRuntimeFacade } from '../../runtime/facade/types';
import type { SelectionModeRuntimeGraphBindingsArgs } from '../../runtime/graph-bindings';

type SelectionModeRuntimeGraph = ReturnType<typeof createSelectionModeRuntimeGraphBindings>;
type SelectionModeSessionLocalSetters = ReturnType<typeof createSelectionModeSessionLocalSetters>;

export function createSelectionModeRuntimeBindings(props: {
  cleanup: () => void;
  mutableRefs: SelectionModeRuntimeGraphBindingsArgs['mutableRefs'];
  runtimeFacade: SelectionModeRuntimeFacade;
  session: SelectionModeSession;
  state: SelectionModeRuntimeGraphBindingsArgs['state'];
  updateFinalFrame: () => void;
}): SelectionModeRuntimeGraph {
  const sessionSetters: SelectionModeSessionLocalSetters = createSelectionModeSessionLocalSetters(
    props.session
  );

  const runtimeGraphArgs: SelectionModeRuntimeGraphBindingsArgs = {
    cleanup: props.cleanup,
    currentSelection: () => props.session.currentSelection,
    disableCursor: () => props.runtimeFacade.disableCursor(),
    getMaxSelectionHeight: () => window.innerHeight,
    getMaxSelectionWidth: () => window.innerWidth,
    getRejectCallback: () => props.session.rejectCallback,
    getResolveCallback: () => props.session.resolveCallback,
    minSelectionSize: MIN_SELECTION_SIZE,
    mutableRefs: props.mutableRefs,
    selectionModeUiRuntime: props.runtimeFacade.uiRuntime,
    setCleanupEventListeners: sessionSetters.setCleanupEventListeners,
    setCleanupScrollListeners: sessionSetters.setCleanupScrollListeners,
    state: props.state,
    updateFinalFrame: props.updateFinalFrame,
    zIndexBase: Z_INDEX_BASE,
  };

  return createSelectionModeRuntimeGraphBindings(runtimeGraphArgs);
}
