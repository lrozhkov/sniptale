import type { CaptureArea } from '@sniptale/runtime-contracts/messaging/capture-messages';
import { setContentModeEnabled } from '../../../application/mode-session';
import { logSelectionModeDiag, logSelectionModeError } from '../diag';
import { createSelectionModeControllerActions } from './actions';
import { createSelectionModeRuntime } from '../runtime/composition';
import { createSelectionModeSession, resetSelectionModeSession } from '../session';

interface SelectionModeController {
  cleanup: () => void;
  disableSelectionMode: () => void;
  enableSelectionMode: () => Promise<CaptureArea>;
  isSelectionModeActive: () => boolean;
}

/**
 * Creates a selection-mode controller with instance-owned state and one runtime composition.
 */
export function createSelectionModeController(): SelectionModeController {
  const session = createSelectionModeSession();
  let runtime: ReturnType<typeof createSelectionModeRuntime>;

  const cleanup = () => {
    logSelectionModeDiag('cleanup.start');
    let cleanupError: unknown;

    try {
      runtime.cleanupEffects();
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

  runtime = createSelectionModeRuntime({
    cleanup,
    session,
  });

  return createSelectionModeControllerActions({
    cleanup,
    runtime,
  });
}
