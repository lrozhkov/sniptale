import { createSelectionModeCancelSelection } from './cancel-selection';
import { createSelectionModeCleanup } from './cleanup';
import { createSelectionModeConfirmSelection } from './confirm-selection';
import { createSelectionModeRuntimeEventActions } from './runtime-event-actions';
import type { SelectionModeEventsBridgeArgs } from './types';

export function createSelectionModeEventsBridge(args: SelectionModeEventsBridgeArgs) {
  const confirmSelection = createSelectionModeConfirmSelection(args);
  const cancelSelection = createSelectionModeCancelSelection(args);
  const cleanup = createSelectionModeCleanup(args);
  return {
    cancelSelection,
    cleanup,
    confirmSelection,
    ...createSelectionModeRuntimeEventActions(args.runtimeArgs),
  };
}
