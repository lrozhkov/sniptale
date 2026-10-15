import type {
  RenderResources,
  RenderCanvasLease,
} from '../../features/video/composition/canvas/render-resources';
import type { QuickEditBorderFrame } from '../../features/video/review/advanced/border';
import type { QuickEditRect } from '../../features/video/review/advanced/scene';

/** The same Canvas stroke adapter paints inspector, stage and encoded frames. */
export function drawReviewBorders(
  context: CanvasRenderingContext2D,
  output: { width: number; height: number },
  frames: readonly QuickEditBorderFrame[],
  clip?: { rect: QuickEditRect; radius: number },
  resources?: RenderResources
) {
  if (!frames.length) return;
  const layerLease = acquireBorderSurface('border-layer', output, resources);
  let maskLease: RenderCanvasLease | undefined;
  try {
    maskLease = acquireBorderSurface('border-mask', output, resources);
    paintBorders(context, frames, clip, layerLease, maskLease);
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
  resources: RenderResources | undefined
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
  frames: readonly QuickEditBorderFrame[],
  clip: { rect: QuickEditRect; radius: number } | undefined,
  layerLease: RenderCanvasLease,
  maskLease: RenderCanvasLease
) {
  const { canvas: layer, context: stroke } = layerLease;
  const { canvas: mask, context: reveal } = maskLease;
  context.save();
  try {
    if (clip) {
      context.beginPath();
      stroke.lineCap = 'butt';
      context.roundRect(clip.rect.x, clip.rect.y, clip.rect.width, clip.rect.height, clip.radius);
      context.clip();
    }
    for (const frame of frames) {
      const span = frame.end - frame.start;
      const length = span >= 1 - 1e-9 ? 1 : Math.max(0, span);
      if (!length || !frame.opacity) continue;
      stroke.clearRect(0, 0, layer.width, layer.height);
      stroke.save();
      try {
        const path = new Path2D(frame.path);
        stroke.lineWidth = frame.width;
        stroke.strokeStyle = frame.color;
        stroke.lineCap = frame.style === 'dotted' ? 'round' : 'butt';
        // A closed contour needs whole pattern repeats; otherwise its join cuts a dash
        // on every rotation. Preserve the dash/gap ratio while fitting the perimeter.
        const nominalPitch = frame.width * (frame.style === 'dashed' ? 5 : 2);
        const repeats = Math.max(1, Math.round(frame.perimeter / nominalPitch));
        const pitch = frame.perimeter / repeats;
        // A tiny nonzero dot avoids duplicate round caps at the closed-path seam.
        const dotLength = Math.min(0.01, pitch / 2);
        stroke.setLineDash(
          frame.style === 'dashed'
            ? [pitch * 0.6, pitch * 0.4]
            : frame.style === 'dotted'
              ? [dotLength, pitch - dotLength]
              : []
        );
        stroke.lineDashOffset = frame.dashOffset ?? 0;
        if (length < 1 && frame.style === 'solid') {
          // Native segment caps stay round; a reveal mask would slice them flat.
          stroke.lineCap = 'round';
          stroke.setLineDash([length * frame.perimeter, (1 - length) * frame.perimeter]);
          stroke.lineDashOffset = -frame.start * frame.perimeter;
        }
        stroke.stroke(path);
        if (length < 1 && frame.style !== 'solid') {
          // Reveal clipping and the traveling pattern have independent, sampled phases.
          reveal.clearRect(0, 0, mask.width, mask.height);
          reveal.lineCap = 'butt';
          reveal.lineWidth = frame.width + 2;
          reveal.strokeStyle = '#ffffff';
          reveal.setLineDash([length * frame.perimeter, (1 - length) * frame.perimeter]);
          reveal.lineDashOffset = -frame.start * frame.perimeter;
          reveal.stroke(path);
          stroke.globalCompositeOperation = 'destination-in';
          stroke.drawImage(mask, 0, 0);
        }
      } finally {
        stroke.restore();
      }
      context.globalAlpha = frame.opacity;
      context.drawImage(layer, 0, 0);
    }
  } finally {
    context.restore();
  }
}
