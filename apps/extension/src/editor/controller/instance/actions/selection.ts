import { insertEditorControllerRichShapeWithOptions } from '../../public-api/rich-shape-insertion';
import { moveSelectionForController, moveSelectionToEdgeForController } from '../helpers/object';
import type { EditorControllerInstance } from '../types';

export {
  applySelectionSettingsForController,
  applyTextSelectionStyleForController,
  deleteSelectionForController,
  duplicateSelectionForController,
  previewSelectionSettingsForController,
  redoForController,
  resetToOriginalForController,
  undoForController,
} from './selection-document-actions';
export {
  finalizeSelectionNudgeForController,
  nudgeSelectionForController,
} from './selection-nudge-actions';
export {
  applyLayerEffectForController,
  applyLayerTransformationForController,
  mergeSelectedLayersForController,
  previewLayerEffectForController,
  removeLayerEffectForController,
  renameLayerForController,
  reorderLayerForController,
  resetLayerEffectPreviewForController,
  resizeLayerForController,
  selectLayerForController,
  toggleLayerLockForController,
  toggleLayerVisibilityForController,
  updateLayerEffectForController,
} from './layer-instance-actions';
export {
  insertImageForController,
  insertTechnicalDataForController,
} from './selection-insertion-actions';

export function bringForwardSelectionForController(controller: EditorControllerInstance): void {
  moveSelectionForController(controller, 1);
}

export function sendBackwardSelectionForController(controller: EditorControllerInstance): void {
  moveSelectionForController(controller, -1);
}

export function bringSelectionToFrontForController(controller: EditorControllerInstance): void {
  moveSelectionToEdgeForController(controller, 'front');
}

export function sendSelectionToBackForController(controller: EditorControllerInstance): void {
  moveSelectionToEdgeForController(controller, 'back');
}

export function insertRichShapeForController(
  controller: EditorControllerInstance,
  id: string,
  options?: { rough?: unknown; customDefinition?: unknown }
): void {
  insertEditorControllerRichShapeWithOptions(controller.getPublicApiAdapter(), id, options);
}
