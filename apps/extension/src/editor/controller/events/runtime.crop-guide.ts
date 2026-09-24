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
  normalizeEditorCanvasExpansion,
} from '../tools/crop';
import { useEditorStore } from '../../state/useEditorStore';

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
    useEditorStore.getState().canvasCropMode === 'expand'
      ? normalizeEditorCanvasExpansion(rawSelection, bindings.getCanvasDocumentSize())
      : interaction === 'move'
        ? clampEditorCropSelectionPosition(rawSelection, bindings.getCanvasDocumentSize())
        : normalizeEditorCropSelection(rawSelection, bindings.getCanvasDocumentSize());
  applyCropGuideSelection(target, selection, 'selection');
  bindings.setCropState(target, selection);
  return true;
}
