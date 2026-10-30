import { projectSourceContentRect } from '../motion/source-window';
import type { QuickEditHomography } from '../motion/spatial-geometry';
import { sampleSceneBorder } from '../scene-border';
import type { VideoCompositionBorderState } from '../types';
import type { RenderResources, RenderCanvasLease } from '../canvas/render-resources';
import type { SceneBorderFrame } from '../scene-border';
import type { QuickEditBorder } from '../../project/scene/focus-appearance';

/** The same Canvas stroke adapter paints inspector, stage and encoded frames. */
export function drawSceneBorders(
  context: CanvasRenderingContext2D,
  output: { width: number; height: number },
  frames: readonly SceneBorderFrame[],
  clip?: { rect: QuickEditBorder['area']; radius: number },
  resources?: Pick<RenderResources, 'canvas'>,
  transform?: DOMMatrix2DInit
) {
  if (!frames.length) return;
  const untransformed =
    context.globalCompositeOperation === 'source-over' &&
    context.filter === 'none' &&
    context.shadowColor === 'rgba(0, 0, 0, 0)' &&
    !transform &&
    context.getTransform().isIdentity &&
    context.canvas.width === output.width &&
    context.canvas.height === output.height;
  if (untransformed && frames.every((frame) => canPaintUnmaskedBorder(frame, clip))) {
    paintUnmaskedBorders(context, frames, clip);
    return;
  }
  const bounds =
    untransformed && frames.every((frame) => frame.bounds)
      ? frames.map((frame) =>
          canPaintUnmaskedBorder(frame, clip) ? null : borderRasterBounds(frame, output)
        )
      : undefined;
  const backing = bounds
    ? {
        width: Math.max(1, ...bounds.map((rect) => rect?.width ?? 0)),
        height: Math.max(1, ...bounds.map((rect) => rect?.height ?? 0)),
      }
    : output;
  const layerLease = acquireBorderSurface('border-layer', backing, resources);
  let maskLease: RenderCanvasLease | undefined;
  try {
    maskLease = acquireBorderSurface('border-mask', backing, resources);
    paintBorders(context, frames, clip, layerLease, maskLease, transform, bounds);
  } finally {
    try {
      maskLease?.release();
    } finally {
      layerLease.release();
    }
  }
}

function canPaintUnmaskedBorder(
  frame: SceneBorderFrame,
  clip: { rect: QuickEditBorder['area']; radius: number } | undefined
) {
  return (
    frame.end - frame.start >= 1 - 1e-9 ||
    ((frame.style === 'solid' ||
      (frame.style === 'dashed' &&
        !!frame.bounds &&
        Math.min(frame.bounds.width, frame.bounds.height) > frame.width + 4 &&
        !!frame.revealCaps &&
        frame.perimeter > 0)) &&
      isBorderStrokeInsideClip(frame, clip))
  );
}

/** Clipping a partial native stroke changes edge coverage; keep that intersection isolated. */
function isBorderStrokeInsideClip(
  frame: SceneBorderFrame,
  clip: { rect: QuickEditBorder['area']; radius: number } | undefined
) {
  if (!clip) return true;
  const bounds = frame.bounds;
  if (!bounds) return false;
  const padding = frame.width * 5 + 2 + clip.radius;
  return (
    bounds.x - padding >= clip.rect.x &&
    bounds.y - padding >= clip.rect.y &&
    bounds.x + bounds.width + padding <= clip.rect.x + clip.rect.width &&
    bounds.y + bounds.height + padding <= clip.rect.y + clip.rect.height
  );
}

/** Integer offsets retain pixel phase; include the default miter limit and reveal fringe. */
function borderRasterBounds(frame: SceneBorderFrame, output: { width: number; height: number }) {
  const rect = frame.bounds!;
  const padding = frame.width * 5 + 2;
  const x = Math.max(0, Math.min(output.width, Math.floor(rect.x - padding)));
  const y = Math.max(0, Math.min(output.height, Math.floor(rect.y - padding)));
  return {
    x,
    y,
    width: Math.max(1, Math.min(output.width, Math.ceil(rect.x + rect.width + padding)) - x),
    height: Math.max(1, Math.min(output.height, Math.ceil(rect.y + rect.height + padding)) - y),
  };
}

/** Solid strokes and full contours need no reveal mask; preserve caller state. */
function paintUnmaskedBorders(
  context: CanvasRenderingContext2D,
  frames: readonly SceneBorderFrame[],
  clip: { rect: QuickEditBorder['area']; radius: number } | undefined
) {
  const opacity = context.globalAlpha;
  context.save();
  try {
    if (clip) {
      context.beginPath();
      context.roundRect(clip.rect.x, clip.rect.y, clip.rect.width, clip.rect.height, clip.radius);
      context.clip();
    }
    context.lineJoin = 'miter';
    context.miterLimit = 10;
    for (const frame of frames) {
      const length = Math.min(1, Math.max(0, frame.end - frame.start));
      if (!frame.opacity || !length) continue;
      configureBorderStroke(context, frame, length >= 1 - 1e-9 ? 1 : length, true);
      context.globalAlpha = opacity * frame.opacity;
      paintBorderStroke(context, frame, length);
    }
  } finally {
    context.restore();
  }
}

