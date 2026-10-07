import { quickEditPlaneProjection } from '../../features/video/review/advanced/spatial-geometry';
import {
  evaluateReviewClicks,
  type ReviewClickCue,
} from '../../features/video/review/click-animation';
import { evaluateQuickEditBordersAtTime } from '../../features/video/review/advanced/border';
import { evaluateQuickEditSpotlightsAtTime } from '../../features/video/review/advanced/focus';
import type { QuickEditZoomRegion } from '../../features/video/review/advanced/types';
import {
  computeQuickEditSceneCamera,
  computeQuickEditSpatialWindow,
  computeQuickEditSpatialRasterLayout,
  computeQuickEditWindowTransform,
} from '../../features/video/review/advanced/scene';
import { drawReviewSceneComments } from './scene-frame';
import { drawReviewClicks } from './render-click-animation';
import { drawReviewBorders } from './render-border';
import { drawReviewSpotlights } from './render-spotlight';
import type { ReviewSpatialRenderer } from './spatial-renderer';

/** Sharp content annotations project together; viewport comments remain in output space. */
export function drawReviewSceneOverlays(args: {
  scene: Parameters<typeof drawReviewSceneComments>[1] & {
    layout: ReturnType<
      typeof import('../../features/video/review/advanced/scene').computeQuickEditSceneLayout
    >;
  };
  renderer?: ReviewSpatialRenderer | undefined;
  context: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  spotlightScratch: HTMLCanvasElement | null;
  regions: readonly QuickEditZoomRegion[];
  globalResultTime: number;
  cameraScale: number;
  sourceWidth: number;
  clicks?: readonly ReviewClickCue[] | undefined;
}) {
  const { scene, context, canvas, renderer: spatialRenderer } = args;
  const { layout, background, comments: burned = [] } = scene;
  const overlay =
    layout.spatial && spatialRenderer
      ? spatialRenderer.surface('overlay', canvas.width, canvas.height)
      : null;
  const overlayContext = overlay?.context ?? context;
  const overlayLayout = overlay ? computeQuickEditSpatialRasterLayout(layout, background) : layout;
  const overlayBackground = overlay
    ? { ...background, zoomBehavior: 'fixed' as const }
    : background;
  const motion = computeQuickEditSceneCamera(overlayLayout, overlayBackground);
  const spotlightWindow = computeQuickEditSpatialWindow(layout, background);
  drawReviewSpotlights(
    context,
    canvas,
    args.spotlightScratch,
    evaluateQuickEditSpotlightsAtTime({
      regions: args.regions,
      time: args.globalResultTime,
      output: canvas,
      video: computeQuickEditWindowTransform(layout),
      scale: (scene.sceneScale ?? 1) * args.cameraScale,
    }),
    {
      rect: layout.spatial ? spotlightWindow : motion.windowClip,
      radius: background.enabled
        ? background.layout.cornerRadius *
          (layout.spatial ? spotlightWindow.width / layout.windowRect.width : motion.scale)
        : 0,
    },
    layout.spatial
      ? quickEditPlaneProjection(spotlightWindow, spotlightWindow, layout.spatial)
      : undefined
  );
  drawReviewBorders(
    overlayContext,
    overlay?.canvas ?? canvas,
    evaluateQuickEditBordersAtTime({
      regions: args.regions,
      time: args.globalResultTime,
      output: canvas,
      video: computeQuickEditWindowTransform(overlayLayout),
      scale:
        (scene.sceneScale ?? 1) *
        (overlayLayout.videoTransform.width / overlayLayout.videoRect.width),
    }),
    {
      rect: motion.windowClip,
      radius: background.enabled ? background.layout.cornerRadius * motion.scale : 0,
    }
  );
  drawReviewClicks(
    overlayContext,
    evaluateReviewClicks(args.clicks ?? [], args.globalResultTime),
    overlayLayout.videoTransform,
    args.sourceWidth,
    {
      rect: motion.windowClip,
      radius: background.enabled ? background.layout.cornerRadius * motion.scale : 0,
    },
    scene.sample
  );
  drawReviewSceneComments(overlayContext, {
    ...scene,
    canvas: overlay?.canvas ?? canvas,
    layout: overlayLayout,
    background: overlayBackground,
    comments: overlay ? burned.filter((c) => c.attachment === 'content') : burned,
    cameraScale: overlayLayout.videoTransform.width / overlayLayout.videoRect.width,
  });
  if (overlay && spatialRenderer && layout.spatial) {
    spatialRenderer.draw(
      context,
      overlay.canvas,
      layout.windowRect,
      computeQuickEditSpatialWindow(layout, background),
      layout.spatial,
      true
    );
    drawReviewSceneComments(context, {
      ...scene,
      canvas,
      layout,
      background,
      comments: burned.filter((c) => c.attachment === 'viewport'),
      cameraScale: 1,
    });
  }
}
