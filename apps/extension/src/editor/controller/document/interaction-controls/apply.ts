import type { FabricObject } from 'fabric';
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
