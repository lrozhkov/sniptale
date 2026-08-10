import type { Canvas } from 'fabric';

import type { EditorTool } from '../../../../features/editor/document/types';
import { isStickyAnnotationTool } from './classification';
import { clearCropGuideIfNeeded } from './crop-guide';
import { setCanvasObjectInteractivity } from './interactivity';

function applyDisabledToolMode(
  canvas: Canvas,
  activeTool: EditorTool,
  hasCropGuide: boolean,
  clearCropSelection: () => void
): void {
  setCanvasObjectInteractivity(canvas, 'none');
  canvas.isDrawingMode = false;
  canvas.selection = false;
  canvas.skipTargetFind = true;
  canvas.defaultCursor = 'default';
  clearCropGuideIfNeeded(activeTool, hasCropGuide, clearCropSelection);
}

function applyDefaultToolMode(
  canvas: Canvas,
  activeTool: EditorTool,
  hasCropGuide: boolean,
  clearCropSelection: () => void
): void {
  const isStickyTool = isStickyAnnotationTool(activeTool);
  setCanvasObjectInteractivity(
    canvas,
    activeTool === 'select'
      ? 'all'
      : activeTool === 'text'
        ? 'text'
        : isStickyTool
          ? 'selection'
          : 'none'
  );
  canvas.isDrawingMode = false;
  canvas.selection = activeTool === 'select';
  canvas.skipTargetFind = activeTool === 'select' || activeTool === 'crop' ? false : !isStickyTool;
  canvas.defaultCursor =
    activeTool === 'text' ? 'text' : activeTool === 'select' ? 'default' : 'crosshair';

  clearCropGuideIfNeeded(activeTool, hasCropGuide, clearCropSelection);
}

export function applyEditorToolMode(options: {
  canvas: Canvas | null;
  activeTool: EditorTool;
  enabled?: boolean;
  hasCropGuide: boolean;
  clearCropSelection: () => void;
}): void {
  const { canvas, activeTool, hasCropGuide, clearCropSelection } = options;
  if (!canvas) {
    return;
  }

  if (options.enabled === false) {
    applyDisabledToolMode(canvas, activeTool, hasCropGuide, clearCropSelection);
    return;
  }

  applyDefaultToolMode(canvas, activeTool, hasCropGuide, clearCropSelection);
}
