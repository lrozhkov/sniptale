import type { SelectionModeMutableRefs } from '../locals-contract';
import type { SelectionModeLocals } from '../locals-sync';

export function createSelectionModePointerDragState(refs: SelectionModeMutableRefs) {
  return {
    get dragStartPoint() {
      return refs.dragStartPoint;
    },
    set dragStartPoint(value: SelectionModeLocals['dragStartPoint']) {
      refs.dragStartPoint = value;
    },
    get hasMovedEnough() {
      return refs.hasMovedEnough;
    },
    set hasMovedEnough(value: boolean) {
      refs.hasMovedEnough = value;
    },
  };
}
