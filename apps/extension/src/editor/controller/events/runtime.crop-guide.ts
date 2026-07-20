import type {
  EditorControllerEventCropBindings,
  EditorControllerEventStateBindings,
} from './types';
import {
  applyCropGuideSelection,
  createCropSelectionFromRect,
  isEditorCropGuide,
  normalizeEditorCropSelection,
} from '../tools/crop';

type CanvasObject = import('fabric').FabricObject;

export function syncCropGuideInteraction(
  bindings: EditorControllerEventStateBindings & EditorControllerEventCropBindings,
  target: CanvasObject
): boolean {
  if (!isEditorCropGuide(target)) {
    return false;
  }

  const selection = normalizeEditorCropSelection(
    createCropSelectionFromRect(target),
    bindings.getCanvasDocumentSize()
  );
  applyCropGuideSelection(target, selection, 'selection');
  bindings.setCropState(target, selection);
  return true;
}
