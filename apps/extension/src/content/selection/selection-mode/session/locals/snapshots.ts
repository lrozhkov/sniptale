import {
  createSelectionModeLocalsSnapshot,
  createSelectionModeMutableLocalsSnapshot as createSelectionModeSharedMutableLocalsSnapshot,
  type SelectionModeLocals,
  type SelectionModeMutableLocals,
} from '../locals-contract';

export function createSelectionModeStateSyncLocals(args: SelectionModeLocals) {
  return createSelectionModeLocalsSnapshot(args);
}

export function createSelectionModeMutableLocalsSnapshot(
  args: SelectionModeMutableLocals
): SelectionModeMutableLocals {
  return createSelectionModeSharedMutableLocalsSnapshot(args);
}
