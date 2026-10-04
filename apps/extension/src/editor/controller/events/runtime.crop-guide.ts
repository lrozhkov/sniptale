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
import { EditorCanvas } from '../../document/canvas-surface/render-region';
import { getEditorCanvasWorkspaceInsets } from '../../document/canvas-surface/editing-surface';

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
  const canvas = bindings.getCanvas();
  const zoom = canvas?.getZoom() ?? 1;
  if (useEditorStore.getState().canvasCropMode === 'expand' && canvas instanceof EditorCanvas) {
    canvas.extendWorkspaceToContain({
      left: rawSelection.left,
      top: rawSelection.top,
      right: rawSelection.left + rawSelection.width,
      bottom: rawSelection.top + rawSelection.height,
    });
  }
  const insets = getEditorCanvasWorkspaceInsets(canvas, size);
  const selection =
    useEditorStore.getState().canvasCropMode === 'expand'
      ? interaction === 'move'
        ? clampEditorFreeCanvasSelectionPosition(rawSelection, size, zoom, insets)
        : normalizeEditorFreeCanvasSelection(rawSelection, size, zoom, insets)
      : interaction === 'move'
        ? clampEditorCropSelectionPosition(rawSelection, size)
        : normalizeEditorCropSelection(rawSelection, size);
  applyCropGuideSelection(target, selection, 'selection');
  bindings.setCropState(target, selection);
  return true;
}
