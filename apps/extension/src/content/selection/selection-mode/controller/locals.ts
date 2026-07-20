import {
  applySelectionModeMutableLocals,
  createSelectionModeLocalsSnapshot as createSelectionModeSharedLocalsSnapshot,
  type SelectionModeLocals,
  type SelectionModeMutableRefs,
} from '../session/locals-contract';

export function createSelectionModeLocalsSnapshot(args: SelectionModeLocals): SelectionModeLocals {
  return createSelectionModeSharedLocalsSnapshot(args);
}

export function applySelectionModeLocals(
  refs: SelectionModeMutableRefs,
  locals: SelectionModeLocals
): void {
  applySelectionModeMutableLocals(refs, locals);
}
