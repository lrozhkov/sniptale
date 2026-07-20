import {
  getBlurSettings,
  isBlurObject,
  normalizeScaledBlurTarget,
  updateBlurObject,
} from '../../objects/annotation/blur/object';
import { normalizeScaledRichShapeObject } from '../../objects/rich-shape';
import { syncCropGuideInteraction } from './runtime.crop-guide';
import { syncSourceState } from './runtime.source-sync';
import { isResizableTextCallout } from './runtime.text-callout-target';
import { normalizeScaledTextCalloutTarget } from './text-callout';
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
    Pick<EditorControllerEventObjectBindings, 'ensureObjectReachable'> &
    Pick<EditorControllerEventCommandBindings, 'commitHistory' | 'syncRuntimeState'>
) {
  return (event: { target?: CanvasObject; transform?: TransformOrigin }) => {
    if (event.target) {
      if (syncCropGuideInteraction(bindings, event.target)) {
        bindings.syncRuntimeState();
        return;
      }
      if (isResizableTextCallout(event.target)) {
        normalizeScaledTextCalloutTarget(event.target, event.transform);
      }
      if (normalizeScaledRichShapeObject(event.target)) {
        event.target.setCoords();
      }
      if (isBlurObject(event.target) && normalizeScaledBlurTarget(event.target)) {
        updateBlurObject(event.target, { settings: getBlurSettings(event.target) });
      }
      bindings.ensureObjectReachable(event.target);
      syncSourceState(bindings, event.target);
    }

    if (bindings.getHistoryMuted() > 0) {
      return;
    }
    bindings.commitHistory();
    bindings.syncRuntimeState();
  };
}
