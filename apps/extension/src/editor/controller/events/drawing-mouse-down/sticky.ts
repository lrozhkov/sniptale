import type { Canvas } from 'fabric';
import { handleCalloutMouseDown } from '../drawing-callout-actions';
import { handleBlurMouseDown } from '../drawing-tool-actions/blur';
import { handleShapeMouseDown } from '../drawing-tool-actions/primitive';
import { handleRichShapeToolMouseDown } from '../drawing-tool-actions/rich-shape';
import { handleStepMouseDown } from '../drawing-tool-actions/step';
import { handleTextMouseDown } from '../drawing-tool-actions/text';
import type { Bindings, DrawingMouseDownEvent, DrawingTool } from './types';

export function stickyDown(
  bindings: Bindings,
  canvas: Canvas,
  tool: DrawingTool,
  event: DrawingMouseDownEvent
) {
  if (tool === 'pencil' || tool === 'highlighter') {
    return;
  }

  const point = canvas.getScenePoint(event.e);
  if (tool === 'rectangle' || tool === 'ellipse' || tool === 'diamond') {
    handleShapeMouseDown(bindings, tool, point);
    return;
  }

  if (tool === 'shapes-and-lines' || tool === 'rough-shape' || tool === 'shape-library') {
    handleRichShapeToolMouseDown(bindings, tool, point);
    return;
  }

  if (tool === 'blur') {
    handleBlurMouseDown(bindings, point);
    return;
  }

  if (tool === 'text') {
    handleTextMouseDown(bindings, point);
    return;
  }

  if (tool === 'callout') {
    handleCalloutMouseDown(bindings, point);
    return;
  }

  if (tool === 'step') {
    handleStepMouseDown(bindings, point);
  }
}
