import type { QuickEditRect } from '../../features/video/review/advanced/scene';

import {
  quickEditSpotlightPath,
  type QuickEditSpotlightFrame,
} from '../../features/video/review/advanced/focus';

/** Visible video-window clip in output pixels. */
export type ReviewSpotlightClip = { rect: QuickEditRect; radius: number };

/** Snapshot before filtering prevents feedback and includes both video and scene background. */
export function drawReviewSpotlight(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  scratch: HTMLCanvasElement | null,
  frame: QuickEditSpotlightFrame | null
) {
  if (!frame) return;
  if (frame.blur > 0 && scratch) {
    const copy = scratch.getContext('2d');
    if (!copy) throw new Error('Spotlight compositor is unavailable.');
    copy.clearRect(0, 0, scratch.width, scratch.height);
    copy.drawImage(canvas, 0, 0);
  }
  context.save();
  context.clip(new Path2D(quickEditSpotlightPath(canvas, frame)), 'evenodd');
  if (frame.blur > 0 && scratch) {
    context.filter = `blur(${frame.blur}px)`;
    context.drawImage(scratch, 0, 0);
    context.filter = 'none';
  }
  if (frame.dim > 0) {
    context.fillStyle = `rgba(0,0,0,${frame.dim})`;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.restore();
}

/** Preserve legacy single-mask composition when its target is fully within the window. */
export function reviewSpotlightNeedsClip(
  frame: QuickEditSpotlightFrame,
  clip: ReviewSpotlightClip | undefined
): boolean {
  if (!clip) return false;
  const hole = frame.protectionOpening ?? frame.opening;
  return (
    hole.x < clip.rect.x + clip.radius ||
    hole.y < clip.rect.y + clip.radius ||
    hole.x + hole.width > clip.rect.x + clip.rect.width - clip.radius ||
    hole.y + hole.height > clip.rect.y + clip.rect.height - clip.radius
  );
}

function maskCanvas(output: { width: number; height: number }) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(output.width));
  canvas.height = Math.max(1, Math.round(output.height));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Spotlight compositor is unavailable.');
  return { canvas, context };
}

/** Rasterizes true union coverage once, shared by CSS preview and Canvas export. */
export function createReviewSpotlightMasks(
  output: { width: number; height: number },
  frames: readonly QuickEditSpotlightFrame[],
  clip?: ReviewSpotlightClip
) {
  const dim = maskCanvas(output),
    blur = maskCanvas(output),
    hole = maskCanvas(output);
  const coverage = (
    rect: QuickEditSpotlightFrame['opening'],
    radius: number,
    progress: number,
    clipped: boolean
  ) => {
    hole.context.clearRect(0, 0, hole.canvas.width, hole.canvas.height);
    hole.context.save();
    if (clip && clipped) {
      const p = Math.max(0, Math.min(1, progress));
      hole.context.beginPath();
      hole.context.roundRect(
        clip.rect.x * p,
        clip.rect.y * p,
        output.width + (clip.rect.width - output.width) * p,
        output.height + (clip.rect.height - output.height) * p,
        clip.radius * p
      );
      hole.context.clip();
    }
    // Retain the legacy quadratic corner geometry, including its antialiased coverage.
    hole.context.fillRect(0, 0, hole.canvas.width, hole.canvas.height);
    hole.context.globalCompositeOperation = 'destination-out';
    hole.context.fill(
      new Path2D(quickEditSpotlightPath(output, { opening: rect, radius, dim: 0, blur: 0 })),
      'evenodd'
    );
    hole.context.restore();
    return hole.context.getImageData(0, 0, hole.canvas.width, hole.canvas.height).data;
  };
  const openings = frames.map((frame) =>
    coverage(
      frame.opening,
      frame.radius,
      frame.openingClipProgress ?? 1,
      reviewSpotlightNeedsClip(frame, clip)
    )
  );
  const protections = frames.map((frame) =>
    coverage(
      frame.protectionOpening ?? frame.opening,
      frame.protectionRadius ?? frame.radius,
      1,
      reviewSpotlightNeedsClip(frame, clip)
    )
  );
  const radius = Math.max(0, ...frames.map((frame) => frame.blur));
  const dimPixels = dim.context.createImageData(dim.canvas.width, dim.canvas.height);
  const blurPixels = blur.context.createImageData(blur.canvas.width, blur.canvas.height);
  const dims = frames.map((frame) => frame.dim),
    blurs = frames.map((frame) => frame.blur);
  const presences = frames.map((frame) => frame.presence ?? 1);
  const prefix = new Float64Array(frames.length + 1);
  prefix[0] = 1;
  for (let pixel = 3; pixel < dimPixels.data.length; pixel += 4) {
    for (let i = 0; i < frames.length; i++)
      prefix[i + 1] = prefix[i]! * (1 - (presences[i]! * protections[i]![pixel]!) / 255);
    let suffix = 1,
      dimCoverage = 0,
      blurCoverage = 0;
    for (let i = frames.length - 1; i >= 0; i--) {
      // Prefix/suffix deliberately excludes this frame's protection, including fractional edges.
      const outside = (1 - openings[i]![pixel]! / 255) * prefix[i]! * suffix;
      dimCoverage = Math.max(dimCoverage, dims[i]! * outside);
      blurCoverage = Math.max(blurCoverage, blurs[i]! * outside);
      suffix *= 1 - (presences[i]! * protections[i]![pixel]!) / 255;
    }
    dimPixels.data[pixel] = Math.round(255 * dimCoverage);
    blurPixels.data[pixel] = radius ? Math.round((255 * blurCoverage) / radius) : 0;
  }
  dim.context.putImageData(dimPixels, 0, 0);
  blur.context.putImageData(blurPixels, 0, 0);
  return { dim: dim.canvas, blur: blur.canvas, radius };
}

/** Blur reads the original scene once; dim follows blur and borders are painted later. */
export function drawReviewSpotlights(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  scratch: HTMLCanvasElement | null,
  frames: readonly QuickEditSpotlightFrame[],
  clip?: ReviewSpotlightClip
) {
  if (frames.length <= 1 && (!frames[0] || !reviewSpotlightNeedsClip(frames[0], clip))) {
    drawReviewSpotlight(context, canvas, scratch, frames[0] ?? null);
    return;
  }
  if (!frames.length) return;
  const masks = createReviewSpotlightMasks(canvas, frames, clip);
  if (masks.radius > 0) {
    const layer = maskCanvas(canvas);
    layer.context.filter = `blur(${masks.radius}px)`;
    layer.context.drawImage(canvas, 0, 0);
    layer.context.filter = 'none';
    layer.context.globalCompositeOperation = 'destination-in';
    layer.context.drawImage(masks.blur, 0, 0);
    context.drawImage(layer.canvas, 0, 0);
  }
  context.drawImage(masks.dim, 0, 0);
}
