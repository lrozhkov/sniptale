import type { SelectionModeMutableRefs } from '../locals-contract';
import type { SelectionModeLocals } from '../locals-sync';

export function createSelectionModePointerInteractionState(refs: SelectionModeMutableRefs) {
  return {
    get isActive() {
      return refs.isActive;
    },
    set isActive(value: boolean) {
      refs.isActive = value;
    },
    get mouseDownPoint() {
      return refs.mouseDownPoint;
    },
    set mouseDownPoint(value: SelectionModeLocals['mouseDownPoint']) {
      refs.mouseDownPoint = value;
    },
    get resizeDirection() {
      return refs.resizeDirection;
    },
    set resizeDirection(value: SelectionModeLocals['resizeDirection']) {
      refs.resizeDirection = value;
    },
  };
}
