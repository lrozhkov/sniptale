import { hexToRgba } from '../../document/model';
import { useEditorStore } from '../../state/useEditorStore';
import type { EditorRasterToolSessionState } from './types';
import { overlayStroke, overlayStrokeShadow } from './overlay-primitives';

export function drawEraserDraft(
  context: CanvasRenderingContext2D,
  draft: NonNullable<EditorRasterToolSessionState['eraserDraft']>
) {
  drawDraftBitmap(context, draft.snapshot);
}

export function drawBrushDraft(
  context: CanvasRenderingContext2D,
  draft: NonNullable<EditorRasterToolSessionState['brushDraft']>
) {
  drawDraftBitmap(context, draft.snapshot);
}

export function drawHoverCursor(
  context: CanvasRenderingContext2D,
  cursor: NonNullable<EditorRasterToolSessionState['hoverCursor']>
) {
  const settings = useEditorStore.getState().rasterToolSettings;
  const radius = (cursor.tool === 'brush' ? settings.brushSize : settings.eraserSize) / 2;
  context.save();
  context.beginPath();
  context.arc(cursor.scenePoint.x, cursor.scenePoint.y, radius, 0, Math.PI * 2);
  context.strokeStyle = overlayStroke;
  context.lineWidth = 1;
  context.shadowBlur = 0;
  context.stroke();
  context.beginPath();
  context.arc(cursor.scenePoint.x, cursor.scenePoint.y, radius + 1.5, 0, Math.PI * 2);
  context.strokeStyle = hexToRgba(overlayStrokeShadow, 0.65);
  context.stroke();
  context.restore();
}

function drawDraftBitmap(
  context: CanvasRenderingContext2D,
  snapshot: NonNullable<
    EditorRasterToolSessionState['eraserDraft'] | EditorRasterToolSessionState['brushDraft']
  >['snapshot']
) {
  context.save();
  context.drawImage(
    snapshot.bitmap,
    snapshot.sceneBounds.left,
    snapshot.sceneBounds.top,
    snapshot.sceneBounds.width,
    snapshot.sceneBounds.height
  );
  context.restore();
}
