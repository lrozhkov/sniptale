import type {
  EffectRuntimeGpuPaint,
  EffectRuntimeGpuPaintColor,
} from '../../../../contracts/effect-runtime/gpu-plan';

/** Materialize admitted contents once per slot revision; the GPU owner retains this raster through completion. */
export function rasterizeGpuPreviewPaint(source: {
  width: number;
  height: number;
  paint: EffectRuntimeGpuPaint;
}): OffscreenCanvas {
  const canvas = new OffscreenCanvas(source.width, source.height);
  try {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('GPU paint context is unavailable.');
    const paint = source.paint;
    for (const clip of paint.clips ?? []) {
      context.setTransform(...clip.transform);
      context.beginPath();
      context.rect(clip.rect.x, clip.rect.y, clip.rect.width, clip.rect.height);
      context.clip();
    }
    context.beginPath();
    context.fillStyle = paintColor(context, paint.style.fill);
    context.strokeStyle = paintColor(context, paint.style.stroke);
    context.font = paint.style.font;
    context.lineWidth = paint.style.lineWidth;
    context.lineCap = paint.style.lineCap;
    context.lineJoin = paint.style.lineJoin;
    context.miterLimit = paint.style.miterLimit;
    context.textAlign = paint.style.textAlign;
    context.textBaseline = paint.style.textBaseline;
    context.direction = paint.style.direction;
    context.setTransform(...paint.transform);
    // Build after style setup; redundant CTM writes can change native fill coverage.
    paintPath(context, paint);
    const last = paint.path.at(-1)?.transform;
    if (last && !last.every((value, index) => value === paint.transform[index]))
      context.setTransform(...paint.transform);
    paintDraw(context, paint);
    return canvas;
  } catch (error) {
    canvas.width = canvas.height = 0;
    throw error;
  }
}

function paintPath(context: OffscreenCanvasRenderingContext2D, paint: EffectRuntimeGpuPaint) {
  for (const item of paint.path) {
    context.setTransform(...item.transform);
    const a = item.args as number[];
    switch (item.op) {
      case 'moveTo':
        context.moveTo(a[0]!, a[1]!);
        break;
      case 'lineTo':
        context.lineTo(a[0]!, a[1]!);
        break;
      case 'quadraticCurveTo':
        context.quadraticCurveTo(a[0]!, a[1]!, a[2]!, a[3]!);
        break;
      case 'bezierCurveTo':
        context.bezierCurveTo(a[0]!, a[1]!, a[2]!, a[3]!, a[4]!, a[5]!);
        break;
      case 'rect':
        context.rect(a[0]!, a[1]!, a[2]!, a[3]!);
        break;
      case 'roundRect':
        context.roundRect(a[0]!, a[1]!, a[2]!, a[3]!, a[4]!);
        break;
      case 'arc':
        context.arc(a[0]!, a[1]!, a[2]!, a[3]!, a[4]!, Boolean(a[5]));
        break;
      case 'arcTo':
        context.arcTo(a[0]!, a[1]!, a[2]!, a[3]!, a[4]!);
        break;
      case 'ellipse':
        context.ellipse(a[0]!, a[1]!, a[2]!, a[3]!, a[4]!, a[5]!, a[6]!, Boolean(a[7]));
        break;
      case 'closePath':
        context.closePath();
        break;
    }
  }
}

function paintColor(context: OffscreenCanvasRenderingContext2D, value: EffectRuntimeGpuPaintColor) {
  if (typeof value === 'string') return value;
  context.setTransform(...value.transform);
  const a = value.args;
  const gradient =
    value.kind === 'linear'
      ? context.createLinearGradient(a[0]!, a[1]!, a[2]!, a[3]!)
      : context.createRadialGradient(a[0]!, a[1]!, a[2]!, a[3]!, a[4]!, a[5]!);
  for (const [offset, stop] of value.stops) gradient.addColorStop(offset, stop);
  return gradient;
}

function paintDraw(context: OffscreenCanvasRenderingContext2D, paint: EffectRuntimeGpuPaint) {
  const a = paint.draw.args;
  switch (paint.draw.op) {
    case 'fill':
      context.fill(a[0] as CanvasFillRule);
      break;
    case 'stroke':
      context.stroke();
      break;
    case 'fillRect':
      context.fillRect(a[0] as number, a[1] as number, a[2] as number, a[3] as number);
      break;
    case 'fillText':
      context.fillText(a[0] as string, a[1] as number, a[2] as number, a[3] as number | undefined);
      break;
  }
}
