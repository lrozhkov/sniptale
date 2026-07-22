import type { SelectionModeEventHandlersArgs } from './types';
import { createSelectionModeActivationHandlers } from './activation';
import { createSelectionModePointerHandlers } from './pointer';

export function createSelectionModeEventHandlers(args: SelectionModeEventHandlersArgs) {
  return {
    ...createSelectionModeActivationHandlers(args),
    ...createSelectionModePointerHandlers(args),
  };
}
