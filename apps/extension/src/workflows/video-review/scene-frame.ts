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
import {
  drawReviewPreparedSource,
  reviewExportWindowSampling,
  reviewExportSpatialRaster,
  type ReviewExportSamplingPaint,
} from './export-source-sampling';
import {
  multiplyQuickEditProjections,
  quickEditPlaneProjection,
} from '../../features/video/composition/motion/spatial-geometry';

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
    /** Borrow the renderer-owned immutable source plane without releasing it. */
    windowRaster?: ReviewWindowRaster | undefined;
    motionBlur?: readonly { camera: QuickEditCameraTransform; alpha: number }[] | undefined;
    drawOverlays?: ((raster: ReviewWindowRaster | null) => void) | undefined;
  }
) {
  args = { ...args, backgroundCacheContext: args.backgroundCacheContext ?? context };
  const paint = (raster: ReviewWindowRaster | null) => {
    const transform = args.exportSampling?.transform;
    if (transform && !args.layout.spatial) {
      context.save();
      context.transform(
        transform[0]!,
        transform[3]!,
        transform[1]!,
        transform[4]!,
        transform[2]!,
        transform[5]!
      );
    }
    try {
      const sourceRaster = args.exportSampling ? null : raster;
      if (args.layout.spatial) drawSpatialScene(context, args, sourceRaster);
      else drawReviewSceneExposure(context, args, sourceRaster);
      args.drawOverlays?.(raster);
    } finally {
      if (transform && !args.layout.spatial) context.restore();
    }
  };
  if (
    args.exportSampling &&
    (args.headerImage || args.layout.sourceCrop) &&
    args.exportSampling.frame.plan.lenses.some((l) => l.kind === 'click')
  )
    withReviewWindowRaster(
      {
        header: args.headerImage ?? undefined,
        resources: args.resources,
        backing: args.windowRasterBacking,
        videoRect: args.layout.videoRect,
        visibleVideoRect: args.layout.visibleVideoRect,
        windowRect: args.layout.windowRect ?? args.layout.videoRect,
        draw: args.sample.draw,
      },
      paint
    );
  else if (args.exportSampling) paint(null);
  else if (args.windowRaster) paint(args.windowRaster);
  else if ((args.headerImage || args.layout.sourceCrop) && args.layout.windowRect)
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

/** Replay only the pre-focus scene stage; models never receive its decorated output. */
export function drawReviewExportSharpStage(
  context: CanvasRenderingContext2D,
  args: Parameters<typeof drawReviewSceneFrame>[1],
  frame: ReviewExportSamplingPaint['frame'],
  lens: ReviewExportSamplingPaint['frame']['plan']['lenses'][number]
) {
  const fullLayout = {
    ...args.layout,
    windowRect: args.layout.windowRect ?? args.layout.videoRect,
  };
  const layout =
    lens.kind === 'click' && fullLayout.spatial
      ? computeQuickEditSpatialRasterLayout(fullLayout, args.background)
      : fullLayout;
  const flat: Parameters<typeof drawReviewSceneFrame>[1]['layout'] = { ...layout };
  delete flat.spatial;
  drawReviewSceneFrame(context, {
    ...args,
    layout: lens.kind === 'click' ? flat : layout,
    background:
      lens.kind === 'click' ? { ...args.background, zoomBehavior: 'fixed' } : args.background,
    drawOverlays: undefined,
    ...(lens.kind === 'click' ? { motionBlur: undefined } : {}),
    deferComments: true,
    exportSampling: { frame, demandId: lens.id, transform: lens.transform, lens },
  });
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
  const transform = args.exportSampling?.transform;
  if (transform) {
    context.save();
    context.transform(
      transform[0]!,
      transform[3]!,
      transform[1]!,
      transform[4]!,
      transform[2]!,
      transform[5]!
    );
  }
  try {
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
  } finally {
    if (transform) context.restore();
  }
  const passes = args.motionBlur?.length ? args.motionBlur : [{ camera: null, alpha: 1 }];
  const exposure = renderer.surface('exposure', args.canvas.width, args.canvas.height);
  const fullSourceRect = reviewSpatialSourceRect({
    output: args.canvas,
    window: baseWindow,
    background: fixed,
    sceneScale: args.sceneScale ?? 1,
  });
  for (const [index, pass] of passes.entries()) {
    const layout = pass.camera
      ? {
          ...fullLayout,
          spatial: pass.camera.spatial ?? spatial,
          videoTransform: computeQuickEditVideoTransform({ ...args.layout, camera: pass.camera }),
        }
      : fullLayout;
    const planExposure = args.exportSampling?.frame.plan.exposures[index];
    const baseProjection = quickEditPlaneProjection(
      baseWindow,
      computeQuickEditSpatialWindow(layout, args.background),
      pass.camera?.spatial ?? spatial
    );
    const projection = transform
      ? multiplyQuickEditProjections(transform, baseProjection)
      : baseProjection;
    const density =
      (planExposure?.planeDensity ?? 1) *
      (args.exportSampling?.lens?.demand ? Math.max(1, args.exportSampling.lens.transform[0]!) : 1);
    const raster = reviewExportSpatialRaster({
      projection,
      output: args.canvas,
      frame: pass.camera?.spatial ?? spatial,
      density,
      fullSourceRect,
      ...(args.exportSampling?.lens ? { lens: args.exportSampling.lens } : {}),
    });
    if (!raster) continue;
    const { sourceRect } = raster;
    const plane = renderer.surface('plane', raster.backing.width, raster.backing.height);
    const rasterLayout = computeQuickEditSpatialRasterLayout(layout, args.background);
    plane.context.save();
    try {
      if (plane.canvas.width !== sourceRect.width || plane.canvas.height !== sourceRect.height)
        plane.context.scale(
          plane.canvas.width / sourceRect.width,
          plane.canvas.height / sourceRect.height
        );
      plane.context.translate(-sourceRect.x, -sourceRect.y);
      drawReviewSceneSample(
        plane.context,
        {
          ...args,
          layout: rasterLayout,
          background: fixed,
          planeOnly: true,
          ...(args.exportSampling
            ? {
                exportSampling: {
                  ...args.exportSampling,
                  exposureIndex: index,
                  sourceAbsent:
                    !!args.exportSampling.lens &&
                    !args.exportSampling.lens.demands.some(
                      (d) =>
                        d.id ===
                        (index
                          ? `${args.exportSampling!.lens!.id}:${index}`
                          : args.exportSampling!.lens!.id)
                    ),
                  demandId: args.exportSampling.lens
                    ? index
                      ? `${args.exportSampling.lens.id}:${index}`
                      : args.exportSampling.lens.id
                    : (args.exportSampling.demandId ?? planExposure?.body.id),
                },
              }
            : {}),
        },
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
        ...(transform ? { projection } : {}),
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
      for (const [index, pass] of passes.entries())
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
              ...(args.exportSampling
                ? {
                    exportSampling: {
                      ...args.exportSampling,
                      exposureIndex: index,
                      sourceAbsent:
                        !!args.exportSampling.lens &&
                        !args.exportSampling.lens.demands.some(
                          (d) =>
                            d.id ===
                            (index
                              ? `${args.exportSampling!.lens!.id}:${index}`
                              : args.exportSampling!.lens!.id)
                        ),
                      demandId: args.exportSampling.lens
                        ? index
                          ? `${args.exportSampling.lens.id}:${index}`
                          : args.exportSampling.lens.id
                        : (args.exportSampling.demandId ??
                          args.exportSampling.frame.plan.exposures[index]?.body.id),
                    },
                  }
                : {}),
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
    currentTime?: number | undefined;
    cameraScale?: number;
    sceneScale?: number;
    exportSampling?: ReviewExportSamplingPaint;
  },
  windowRaster: ReviewWindowRaster | null
) {
  const { layout, background, sample } = args;
  const sampling = args.exportSampling;
  const demandId = sampling?.demandId ?? sampling?.frame.plan.exposures[0]?.body.id;
  const draw = (
    target: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number
  ) => {
    if (sampling?.sourceAbsent) return;
    if (
      !sampling ||
      !demandId ||
      !drawReviewPreparedSource(target, sampling.frame.sampling, demandId, { x, y, width, height })
    )
      sample.draw(target, x, y, width, height);
  };
  if (!windowRaster && sampling && demandId && (args.headerImage || layout.sourceCrop)) {
    withReviewWindowRaster(
      {
        header: args.headerImage ?? undefined,
        resources: args.resources,
        ...reviewExportWindowSampling(sampling, layout, background, demandId),
        videoRect: layout.videoRect,
        visibleVideoRect: layout.visibleVideoRect,
        windowRect: layout.windowRect ?? layout.videoRect,
        draw,
      },
      (raster) => drawReviewSceneSample(context, args, raster)
    );
    return;
  }
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
      const rect = windowRaster.rect;
      const baseWindow = layout.windowRect ?? layout.videoRect;
      const sx = window.width / baseWindow.width,
        sy = window.height / baseWindow.height;
      context.drawImage(
        windowRaster.image,
        0,
        0,
        windowRaster.width,
        windowRaster.height,
        rect ? window.x + (rect.x - baseWindow.x) * sx : window.x,
        rect ? window.y + (rect.y - baseWindow.y) * sy : window.y,
        rect ? rect.width * sx : window.width,
        rect ? rect.height * sy : window.height
      );
    } else
      draw(
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
    currentTime,
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
    const paint = { background, image, width: canvas.width, height: canvas.height, currentTime };
    if (backgroundPainter) backgroundPainter.draw(context, paint);
    else drawReviewBackgroundPaint(context, paint, backgroundCacheContext);
  } finally {
    if (motion.backgroundScale !== 1) context.restore();
  }
}
