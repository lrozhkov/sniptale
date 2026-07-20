import type { Canvas } from 'fabric';

import type { EditorTool } from '../../../../features/editor/document/types';
import { useEditorStore } from '../../../state/useEditorStore';
import { configureLiveFreehandBrush } from '../../freehand';
import { resolveRasterCursor } from '../../raster-tools/tool-mode';
import {
  isFreeDrawingTool,
  isRasterInteractionTool,
  isStickyAnnotationTool,
} from './classification';
import { clearCropGuideIfNeeded } from './crop-guide';
import { setCanvasObjectInteractivity } from './interactivity';
import type { RasterInteractionTool } from './types';

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

function applyRasterToolMode(
  canvas: Canvas,
  activeTool: RasterInteractionTool,
  hasCropGuide: boolean,
  clearCropSelection: () => void
): void {
  setCanvasObjectInteractivity(canvas, 'target-only', activeTool);
  canvas.isDrawingMode = false;
  canvas.selection = false;
  canvas.skipTargetFind = false;
  canvas.defaultCursor = resolveRasterCursor(activeTool);
  clearCropGuideIfNeeded(activeTool, hasCropGuide, clearCropSelection);
}

function applyDefaultToolMode(
  canvas: Canvas,
  activeTool: EditorTool,
  hasSelection: boolean,
  hasCropGuide: boolean,
  clearCropSelection: () => void
): void {
  const isStickyTool = isStickyAnnotationTool(activeTool);
  const drawingModeEnabled = isFreeDrawingTool(activeTool) && (!isStickyTool || !hasSelection);

  setCanvasObjectInteractivity(
    canvas,
    activeTool === 'select' ? 'all' : isStickyTool ? 'selection' : 'none'
  );
  canvas.isDrawingMode = drawingModeEnabled;
  canvas.selection = activeTool === 'select';
  canvas.skipTargetFind = activeTool === 'select' || activeTool === 'crop' ? false : !isStickyTool;
  canvas.defaultCursor =
    activeTool === 'text' ? 'text' : activeTool === 'select' ? 'default' : 'crosshair';

  if (drawingModeEnabled) {
    const brushSettings =
      useEditorStore.getState().toolSettings[
        activeTool === 'highlighter' ? 'highlighter' : 'pencil'
      ];
    canvas.freeDrawingBrush = configureLiveFreehandBrush(
      canvas,
      brushSettings,
      canvas.freeDrawingBrush
    );
  }

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

  const hasSelection = canvas.getActiveObjects().length > 0;

  if (options.enabled === false) {
    applyDisabledToolMode(canvas, activeTool, hasCropGuide, clearCropSelection);
    return;
  }

  if (isRasterInteractionTool(activeTool)) {
    applyRasterToolMode(canvas, activeTool, hasCropGuide, clearCropSelection);
    return;
  }

  applyDefaultToolMode(canvas, activeTool, hasSelection, hasCropGuide, clearCropSelection);
}
