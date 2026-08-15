import type { Canvas } from 'fabric';
import { isTextbox } from '../core/helpers';
import { applyEditorObjectInteractionControls } from '../document/interaction-controls/apply';
import { clearRichShapeToolOrigin } from '../tools/rich-shape-drawing/origin';
import { readEditorDrawingObject, writeEditorDrawingObject } from '../../drawing/object/metadata';
import { applyEditorDrawingInteractionControls } from '../../drawing/object/controls/apply';
import { updateEditorDrawingPathDraft } from '../../drawing/object/vector';
import type { completeEditorDrawSession } from '../transient';
import type { DrawWorkflowState } from './completion-types';
import { beginEditorTextboxEditing } from '../document/objects/textbox-lifecycle';

export function createCompletedDrawWorkflowState(
  canvas: Canvas,
  completion: Extract<ReturnType<typeof completeEditorDrawSession>, { kind: 'complete' }>,
  commitHistory: () => void,
  syncRuntimeState: () => void
): DrawWorkflowState {
  const drawing = readEditorDrawingObject(completion.object);
  if (drawing?.kind === 'pencil' || drawing?.kind === 'marker' || drawing?.kind === 'arrow') {
    updateEditorDrawingPathDraft(completion.object, drawing, { preview: false });
  }
  if (
    drawing?.kind === 'rectangle' ||
    drawing?.kind === 'ellipse' ||
    drawing?.kind === 'triangle' ||
    drawing?.kind === 'parallelogram'
  ) {
    writeEditorDrawingObject(completion.object, drawing);
  }
  if (completion.completedTool === 'rich-shape') {
    clearRichShapeToolOrigin(completion.object);
  }
  applyEditorObjectInteractionControls(completion.object);
  applyEditorDrawingInteractionControls(completion.object);
  if (completion.completedTool === 'pencil' || completion.completedTool === 'marker') {
    canvas.discardActiveObject();
  } else {
    canvas.setActiveObject(completion.object);
  }
  if (completion.completedTool === 'text' && isTextbox(completion.object)) {
    beginEditorTextboxEditing(completion.object);
    completion.object.enterEditing();
  }
  canvas.requestRenderAll();
  if (completion.completedTool !== 'text') {
    commitHistory();
  }
  syncRuntimeState();

  return {
    drawSession: completion.drawSession,
    cropGuide: null,
    cropSelection: null,
  };
}
