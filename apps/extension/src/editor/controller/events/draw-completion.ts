import { MIN_DRAW_SIZE } from '../../document/model';
import { completeEditorDrawWorkflow } from '../draw-workflow';
import type {
  EditorControllerEventCommandBindings,
  EditorControllerEventCropBindings,
  EditorControllerEventStateBindings,
} from './types';

export type DrawCompletionBindings = EditorControllerEventStateBindings &
  EditorControllerEventCropBindings &
  Pick<EditorControllerEventCommandBindings, 'commitHistory' | 'syncRuntimeState'>;

export function completeDrawWorkflowFromBindings(bindings: DrawCompletionBindings): boolean {
  const nextState = completeEditorDrawWorkflow({
    canvas: bindings.getCanvas(),
    drawSession: bindings.getDrawSession(),
    canvasDocumentSize: bindings.getCanvasDocumentSize(),
    minDrawSize: MIN_DRAW_SIZE,
    commitHistory: () => bindings.commitHistory(),
    syncRuntimeState: () => bindings.syncRuntimeState(),
  });
  if (!nextState) {
    return false;
  }

  bindings.setDrawSession(nextState.drawSession);
  bindings.setCropState(nextState.cropGuide, nextState.cropSelection);
  bindings.syncRuntimeState();
  return true;
}
