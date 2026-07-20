import type { SelectionModeMutableRefs } from '../locals-contract';

export function createSelectionModePointerHoverState(refs: SelectionModeMutableRefs) {
  return {
    get hoveredElement() {
      return refs.hoveredElement;
    },
    set hoveredElement(value: HTMLElement | null) {
      refs.hoveredElement = value;
    },
  };
}
