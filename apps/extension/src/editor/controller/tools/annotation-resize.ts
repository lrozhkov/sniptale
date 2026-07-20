import type { FabricObject, Group } from 'fabric';
import { normalizeScaledStepGroup } from '../../objects/annotation/step-normalize';
import {
  getBlurSettings,
  isBlurObject,
  normalizeScaledBlurTarget,
  updateBlurObject,
} from '../../objects/annotation/blur/object';

type StrokeUniformTarget = FabricObject & {
  strokeUniform?: boolean;
};

function applyStrokeUniform(target: StrokeUniformTarget): void {
  if (typeof target.set === 'function') {
    target.set({ strokeUniform: true });
    return;
  }

  target['strokeUniform'] = true;
}

export function normalizeScaledAnnotationTarget(object: FabricObject): boolean {
  if (isBlurObject(object)) {
    if (!normalizeScaledBlurTarget(object)) {
      return false;
    }

    updateBlurObject(object, { settings: getBlurSettings(object) });
    return true;
  }

  if (object.sniptaleType === 'pencil' || object.sniptaleType === 'highlighter') {
    applyStrokeUniform(object);
    return true;
  }

  if (object.sniptaleType !== 'step') {
    return false;
  }
  return normalizeScaledStepGroup(object as Group);
}
