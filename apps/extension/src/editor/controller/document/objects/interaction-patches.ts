import type { FabricObject } from 'fabric';
import { isEditableObject } from '../../../document/model';
import { isBlurObject } from '../../../objects/annotation/blur/object';
import {
  EDITOR_CANVAS_ACCENT,
  EDITOR_CANVAS_CONTROL_SURFACE,
} from '../../../color/palette/constants';

function getStepInteractionPatch(object: FabricObject) {
  if (object.sniptaleType !== 'step') {
    return {};
  }

  return {
    hasControls: false,
    lockRotation: true,
    lockScalingX: true,
    lockScalingY: true,
  };
}

function getBlurInteractionPatch(object: FabricObject, locked: boolean) {
  if (!isBlurObject(object)) {
    return {};
  }

  return {
    hasControls: !locked,
    lockScalingX: locked,
    lockScalingY: locked,
  };
}

export function applyBaseInteractionPatch(
  object: FabricObject,
  options: {
    arrowInteraction: { hasBorders: boolean; lockRotation?: boolean; lockScaling?: boolean } | null;
    arrowObject: boolean;
    locked: boolean;
  }
): void {
  object.set({
    transparentCorners: false,
    borderColor: EDITOR_CANVAS_ACCENT,
    cornerColor: EDITOR_CANVAS_CONTROL_SURFACE,
    cornerStrokeColor: EDITOR_CANVAS_ACCENT,
    objectCaching: false,
    selectable: isEditableObject(object),
    evented: isEditableObject(object),
    hasControls: !options.locked,
    lockMovementX: options.locked,
    lockMovementY: options.locked,
    lockScalingX: options.locked || Boolean(options.arrowInteraction?.lockScaling),
    lockScalingY: options.locked || Boolean(options.arrowInteraction?.lockScaling),
    lockRotation: options.locked || Boolean(options.arrowInteraction?.lockRotation),
    hasBorders: options.arrowInteraction
      ? options.arrowInteraction.hasBorders
      : !options.arrowObject,
    ...getStepInteractionPatch(object),
    ...getBlurInteractionPatch(object, options.locked),
  });
}
