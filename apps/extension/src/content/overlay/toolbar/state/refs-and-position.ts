import { useToolbarDragPosition, type ToolbarDragPositionState } from '../shell/drag-position';

export function useToolbarRefsAndPosition(
  currentViewport: { width: number; height: number } | null
): ToolbarDragPositionState {
  return useToolbarDragPosition(currentViewport);
}
