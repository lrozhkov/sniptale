import type { SelectionModeRuntimeState } from './types';

export function mergeSelectionModeRuntimeState(
  ...stateSlices: object[]
): SelectionModeRuntimeState {
  const state = {};

  for (const stateSlice of stateSlices) {
    // Getter/setter-based proxy slices must keep their property descriptors.
    Object.defineProperties(state, Object.getOwnPropertyDescriptors(stateSlice));
  }

  return state as SelectionModeRuntimeState;
}
