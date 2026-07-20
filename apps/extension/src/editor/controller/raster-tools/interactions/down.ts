import type { Canvas, FabricObject, TPointerEvent } from 'fabric';
import { handleBrushMouseDown } from '../brush';
import { handleEraserMouseDown } from '../edit';
import { handleFillMouseDown } from '../fill';
import type { RasterToolBindings } from '../shared';
import { handleSelectionMouseDown } from '../selection/start';
import { isRasterEditorTool } from './tool';

export async function handleRasterToolMouseDown(
  bindings: RasterToolBindings,
  args: { canvas: Canvas; event: { e: TPointerEvent; target?: FabricObject } }
): Promise<boolean> {
  const tool = bindings.getActiveTool();
  if (!isRasterEditorTool(tool)) {
    return false;
  }

  const scenePoint = args.canvas.getScenePoint(args.event.e);
  if (tool === 'selection') {
    return await handleSelectionMouseDown(bindings, args.canvas, scenePoint, args.event.target);
  }
  if (tool === 'brush') {
    return await handleBrushMouseDown(bindings, args.canvas, scenePoint, args.event.target);
  }
  if (tool === 'eraser') {
    return await handleEraserMouseDown(bindings, args.canvas, scenePoint, args.event.target);
  }
  return await handleFillMouseDown(bindings, args.canvas, scenePoint, args.event.target);
}
