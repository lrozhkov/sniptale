import type { ActiveSelection, FabricObject } from 'fabric';
import {
  EDITOR_CANVAS_ACCENT,
  EDITOR_CANVAS_CONTROL_SURFACE,
} from '../../../color/palette/constants';
import { DEFAULT_EDGE_CONTROLS, patchEdgeControl } from '../interaction-border-controls';
import { applyEditorObjectControlDefaults } from './base';
import { DEFAULT_CORNER_CONTROLS } from './constants';
import { hasDefaultBoxControls, patchCornerControl } from './corner';
import { patchRotateControl } from './rotate';

export function applyEditorObjectInteractionControls(object: FabricObject): void {
  applyEditorObjectControlDefaults(object);

  if (!hasDefaultBoxControls(object)) {
    return;
  }

  DEFAULT_CORNER_CONTROLS.forEach((key) => patchCornerControl(object.controls[key], key));
  DEFAULT_EDGE_CONTROLS.forEach((key) => patchEdgeControl(object.controls[key], key));
  patchRotateControl(object.controls['mtr']);
}

export function applyEditorActiveSelectionInteractionControls(object: ActiveSelection): void {
  object.set({
    borderColor: EDITOR_CANVAS_ACCENT,
    borderDashArray: null,
    cornerColor: EDITOR_CANVAS_CONTROL_SURFACE,
    cornerStrokeColor: EDITOR_CANVAS_ACCENT,
    hasBorders: true,
    hasControls: true,
    lockRotation: false,
    transparentCorners: false,
  });
  applyEditorObjectInteractionControls(object);
}
