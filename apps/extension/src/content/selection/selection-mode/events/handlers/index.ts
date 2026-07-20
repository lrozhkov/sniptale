import type { SelectionModeEventHandlersArgs } from './types';
import { createSelectionModeActivationHandlers } from './activation';
import { createSelectionModePointerHandlers } from './pointer';

export function createSelectionModeEventHandlers(args: SelectionModeEventHandlersArgs) {
  const withStateSync = (callback: () => void) => {
    callback();
  };

  return {
    ...createSelectionModeActivationHandlers({
      selectionModeEvents: args.selectionModeEvents,
      state: args.state,
      withStateSync,
    }),
    ...createSelectionModePointerHandlers({
      selectionModeEvents: args.selectionModeEvents,
      state: args.state,
      withStateSync,
    }),
  };
}
