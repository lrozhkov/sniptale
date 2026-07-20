import type { SelectionModeMutableRefs } from '../locals-contract';
import type { SelectionModeLocals } from '../locals-sync';

export function createSelectionModePointerSelectionState(refs: SelectionModeMutableRefs) {
  return {
    get selectionAtDragStart() {
      return refs.selectionAtDragStart;
    },
    set selectionAtDragStart(value: SelectionModeLocals['selectionAtDragStart']) {
      refs.selectionAtDragStart = value;
    },
  };
}