/** Cap clips multiply native dash coverage exactly as the former reveal-mask pass. */
function paintBorderStroke(
  context: CanvasRenderingContext2D,
  frame: SceneBorderFrame,
  length: number
) {
  if (length >= 1 || frame.style !== 'dashed' || !frame.revealCaps) {
    context.stroke(new Path2D(frame.path));
    return;
  }
  context.save();
  try {
    const coverage = new Path2D();
    coverage.rect(0, 0, context.canvas.width, context.canvas.height);
    const halfWidth = frame.width / 2 + 2;
    for (const cap of frame.revealCaps) {
      const nx = -cap.dy * halfWidth,
        ny = cap.dx * halfWidth;
      coverage.moveTo(cap.x + nx, cap.y + ny);
      coverage.lineTo(cap.x + nx + cap.dx * 4, cap.y + ny + cap.dy * 4);
      coverage.lineTo(cap.x - nx + cap.dx * 4, cap.y - ny + cap.dy * 4);
      coverage.lineTo(cap.x - nx, cap.y - ny);
      coverage.closePath();
    }
    context.clip(coverage, 'evenodd');
    context.stroke(new Path2D(frame.path));
  } finally {
    context.restore();
  }
}

function acquireBorderSurface(
  role: string,
  output: { width: number; height: number },
  resources: Pick<RenderResources, 'canvas'> | undefined
): RenderCanvasLease {
  if (resources) return resources.canvas(role, output);
  const canvas = document.createElement('canvas');
  canvas.width = output.width;
  canvas.height = output.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Border compositor is unavailable.');
  return { canvas, context, release() {} };
}

function paintBorders(
  context: CanvasRenderingContext2D,
  frames: readonly SceneBorderFrame[],
  clip: { rect: QuickEditBorder['area']; radius: number } | undefined,
  layerLease: RenderCanvasLease,
  maskLease: RenderCanvasLease,
  transform: DOMMatrix2DInit | undefined,
  bounds?: readonly ({ x: number; y: number; width: number; height: number } | null)[]
) {
  const inheritedOpacity = context.globalAlpha;
  context.save();
  try {
    if (clip) {
      context.beginPath();
      layerLease.context.lineCap = 'butt';
      context.roundRect(clip.rect.x, clip.rect.y, clip.rect.width, clip.rect.height, clip.radius);
      context.clip();
    }
    if (transform) context.setTransform(1, 0, 0, 1, 0, 0);
    for (const [index, frame] of frames.entries()) {
      const span = frame.end - frame.start;
      const length = span >= 1 - 1e-9 ? 1 : Math.max(0, span);
      if (!length || !frame.opacity) continue;
      const rect = bounds?.[index];
      if (rect === null) {
        context.globalAlpha = inheritedOpacity;
        paintUnmaskedBorders(context, [frame], undefined);
        continue;
      }
      rasterizeBorderFrame(
        layerLease,
        maskLease,
        frame,
        length,
        rect ? { a: 1, b: 0, c: 0, d: 1, e: -rect.x, f: -rect.y } : transform
      );
      context.globalAlpha = inheritedOpacity * frame.opacity;
      context.drawImage(layerLease.canvas, rect?.x ?? 0, rect?.y ?? 0);
    }
  } finally {
    context.restore();
  }
}

function rasterizeBorderFrame(
  layer: RenderCanvasLease,
  mask: RenderCanvasLease,
  frame: SceneBorderFrame,
  length: number,
  transform: DOMMatrix2DInit | undefined
) {
  const stroke = layer.context;
  stroke.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
  stroke.save();
  try {
    if (transform) stroke.setTransform(transform);
    configureBorderStroke(stroke, frame, length);
    const path = new Path2D(frame.path);
    stroke.stroke(path);
    if (length < 1 && frame.style !== 'solid') {
      rasterizeBorderReveal(mask, path, frame, length, transform);
      stroke.globalCompositeOperation = 'destination-in';
      if (transform) stroke.setTransform(1, 0, 0, 1, 0, 0);
      stroke.drawImage(mask.canvas, 0, 0);
    }
  } finally {
    stroke.restore();
  }
}

