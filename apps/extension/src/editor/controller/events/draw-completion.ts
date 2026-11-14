import { deferEditorFreehandCompletion } from '../draw-workflow/released';
import { retainCompletedEditorFreehandPreview } from './runtime.render';
import { reportEditorActionFailure } from '../../runtime/async-actions';
import { MIN_DRAW_SIZE } from '../../document/model';
import { completeEditorDrawWorkflow } from '../draw-workflow';
import type {
  EditorControllerEventCommandBindings,
  EditorControllerEventCropBindings,
  EditorControllerEventStateBindings,
} from './types';

export type DrawCompletionBindings = EditorControllerEventStateBindings &
  EditorControllerEventCropBindings &
  Pick<
    EditorControllerEventCommandBindings,
    'commitHistory' | 'syncRuntimeState' | 'beginFreehandCompletion' | 'syncHistoryState'
  >;

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

/** Releases input without building geometry or a document snapshot in pointerup. */
export function releaseFreehandDrawWorkflowFromBindings(bindings: DrawCompletionBindings): boolean {
  const canvas = bindings.getCanvas();
  const session = bindings.getDrawSession();
  if (!canvas || !session?.object || (session.tool !== 'pencil' && session.tool !== 'marker')) {
    return completeDrawWorkflowFromBindings(bindings);
  }
  const object = session.object;
  retainCompletedEditorFreehandPreview(canvas, object);
  bindings.setDrawSession(null);
  const onSettled = bindings.beginFreehandCompletion?.();
  deferEditorFreehandCompletion({
    canvas,
    object,
    ...(onSettled ? { onSettled } : {}),
    complete: () => {
      if (bindings.getCanvas() !== canvas) return;
      completeDrawWorkflowFromBindings({ ...bindings, getDrawSession: () => session });
    },
    onFailure: () =>
      reportEditorActionFailure('freehand-completion', new Error('Stroke completion failed')),
  });
  if (bindings.syncHistoryState) bindings.syncHistoryState();
  else bindings.syncRuntimeState();
  return true;
}
