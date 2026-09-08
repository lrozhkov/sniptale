import {
  drawSceneActionCompositionStates,
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
        x:
          (overlayFrame.cursor.x - overlayFrame.camera.viewportX) *
          overlayFrame.camera.scale *
          scaleX,
        y:
          (overlayFrame.cursor.y - overlayFrame.camera.viewportY) *
          overlayFrame.camera.scale *
          scaleY,
        scale: (overlayFrame.cursor.scale * overlayFrame.camera.scale * (scaleX + scaleY)) / 2,
      }
    : null;
  drawSceneActionCompositionStates(context, overlayFrame.actions, overlayFrame.camera, {
    offsetX: 0,
    offsetY: 0,
    scaleX,
    scaleY,
  });
  if (scaledCursor) drawCursorCompositionState(context, scaledCursor);
}
