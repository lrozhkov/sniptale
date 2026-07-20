import type { Point, Selection } from '../../types';
import { applyAspectRatioResize } from './aspect-ratio';
import {
  applyAnchoredResizePosition,
  applyHorizontalResize,
  applyVerticalResize,
  getResizeViewportBounds,
} from './bounds';

export function handleResizeSelectionMove(args: {
  aspectRatio: number | null;
  dragStartPoint: Point;
  event: MouseEvent;
  getMaxSelectionHeight: () => number;
  getMaxSelectionWidth: () => number;
  maintainAspectRatio: boolean;
  minSelectionSize: number;
  resizeDirection: string;
  selectionAtDragStart: Selection;
}) {
  const deltaX = args.event.clientX - args.dragStartPoint.x;
  const deltaY = args.event.clientY - args.dragStartPoint.y;
  const { maxWidth, maxHeight } = getResizeViewportBounds(args);

  const horizontal = applyHorizontalResize(args.selectionAtDragStart, args.resizeDirection, deltaX);
  const vertical = applyVerticalResize(args.selectionAtDragStart, args.resizeDirection, deltaY);

  let newWidth = Math.min(Math.max(horizontal.newWidth, args.minSelectionSize), maxWidth);
  let newHeight = Math.min(Math.max(vertical.newHeight, args.minSelectionSize), maxHeight);

  if (args.maintainAspectRatio && args.aspectRatio) {
    const ratioResize = applyAspectRatioResize({
      aspectRatio: args.aspectRatio,
      maxHeight,
      maxWidth,
      minSelectionSize: args.minSelectionSize,
      newHeight,
      newWidth,
      resizeDirection: args.resizeDirection,
      selectionAtDragStart: args.selectionAtDragStart,
    });
    newHeight = ratioResize.newHeight;
    newWidth = ratioResize.newWidth;
  }

  const anchoredPosition = applyAnchoredResizePosition({
    newHeight,
    newWidth,
    resizeDirection: args.resizeDirection,
    selectionAtDragStart: args.selectionAtDragStart,
  });

  return { height: newHeight, width: newWidth, x: anchoredPosition.newX, y: anchoredPosition.newY };
}
