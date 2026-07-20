import type { CaptureArea } from '@sniptale/runtime-contracts/messaging/capture-messages';
import { setContentModeEnabled } from '../../../application/mode-session';
import { logSelectionModeDiag, logSelectionModeError } from '../diag';
import { createSelectionModeControllerActions } from './actions';
import {
  createSelectionModeFacadeBindings,
  createSelectionModeRuntimeBindings,
} from './runtime-bindings';
import { createSelectionModeSessionMutableRefs } from '../session/locals/helpers';
import { createSelectionModeSession, resetSelectionModeSession } from '../session';
import { createSelectionModeState } from '../session/state';

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
  const state = createSelectionModeState();
  const session = createSelectionModeSession(state);
  const mutableRefs = createSelectionModeSessionMutableRefs(session);
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

  const runtimeFacade = createSelectionModeFacadeBindings({
    cleanup,
    getRuntimeArgs: () => runtimeGraph.selectionModeRuntimeArgs,
    getRuntimeEvents: () => runtimeGraph.selectionModeEvents,
    session,
    state,
  });

  runtimeGraph = createSelectionModeRuntimeBindings({
    cleanup,
    mutableRefs,
    runtimeFacade,
    session,
    state,
    updateFinalFrame: () => runtimeGraph.selectionModeEvents.updateFinalFrame(),
  });

  return createSelectionModeControllerActions({
    cleanup,
    runtimeFacade,
  });
}
