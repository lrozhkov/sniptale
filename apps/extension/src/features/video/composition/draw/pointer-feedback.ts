import { drawOpticalGlass } from './optical-lens';
import type { ReviewClickFrame } from '../../review/click-animation';

/** Original media pixels in the same coordinate plane as the feedback frame. */
export interface PointerFeedbackSource {
  rect: { x: number; y: number; width: number; height: number };
  draw(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number
  ): void;
}

/** Paint one pixel-space frame with the caller's existing layer opacity and clip. */
export function drawPointerFeedbackFrame(
  context: CanvasRenderingContext2D,
  frame: ReviewClickFrame,
  source?: PointerFeedbackSource
): void {
  if (frame.effect === 'magnify') {
    if (source && frame.lens) drawLens(context, frame, source);
    return;
  }
  context.save();
  try {
    const { x, y } = frame.point;
    const radius = Math.max(0.01, frame.radius);
    context.globalAlpha *= frame.opacity;
    context.strokeStyle = frame.color;
    context.fillStyle = frame.color;
    context.lineWidth = frame.stroke;
    if (frame.path?.length) {
      context.beginPath();
      frame.path.forEach((point, index) => {
        if (index === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      });
      context.stroke();
    }
    if (frame.area)
      context.strokeRect(frame.area.x, frame.area.y, frame.area.width, frame.area.height);
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    if (frame.effect === 'ripple') context.stroke();
    else {
      if (frame.effect === 'glow') {
        const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, frame.color);
        gradient.addColorStop(1, 'transparent');
        context.fillStyle = gradient;
      }
      context.fill();
    }
  } finally {
    context.restore();
  }
}

function drawLens(
  context: CanvasRenderingContext2D,
  frame: ReviewClickFrame,
  source: PointerFeedbackSource
) {
  const lens = frame.lens!;
  const { x, y } = frame.point;
  const radius = frame.radius;
  if (radius <= 0 || lens.scale <= 1) return;
  context.save();
  const layerOpacity = context.globalAlpha;
  try {
    context.beginPath();
    context.rect(source.rect.x, source.rect.y, source.rect.width, source.rect.height);
    context.clip();
    const traceLens = () => {
      context.beginPath();
      if (lens.shape === 'circle') context.arc(x, y, radius, 0, Math.PI * 2);
      else context.roundRect(x - radius, y - radius, radius * 2, radius * 2, radius * 0.18);
    };
    traceLens();
    context.save();
    try {
      context.shadowColor = `rgba(0,0,0,${lens.shadow / 100})`;
      context.shadowBlur = radius * 0.16;
      context.shadowOffsetY = radius * 0.04;
      context.fillStyle = '#000';
      context.fill();
    } finally {
      context.restore();
    }
    context.save();
    try {
      context.clip();
      const sharp = () =>
        source.draw(
          context,
          x + (source.rect.x - x) * lens.scale,
          y + (source.rect.y - y) * lens.scale,
          source.rect.width * lens.scale,
          source.rect.height * lens.scale
        );
      if (lens.optics === 'optical') {
        const bounds = { x: x - radius, y: y - radius, width: radius * 2, height: radius * 2 };
        drawOpticalGlass(
          context,
          bounds,
          lens.scale,
          lens.shape === 'circle' ? 'circle' : 0.18,
          (sample) =>
            source.draw(
              sample,
              source.rect.x - bounds.x,
              source.rect.y - bounds.y,
              source.rect.width,
              source.rect.height
            ),
          sharp,
          lens.edgeWidth
        );
      } else sharp();
    } finally {
      context.restore();
    }
    // Canvas paths survive save/restore; the media sampler can replace the current path.
    traceLens();
    context.globalAlpha = layerOpacity * frame.opacity;
    context.strokeStyle = frame.color;
    context.lineWidth = frame.stroke;
    context.stroke();
  } finally {
    context.restore();
  }
}
