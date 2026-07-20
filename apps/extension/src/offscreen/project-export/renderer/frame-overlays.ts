import {
  drawActionCompositionState,
  drawCursorCompositionState,
} from '../../../features/video/composition/draw';
import type { resolveVideoCompositionRenderPasses } from '../../../features/video/composition/timeline/render';

type OverlayFrame = ReturnType<typeof resolveVideoCompositionRenderPasses>['overlayFrame'];

export function drawExportOverlayPass(
  context: CanvasRenderingContext2D,
  overlayFrame: OverlayFrame,
  scaleX: number,
  scaleY: number
): void {
  const scaledCursor = overlayFrame.cursor
    ? {
        ...overlayFrame.cursor,
        x: overlayFrame.cursor.x * scaleX,
        y: overlayFrame.cursor.y * scaleY,
      }
    : null;
  const scaledCursorPoint = scaledCursor ? { x: scaledCursor.x, y: scaledCursor.y } : null;
  for (const action of overlayFrame.actions) {
    drawActionCompositionState(
      context,
      {
        ...action,
        point: action.point ? { x: action.point.x * scaleX, y: action.point.y * scaleY } : null,
      },
      scaledCursorPoint
    );
  }
  if (scaledCursor) drawCursorCompositionState(context, scaledCursor);
}
