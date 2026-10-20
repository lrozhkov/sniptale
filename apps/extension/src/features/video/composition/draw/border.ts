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
  const layerLease = acquireBorderSurface('border-layer', output, resources);
  let maskLease: RenderCanvasLease | undefined;
  try {
    maskLease = acquireBorderSurface('border-mask', output, resources);
    paintBorders(context, frames, clip, layerLease, maskLease, transform);
  } finally {
    try {
      maskLease?.release();
    } finally {
      layerLease.release();
    }
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
  transform: DOMMatrix2DInit | undefined
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
    for (const frame of frames) {
      const span = frame.end - frame.start;
      const length = span >= 1 - 1e-9 ? 1 : Math.max(0, span);
      if (!length || !frame.opacity) continue;
      rasterizeBorderFrame(layerLease, maskLease, frame, length, transform);
      context.globalAlpha = inheritedOpacity * frame.opacity;
      context.drawImage(layerLease.canvas, 0, 0);
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
  length: number
) {
  stroke.lineWidth = frame.width;
  stroke.strokeStyle = frame.color;
  stroke.lineCap = frame.style === 'dotted' ? 'round' : 'butt';
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
  radius = 0
): void {
  if (!states?.length || window.width <= 0 || window.height <= 0) return;
  const frames = states.flatMap((state) => sampleSceneBorder({ ...state, window, scale }));
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
