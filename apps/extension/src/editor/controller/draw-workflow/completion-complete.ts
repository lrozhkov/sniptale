import type { Canvas, FabricObject } from 'fabric';
import { isArrowObject, updateArrowObject } from '../../objects/arrow';
import { isLineObject, updateLineObject } from '../../objects/line';
import { isTextbox } from '../core/helpers';
import { applyEditorObjectInteractionControls } from '../document/interaction-controls/apply';
import { clearRichShapeToolOrigin } from '../tools/rich-shape-drawing/origin';
import type { completeEditorDrawSession } from '../transient';
import type { DrawWorkflowState } from './completion-types';

function reapplyInteractionControls(object: FabricObject): void {
  if (typeof object.set !== 'function') {
    return;
  }

  applyEditorObjectInteractionControls(object);
}

function completeArrowDrawObject(object: FabricObject): void {
  delete object.sniptaleArrowClickMode;
  delete object.sniptaleArrowDrawing;
  delete object.sniptaleArrowPointerMoved;
  delete object.sniptaleArrowDraftPoints;
  if (isArrowObject(object)) {
    updateArrowObject(object, {});
    reapplyInteractionControls(object);
  }
}

function completeLineDrawObject(canvas: Canvas, object: FabricObject): void {
  delete object.sniptaleLineClickMode;
  delete object.sniptaleLineDrawing;
  delete object.sniptaleLinePointerMoved;
  if (isLineObject(object)) {
    updateLineObject(object, {});
    reapplyInteractionControls(object);
  }
  canvas.discardActiveObject?.();
}

export function createCompletedDrawWorkflowState(
  canvas: Canvas,
  completion: Extract<ReturnType<typeof completeEditorDrawSession>, { kind: 'complete' }>,
  commitHistory: () => void,
  syncRuntimeState: () => void
): DrawWorkflowState {
  if (completion.completedTool === 'arrow') {
    completeArrowDrawObject(completion.object);
  }
  if (completion.completedTool === 'rich-shape') {
    clearRichShapeToolOrigin(completion.object);
  }
  if (completion.completedTool === 'line') {
    completeLineDrawObject(canvas, completion.object);
  } else {
    canvas.setActiveObject(completion.object);
  }
  if (completion.completedTool === 'text' && isTextbox(completion.object)) {
    completion.object.enterEditing();
    completion.object.selectAll();
  }
  canvas.requestRenderAll();
  commitHistory();
  syncRuntimeState();

  return {
    drawSession: completion.drawSession,
    cropGuide: null,
    cropSelection: null,
  };
}
