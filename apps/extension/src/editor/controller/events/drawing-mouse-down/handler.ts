import type { Canvas } from 'fabric';
import {
  clearActiveAnnotationSelection as clearSelection,
  isStickyAnnotationTool as isStickyTool,
  isTargetInCurrentSelection as isSelectedTarget,
} from '../drawing.helpers';
import { handleRasterToolMouseDown } from '../../raster-tools/interactions/down';
import { isRasterEditorTool } from '../../raster-tools/interactions/tool';
import { handleSelectedTextTargetMouseDown } from '../text-callout/selected';
import { cropDown } from './crop';
import { drawDown } from './direct';
import { stickyDown } from './sticky';
import type { Bindings, DrawingMouseDownEvent } from './types';

export function handleDrawingMouseDownTool(
  bindings: Bindings,
  canvas: Canvas,
  event: DrawingMouseDownEvent
): boolean {
  const tool = bindings.getActiveTool();
  if (
    handleSelectedTextTargetMouseDown({
      activeTool: tool,
      canvas,
      event,
    })
  ) {
    return true;
  }

  if (isRasterEditorTool(tool)) {
    void handleRasterToolMouseDown(bindings, { canvas, event });
    return true;
  }

  if (drawDown(bindings, canvas, tool, event)) {
    return true;
  }

  if (cropDown(bindings, canvas, tool, event)) {
    return true;
  }

  if (!isStickyTool(tool)) {
    return true;
  }

  if (event.alreadySelected ?? isSelectedTarget(canvas, event.target)) {
    return true;
  }

  clearSelection(canvas, () => bindings.syncRuntimeState());
  stickyDown(bindings, canvas, tool, event);
  return true;
}
