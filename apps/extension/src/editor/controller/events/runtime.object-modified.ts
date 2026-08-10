import {
  getBlurSettings,
  isBlurObject,
  normalizeScaledBlurTarget,
  updateBlurObject,
} from '../../objects/annotation/blur/object';
import { normalizeScaledRichShapeObject } from '../../objects/rich-shape';
import { readEditorDrawingObject } from '../../drawing/object/metadata';
import { canonicalizeModifiedEditorDrawingSelection } from '../../drawing/object/canonicalize';
import { syncCropGuideInteraction } from './runtime.crop-guide';
import { syncSourceState } from './runtime.source-sync';
import type {
  EditorControllerEventCommandBindings,
  EditorControllerEventCropBindings,
  EditorControllerEventObjectBindings,
  EditorControllerEventStateBindings,
} from './types';

type CanvasObject = import('fabric').FabricObject;
type TransformOrigin = Pick<import('fabric').Transform, 'originX' | 'originY'>;

export function createObjectModifiedHandler(
  bindings: EditorControllerEventStateBindings &
    EditorControllerEventCropBindings &
    Pick<EditorControllerEventObjectBindings, 'ensureObjectReachable' | 'prepareObject'> &
    Pick<EditorControllerEventCommandBindings, 'commitHistory' | 'syncRuntimeState'>
) {
  return (event: { target?: CanvasObject; transform?: TransformOrigin }) => {
    if (event.target) {
      if (syncCropGuideInteraction(bindings, event.target)) {
        bindings.syncRuntimeState();
        return;
      }
      if (normalizeScaledRichShapeObject(event.target)) {
        event.target.setCoords();
      }
      const sharedDrawing = readEditorDrawingObject(event.target);
      if (
        isBlurObject(event.target) &&
        sharedDrawing?.kind !== 'blur' &&
        normalizeScaledBlurTarget(event.target)
      ) {
        updateBlurObject(event.target, { settings: getBlurSettings(event.target) });
      }
      const canvas = bindings.getCanvas();
      const canonical = canvas
        ? canonicalizeModifiedEditorDrawingSelection({
            canvas,
            object: event.target,
            prepareObject: bindings.prepareObject,
            source: bindings.getSource(),
          })
        : null;
      (canonical ?? [event.target]).forEach((object) => {
        bindings.ensureObjectReachable(object);
        syncSourceState(bindings, object);
      });
    }

    if (bindings.getHistoryMuted() > 0) {
      return;
    }
    bindings.commitHistory();
    bindings.syncRuntimeState();
  };
}
