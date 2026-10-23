import type { RenderResources } from '../../features/video/composition/canvas/render-resources';
import type { ReviewSpatialRenderer } from '../../features/video/composition/canvas/spatial-renderer';
import { withReviewWindowRaster, type ReviewWindowRaster } from './window-header';
import { createVideoCompositionPassBuffer } from '../../features/video/composition/canvas/pass-buffer';
import {
  computeQuickEditSceneCamera,
  computeQuickEditSpatialWindow,
  computeQuickEditSpatialRasterLayout,
  computeQuickEditWindowTransform,
  computeQuickEditVideoTransform,
  quickEditVisibleVideoTransform,
  type computeQuickEditSceneLayout,
} from '../../features/video/review/advanced/scene';
import type {
  QuickEditAdvancedState,
  QuickEditCameraTransform,
} from '../../features/video/review/advanced/types';
import type { CanvasCommentExport } from '../../features/video/review/comments';
import { drawReviewBackgroundPaint, type createReviewBackgroundPainter } from './scene-background';
import { drawReviewComments } from './render-comments';
import { drawReviewSceneShadow, reviewSpatialSourceRect } from './scene-shadow';

type ReviewCommentSpace = {
  canvas: { width: number; height: number };
  layout: ReturnType<typeof computeQuickEditSceneLayout>;
  background: QuickEditAdvancedState['background'];
  cameraScale?: number | undefined;
};

/** Content comments occupy the unprojected plane; viewport comments keep the original space. */
export function spatialReviewCommentSpace(
  space: ReviewCommentSpace | undefined,
  cameraScale?: number
) {
  if (!space) return undefined;
  const layout = computeQuickEditSpatialRasterLayout(space.layout, space.background);
  return {
    ...space,
    layout,
    background: { ...space.background, zoomBehavior: 'fixed' as const },
    cameraScale: cameraScale ?? layout.videoTransform.width / layout.videoRect.width,
  };
}

/** Paints one decorated scene, accumulating only camera motion; annotations stay readable. */
export function drawReviewSceneFrame(
  context: CanvasRenderingContext2D,
  args: Parameters<typeof drawReviewSceneSample>[1] & {
    spatialRenderer?: ReviewSpatialRenderer | undefined;
    resources?: RenderResources | undefined;
    windowRasterBacking?: { width: number; height: number } | undefined;
    motionBlur?: readonly { camera: QuickEditCameraTransform; alpha: number }[] | undefined;
    drawOverlays?: ((raster: ReviewWindowRaster | null) => void) | undefined;
  }
) {
  args = { ...args, backgroundCacheContext: args.backgroundCacheContext ?? context };
  const paint = (raster: ReviewWindowRaster | null) => {
    if (args.layout.spatial) drawSpatialScene(context, args, raster);
    else drawReviewSceneExposure(context, args, raster);
    args.drawOverlays?.(raster);
  };
  if ((args.headerImage || args.layout.sourceCrop) && args.layout.windowRect)
    withReviewWindowRaster(
      {
        header: args.headerImage ?? undefined,
        resources: args.resources,
        backing: args.windowRasterBacking,
        videoRect: args.layout.videoRect,
        visibleVideoRect: args.layout.visibleVideoRect,
        windowRect: args.layout.windowRect,
        draw: args.sample.draw,
      },
      paint
    );
  else paint(null);
}

