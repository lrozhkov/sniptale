import type { Canvas } from 'fabric';
import { useEditorStore } from '../../state/useEditorStore';
import type { completeEditorDrawSession } from '../transient';
import type { DrawWorkflowState } from './completion-types';

export function createCropDrawWorkflowState(
  canvas: Canvas,
  completion: Extract<ReturnType<typeof completeEditorDrawSession>, { kind: 'crop' }>,
  syncRuntimeState: () => void
): DrawWorkflowState {
  useEditorStore.getState().setCropReady(true);
  canvas.setActiveObject(completion.cropGuide);
  canvas.requestRenderAll();
  syncRuntimeState();

  return {
    drawSession: completion.drawSession,
    cropGuide: completion.cropGuide,
    cropSelection: completion.cropSelection,
  };
}
