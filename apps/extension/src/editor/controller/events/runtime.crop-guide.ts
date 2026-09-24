import type {
  EditorControllerEventCropBindings,
  EditorControllerEventStateBindings,
} from './types';
import {
  applyCropGuideSelection,
  clampEditorFreeCanvasSelectionPosition,
  createCropSelectionFromRect,
  isEditorCropGuide,
  normalizeEditorCropSelection,
  clampEditorCropSelectionPosition,
  normalizeEditorFreeCanvasSelection,
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
  const size = bindings.getCanvasDocumentSize();
  const zoom = bindings.getCanvas()?.getZoom() ?? 1;
  const selection =
    useEditorStore.getState().canvasCropMode === 'expand'
      ? interaction === 'move'
        ? clampEditorFreeCanvasSelectionPosition(rawSelection, size, zoom)
        : normalizeEditorFreeCanvasSelection(rawSelection, size, zoom)
      : interaction === 'move'
        ? clampEditorCropSelectionPosition(rawSelection, size)
        : normalizeEditorCropSelection(rawSelection, size);
  applyCropGuideSelection(target, selection, 'selection');
  bindings.setCropState(target, selection);
  return true;
}
