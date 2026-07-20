import type { Canvas } from 'fabric';
import type { DrawSession } from '../core/types';
import type { DrawWorkflowState } from './completion-types';

export function createDiscardDrawWorkflowState(
  canvas: Canvas,
  drawSession: DrawSession,
  syncRuntimeState: () => void
): DrawWorkflowState {
  if (drawSession.object) {
    canvas.remove(drawSession.object);
  }
  syncRuntimeState();

  return {
    drawSession: null,
    cropGuide: null,
    cropSelection: null,
  };
}
