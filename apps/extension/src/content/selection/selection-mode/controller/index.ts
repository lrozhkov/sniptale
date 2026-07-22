import type { CaptureArea } from '@sniptale/runtime-contracts/messaging/capture-messages';
import { setContentModeEnabled } from '../../../application/mode-session';
import { logSelectionModeDiag, logSelectionModeError } from '../diag';
import { createSelectionModeControllerActions } from './actions';
import { getMaxSelectionHeight, getMaxSelectionWidth } from '../constants';
import { setupSelectionModeRuntimeListeners } from '../interaction/actions/runtime';
import { createSelectionModeRuntimeFacade } from '../runtime/facade';
import type { SelectionModeRuntimeFacade } from '../runtime/facade/types';
import { createSelectionModeRuntimeBindings } from './runtime-bindings';
import { createSelectionModeSession, resetSelectionModeSession } from '../session';
import type { SelectionModeSession } from '../session';

type SelectionModeRuntimeGraph = ReturnType<typeof createSelectionModeRuntimeBindings>;

function createControllerRuntimeFacade(args: {
  cleanup: () => void;
  getRuntimeGraph: () => SelectionModeRuntimeGraph;
  session: SelectionModeSession;
}): SelectionModeRuntimeFacade {
  const getEvents = () => args.getRuntimeGraph().selectionModeEvents;
  return createSelectionModeRuntimeFacade({
    cancelSelection: () => getEvents().cancelSelection(),
    cleanup: args.cleanup,
    confirmSelection: () => getEvents().confirmSelection(),
    constrainSelection: () => getEvents().constrainSelection(),
    getMaxSelectionHeight,
    getMaxSelectionWidth,
    resetToIdleState: () => getEvents().resetToIdleState(),
    session: args.session,
    setupRuntimeListeners: () =>
      setupSelectionModeRuntimeListeners(args.getRuntimeGraph().selectionModeRuntimeArgs),
    updateFinalFrame: () => getEvents().updateFinalFrame(),
  });
}

interface SelectionModeController {
  cleanup: () => void;
  disableSelectionMode: () => void;
  enableSelectionMode: () => Promise<CaptureArea>;
  isSelectionModeActive: () => boolean;
}

/**
 * Creates a selection-mode controller with instance-owned state, session locals, and runtime graph.
 */
export function createSelectionModeController(): SelectionModeController {
  const session = createSelectionModeSession();
  let runtimeGraph: ReturnType<typeof createSelectionModeRuntimeBindings>;

  const cleanup = () => {
    logSelectionModeDiag('cleanup.start');
    let cleanupError: unknown;

    try {
      runtimeGraph.selectionModeEvents.cleanup();
    } catch (error) {
      cleanupError = error;
    } finally {
      resetSelectionModeSession(session);
      setContentModeEnabled('selection-mode', false);
    }

    if (cleanupError) {
      logSelectionModeError('cleanup.failed', cleanupError);
      throw cleanupError;
    }

    logSelectionModeDiag('cleanup.complete');
  };

  const runtimeFacade = createControllerRuntimeFacade({
    cleanup,
    getRuntimeGraph: () => runtimeGraph,
    session,
  });

  runtimeGraph = createSelectionModeRuntimeBindings({
    cleanup,
    runtimeFacade,
    session,
    updateFinalFrame: () => runtimeGraph.selectionModeEvents.updateFinalFrame(),
  });

  return createSelectionModeControllerActions({
    cleanup,
    runtimeFacade,
  });
}
