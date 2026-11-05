import { isCanvasCommentVisibleAt } from '../../features/video/review/comments';
import { quickEditPlaneProjection } from '../../features/video/composition/motion/spatial-geometry';
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
  computeQuickEditSourceWindowTransform,
  quickEditVisibleVideoTransform,
} from '../../features/video/review/advanced/scene';
import {
  clipReviewSceneContent,
  drawReviewSceneComments,
  spatialReviewCommentSpace,
} from './scene-frame';
import { drawReviewAnnotationFrame } from './annotation-renderer';
import { drawReviewClicks } from './render-click-animation';
import { pointerFeedbackLensPaintBounds } from '../../features/video/composition/draw/pointer-feedback';
import { drawSceneBorders } from '../../features/video/composition/draw/border';
import { drawSceneSpotlights } from '../../features/video/composition/draw/spotlight';
import type { ReviewSpatialRenderer } from '../../features/video/composition/canvas/spatial-renderer';
import type { ReviewWindowRaster } from './window-header';
import type { ReviewExportSamplingFrame } from './export-source-sampling';

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
  exportSampling?: ReviewExportSamplingFrame;
  sharpPaint?: (
    context: CanvasRenderingContext2D,
    lens: ReviewExportSamplingFrame['plan']['lenses'][number]
  ) => void;
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
  drawSceneSpotlights(
    context,
    canvas,
    args.spotlightScratch,
    (
      args.exportSampling?.plan.spotlightFrames ??
      evaluateQuickEditSpotlightsAtTime({
        regions: args.regions,
        time: args.globalResultTime,
        output: canvas,
        video: computeQuickEditSourceWindowTransform(layout),
        scale: (scene.sceneScale ?? 1) * args.cameraScale,
      })
    ).map((frame, index) => ({
      ...frame,
      ...(args.exportSampling &&
      args.sharpPaint &&
      args.exportSampling.plan.lenses.some((l) => l.kind === 'scene' && l.index === index)
        ? {
            sharpPaint: (target: CanvasRenderingContext2D) => {
              const lens = args.exportSampling!.plan.lenses.find(
                (l) => l.kind === 'scene' && l.index === index
              );
              if (!lens) throw new Error('Export scene lens demand is unavailable.');
              args.sharpPaint!(target, lens);
            },
          }
        : {}),
      clip: {
        rect: layout.spatial ? spotlightWindow : motion.windowClip,
        radius: background.enabled
          ? background.layout.cornerRadius *
            (layout.spatial ? spotlightWindow.width / layout.windowRect.width : motion.scale)
          : 0,
      },
      projection: layout.spatial
        ? quickEditPlaneProjection(spotlightWindow, spotlightWindow, layout.spatial)
        : undefined,
    })),
    scene.resources
  );
  const borders = evaluateQuickEditBordersAtTime({
    regions: args.regions,
    time: args.globalResultTime,
    output: canvas,
    video: computeQuickEditSourceWindowTransform(overlayLayout),
    scale:
      (scene.sceneScale ?? 1) *
      (overlayLayout.videoTransform.width / overlayLayout.videoRect.width),
  });
  const clicks =
    args.exportSampling?.plan.clickFrames ??
    evaluateReviewClicks(args.clicks ?? [], args.globalResultTime);
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
  const overlayDensity = args.exportSampling ? args.exportSampling.plan.overlayDensity : 1;
  let overlayBounds = { x: 0, y: 0, width: canvas.width, height: canvas.height };
  if (spatial) {
    const video = overlayLayout.videoTransform;
    const scale = video.width / Math.max(1, args.sourceWidth);
    for (const click of clicks) {
      const bounds = pointerFeedbackLensPaintBounds({
        ...click,
        point: {
          x: video.x + click.point.x * video.width,
          y: video.y + click.point.y * video.height,
        },
        radius: click.radius * scale,
        stroke: click.stroke * scale,
      });
      if (!bounds) continue;
      const x = Math.min(overlayBounds.x, bounds.x),
        y = Math.min(overlayBounds.y, bounds.y);
      overlayBounds = {
        x,
        y,
        width: Math.max(overlayBounds.x + overlayBounds.width, bounds.x + bounds.width) - x,
        height: Math.max(overlayBounds.y + overlayBounds.height, bounds.y + bounds.height) - y,
      };
    }
  }
  const overlay = spatial
    ? spatial.surface(
        'overlay',
        Math.ceil(overlayBounds.width * overlayDensity),
        Math.ceil(overlayBounds.height * overlayDensity)
      )
    : null;
  const overlayContext = overlay?.context ?? context;
  const overlayCanvas = canvas;
  overlayContext.save();
  try {
    if (overlay) {
      if (overlayDensity !== 1) overlayContext.scale(overlayDensity, overlayDensity);
      if (overlayBounds.x !== 0 || overlayBounds.y !== 0)
        overlayContext.translate(-overlayBounds.x, -overlayBounds.y);
    }
    drawSceneBorders(
      overlayContext,
      overlayCanvas,
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
        ...(overlayLayout.sourceCrop
          ? { contentRect: quickEditVisibleVideoTransform(overlayLayout) }
          : {}),
      },
      args.windowRaster
        ? {
            rect: computeQuickEditWindowTransform(overlayLayout),
            draw: (target, x, y, width, height) => {
              const raster = args.windowRaster!;
              target.drawImage(
                raster.image,
                0,
                0,
                raster.width,
                raster.height,
                x,
                y,
                width,
                height
              );
            },
          }
        : {
            rect: overlayLayout.videoTransform,
            draw: (target, x, y, width, height) => scene.sample.draw(target, x, y, width, height),
          },
      ...(args.exportSampling && args.sharpPaint
        ? ([
            (index: number) => {
              const lens = args.exportSampling!.plan.lenses.find(
                (l) => l.kind === 'click' && l.index === index
              );
              return lens
                ? (target: CanvasRenderingContext2D) => args.sharpPaint!(target, lens)
                : undefined;
            },
          ] as const)
        : [])
    );
    const contentFrames = annotationFrames.filter(
      (frame) => frame.instance.attachment === 'content'
    );
    if (contentFrames.length) {
      overlayContext.save();
      try {
        clipReviewSceneContent(overlayContext, overlayLayout, overlayBackground);
        for (const frame of contentFrames)
          drawReviewAnnotationFrame(overlayContext, frame, overlayLayout.videoTransform);
      } finally {
        overlayContext.restore();
      }
    }
    drawReviewSceneComments(overlayContext, {
      ...scene,
      canvas: overlayCanvas,
      layout: overlayLayout,
      commentSpace: overlay ? spatialReviewCommentSpace(scene.commentSpace) : scene.commentSpace,
      background: overlayBackground,
      comments: overlay ? burned.filter((c) => c.attachment === 'content') : burned,
      cameraScale: overlayLayout.videoTransform.width / overlayLayout.videoRect.width,
    });
  } finally {
    overlayContext.restore();
  }
  if (overlay && spatialRenderer && layout.spatial) {
    spatialRenderer.draw(context, {
      source: overlay.canvas,
      sourceRect: overlayBounds,
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
