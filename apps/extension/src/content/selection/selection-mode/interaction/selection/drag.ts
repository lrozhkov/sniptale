import {
  createDragEventCatcher,
  hideHoverFrame as hideHoverFrameDom,
  removeDragEventCatcher,
  updateDragFrame as updateDragFrameDom,
} from '../../ui';
import type { SelectionModeDom } from '../../ui/dom-types';
import type { Point, Selection, SelectionState } from '../../types';

type StartDragSelectionArgs = {
  dom: SelectionModeDom;
  zIndexBase: number;
};

type FinalizeDragSelectionArgs = {
  dom: SelectionModeDom;
  currentSelection: Selection;
  minSelectionSize: number;
};

function resetDocumentBodySelectionStyles(): void {
  document.body.style.userSelect = '';
  document.body.style.webkitUserSelect = '';
}

export function startDragSelection(
  { dom, zIndexBase }: StartDragSelectionArgs,
  startX: number,
  startY: number
): { currentSelection: Selection; dragStartPoint: Point; currentState: SelectionState } {
  hideHoverFrameDom(dom);
  createDragEventCatcher(dom, zIndexBase);

  document.body.style.userSelect = 'none';
  document.body.style.webkitUserSelect = 'none';

  const currentSelection = {
    x: startX,
    y: startY,
    width: 0,
    height: 0,
  };

  if (dom.dragFrame) {
    dom.dragFrame.style.display = 'block';
    updateDragFrameDom(dom, currentSelection);
  }

  return {
    currentSelection,
    dragStartPoint: { x: startX, y: startY },
    currentState: 'drag',
  };
}

export function updateDragSelection(
  dragStartPoint: Point,
  currentX: number,
  currentY: number
): Selection {
  return {
    x: Math.min(dragStartPoint.x, currentX),
    y: Math.min(dragStartPoint.y, currentY),
    width: Math.abs(currentX - dragStartPoint.x),
    height: Math.abs(currentY - dragStartPoint.y),
  };
}

export function finalizeDragSelection({
  dom,
  currentSelection,
  minSelectionSize,
}: FinalizeDragSelectionArgs): {
  shouldShowFinalFrame: boolean;
  currentState: SelectionState;
  aspectRatio: number | null;
  skipNextClick: boolean;
} {
  try {
    removeDragEventCatcher(dom);

    if (currentSelection.width < minSelectionSize || currentSelection.height < minSelectionSize) {
      return {
        shouldShowFinalFrame: false,
        currentState: 'idle',
        aspectRatio: null,
        skipNextClick: false,
      };
    }

    return {
      shouldShowFinalFrame: true,
      currentState: 'confirmed',
      aspectRatio:
        currentSelection.width > 0 && currentSelection.height > 0
          ? currentSelection.width / currentSelection.height
          : null,
      skipNextClick: true,
    };
  } finally {
    resetDocumentBodySelectionStyles();
    if (dom.dragFrame) {
      dom.dragFrame.style.display = 'none';
    }
  }
}

export function handleDragMove(
  selectionAtDragStart: Selection,
  dragStartPoint: Point,
  event: MouseEvent
): Selection {
  return {
    ...selectionAtDragStart,
    x: selectionAtDragStart.x + (event.clientX - dragStartPoint.x),
    y: selectionAtDragStart.y + (event.clientY - dragStartPoint.y),
  };
}
