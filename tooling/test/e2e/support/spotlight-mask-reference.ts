// Frozen untiled oracle from a911179c22c7c39a69508091553edad20dbde65e render-spotlight.ts.
// Only imports, export naming and explicit test cleanup differ from the original mask algorithm.
import {
  projectQuickEditPoint,
  type QuickEditHomography,
} from '../../../../apps/extension/src/features/video/composition/motion/spatial-geometry';
import type { QuickEditRect } from '../../../../apps/extension/src/features/video/review/advanced/scene';
import {
  quickEditSpotlightOpeningPath,
  type QuickEditSpotlightFrame,
} from '../../../../apps/extension/src/features/video/review/advanced/focus';
type ReviewSpotlightClip = { rect: QuickEditRect; radius: number };
/** Preserve legacy single-mask composition when its target is fully within the window. */
function reviewSpotlightNeedsClip(
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

/** Opening and window clips expand in parallel; final protection keeps the real window bounds. */
function reviewSpotlightOpeningClip(
  frame: QuickEditSpotlightFrame,
  clip: ReviewSpotlightClip | undefined
): ReviewSpotlightClip | undefined {
  if (!clip) return undefined;
  const target = frame.protectionOpening ?? frame.opening;
  const distance =
    (frame.openingClipProgress ?? 1) < 1
      ? Math.max(0, (frame.opening.width - target.width) / 2)
      : 0;
  return {
    rect: {
      x: clip.rect.x - distance,
      y: clip.rect.y - distance,
      width: clip.rect.width + 2 * distance,
      height: clip.rect.height + 2 * distance,
    },
    radius: clip.radius + distance,
  };
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
export function createUntiledSpotlightMasks(
  output: { width: number; height: number },
  frames: readonly QuickEditSpotlightFrame[],
  clip?: ReviewSpotlightClip,
  projection?: QuickEditHomography
) {
  const dim = maskCanvas(output),
    blur = maskCanvas(output),
    hole = maskCanvas(output);
  const coverage = (
    rect: QuickEditSpotlightFrame['opening'],
    radius: number,
    bounds: ReviewSpotlightClip | undefined,
    clipped: boolean
  ) => {
    hole.context.clearRect(0, 0, hole.canvas.width, hole.canvas.height);
    hole.context.save();
    if (bounds && clipped) {
      if (projection) hole.context.clip(projectedOpening(bounds.rect, bounds.radius, projection));
      else {
        hole.context.beginPath();
        hole.context.roundRect(
          bounds.rect.x,
          bounds.rect.y,
          bounds.rect.width,
          bounds.rect.height,
          bounds.radius
        );
        hole.context.clip();
      }
    }
    // Draw the positive opening once. Subtracting its inverse under an antialiased clip
    // applies edge coverage twice and leaves a translucent ring around the whole window.
    hole.context.fill(
      projection
        ? projectedOpening(rect, radius, projection)
        : new Path2D(quickEditSpotlightOpeningPath({ opening: rect, radius }))
    );
    hole.context.restore();
    return hole.context.getImageData(0, 0, hole.canvas.width, hole.canvas.height).data;
  };
  const openings = frames.map((frame) =>
    coverage(
      frame.opening,
      frame.radius,
      reviewSpotlightOpeningClip(frame, clip),
      reviewSpotlightNeedsClip(frame, clip)
    )
  );
  const protections = frames.map((frame) =>
    coverage(
      frame.protectionOpening ?? frame.opening,
      frame.protectionRadius ?? frame.radius,
      clip,
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
  return {
    dim: dim.canvas,
    blur: blur.canvas,
    radius,
    dispose() {
      for (const item of [dim, blur, hole]) item.canvas.width = item.canvas.height = 0;
    },
  };
}

/** Rounded openings become a bounded polygon in the same projected space as the window. */
function projectedOpening(rect: QuickEditRect, radius: number, matrix: QuickEditHomography) {
  const path = new Path2D();
  const r = Math.max(0, Math.min(radius, rect.width / 2, rect.height / 2));
  const corners = [
    [rect.x + rect.width - r, rect.y + r],
    [rect.x + rect.width - r, rect.y + rect.height - r],
    [rect.x + r, rect.y + rect.height - r],
    [rect.x + r, rect.y + r],
  ];
  let first = true;
  for (let corner = 0; corner < 4; corner++)
    for (let step = 0; step <= 12; step++) {
      const angle = ((corner - 1 + step / 12) * Math.PI) / 2;
      const point = projectQuickEditPoint(matrix, {
        x: corners[corner]![0]! + r * Math.cos(angle),
        y: corners[corner]![1]! + r * Math.sin(angle),
      });
      if (!point) continue;
      if (first) {
        path.moveTo(point.x, point.y);
        first = false;
      } else path.lineTo(point.x, point.y);
    }
  path.closePath();
  return path;
}
