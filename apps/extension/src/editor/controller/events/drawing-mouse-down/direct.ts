import type { Canvas } from 'fabric';
import { handleArrowDrawingMouseDown } from '../arrow-drawing';
import { handleLineDrawingMouseDown } from '../line-drawing';
import type { Bindings, DrawingMouseDownEvent, DrawingTool } from './types';

export function drawDown(
  bindings: Bindings,
  canvas: Canvas,
  tool: DrawingTool,
  event: DrawingMouseDownEvent
): boolean {
  if (tool === 'select') {
    return true;
  }

  if (tool === 'arrow') {
    handleArrowDrawingMouseDown(bindings, canvas, event);
    return true;
  }

  if (tool === 'line') {
    handleLineDrawingMouseDown(bindings, canvas, event);
    return true;
  }

  return false;
}