function configureBorderStroke(
  stroke: CanvasRenderingContext2D,
  frame: SceneBorderFrame,
  length: number,
  directReveal = false
) {
  stroke.lineWidth = frame.width;
  stroke.strokeStyle = frame.color;
  stroke.lineCap = frame.style === 'dotted' ? 'round' : 'butt';
  if (directReveal && frame.style === 'dashed' && length < 1) {
    stroke.setLineDash(revealedBorderDashes(frame, length));
    stroke.lineDashOffset = 0;
    return;
  }
  // A closed contour needs whole repeats, or its join cuts a dash on each rotation.
  const nominalPitch = frame.width * (frame.style === 'dashed' ? 5 : 2);
  const repeats = Math.max(1, Math.round(frame.perimeter / nominalPitch));
  const pitch = frame.perimeter / repeats;
  // A tiny nonzero dot avoids duplicate round caps at the closed-path seam.
  const dotLength = Math.min(0.01, pitch / 2);
  const patterns = {
    solid: [],
    dashed: [pitch * 0.6, pitch * 0.4],
    dotted: [dotLength, pitch - dotLength],
  };
  stroke.setLineDash(patterns[frame.style]);
  stroke.lineDashOffset = frame.dashOffset ?? 0;
  if (length < 1 && frame.style === 'solid') {
    // Native segment caps stay round; a reveal mask would slice them flat.
    stroke.lineCap = 'round';
    stroke.setLineDash([length * frame.perimeter, (1 - length) * frame.perimeter]);
    stroke.lineDashOffset = -frame.start * frame.perimeter;
  }
}

/** Intersect the traveling dash pattern with the reveal in contour-distance coordinates. */
function revealedBorderDashes(frame: SceneBorderFrame, length: number): number[] {
  const perimeter = frame.perimeter;
  const pitch = perimeter / Math.max(1, Math.round(perimeter / (frame.width * 5)));
  const offset = (((frame.dashOffset ?? 0) % pitch) + pitch) % pitch;
  const phase = frame.start - 2 / perimeter;
  const start = (((phase % 1) + 1) % 1) * perimeter;
  const end = start + length * perimeter + 4;
  const windows: readonly (readonly [number, number])[] =
    end > perimeter
      ? [
          [0, end - perimeter],
          [start, perimeter],
        ]
      : [[start, end]];
  const pattern = [0];
  let cursor = 0;
  for (const [from, to] of windows) {
    const first = Math.floor((from + offset) / pitch) - 1;
    const last = Math.floor((to + offset) / pitch);
    for (let repeat = first; repeat <= last; repeat++) {
      const dash = repeat * pitch - offset;
      const left = Math.max(from, dash);
      const right = Math.min(to, dash + pitch * 0.6);
      if (right <= left) continue;
      pattern.push(Math.max(0, left - cursor), right - left);
      cursor = right;
    }
  }
  pattern.push(Math.max(0, perimeter - cursor));
  return pattern;
}

function rasterizeBorderReveal(
  lease: RenderCanvasLease,
  path: Path2D,
  frame: SceneBorderFrame,
  length: number,
  transform: DOMMatrix2DInit | undefined
) {
  // Reveal clipping and the traveling pattern have independent, sampled phases.
  const reveal = lease.context;
  reveal.clearRect(0, 0, lease.canvas.width, lease.canvas.height);
  reveal.save();
  try {
    if (transform) reveal.setTransform(transform);
    reveal.lineCap = 'butt';
    reveal.lineWidth = frame.width + 2;
    reveal.strokeStyle = '#ffffff';
    reveal.setLineDash([length * frame.perimeter, (1 - length) * frame.perimeter]);
    reveal.lineDashOffset = -frame.start * frame.perimeter;
    reveal.stroke(path);
  } finally {
    reveal.restore();
  }
}

/** Rasterize Native window or viewport borders under the current transform exactly once. */
export function drawCompositionBorders(
  context: CanvasRenderingContext2D,
  states: readonly VideoCompositionBorderState[] | undefined,
  window: QuickEditBorder['area'],
  scale: number,
  radius = 0,
  originalWindow?: QuickEditBorder['area'],
  sourceContentTransform?: QuickEditHomography
): void {
  if (!states?.length || window.width <= 0 || window.height <= 0) return;
  const source = originalWindow ?? window;
  const projectedSource = sourceContentTransform
    ? projectSourceContentRect(source, sourceContentTransform, scale)
    : null;
  const frames = states.flatMap((state) =>
    sampleSceneBorder({
      ...state,
      window:
        state.coordinateSpace === 'source-window' ? (projectedSource?.rect ?? source) : window,
      scale:
        scale * (state.coordinateSpace === 'source-window' ? (projectedSource?.scale ?? 1) : 1),
    })
  );
  const ownerDocument = context.canvas.ownerDocument ?? document;
  drawSceneBorders(
    context,
    context.canvas,
    frames,
    { rect: window, radius },
    {
      canvas(_role, size) {
        const canvas = ownerDocument.createElement('canvas');
        canvas.width = size.width;
        canvas.height = size.height;
        const surface = canvas.getContext('2d');
        if (!surface) {
          canvas.width = canvas.height = 0;
          throw new Error('Border compositor is unavailable.');
        }
        return {
          canvas,
          context: surface,
          release() {
            canvas.width = canvas.height = 0;
          },
        };
      },
    },
    context.getTransform()
  );
}
