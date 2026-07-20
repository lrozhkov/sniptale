import type { EditorRasterTargetSnapshot } from '../raster/types';

export const overlayStroke = '#ffffff';
export const overlayStrokeShadow = '#111827';

export function drawOverlayDashedRect(
  context: CanvasRenderingContext2D,
  rect: { left: number; top: number; width: number; height: number }
) {
  context.save();
  context.setLineDash([6, 4]);
  context.lineWidth = 1.25;
  context.strokeStyle = overlayStroke;
  context.strokeRect(rect.left, rect.top, rect.width, rect.height);
  context.setLineDash([6, 4]);
  context.lineDashOffset = -5;
  context.strokeStyle = overlayStrokeShadow;
  context.strokeRect(rect.left, rect.top, rect.width, rect.height);
  context.restore();
}

export function mapBitmapRectToScene(
  snapshot: EditorRasterTargetSnapshot,
  rect: { left: number; top: number; width: number; height: number }
) {
  return {
    left:
      snapshot.sceneBounds.left + (rect.left / snapshot.bitmap.width) * snapshot.sceneBounds.width,
    top:
      snapshot.sceneBounds.top + (rect.top / snapshot.bitmap.height) * snapshot.sceneBounds.height,
    width: (rect.width / snapshot.bitmap.width) * snapshot.sceneBounds.width,
    height: (rect.height / snapshot.bitmap.height) * snapshot.sceneBounds.height,
  };
}
