import { isCanvasCommentVisibleAt } from '../../features/video/review/comments';
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
import { clipReviewScene, drawReviewSceneComments, spatialReviewCommentSpace } from './scene-frame';
import { drawReviewAnnotationFrame } from './annotation-renderer';
import { drawReviewClicks } from './render-click-animation';
import { drawReviewBorders } from './render-border';
import { drawReviewSpotlights } from './render-spotlight';
import type { ReviewSpatialRenderer } from './spatial-renderer';
import type { ReviewWindowRaster } from './window-header';

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
  windowRaster?: ReviewWindowRaster | null | undefined;
  clicks?: readonly ReviewClickCue[] | undefined;
  annotationFrames?: readonly Parameters<typeof drawReviewAnnotationFrame>[1][];
}) {
  const { scene, context, canvas, renderer: spatialRenderer } = args;
  const { layout, background, comments: burned = [] } = scene;
  const spatial = layout.spatial && spatialRenderer;
  const overlayLayout = spatial ? computeQuickEditSpatialRasterLayout(layout, background) : layout;
  const overlayBackground = spatial
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
      : undefined,
    scene.resources
  );
  const borders = evaluateQuickEditBordersAtTime({
    regions: args.regions,
    time: args.globalResultTime,
    output: canvas,
    video: computeQuickEditWindowTransform(overlayLayout),
    scale:
      (scene.sceneScale ?? 1) *
      (overlayLayout.videoTransform.width / overlayLayout.videoRect.width),
  });
  const clicks = evaluateReviewClicks(args.clicks ?? [], args.globalResultTime);
  const hasContentComment = burned.some(
    (comment) =>
      comment.attachment === 'content' &&
      comment.renderToVideo &&
      (scene.sourceTime === undefined || isCanvasCommentVisibleAt(comment, scene.sourceTime))
  );
  const annotationFrames = args.annotationFrames ?? [];
  const paintViewport = () => {
    for (const frame of annotationFrames)
      if (frame.instance.attachment === 'viewport')
        drawReviewAnnotationFrame(context, frame, {
          x: 0,
          y: 0,
          width: canvas.width,
          height: canvas.height,
        });
  };
  if (
    spatial &&
    !borders.length &&
    !clicks.length &&
    !hasContentComment &&
    !annotationFrames.some((frame) => frame.instance.attachment === 'content')
  ) {
    drawReviewSceneComments(context, {
      ...scene,
      comments: burned.filter((comment) => comment.attachment === 'viewport'),
      cameraScale: 1,
    });
    paintViewport();
    return;
  }
  const overlay = spatial ? spatial.surface('overlay', canvas.width, canvas.height) : null;
  const overlayContext = overlay?.context ?? context;
  drawReviewBorders(
    overlayContext,
    overlay?.canvas ?? canvas,
    borders,
    {
      rect: motion.windowClip,
      radius: background.enabled ? background.layout.cornerRadius * motion.scale : 0,
    },
    scene.resources
  );
  drawReviewClicks(
    overlayContext,
    clicks,
    overlayLayout.videoTransform,
    args.sourceWidth,
    {
      rect: motion.windowClip,
      radius: background.enabled ? background.layout.cornerRadius * motion.scale : 0,
    },
    args.windowRaster
      ? {
          rect: computeQuickEditWindowTransform(overlayLayout),
          draw: (target, x, y, width, height) => {
            const raster = args.windowRaster!;
            target.drawImage(raster.image, 0, 0, raster.width, raster.height, x, y, width, height);
          },
        }
      : {
          rect: overlayLayout.videoTransform,
          draw: (target, x, y, width, height) => scene.sample.draw(target, x, y, width, height),
        }
  );
  const contentFrames = annotationFrames.filter((frame) => frame.instance.attachment === 'content');
  if (contentFrames.length) {
    overlayContext.save();
    try {
      clipReviewScene(overlayContext, overlayLayout, overlayBackground);
      for (const frame of contentFrames)
        drawReviewAnnotationFrame(overlayContext, frame, overlayLayout.videoTransform);
    } finally {
      overlayContext.restore();
    }
  }
  drawReviewSceneComments(overlayContext, {
    ...scene,
    canvas: overlay?.canvas ?? canvas,
    layout: overlayLayout,
    commentSpace: overlay ? spatialReviewCommentSpace(scene.commentSpace) : scene.commentSpace,
    background: overlayBackground,
    comments: overlay ? burned.filter((c) => c.attachment === 'content') : burned,
    cameraScale: overlayLayout.videoTransform.width / overlayLayout.videoRect.width,
  });
  if (overlay && spatialRenderer && layout.spatial) {
    spatialRenderer.draw(context, {
      source: overlay.canvas,
      sourceRect: { x: 0, y: 0, width: canvas.width, height: canvas.height },
      output: canvas,
      base: layout.windowRect,
      target: computeQuickEditSpatialWindow(layout, background),
      frame: layout.spatial,
      sharp: true,
    });
    drawReviewSceneComments(context, {
      ...scene,
      canvas,
      layout,
      background,
      comments: burned.filter((c) => c.attachment === 'viewport'),
      cameraScale: 1,
    });
  }
  paintViewport();
}
