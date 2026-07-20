import * as runtimeStateArgs from '../session/runtime-state/args';

export function createSelectionModeRuntimeArgs(
  args: Parameters<typeof runtimeStateArgs.createSelectionModeRuntimeArgs>[0]
) {
  return runtimeStateArgs.createSelectionModeRuntimeArgs(args);
}
