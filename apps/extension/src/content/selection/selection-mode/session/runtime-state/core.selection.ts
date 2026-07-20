import type { SelectionModeMutableRefs } from '../locals-contract';
import type { SelectionModeLocals } from '../locals-sync';
import type { SelectionState } from '../../types';

export function createSelectionModeCoreSelectionState(refs: SelectionModeMutableRefs) {
  return {
    get currentSelection() {
      return refs.currentSelection;
    },
    set currentSelection(value: SelectionModeLocals['currentSelection']) {
      refs.currentSelection = value;
    },
    get currentState() {
      return refs.currentState;
    },
    set currentState(value: SelectionState) {
      refs.currentState = value;
    },
  };
}
