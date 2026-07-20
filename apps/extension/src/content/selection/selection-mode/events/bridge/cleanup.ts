import { cleanupSelectionModeRuntime } from '../../runtime';
import type { SelectionModeEventsBridgeArgs, SelectionModeEventsBridgeRuntimeArgs } from './types';

export function createSelectionModeCleanup(args: SelectionModeEventsBridgeArgs) {
  return () => {
    args.disableCursor();
    const runtimeState: SelectionModeEventsBridgeRuntimeArgs['state'] = args.runtimeArgs.state;
    cleanupSelectionModeRuntime(runtimeState, args.handleKeyDown);
  };
}
