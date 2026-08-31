import type { Canvas } from 'fabric';
import type { completeEditorDrawSession } from '../transient';
import type { DrawWorkflowState } from './completion-types';

export function createCropDrawWorkflowState(
  canvas: Canvas,
  completion: Extract<ReturnType<typeof completeEditorDrawSession>, { kind: 'crop' }>
): DrawWorkflowState {
  canvas.setActiveObject(completion.cropGuide);
  canvas.requestRenderAll();

  return {
    drawSession: completion.drawSession,
    cropGuide: completion.cropGuide,
    cropSelection: completion.cropSelection,
  };
}