/** A background-independent decorated plane, projected with the exact export/preview GPU pass. */
function drawSpatialScene(
  context: CanvasRenderingContext2D,
  args: Parameters<typeof drawReviewSceneFrame>[1],
  windowRaster: ReviewWindowRaster | null
) {
  const renderer = args.spatialRenderer;
  const spatial = args.layout.spatial;
  if (!renderer || !spatial) throw new Error('Perspective renderer is unavailable.');
  const baseWindow = args.layout.windowRect ?? args.layout.videoRect;
  const fullLayout = { ...args.layout, windowRect: baseWindow };
  const baseLayout = computeQuickEditSpatialRasterLayout(fullLayout, args.background);
  const fixed = { ...args.background, zoomBehavior: 'fixed' as const };
  drawReviewSceneSample(
    context,
    {
      ...args,
      background: spatial.lockBackground ? fixed : args.background,
      sample: { draw() {} },
      backgroundOnly: true,
    },
    null
  );
  const passes = args.motionBlur?.length ? args.motionBlur : [{ camera: null, alpha: 1 }];
  const exposure = renderer.surface('exposure', args.canvas.width, args.canvas.height);
  const sourceRect = reviewSpatialSourceRect({
    output: args.canvas,
    window: baseWindow,
    background: fixed,
    sceneScale: args.sceneScale ?? 1,
  });
  for (const pass of passes) {
    const layout = pass.camera
      ? {
          ...fullLayout,
          spatial: pass.camera.spatial ?? spatial,
          videoTransform: computeQuickEditVideoTransform({ ...args.layout, camera: pass.camera }),
        }
      : fullLayout;
    const plane = renderer.surface('plane', sourceRect.width, sourceRect.height);
    const rasterLayout = computeQuickEditSpatialRasterLayout(layout, args.background);
    plane.context.save();
    try {
      plane.context.translate(-sourceRect.x, -sourceRect.y);
      drawReviewSceneSample(
        plane.context,
        { ...args, layout: rasterLayout, background: fixed, planeOnly: true },
        windowRaster
      );
    } finally {
      plane.context.restore();
    }
    exposure.context.save();
    try {
      exposure.context.globalCompositeOperation = 'lighter';
      exposure.context.globalAlpha = pass.alpha;
      renderer.draw(exposure.context, {
        source: plane.canvas,
        sourceRect,
        output: args.canvas,
        base: baseWindow,
        target: computeQuickEditSpatialWindow(layout, args.background),
        frame: pass.camera?.spatial ?? spatial,
      });
    } finally {
      exposure.context.restore();
    }
  }
  context.drawImage(exposure.canvas, 0, 0);
  if (!args.deferComments && args.comments?.length) {
    const overlay = renderer.surface('overlay', args.canvas.width, args.canvas.height);
    drawReviewSceneComments(overlay.context, {
      ...args,
      layout: baseLayout,
      commentSpace: spatialReviewCommentSpace(args.commentSpace, 1),
      background: fixed,
      cameraScale: 1,
      comments: args.comments.filter((c) => c.attachment === 'content'),
    });
    renderer.draw(context, {
      source: overlay.canvas,
      sourceRect: { x: 0, y: 0, width: args.canvas.width, height: args.canvas.height },
      output: args.canvas,
      base: baseWindow,
      target: computeQuickEditSpatialWindow(args.layout, args.background),
      frame: spatial,
      sharp: true,
    });
    drawReviewSceneComments(context, {
      ...args,
      comments: args.comments.filter((c) => c.attachment === 'viewport'),
    });
  }
}

function drawReviewSceneExposure(
  context: CanvasRenderingContext2D,
  args: Parameters<typeof drawReviewSceneFrame>[1],
  windowRaster: ReviewWindowRaster | null
) {
  const passes = args.motionBlur;
  if (passes && passes.length > 1) {
    const buffer = createVideoCompositionPassBuffer({
      bufferWidth: args.canvas.width,
      bufferHeight: args.canvas.height,
      drawWidth: args.canvas.width,
      drawHeight: args.canvas.height,
      targetContext: context,
      resources: args.resources,
    });
    if (!buffer) throw new Error('Motion blur canvas is unavailable.');
    try {
      for (const pass of passes)
        buffer.drawPass(pass.alpha, (target) =>
          drawReviewSceneSample(
            target,
            {
              ...args,
              layout: {
                ...args.layout,
                videoTransform: computeQuickEditVideoTransform({
                  ...args.layout,
                  camera: pass.camera,
                }),
              },
            },
            windowRaster
          )
        );
      buffer.flush();
    } finally {
      buffer.dispose();
    }
  } else drawReviewSceneSample(context, args, windowRaster);
  if (!args.deferComments) drawReviewSceneComments(context, args);
}

/** Final sharp comment pass, optionally deferred until focus/click overlays are painted. */
export function drawReviewSceneComments(
  context: CanvasRenderingContext2D,
  args: Parameters<typeof drawReviewSceneFrame>[1]
) {
  if (!args.comments?.length) return;
  const space = args.commentSpace ?? args;
  const { canvas, layout, background } = space;
  const { comments, sourceTime, resources } = args;
  const rasterScale = {
    x: args.canvas.width / canvas.width,
    y: args.canvas.height / canvas.height,
  };
  const draw = () => {
    context.save();
    try {
      clipReviewSceneContent(context, layout, background);
      drawReviewComments(context, comments, {
        attachment: 'content',
        canvas,
        videoTransform: layout.videoTransform,
        scale: space.cameraScale ?? args.cameraScale ?? 1,
        sourceTime,
        resources,
        rasterScale,
      });
    } finally {
      context.restore();
    }
    drawReviewComments(context, comments, {
      attachment: 'viewport',
      canvas,
      videoTransform: null,
      scale: 1,
      sourceTime,
      resources,
      rasterScale,
    });
  };
  if (!args.commentSpace) return draw();
  context.save();
  try {
    context.scale(rasterScale.x, rasterScale.y);
    draw();
  } finally {
    context.restore();
  }
}

