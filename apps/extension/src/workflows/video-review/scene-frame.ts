import { createReviewWindowRaster } from './window-header';
import { createVideoCompositionPassBuffer } from '../../features/video/composition/canvas/pass-buffer';
import {
  computeQuickEditSceneCamera,
  computeQuickEditWindowTransform,
  computeQuickEditVideoTransform,
  type computeQuickEditSceneLayout,
} from '../../features/video/review/advanced/scene';
import type {
  QuickEditAdvancedState,
  QuickEditCameraTransform,
} from '../../features/video/review/advanced/types';
import type { CanvasCommentExport } from '../../features/video/review/comments';
import { drawSceneGradient } from '../../features/video/project/scene/background-gradient-canvas';
import { drawReviewComments } from './render-comments';
import { drawReviewSceneShadow } from './scene-shadow';

/** Paints one decorated scene, accumulating only camera motion; annotations stay readable. */
export function drawReviewSceneFrame(
  context: CanvasRenderingContext2D,
  args: Parameters<typeof drawReviewSceneSample>[1] & {
    motionBlur?: readonly { camera: QuickEditCameraTransform; alpha: number }[] | undefined;
  }
) {
  const windowRaster =
    args.headerImage && args.layout.windowRect
      ? createReviewWindowRaster({
          header: args.headerImage,
          videoRect: args.layout.videoRect,
          windowRect: args.layout.windowRect,
          draw: args.sample.draw,
        })
      : null;
  try {
    drawReviewSceneExposure(context, args, windowRaster);
  } finally {
    windowRaster?.release();
  }
}

function drawReviewSceneExposure(
  context: CanvasRenderingContext2D,
  args: Parameters<typeof drawReviewSceneFrame>[1],
  windowRaster: ReturnType<typeof createReviewWindowRaster> | null
) {
  const passes = args.motionBlur;
  if (passes && passes.length > 1) {
    const buffer = createVideoCompositionPassBuffer({
      bufferWidth: args.canvas.width,
      bufferHeight: args.canvas.height,
      drawWidth: args.canvas.width,
      drawHeight: args.canvas.height,
      targetContext: context,
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
  const { canvas, layout, background, comments, sourceTime } = args;
  context.save();
  clipReviewScene(context, layout, background);
  const cameraScale = args.cameraScale ?? 1;
  drawReviewComments(context, comments ?? [], {
    attachment: 'content',
    canvas,
    videoTransform: layout.videoTransform,
    scale: cameraScale,
    sourceTime,
  });
  context.restore();
  drawReviewComments(context, comments ?? [], {
    attachment: 'viewport',
    canvas,
    videoTransform: null,
    scale: 1,
    sourceTime,
  });
}

function clipReviewScene(
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
    deferComments?: boolean;
    comments?: readonly CanvasCommentExport[];
    sourceTime?: number;
    cameraScale?: number;
    sceneScale?: number;
  },
  windowRaster: ReturnType<typeof createReviewWindowRaster> | null
) {
  const { canvas, layout, background, image, sample } = args;
  context.fillStyle = '#000000';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const motion = computeQuickEditSceneCamera(layout, background);
  if (motion.scale !== 1) {
    context.save();
    context.translate(motion.x, motion.y);
    context.scale(motion.scale, motion.scale);
  }
  if (background.enabled) {
    if (background.type === 'solid') {
      context.fillStyle = background.color;
      context.fillRect(0, 0, canvas.width, canvas.height);
    } else if (background.type === 'gradient') {
      drawSceneGradient(context, background.gradient, canvas.width, canvas.height);
    } else if (image) {
      drawFittedImage(context, image, canvas.width, canvas.height, background.imageFit);
    }
  }
  if (motion.scale !== 1) context.restore();
  drawReviewSceneShadow(
    context,
    background,
    motion.windowClip,
    background.enabled ? background.layout.cornerRadius * motion.scale : 0,
    (args.sceneScale ?? 1) * motion.scale
  );
  context.save();
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
  context.restore();
}

function drawFittedImage(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource & { width: number; height: number },
  width: number,
  height: number,
  fit: 'cover' | 'contain'
) {
  const scale =
    fit === 'cover'
      ? Math.max(width / image.width, height / image.height)
      : Math.min(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  context.drawImage(
    image,
    (width - drawWidth) / 2,
    (height - drawHeight) / 2,
    drawWidth,
    drawHeight
  );
}
