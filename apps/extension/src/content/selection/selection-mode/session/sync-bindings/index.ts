import type { SelectionModeLocals } from '../locals-contract';
import type { SelectionModeState } from '../state';
import { syncSelectionModeLocalsBindings, syncSelectionModeStateBindings } from './sync';

export function syncSelectionModeStateFromLocals(args: {
  locals: SelectionModeLocals;
  mutableRefs: ReturnType<typeof import('../refs').createSelectionModeMutableRefs>;
  state: SelectionModeState;
}): void {
  syncSelectionModeStateBindings(args);
}

export function syncSelectionModeLocalsFromState(args: {
  mutableRefs: ReturnType<typeof import('../refs').createSelectionModeMutableRefs>;
  onSync: (locals: SelectionModeLocals) => void;
  state: SelectionModeState;
}): void {
  syncSelectionModeLocalsBindings(args);
}
