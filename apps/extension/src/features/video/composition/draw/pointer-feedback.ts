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
      if (lens.optics === 'optical') {
        drawOpticalLens(context, source, x, y, radius, lens.scale);
      } else {
        source.draw(
          context,
          x + (source.rect.x - x) * lens.scale,
          y + (source.rect.y - y) * lens.scale,
          source.rect.width * lens.scale,
          source.rect.height * lens.scale
        );
      }
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

function drawOpticalLens(
  context: CanvasRenderingContext2D,
  source: PointerFeedbackSource,
  x: number,
  y: number,
  radius: number,
  scale: number
): void {
  const diameter = radius * 2;
  // An optical lens is intentionally soft. Bound the readback and warp work for large radii.
  const side = Math.max(1, Math.min(160, Math.ceil(diameter)));
  const samplingScale = side / diameter;
  const left = x - radius;
  const top = y - radius;
  const input = document.createElement('canvas');
  const output = document.createElement('canvas');
  input.width = output.width = side;
  input.height = output.height = side;
  try {
    const inputContext = input.getContext('2d', { willReadFrequently: true });
    const outputContext = output.getContext('2d');
    if (!inputContext || !outputContext) return;
    inputContext.scale(samplingScale, samplingScale);
    source.draw(
      inputContext,
      source.rect.x - left,
      source.rect.y - top,
      source.rect.width,
      source.rect.height
    );
    const sourcePixels = inputContext.getImageData(0, 0, side, side);
    const warpedPixels = outputContext.createImageData(side, side);
    warpOpticalPixels(sourcePixels.data, warpedPixels.data, side, side / 2, scale);
    outputContext.putImageData(warpedPixels, 0, 0);
    context.drawImage(output, left, top, diameter, diameter);
  } finally {
    input.width = input.height = output.width = output.height = 0;
  }
}

/** Continuous inverse sampling prevents visible seams between magnification levels. */
export function warpOpticalPixels(
  input: Uint8ClampedArray,
  output: Uint8ClampedArray,
  side: number,
  radius: number,
  scale: number,
  profile: 'radial' | 'rect' = 'radial'
): void {
  const center = side / 2;
  for (let row = 0; row < side; row++) {
    for (let column = 0; column < side; column++) {
      const dx = column + 0.5 - center;
      const dy = row + 0.5 - center;
      const distance =
        (profile === 'radial' ? Math.hypot(dx, dy) : Math.max(Math.abs(dx), Math.abs(dy))) / radius;
      if (distance >= 1) continue;
      const falloff = 1 - distance * distance;
      const localScale = 1 + (scale - 1) * falloff * falloff;
      const sampleX = center + dx / localScale - 0.5;
      const sampleY = center + dy / localScale - 0.5;
      const x0 = Math.max(0, Math.min(side - 1, Math.floor(sampleX)));
      const y0 = Math.max(0, Math.min(side - 1, Math.floor(sampleY)));
      const x1 = Math.min(side - 1, x0 + 1);
      const y1 = Math.min(side - 1, y0 + 1);
      const xWeight = sampleX - x0;
      const yWeight = sampleY - y0;
      const target = (row * side + column) * 4;
      const upperLeft = (y0 * side + x0) * 4;
      const upperRight = (y0 * side + x1) * 4;
      const lowerLeft = (y1 * side + x0) * 4;
      const lowerRight = (y1 * side + x1) * 4;
      for (let channel = 0; channel < 4; channel++) {
        const upper =
          input[upperLeft + channel]! * (1 - xWeight) + input[upperRight + channel]! * xWeight;
        const lower =
          input[lowerLeft + channel]! * (1 - xWeight) + input[lowerRight + channel]! * xWeight;
        output[target + channel] = upper * (1 - yWeight) + lower * yWeight;
      }
    }
  }
}
