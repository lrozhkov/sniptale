import { completeEditorDrawSession } from '../transient';
import type { DrawSession } from '../core/types';
import { createCompletedDrawWorkflowState } from './completion-complete';
import { createCropDrawWorkflowState } from './completion-crop';
import { createDiscardDrawWorkflowState } from './completion-discard';
import type { DrawWorkflowState } from './completion-types';

export function completeEditorDrawWorkflow(options: {
  canvas: import('fabric').Canvas | null;
  drawSession: DrawSession | null;
  canvasDocumentSize: { width: number; height: number };
  minDrawSize: number;
  commitHistory: () => void;
  syncRuntimeState: () => void;
}): DrawWorkflowState | null {
  const { canvas, drawSession, canvasDocumentSize, minDrawSize, commitHistory, syncRuntimeState } =
    options;
  if (!canvas || !drawSession?.object) {
    return null;
  }

  const completion = completeEditorDrawSession({
    drawSession,
    canvasDocumentSize,
    minDrawSize,
  });

  switch (completion.kind) {
    case 'discard':
      return createDiscardDrawWorkflowState(canvas, drawSession, syncRuntimeState);
    case 'crop':
      return createCropDrawWorkflowState(canvas, completion, syncRuntimeState);
    case 'complete':
      return createCompletedDrawWorkflowState(canvas, completion, commitHistory, syncRuntimeState);
    default:
      return null;
  }
}
