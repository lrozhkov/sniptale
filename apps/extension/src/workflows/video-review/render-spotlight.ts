import type {
  RenderCanvasLease,
  RenderResources,
} from '../../features/video/composition/canvas/render-resources';
import {
  projectQuickEditPoint,
  type QuickEditHomography,
} from '../../features/video/composition/motion/spatial-geometry';
import { drawEdgePaddedBlur } from '../../features/video/composition/canvas/edge-padded-blur';
import type { QuickEditRect } from '../../features/video/review/advanced/scene';

import {
  quickEditSpotlightPath,
  quickEditSpotlightOpeningPath,
  type QuickEditSpotlightFrame,
} from '../../features/video/review/advanced/focus';

/** Visible video-window clip in output pixels. */
export type ReviewSpotlightClip = { rect: QuickEditRect; radius: number };

/** Snapshot before filtering prevents feedback and includes both video and scene background. */
export function drawReviewSpotlight(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  scratch: HTMLCanvasElement | null,
  frame: QuickEditSpotlightFrame | null,
  resources?: RenderResources
) {
  if (!frame) return;
  context.save();
  try {
    context.clip(new Path2D(quickEditSpotlightPath(canvas, frame)), 'evenodd');
    if (frame.blur > 0 && (scratch || resources)) {
      drawEdgePaddedBlur(context, canvas, scratch, frame.blur, resources);
    }
    if (frame.dim > 0) {
      context.fillStyle = `rgba(0,0,0,${frame.dim})`;
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
  } finally {
    context.restore();
  }
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

/** Opening and window clips expand in parallel; final protection keeps the real window bounds. */
export function reviewSpotlightOpeningClip(
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

function maskCanvas(
  output: { width: number; height: number },
  role: string,
  resources?: RenderResources
): RenderCanvasLease {
  const size = {
    width: Math.max(1, Math.round(output.width)),
    height: Math.max(1, Math.round(output.height)),
  };
  if (resources) return resources.canvas(role, size, { willReadFrequently: true });
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    canvas.width = canvas.height = 0;
    throw new Error('Spotlight compositor is unavailable.');
  }
  return {
    canvas,
    context,
    release() {
      canvas.width = canvas.height = 0;
    },
  };
}

/** Rasterizes union coverage in bounded tiles; callers dispose both returned masks. */
export function createReviewSpotlightMasks(
  output: { width: number; height: number },
  frames: readonly QuickEditSpotlightFrame[],
  clip?: ReviewSpotlightClip,
  projection?: QuickEditHomography,
  resources?: RenderResources
) {
  const leases: RenderCanvasLease[] = [];
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const lease of leases) lease.release();
  };
  try {
    const dim = maskCanvas(output, 'spotlight.dim', resources);
    leases.push(dim);
    const blur = maskCanvas(output, 'spotlight.blur', resources);
    leases.push(blur);
    const width = dim.canvas.width,
      height = dim.canvas.height;
    // Tile readbacks and output ImageData stay within one scene-sized working set.
    const pixels = Math.max(1, Math.floor((width * height) / (2 * frames.length + 3)));
    const tileWidth = Math.min(width, pixels),
      tileHeight = Math.max(1, Math.min(height, Math.floor(pixels / tileWidth)));
    const radius = Math.max(0, ...frames.map((frame) => frame.blur));
    let reservation: ReturnType<RenderResources['bytes']> | undefined;
    // Skia coverage depends on raster clipping bounds; retain the original full-scene raster.
    const hole = maskCanvas({ width, height }, 'spotlight.hole', resources);
    try {
      reservation = resources?.bytes(
        'spotlight.coverage',
        frames.length === 1
          ? 3 * tileWidth * tileHeight * 4
          : (2 * frames.length + 2) * tileWidth * tileHeight * 4 + (frames.length + 1) * 8
      );
      const single = frames.length === 1 ? frames[0] : undefined;
      const prefix = single ? null : new Float64Array(frames.length + 1);
      if (prefix) prefix[0] = 1;
      if (single)
        rasterizeMaskOpening(
          hole,
          single.opening,
          single.radius,
          reviewSpotlightOpeningClip(single, clip),
          reviewSpotlightNeedsClip(single, clip),
          projection
        );
      for (let y = 0; y < height; y += tileHeight)
        for (let x = 0; x < width; x += tileWidth) {
          const tile = {
            x,
            y,
            width: Math.min(tileWidth, width - x),
            height: Math.min(tileHeight, height - y),
          };
          if (single) paintSingleMaskTile(dim.context, blur.context, hole, single, radius, tile);
          else if (prefix)
            paintMaskTile(
              dim.context,
              blur.context,
              hole,
              frames,
              prefix,
              radius,
              tile,
              clip,
              projection
            );
        }
    } finally {
      reservation?.release();
      hole.release();
    }
    return { dim: dim.canvas, blur: blur.canvas, radius, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}

/** Self-protection is excluded from a mask, so one frame needs only opening coverage. */
function paintSingleMaskTile(
  dim: CanvasRenderingContext2D,
  blur: CanvasRenderingContext2D,
  hole: RenderCanvasLease,
  frame: QuickEditSpotlightFrame,
  radius: number,
  tile: QuickEditRect
) {
  const opening = hole.context.getImageData(tile.x, tile.y, tile.width, tile.height).data;
  const dimPixels = dim.createImageData(tile.width, tile.height);
  const blurPixels = blur.createImageData(tile.width, tile.height);
  for (let pixel = 3; pixel < dimPixels.data.length; pixel += 4) {
    const outside = 1 - opening[pixel]! / 255;
    const dimCoverage = Math.max(0, frame.dim * outside);
    const blurCoverage = Math.max(0, frame.blur * outside);
    writeSpotlightCoverage(dimPixels, blurPixels, pixel, dimCoverage, blurCoverage, radius);
  }
  publishSpotlightPixels(dim, blur, dimPixels, blurPixels, tile);
}

function rasterizeMaskOpening(
  hole: RenderCanvasLease,
  rect: QuickEditRect,
  corner: number,
  bounds: ReviewSpotlightClip | undefined,
  clipped: boolean,
  projection: QuickEditHomography | undefined
) {
  hole.context.clearRect(0, 0, hole.canvas.width, hole.canvas.height);
  hole.context.save();
  try {
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
    // Positive coverage preserves the original fractional clip-edge semantics.
    hole.context.fill(
      projection
        ? projectedOpening(rect, corner, projection)
        : new Path2D(quickEditSpotlightOpeningPath({ opening: rect, radius: corner }))
    );
  } finally {
    hole.context.restore();
  }
}

function paintMaskTile(
  dim: CanvasRenderingContext2D,
  blur: CanvasRenderingContext2D,
  hole: RenderCanvasLease,
  frames: readonly QuickEditSpotlightFrame[],
  prefix: Float64Array,
  radius: number,
  tile: QuickEditRect,
  clip?: ReviewSpotlightClip,
  projection?: QuickEditHomography
) {
  const coverage = (
    rect: QuickEditRect,
    corner: number,
    bounds: ReviewSpotlightClip | undefined,
    clipped: boolean
  ) => {
    rasterizeMaskOpening(hole, rect, corner, bounds, clipped, projection);
    return hole.context.getImageData(tile.x, tile.y, tile.width, tile.height).data;
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
  const dimPixels = dim.createImageData(tile.width, tile.height),
    blurPixels = blur.createImageData(tile.width, tile.height);
  for (let pixel = 3; pixel < dimPixels.data.length; pixel += 4) {
    for (let i = 0; i < frames.length; i++)
      prefix[i + 1] =
        prefix[i]! * (1 - ((frames[i]!.presence ?? 1) * protections[i]![pixel]!) / 255);
    let suffix = 1,
      dimCoverage = 0,
      blurCoverage = 0;
    for (let i = frames.length - 1; i >= 0; i--) {
      // Exclude this frame's protection, including its fractional edges.
      const outside = (1 - openings[i]![pixel]! / 255) * prefix[i]! * suffix;
      dimCoverage = Math.max(dimCoverage, frames[i]!.dim * outside);
      blurCoverage = Math.max(blurCoverage, frames[i]!.blur * outside);
      suffix *= 1 - ((frames[i]!.presence ?? 1) * protections[i]![pixel]!) / 255;
    }
    writeSpotlightCoverage(dimPixels, blurPixels, pixel, dimCoverage, blurCoverage, radius);
  }
  publishSpotlightPixels(dim, blur, dimPixels, blurPixels, tile);
}

/** Blur reads the original scene once; dim follows blur and borders are painted later. */
export function drawReviewSpotlights(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  scratch: HTMLCanvasElement | null,
  frames: readonly QuickEditSpotlightFrame[],
  clip?: ReviewSpotlightClip,
  projection?: QuickEditHomography,
  resources?: RenderResources
) {
  if (
    !projection &&
    frames.length <= 1 &&
    (!frames[0] || !reviewSpotlightNeedsClip(frames[0], clip))
  ) {
    drawReviewSpotlight(context, canvas, scratch, frames[0] ?? null, resources);
    return;
  }
  if (!frames.length) return;
  const masks = createReviewSpotlightMasks(canvas, frames, clip, projection, resources);
  try {
    if (masks.radius > 0) {
      const layer = maskCanvas(canvas, 'spotlight.layer', resources);
      try {
        drawEdgePaddedBlur(layer.context, canvas, scratch, masks.radius, resources);
        layer.context.globalCompositeOperation = 'destination-in';
        layer.context.drawImage(masks.blur, 0, 0);
        context.drawImage(layer.canvas, 0, 0);
      } finally {
        layer.release();
      }
    }
    context.drawImage(masks.dim, 0, 0);
  } finally {
    masks.dispose();
  }
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

function writeSpotlightCoverage(
  dim: ImageData,
  blur: ImageData,
  pixel: number,
  dimCoverage: number,
  blurCoverage: number,
  radius: number
) {
  dim.data[pixel] = Math.round(255 * dimCoverage);
  blur.data[pixel] = radius ? Math.round((255 * blurCoverage) / radius) : 0;
}
function publishSpotlightPixels(
  dim: CanvasRenderingContext2D,
  blur: CanvasRenderingContext2D,
  dimPixels: ImageData,
  blurPixels: ImageData,
  tile: { x: number; y: number }
) {
  dim.putImageData(dimPixels, tile.x, tile.y);
  blur.putImageData(blurPixels, tile.x, tile.y);
}
