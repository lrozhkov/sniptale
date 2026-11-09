import type {
  EditorControllerEventCropBindings,
  EditorControllerEventStateBindings,
} from './types';
import {
  applyCropGuideSelection,
  constrainEditorCropResize,
  getEditorFreeCanvasBounds,
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

  let rawSelection = createCropSelectionFromRect(target);
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
  const { canvasCropAspectRatio: ratio, canvasCropMode: mode } = useEditorStore.getState();
  const transform = canvas?._currentTransform;
  if (interaction === 'scale' && ratio && transform) {
    const fraction = (value: typeof transform.originX | typeof transform.originY) =>
      typeof value === 'number'
        ? value
        : value === 'center'
          ? 0.5
          : value === 'right' || value === 'bottom'
            ? 1
            : 0;
    const bounds =
      mode === 'expand'
        ? getEditorFreeCanvasBounds(size, zoom, insets)
        : { left: 0, top: 0, right: size.width, bottom: size.height };
    rawSelection = constrainEditorCropResize(
      rawSelection,
      ratio,
      {
        x: fraction(transform.originX),
        y: fraction(transform.originY),
        axis:
          transform.corner === 'ml' || transform.corner === 'mr'
            ? 'x'
            : transform.corner === 'mt' || transform.corner === 'mb'
              ? 'y'
              : 'both',
      },
      bounds
    );
  }
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
