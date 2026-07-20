import type { Selection, SelectionState } from '../../types';
import { resetFinalElements } from '../../ui';
import type { SelectionModeDom } from '../../ui/dom-types';

type SelectElementArgs = {
  element: HTMLElement;
  getAbsolutePosition: (element: HTMLElement) => {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  getMaxSelectionWidth: () => number;
  getMaxSelectionHeight: () => number;
};

export function selectElement({
  element,
  getAbsolutePosition,
  getMaxSelectionWidth,
  getMaxSelectionHeight,
}: SelectElementArgs): { currentSelection: Selection; aspectRatio: number | null } {
  const pos = getAbsolutePosition(element);
  const width = Math.min(pos.width, getMaxSelectionWidth());
  const height = Math.min(pos.height, getMaxSelectionHeight());
  const currentSelection = constrainSelection({
    x: pos.x,
    y: pos.y,
    width,
    height,
  });

  return {
    currentSelection,
    aspectRatio: width > 0 && height > 0 ? width / height : null,
  };
}

export function resetToIdleState(dom: SelectionModeDom): {
  currentSelection: Selection;
  aspectRatio: null;
  maintainAspectRatio: false;
  isDragging: false;
  isResizing: false;
  resizeDirection: null;
  hoveredElement: null;
  mouseDownPoint: null;
  hasMovedEnough: false;
  currentState: SelectionState;
} {
  resetFinalElements(dom);

  return {
    currentSelection: { x: 0, y: 0, width: 0, height: 0 },
    aspectRatio: null,
    maintainAspectRatio: false,
    isDragging: false,
    isResizing: false,
    resizeDirection: null,
    hoveredElement: null,
    mouseDownPoint: null,
    hasMovedEnough: false,
    currentState: 'idle',
  };
}

export function constrainSelection(currentSelection: Selection): Selection {
  const maxX = window.innerWidth - currentSelection.width;
  const maxY = window.innerHeight - currentSelection.height;

  return {
    ...currentSelection,
    x: Math.max(0, Math.min(currentSelection.x, maxX)),
    y: Math.max(0, Math.min(currentSelection.y, maxY)),
  };
}
