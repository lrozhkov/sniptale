import { handleResizeSelectionMove } from '../selection/helpers';
import type { ResizeDirection } from '../../ui/dom-types';
import type { Point, Selection } from '../../types';

type ResizeSelectionArgs = {
  selectionAtDragStart: Selection;
  dragStartPoint: Point;
  event: MouseEvent;
  resizeDirection: ResizeDirection;
  maintainAspectRatio: boolean;
  aspectRatio: number | null;
  minSelectionSize: number;
  getMaxSelectionWidth: () => number;
  getMaxSelectionHeight: () => number;
};

export function handleResizeMove({
  selectionAtDragStart,
  dragStartPoint,
  event,
  resizeDirection,
  maintainAspectRatio,
  aspectRatio,
  minSelectionSize,
  getMaxSelectionWidth,
  getMaxSelectionHeight,
}: ResizeSelectionArgs): Selection {
  return handleResizeSelectionMove({
    aspectRatio,
    dragStartPoint,
    event,
    getMaxSelectionHeight,
    getMaxSelectionWidth,
    maintainAspectRatio,
    minSelectionSize,
    resizeDirection,
    selectionAtDragStart,
  });
}
