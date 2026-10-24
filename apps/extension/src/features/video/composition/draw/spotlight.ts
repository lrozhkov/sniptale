import {
  sceneSpotlightPath,
  sceneSpotlightOpeningPath,
  type SceneSpotlightFrame,
} from '../scene-spotlight';
import type { RenderCanvasLease, RenderResources } from '../canvas/render-resources';
import { projectQuickEditPoint, type QuickEditHomography } from '../motion/spatial-geometry';
import { drawEdgePaddedBlur } from '../canvas/edge-padded-blur';
import { drawSceneLens } from './scene-lens';
type SceneSpotlightRect = SceneSpotlightFrame['opening'];

/** Visible video-window clip in output pixels. */
export type SceneSpotlightClip = {
  rect: SceneSpotlightRect;
  radius: number;
  /** Optional silhouette in unit-window coordinates, supplied by the attachment owner. */
  outline?: readonly { x: number; y: number }[];
};

/** Each opening retains its own decorated-window clip and output projection. */
export interface SceneSpotlightLayer extends SceneSpotlightFrame {
  /** Mutually exclusive source appearances blend coverage. Independent masks retain union coverage. */
  blend?: { groupId: string; weight: number };
  clip?: SceneSpotlightClip | undefined;
  projection?: QuickEditHomography | undefined;
}

