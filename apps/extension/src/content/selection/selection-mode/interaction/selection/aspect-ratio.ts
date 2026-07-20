import type { Selection } from '../../types';

export function applyAspectRatioResize(args: {
  aspectRatio: number;
  maxHeight: number;
  maxWidth: number;
  minSelectionSize: number;
  newHeight: number;
  newWidth: number;
  resizeDirection: string;
  selectionAtDragStart: Selection;
}) {
  let { newHeight, newWidth } = args;
  let newX = args.selectionAtDragStart.x;
  let newY = args.selectionAtDragStart.y;

  if (args.resizeDirection.includes('e') || args.resizeDirection.includes('w')) {
    const computedHeight = newWidth / args.aspectRatio;
    if (computedHeight >= args.minSelectionSize && computedHeight <= args.maxHeight) {
      newHeight = computedHeight;
    } else {
      newHeight = Math.min(Math.max(computedHeight, args.minSelectionSize), args.maxHeight);
      newWidth = Math.min(
        Math.max(newHeight * args.aspectRatio, args.minSelectionSize),
        args.maxWidth
      );
    }
    if (args.resizeDirection.includes('n')) {
      newY = args.selectionAtDragStart.y + args.selectionAtDragStart.height - newHeight;
    }
  } else {
    const computedWidth = newHeight * args.aspectRatio;
    if (computedWidth >= args.minSelectionSize && computedWidth <= args.maxWidth) {
      newWidth = computedWidth;
    } else {
      newWidth = Math.min(Math.max(computedWidth, args.minSelectionSize), args.maxWidth);
      newHeight = Math.min(
        Math.max(newWidth / args.aspectRatio, args.minSelectionSize),
        args.maxHeight
      );
    }
    if (args.resizeDirection.includes('w')) {
      newX = args.selectionAtDragStart.x + args.selectionAtDragStart.width - newWidth;
    }
  }

  return { newHeight, newWidth, newX, newY };
}
