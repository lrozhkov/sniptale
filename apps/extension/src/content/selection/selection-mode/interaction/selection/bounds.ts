import type { Selection } from '../../types';

export function applyHorizontalResize(
  selectionAtDragStart: Selection,
  resizeDirection: string,
  deltaX: number
) {
  let newX = selectionAtDragStart.x;
  let newWidth = selectionAtDragStart.width;

  if (resizeDirection.includes('e')) {
    newWidth = selectionAtDragStart.width + deltaX;
  }
  if (resizeDirection.includes('w')) {
    newWidth = selectionAtDragStart.width - deltaX;
    newX = selectionAtDragStart.x + deltaX;
  }

  return { newWidth, newX };
}

function getMaxHorizontalResizeWidth(
  selectionAtDragStart: Selection,
  resizeDirection: string,
  viewportWidth: number
) {
  if (resizeDirection.includes('w')) {
    return selectionAtDragStart.x + selectionAtDragStart.width;
  }

  if (resizeDirection.includes('e')) {
    return viewportWidth - selectionAtDragStart.x;
  }

  return viewportWidth;
}

export function applyVerticalResize(
  selectionAtDragStart: Selection,
  resizeDirection: string,
  deltaY: number
) {
  let newY = selectionAtDragStart.y;
  let newHeight = selectionAtDragStart.height;

  if (resizeDirection.includes('s')) {
    newHeight = selectionAtDragStart.height + deltaY;
  }
  if (resizeDirection.includes('n')) {
    newHeight = selectionAtDragStart.height - deltaY;
    newY = selectionAtDragStart.y + deltaY;
  }

  return { newHeight, newY };
}

function getMaxVerticalResizeHeight(
  selectionAtDragStart: Selection,
  resizeDirection: string,
  viewportHeight: number
) {
  if (resizeDirection.includes('n')) {
    return selectionAtDragStart.y + selectionAtDragStart.height;
  }

  if (resizeDirection.includes('s')) {
    return viewportHeight - selectionAtDragStart.y;
  }

  return viewportHeight;
}

export function getResizeViewportBounds(args: {
  getMaxSelectionHeight: () => number;
  getMaxSelectionWidth: () => number;
  minSelectionSize: number;
  resizeDirection: string;
  selectionAtDragStart: Selection;
}) {
  return {
    maxWidth: Math.max(
      args.minSelectionSize,
      getMaxHorizontalResizeWidth(
        args.selectionAtDragStart,
        args.resizeDirection,
        args.getMaxSelectionWidth()
      )
    ),
    maxHeight: Math.max(
      args.minSelectionSize,
      getMaxVerticalResizeHeight(
        args.selectionAtDragStart,
        args.resizeDirection,
        args.getMaxSelectionHeight()
      )
    ),
  };
}

export function applyAnchoredResizePosition(args: {
  newHeight: number;
  newWidth: number;
  resizeDirection: string;
  selectionAtDragStart: Selection;
}) {
  return {
    newX: args.resizeDirection.includes('w')
      ? args.selectionAtDragStart.x + args.selectionAtDragStart.width - args.newWidth
      : args.selectionAtDragStart.x,
    newY: args.resizeDirection.includes('n')
      ? args.selectionAtDragStart.y + args.selectionAtDragStart.height - args.newHeight
      : args.selectionAtDragStart.y,
  };
}