/** Snapshot before filtering prevents feedback and includes both video and scene background. */
export function drawSceneSpotlight(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement | OffscreenCanvas,
  scratch: HTMLCanvasElement | OffscreenCanvas | null,
  frame: SceneSpotlightFrame | null,
  resources?: RenderResources
) {
  if (!frame) return;
  if (frame.lens) drawSpotlightLenses(context, canvas, [frame]);
  if (frame.dim <= 0 && frame.blur <= 0) return;
  context.save();
  try {
    context.clip(new Path2D(sceneSpotlightPath(canvas, frame)), 'evenodd');
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
export function sceneSpotlightNeedsClip(
  frame: SceneSpotlightFrame,
  clip: SceneSpotlightClip | undefined
): boolean {
  if (!clip) return false;
  if (clip.outline) return true;
  const hole = frame.protectionOpening ?? frame.opening;
  return (
    hole.x < clip.rect.x + clip.radius ||
    hole.y < clip.rect.y + clip.radius ||
    hole.x + hole.width > clip.rect.x + clip.rect.width - clip.radius ||
    hole.y + hole.height > clip.rect.y + clip.rect.height - clip.radius
  );
}

/** Opening and window clips expand in parallel; final protection keeps the real window bounds. */
export function sceneSpotlightOpeningClip(
  frame: SceneSpotlightFrame,
  clip: SceneSpotlightClip | undefined
): SceneSpotlightClip | undefined {
  if (!clip) return undefined;
  const target = frame.protectionOpening ?? frame.opening;
  const distance =
    (frame.openingClipProgress ?? 1) < 1
      ? Math.max(0, (frame.opening.width - target.width) / 2)
      : 0;
  return {
    ...clip,
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
export function createSceneSpotlightMasks(
  output: { width: number; height: number },
  frames: readonly SceneSpotlightLayer[],
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
    const groups: number[][] = [];
    const blends = new Map<string, number[]>();
    if (frames.length > 1)
      frames.forEach((frame, index) => {
        const members = frame.blend ? blends.get(frame.blend.groupId) : undefined;
        if (members) members.push(index);
        else {
          const group = [index];
          groups.push(group);
          if (frame.blend) blends.set(frame.blend.groupId, group);
        }
      });
    blends.clear();
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
          : (2 * frames.length + 2) * tileWidth * tileHeight * 4 +
              (2 * frames.length + groups.length + 1) * 8
      );
      const single = frames.length === 1 ? frames[0] : undefined;
      const prefix = single ? null : new Float64Array(frames.length + 1);
      if (prefix) prefix[0] = 1;
      if (single)
        rasterizeMaskOpening(
          hole,
          single.opening,
          single.radius,
          sceneSpotlightOpeningClip(single, single.clip),
          sceneSpotlightNeedsClip(single, single.clip),
          single.projection
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
            paintMaskTile(dim.context, blur.context, hole, frames, groups, prefix, radius, tile);
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
  frame: SceneSpotlightLayer,
  radius: number,
  tile: SceneSpotlightRect
) {
  const opening = hole.context.getImageData(tile.x, tile.y, tile.width, tile.height).data;
  const dimPixels = dim.createImageData(tile.width, tile.height);
  const blurPixels = blur.createImageData(tile.width, tile.height);
  for (let pixel = 3; pixel < dimPixels.data.length; pixel += 4) {
    const outside = 1 - opening[pixel]! / 255;
    const dimCoverage = Math.max(0, frame.dim * (frame.blend?.weight ?? 1) * outside);
    const blurCoverage = Math.max(0, frame.blur * (frame.blend?.weight ?? 1) * outside);
    writeSpotlightCoverage(dimPixels, blurPixels, pixel, dimCoverage, blurCoverage, radius);
  }
  publishSpotlightPixels(dim, blur, dimPixels, blurPixels, tile);
}

function rasterizeMaskOpening(
  hole: RenderCanvasLease,
  rect: SceneSpotlightRect,
  corner: number,
  bounds: SceneSpotlightClip | undefined,
  clipped: boolean,
  projection: QuickEditHomography | undefined
) {
  hole.context.clearRect(0, 0, hole.canvas.width, hole.canvas.height);
  hole.context.save();
  try {
    if (bounds && clipped) {
      if (bounds.outline) hole.context.clip(spotlightOutlinePath(bounds, projection));
      else if (projection)
        hole.context.clip(projectedOpening(bounds.rect, bounds.radius, projection));
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
        : new Path2D(sceneSpotlightOpeningPath({ opening: rect, radius: corner }))
    );
  } finally {
    hole.context.restore();
  }
}

function paintMaskTile(
  dim: CanvasRenderingContext2D,
  blur: CanvasRenderingContext2D,
  hole: RenderCanvasLease,
  frames: readonly SceneSpotlightLayer[],
  groups: readonly number[][],
  prefix: Float64Array,
  radius: number,
  tile: SceneSpotlightRect
) {
  const coverage = (
    rect: SceneSpotlightRect,
    corner: number,
    bounds: SceneSpotlightClip | undefined,
    clipped: boolean,
    projection: QuickEditHomography | undefined
  ) => {
    rasterizeMaskOpening(hole, rect, corner, bounds, clipped, projection);
    return hole.context.getImageData(tile.x, tile.y, tile.width, tile.height).data;
  };
  const openings = frames.map((frame) =>
    coverage(
      frame.opening,
      frame.radius,
      sceneSpotlightOpeningClip(frame, frame.clip),
      sceneSpotlightNeedsClip(frame, frame.clip),
      frame.projection
    )
  );
  const protections = frames.map((frame) =>
    coverage(
      frame.protectionOpening ?? frame.opening,
      frame.protectionRadius ?? frame.radius,
      frame.clip,
      sceneSpotlightNeedsClip(frame, frame.clip),
      frame.projection
    )
  );
  const dimPixels = dim.createImageData(tile.width, tile.height),
    blurPixels = blur.createImageData(tile.width, tile.height);
  const protection = (members: readonly number[], pixel: number) => {
    let sum = 0;
    for (const i of members) sum += ((frames[i]!.presence ?? 1) * protections[i]![pixel]!) / 255;
    return Math.min(1, sum);
  };
  for (let pixel = 3; pixel < dimPixels.data.length; pixel += 4) {
    for (let group = 0; group < groups.length; group++)
      prefix[group + 1] = prefix[group]! * (1 - protection(groups[group]!, pixel));
    let suffix = 1,
      dimCoverage = 0,
      blurCoverage = 0;
    for (let group = groups.length - 1; group >= 0; group--) {
      let groupDim = 0,
        groupBlur = 0;
      for (const i of groups[group]!) {
        const outside = (1 - openings[i]![pixel]! / 255) * prefix[group]! * suffix;
        const weight = frames[i]!.blend?.weight ?? 1;
        groupDim += frames[i]!.dim * weight * outside;
        groupBlur += frames[i]!.blur * weight * outside;
      }
      dimCoverage = Math.max(dimCoverage, groupDim);
      blurCoverage = Math.max(blurCoverage, groupBlur);
      suffix *= 1 - protection(groups[group]!, pixel);
    }
    writeSpotlightCoverage(dimPixels, blurPixels, pixel, dimCoverage, blurCoverage, radius);
  }
  publishSpotlightPixels(dim, blur, dimPixels, blurPixels, tile);
}

/** Blur reads the original scene once; dim follows blur and borders are painted later. */
export function drawSceneSpotlights(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement | OffscreenCanvas,
  scratch: HTMLCanvasElement | OffscreenCanvas | null,
  frames: readonly SceneSpotlightLayer[],
  resources?: RenderResources
) {
  if (
    frames.length <= 1 &&
    !frames[0]?.blend &&
    (!frames[0] || (!frames[0].projection && !sceneSpotlightNeedsClip(frames[0], frames[0].clip)))
  ) {
    drawSceneSpotlight(context, canvas, scratch, frames[0] ?? null, resources);
    return;
  }
  if (!frames.length) return;
  drawSpotlightLenses(context, canvas, frames, resources);
  const maskFrames = frames.filter((frame) => frame.dim > 0 || frame.blur > 0);
  if (!maskFrames.length) return;
  const masks = createSceneSpotlightMasks(canvas, maskFrames, resources);
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

function drawSpotlightLenses(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement | OffscreenCanvas,
  frames: readonly SceneSpotlightLayer[],
  resources?: RenderResources
) {
  const lenses = frames.filter((frame) => frame.lens && frame.lens.scale > 1);
  if (!lenses.length) return;
  const snapshot =
    lenses.length > 1 ? maskCanvas(canvas, 'spotlight.lens-source', resources) : null;
  try {
    if (snapshot) snapshot.context.drawImage(canvas, 0, 0);
    const source = snapshot?.canvas ?? canvas;
    for (const frame of lenses) {
      const opening = frame.projection
        ? projectedOpening(frame.opening, frame.radius, frame.projection)
        : new Path2D(sceneSpotlightOpeningPath(frame));
      const bounds = frame.projection
        ? projectedLensBounds(frame.opening, frame.projection)
        : frame.opening;
      if (!bounds) continue;
      context.save();
      try {
        if (frame.clip) {
          const clip = frame.clip.outline
            ? spotlightOutlinePath(frame.clip, frame.projection)
            : frame.projection
              ? projectedOpening(frame.clip.rect, frame.clip.radius, frame.projection)
              : new Path2D(
                  sceneSpotlightOpeningPath({
                    opening: frame.clip.rect,
                    radius: frame.clip.radius,
                  })
                );
          context.clip(clip);
        }
        context.clip(opening);
        drawSceneLens(context, source, bounds, frame.lens!);
      } finally {
        context.restore();
      }
    }
  } finally {
    snapshot?.release();
  }
}

function projectedLensBounds(rect: SceneSpotlightRect, projection: QuickEditHomography) {
  const points = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x, y: rect.y + rect.height },
    { x: rect.x + rect.width, y: rect.y + rect.height },
  ].map((point) => projectQuickEditPoint(projection, point));
  if (points.some((point) => !point)) return null;
  const x = points.map((point) => point!.x);
  const y = points.map((point) => point!.y);
  return {
    x: Math.min(...x),
    y: Math.min(...y),
    width: Math.max(...x) - Math.min(...x),
    height: Math.max(...y) - Math.min(...y),
  };
}

/** Rounded openings become a bounded polygon in the same projected space as the window. */
function projectedOpening(rect: SceneSpotlightRect, radius: number, matrix: QuickEditHomography) {
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

function spotlightOutlinePath(
  clip: SceneSpotlightClip,
  projection: QuickEditHomography | undefined
) {
  const path = new Path2D();
  let first = true;
  for (const normalized of clip.outline ?? []) {
    const local = {
      x: clip.rect.x + normalized.x * clip.rect.width,
      y: clip.rect.y + normalized.y * clip.rect.height,
    };
    const point = projection ? projectQuickEditPoint(projection, local) : local;
    if (!point) continue;
    if (first) {
      path.moveTo(point.x, point.y);
      first = false;
    } else path.lineTo(point.x, point.y);
  }
  path.closePath();
  return path;
}
