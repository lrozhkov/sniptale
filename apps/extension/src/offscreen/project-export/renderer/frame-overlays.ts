import { drawSpatialSceneOverlays } from '../../../features/video/composition/draw/spatial';
import type { ReviewSpatialRenderer } from '../../../features/video/composition/canvas/spatial-renderer';
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
  scaleY: number,
  spatial?: {
    logicalSize: { width: number; height: number };
    spatialRenderer?: (() => ReviewSpatialRenderer) | undefined;
  }
): void {
  if (overlayFrame.camera.spatial) {
    if (!spatial) throw new Error('Perspective reference is unavailable.');
    if (
      drawSpatialSceneOverlays({
        actions: overlayFrame.actions,
        camera: overlayFrame.camera,
        cursor: overlayFrame.cursor,
        context,
        logicalSize: spatial.logicalSize,
        output: {
          width: Math.ceil(spatial.logicalSize.width * scaleX),
          height: Math.ceil(spatial.logicalSize.height * scaleX),
        },
        destination: {
          x: 0,
          y: 0,
          width: spatial.logicalSize.width * scaleX,
          height: spatial.logicalSize.height * scaleY,
        },
        rasterScale: scaleX,
        spatialRenderer: spatial.spatialRenderer,
      })
    )
      return;
  }
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
