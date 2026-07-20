import type { Canvas, Point } from 'fabric';
import { getEditorShapeSettings } from '../../../features/editor/document/shape-settings';
import { useEditorStore } from '../../state/useEditorStore';
import { updateEditorDrawSessionObject } from '../drawing';
import { completeEditorDrawWorkflow } from './completion';
import { handleEditorPathCreated } from './path';
import type { CropSelection, DrawSession } from '../core/types';

export function handleEditorDrawMouseMove(options: {
  canvas: Canvas | null;
  drawSession: DrawSession | null;
  cropSelection: CropSelection | null;
  point: Point;
  constrainProportions?: boolean;
}): CropSelection | null {
  const { canvas, drawSession, cropSelection, point } = options;
  if (!canvas || !drawSession?.object) {
    return cropSelection;
  }
  const toolSettings = useEditorStore.getState().toolSettings;
  const { arrow, blur, line } = toolSettings;
  const shape =
    drawSession.tool === 'ellipse'
      ? getEditorShapeSettings(toolSettings, 'ellipse')
      : getEditorShapeSettings(toolSettings, 'rectangle');

  const nextCropSelection =
    updateEditorDrawSessionObject(
      drawSession,
      point,
      arrow,
      shape,
      blur,
      options.constrainProportions === true,
      line
    ) ?? cropSelection;

  drawSession.object.setCoords();
  canvas.requestRenderAll();
  return nextCropSelection;
}

export { handleEditorPathCreated, completeEditorDrawWorkflow };
