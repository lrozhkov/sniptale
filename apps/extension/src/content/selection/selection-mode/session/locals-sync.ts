import {
  applySelectionModeStateLocals,
  createSelectionModeLocalsSnapshot,
  type SelectionModeLocals,
} from './locals-contract';
import type { SelectionModeState } from './state';

export type { SelectionModeLocals } from './locals-contract';

export function syncStateFromLocals(state: SelectionModeState, locals: SelectionModeLocals): void {
  applySelectionModeStateLocals(state, locals);
}

export function syncLocalsFromState(
  state: SelectionModeState,
  update: (locals: SelectionModeLocals) => void
): void {
  update(createSelectionModeLocalsSnapshot(state));
}
