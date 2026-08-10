import { isBlurObject } from '../../objects/annotation/blur/object';
import { normalizeScaledRectangleTarget } from '../../objects/shape-style';
import { syncCropGuideInteraction } from './runtime.crop-guide';
import { syncSourceState } from './runtime.source-sync';
import { normalizeScaledAnnotationTarget } from '../tools/annotation-resize';
import type {
  EditorControllerEventCommandBindings,
  EditorControllerEventCropBindings,
  EditorControllerEventObjectBindings,
  EditorControllerEventStateBindings,
} from './types';

type CanvasObject = import('fabric').FabricObject;
type TransformOrigin = Pick<import('fabric').Transform, 'originX' | 'originY'>;

export function createObjectScalingHandler(
  bindings: EditorControllerEventStateBindings &
    EditorControllerEventCropBindings &
    Pick<EditorControllerEventObjectBindings, 'ensureObjectReachable'> &
    Pick<EditorControllerEventCommandBindings, 'syncRuntimeState'>
) {
  return (event: { target?: CanvasObject; transform?: TransformOrigin }) => {
    if (!event.target) {
      return;
    }

    if (syncCropGuideInteraction(bindings, event.target)) {
      bindings.getCanvas()?.requestRenderAll();
      bindings.syncRuntimeState();
      return;
    }

    if (!normalizeRuntimeScaledTarget(bindings, event.target, event.transform)) {
      return;
    }

    bindings.ensureObjectReachable(event.target);
    bindings.getCanvas()?.requestRenderAll();
  };
}

function normalizeRuntimeScaledTarget(
  bindings: EditorControllerEventStateBindings,
  target: CanvasObject,
  _transform?: TransformOrigin
) {
  if (isBlurObject(target)) {
    target.dirty = true;
  } else if (normalizeScaledRectangleTarget(target)) {
    target.setCoords();
  } else if (target.sniptaleType === 'rich-shape') {
    target.setCoords();
  } else if (target.sniptaleType === 'source-image') {
    syncSourceState(bindings, target);
  } else if (!normalizeScaledAnnotationTarget(target)) {
    return false;
  } else {
    target.setCoords();
  }

  return true;
}
