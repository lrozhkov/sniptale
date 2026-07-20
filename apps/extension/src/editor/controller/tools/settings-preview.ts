import type { Canvas } from 'fabric';
import { getEditorShapeSettings } from '../../../features/editor/document/shape-settings';
import { type EditorTool } from '../../../features/editor/document/types';
import { useEditorStore } from '../../state/useEditorStore';
import { getBlurSettings } from '../../objects/annotation/blur/object/settings';
import { isBlurObject } from '../../objects/annotation/blur/object/identity';
import { updateBlurObject } from '../../objects/annotation/blur/object/update';
import { applyShapeSettings } from '../../objects/shape-style';
import { getArrowGeometry, isArrowObject, updateArrowObject } from '../../objects/arrow';
import { configureLiveFreehandBrush } from '../freehand';
import type { DrawSession } from '../core/types';

function refreshBrushPreview(
  canvas: Canvas,
  tool: Extract<EditorTool, 'highlighter' | 'pencil'>
): void {
  const settings = useEditorStore.getState().toolSettings[tool];
  canvas.freeDrawingBrush = configureLiveFreehandBrush(canvas, settings, canvas.freeDrawingBrush);
  canvas.requestRenderAll();
}

function refreshShapeDraftPreview(canvas: Canvas, drawSession: DrawSession): boolean {
  const { object, tool } = drawSession;
  if (!object || (tool !== 'rectangle' && tool !== 'ellipse' && tool !== 'diamond')) {
    return false;
  }

  applyShapeSettings(
    object,
    tool,
    getEditorShapeSettings(useEditorStore.getState().toolSettings, tool)
  );
  object.setCoords();
  canvas.requestRenderAll();
  return true;
}

function refreshArrowDraftPreview(canvas: Canvas, drawSession: DrawSession): boolean {
  const { object, tool } = drawSession;
  if (!object || tool !== 'arrow' || !isArrowObject(object)) {
    return false;
  }

  const geometry = getArrowGeometry(object);
  updateArrowObject(object, {
    end: geometry.end,
    settings: useEditorStore.getState().toolSettings.arrow,
    start: geometry.start,
  });
  object.setCoords();
  canvas.requestRenderAll();
  return true;
}

function refreshBlurDraftPreview(canvas: Canvas, drawSession: DrawSession): boolean {
  const { object, tool } = drawSession;
  if (!object || tool !== 'blur' || !isBlurObject(object)) {
    return false;
  }

  updateBlurObject(object, {
    settings: {
      ...getBlurSettings(object),
      ...useEditorStore.getState().toolSettings.blur,
    },
  });
  object.setCoords();
  canvas.requestRenderAll();
  return true;
}

export function refreshEditorToolSettingsPreview(options: {
  activeTool: EditorTool;
  canvas: Canvas | null;
  drawSession: DrawSession | null;
}): void {
  const { activeTool, canvas, drawSession } = options;
  if (!canvas) {
    return;
  }

  if (activeTool === 'highlighter' || activeTool === 'pencil') {
    refreshBrushPreview(canvas, activeTool);
    return;
  }

  if (!drawSession) {
    return;
  }

  if (refreshShapeDraftPreview(canvas, drawSession)) {
    return;
  }

  if (refreshArrowDraftPreview(canvas, drawSession)) {
    return;
  }

  refreshBlurDraftPreview(canvas, drawSession);
}
