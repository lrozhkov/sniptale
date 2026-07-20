import { hexToRgba } from '../../document/model';
import { useEditorStore } from '../../state/useEditorStore';
import type { EditorRasterToolSessionState } from './types';
import { resolveRasterGradientStops } from './gradient-stops';
import { drawOverlayDashedRect, mapBitmapRectToScene, overlayStroke } from './overlay-primitives';

export function drawMarqueeDraft(
  context: CanvasRenderingContext2D,
  draft: NonNullable<EditorRasterToolSessionState['marqueeDraft']>
) {
  const left = Math.min(draft.startBitmapPoint.x, draft.currentBitmapPoint.x);
  const top = Math.min(draft.startBitmapPoint.y, draft.currentBitmapPoint.y);
  const width = Math.abs(draft.currentBitmapPoint.x - draft.startBitmapPoint.x);
  const height = Math.abs(draft.currentBitmapPoint.y - draft.startBitmapPoint.y);
  drawOverlayDashedRect(
    context,
    mapBitmapRectToScene(draft.snapshot, { left, top, width, height })
  );
}

export function drawLassoDraft(
  context: CanvasRenderingContext2D,
  draft: NonNullable<EditorRasterToolSessionState['lassoDraft']>
) {
  if (draft.scenePoints.length < 2) {
    return;
  }

  context.save();
  context.beginPath();
  context.moveTo(draft.scenePoints[0]?.x ?? 0, draft.scenePoints[0]?.y ?? 0);
  for (const point of draft.scenePoints.slice(1)) {
    context.lineTo(point.x, point.y);
  }
  context.strokeStyle = overlayStroke;
  context.lineWidth = 1.25;
  context.setLineDash([6, 4]);
  context.stroke();
  context.restore();
}

export function drawGradientDraft(
  context: CanvasRenderingContext2D,
  draft: NonNullable<EditorRasterToolSessionState['gradientDraft']>
) {
  const settings = useEditorStore.getState().rasterToolSettings;
  const gradient = context.createLinearGradient(
    draft.startScenePoint.x,
    draft.startScenePoint.y,
    draft.currentScenePoint.x,
    draft.currentScenePoint.y
  );
  for (const stop of resolveRasterGradientStops(settings)) {
    gradient.addColorStop(stop.offset, hexToRgba(stop.color, 0.3 * (stop.opacity ?? 1)));
  }

  context.save();
  context.fillStyle = gradient;
  context.fillRect(
    draft.snapshot.sceneBounds.left,
    draft.snapshot.sceneBounds.top,
    draft.snapshot.sceneBounds.width,
    draft.snapshot.sceneBounds.height
  );
  context.strokeStyle = overlayStroke;
  context.lineWidth = 1.25;
  context.beginPath();
  context.moveTo(draft.startScenePoint.x, draft.startScenePoint.y);
  context.lineTo(draft.currentScenePoint.x, draft.currentScenePoint.y);
  context.stroke();
  context.restore();
}