/** Content overlays cannot reopen pixels outside the selected source area. */
export function clipReviewSceneContent(
  context: CanvasRenderingContext2D,
  layout: Parameters<typeof clipReviewScene>[1] & {
    sourceCrop?: import('../../features/video/review/advanced/types').QuickEditRect;
  },
  background: QuickEditAdvancedState['background']
) {
  clipReviewScene(context, layout, background);
  if (!layout.sourceCrop) return;
  const visible = quickEditVisibleVideoTransform(layout);
  context.beginPath();
  context.rect(visible.x, visible.y, visible.width, visible.height);
  context.clip();
}

export function clipReviewScene(
  context: CanvasRenderingContext2D,
  layout: Parameters<typeof drawReviewSceneSample>[1]['layout'],
  background: QuickEditAdvancedState['background']
) {
  const motion = computeQuickEditSceneCamera(layout, background);
  context.beginPath();
  const videoClip = motion.windowClip;
  const clip = background.enabled ? background.layout : null;
  if (clip && clip.cornerRadius > 0) {
    context.roundRect(
      videoClip.x,
      videoClip.y,
      videoClip.width,
      videoClip.height,
      Math.min(clip.cornerRadius * motion.scale, Math.min(videoClip.width, videoClip.height) / 2)
    );
  } else {
    context.rect(videoClip.x, videoClip.y, videoClip.width, videoClip.height);
  }
  context.clip();
}

/**
 * One scene draw for export: full-canvas paint, rounded content clip, and the
 * camera-transformed frame. Content-attached overlays burn inside the content
 * clip; viewport-attached ones burn onto the composition frame after the clip.
 * Mirrors the preview stage so decoded frames and preview stay comparable.
 */
function drawReviewSceneSample(
  context: CanvasRenderingContext2D,
  args: {
    canvas: { width: number; height: number };
    layout: Omit<ReturnType<typeof computeQuickEditSceneLayout>, 'windowRect'> & {
      windowRect?: ReturnType<typeof computeQuickEditSceneLayout>['windowRect'];
    };
    background: QuickEditAdvancedState['background'];
    image: (CanvasImageSource & { width: number; height: number }) | null;
    headerImage?: CanvasImageSource | null | undefined;
    sample: {
      draw(
        context: CanvasRenderingContext2D,
        x: number,
        y: number,
        width: number,
        height: number
      ): void;
    };
    backgroundCacheContext?: CanvasRenderingContext2D;
    resources?: RenderResources | undefined;
    commentSpace?: ReviewCommentSpace | undefined;
    backgroundPainter?: Pick<ReturnType<typeof createReviewBackgroundPainter>, 'draw'> | undefined;
    planeOnly?: boolean;
    backgroundOnly?: boolean;
    deferComments?: boolean;
    comments?: readonly CanvasCommentExport[];
    sourceTime?: number;
    cameraScale?: number;
    sceneScale?: number;
  },
  windowRaster: ReviewWindowRaster | null
) {
  const { layout, background, sample } = args;
  if (!args.planeOnly) drawReviewSceneBackground(context, args);
  if (args.backgroundOnly) return;
  const motion = computeQuickEditSceneCamera(layout, background);
  drawReviewSceneShadow(
    context,
    background,
    motion.windowClip,
    background.enabled ? background.layout.cornerRadius * motion.scale : 0,
    (args.sceneScale ?? 1) * motion.scale
  );
  context.save();
  try {
    clipReviewScene(context, layout, background);
    if (windowRaster) {
      const window = computeQuickEditWindowTransform(layout);
      context.drawImage(
        windowRaster.image,
        0,
        0,
        windowRaster.width,
        windowRaster.height,
        window.x,
        window.y,
        window.width,
        window.height
      );
    } else
      sample.draw(
        context,
        layout.videoTransform.x,
        layout.videoTransform.y,
        layout.videoTransform.width,
        layout.videoTransform.height
      );
  } finally {
    context.restore();
  }
}

/** Background owns its follow-video policy independently of the decorated plane. */
function drawReviewSceneBackground(
  context: CanvasRenderingContext2D,
  {
    canvas,
    layout,
    background,
    image,
    backgroundCacheContext,
    backgroundPainter,
  }: Parameters<typeof drawReviewSceneSample>[1]
) {
  context.fillStyle = '#000000';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const motion = computeQuickEditSceneCamera(layout, background);
  if (motion.backgroundScale !== 1) {
    context.save();
    context.translate(motion.x, motion.y);
    context.scale(motion.backgroundScale, motion.backgroundScale);
  }
  try {
    const paint = { background, image, width: canvas.width, height: canvas.height };
    if (backgroundPainter) backgroundPainter.draw(context, paint);
    else drawReviewBackgroundPaint(context, paint, backgroundCacheContext);
  } finally {
    if (motion.backgroundScale !== 1) context.restore();
  }
}
