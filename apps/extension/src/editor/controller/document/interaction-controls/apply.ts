import { DEFAULT_COLOR_CANVAS_SELECTION } from '@sniptale/ui/default-colors/constants';
import type { ActiveSelection, FabricObject } from 'fabric';
import { EDITOR_CANVAS_CONTROL_SURFACE } from '../../../color/palette/constants';
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
  DEFAULT_EDGE_CONTROLS.forEach((key) =>
    patchEdgeControl(object.controls[key], key, object.sniptaleRole === 'crop-guide')
  );
  patchRotateControl(object.controls['mtr']);
}

export function applyEditorActiveSelectionInteractionControls(object: ActiveSelection): void {
  object.set({
    borderColor: DEFAULT_COLOR_CANVAS_SELECTION,
    borderDashArray: null,
    cornerColor: EDITOR_CANVAS_CONTROL_SURFACE,
    cornerStrokeColor: DEFAULT_COLOR_CANVAS_SELECTION,
    hasBorders: true,
    hasControls: true,
    lockRotation: false,
    transparentCorners: false,
  });
  applyEditorObjectInteractionControls(object);
}
