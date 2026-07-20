import { finishBrushDraft } from '../brush';
import { finishEraserDraft } from '../edit';
import { finishGradientDraft } from '../fill';
import type { RasterToolBindings } from '../shared';
import { finalizeLassoDraft, finalizeMarqueeDraft } from '../selection/draft';
import { isRasterEditorTool } from './tool';

export async function handleRasterToolMouseUp(bindings: RasterToolBindings): Promise<boolean> {
  if (!isRasterEditorTool(bindings.getActiveTool())) {
    return false;
  }

  const session = bindings.getRasterToolSession();
  if (finalizeMarqueeDraft(session)) {
    return true;
  }

  if (finalizeLassoDraft(session)) {
    return true;
  }

  if (await finishEraserDraft(bindings, session)) {
    return true;
  }

  if (await finishBrushDraft(bindings, session)) {
    return true;
  }

  if (await finishGradientDraft(bindings, session)) {
    return true;
  }

  return bindings.getActiveTool() === 'eraser' || bindings.getActiveTool() === 'brush';
}
