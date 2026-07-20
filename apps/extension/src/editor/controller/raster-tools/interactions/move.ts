import type { Canvas, FabricObject, TPointerEvent } from 'fabric';
import { isEditorRasterTargetActionableStatus } from '../../../state/raster-tools';
import { useEditorStore } from '../../../state/useEditorStore';
import { updateBrushDraft, updateBrushHoverCursor } from '../brush';
import { updateEraserDraft, updateRasterHoverCursor } from '../edit';
import { updateGradientDraft } from '../fill';
import { clearEditorRasterHoverCursor } from '../session';
import type { RasterToolBindings } from '../shared';
import { updateLassoDraft, updateMarqueeDraft } from '../selection/draft';
import { syncRasterPointerTarget } from './target';
import { isRasterEditorTool } from './tool';

export function handleRasterToolMouseMove(
  bindings: RasterToolBindings,
  args: { canvas: Canvas; event: { e: TPointerEvent; target?: FabricObject } }
): boolean {
  const tool = bindings.getActiveTool();
  if (!isRasterEditorTool(tool)) {
    return false;
  }

  syncRasterPointerTarget(args.canvas, tool, args.event.target);
  const scenePoint = args.canvas.getScenePoint(args.event.e);
  const session = bindings.getRasterToolSession();
  if (updateMarqueeDraft(session, args.canvas, bindings.getCanvas(), scenePoint)) {
    return true;
  }

  if (updateLassoDraft(session, args.canvas, bindings.getCanvas(), scenePoint)) {
    return true;
  }

  if (updateEraserDraft(session, args.canvas, bindings.getCanvas(), scenePoint)) {
    return true;
  }

  if (updateBrushDraft(session, scenePoint)) {
    return true;
  }

  if (updateGradientDraft(session, args.canvas, bindings.getCanvas(), scenePoint)) {
    return true;
  }

  if (
    bindings.getActiveTool() === 'eraser' &&
    isEditorRasterTargetActionableStatus(useEditorStore.getState().rasterTarget.status)
  ) {
    return updateRasterHoverCursor(session, scenePoint);
  }

  if (
    bindings.getActiveTool() === 'brush' &&
    isEditorRasterTargetActionableStatus(useEditorStore.getState().rasterTarget.status)
  ) {
    return updateBrushHoverCursor(session, scenePoint);
  }

  clearEditorRasterHoverCursor(session);
  return false;
}
