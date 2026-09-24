import type {
  EditorControllerEventCropBindings,
  EditorControllerEventStateBindings,
} from './types';
import {
  applyCropGuideSelection,
  createCropSelectionFromRect,
  isEditorCropGuide,
  normalizeEditorCropSelection,
  clampEditorCropSelectionPosition,
} from '../tools/crop';

type CanvasObject = import('fabric').FabricObject;

export function syncCropGuideInteraction(
  bindings: EditorControllerEventStateBindings & EditorControllerEventCropBindings,
  target: CanvasObject,
  interaction: 'move' | 'scale' = 'scale'
): boolean {
  if (!isEditorCropGuide(target)) {
    return false;
  }

  const rawSelection = createCropSelectionFromRect(target);
  const selection =
    interaction === 'move'
      ? clampEditorCropSelectionPosition(rawSelection, bindings.getCanvasDocumentSize())
      : normalizeEditorCropSelection(rawSelection, bindings.getCanvasDocumentSize());
  applyCropGuideSelection(target, selection, 'selection');
  bindings.setCropState(target, selection);
  return true;
}
