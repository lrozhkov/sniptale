import type { RenderResources } from '../../composition/canvas/render-resources';
import { getColorAlpha } from '@sniptale/foundation/color';
import { sampleGradient, type Gradient } from '@sniptale/foundation/paint';

interface GradientRaster {
  backing: { width: number; height: number };
  resources: RenderResources;
}

interface ColorStop {
  position: number;
  color: string;
}

function sampleStops(gradient: Gradient): ColorStop[] {
  const result: ColorStop[] = [];
  gradient.stops.forEach((stop, index) => {
    result.push({ position: stop.position, color: stop.color });
    const next = gradient.stops[index + 1];
    if (!next || next.position === stop.position) return;
    const nativeInterpolation =
      gradient.interpolation === 'srgb' &&
      stop.midpoint === 0.5 &&
      getColorAlpha(stop.color) === getColorAlpha(next.color);
    const steps = nativeInterpolation ? 1 : 64;
    for (let step = 1; step < steps; step++) {
      const amount = step / steps;
      const position = amount ** (Math.log(stop.midpoint) / Math.log(0.5));
      result.push({
        position: stop.position + position * (next.position - stop.position),
        color: sampleGradient(
          { ...gradient, stops: [stop, next] },
          stop.position + position * (next.position - stop.position)
        ),
      });
    }
  });
  return result;
}

function repeatPosition(gradient: Gradient, position: number) {
  if (!gradient.repeat.enabled) return position;
  const first = gradient.stops[0]!.position;
  const period = gradient.stops.at(-1)!.position - first;
  if (period <= 0) return first;
  const relative = position / gradient.repeat.span - first;
  return first + (((relative % period) + period) % period);
}

function createCanvasStops(gradient: Gradient, extent: number): ColorStop[] | null {
  const stops = sampleStops(gradient);
  if (!gradient.repeat.enabled) {
    return stops.map((stop) => ({ ...stop, position: stop.position / extent }));
  }
  const span = gradient.repeat.span;
  const first = gradient.stops[0]!.position * span;
  const period = (gradient.stops.at(-1)!.position - gradient.stops[0]!.position) * span;
  if (period <= 0) return [{ position: 0, color: gradient.stops.at(-1)!.color }];
  const start = Math.floor(-first / period);
  const end = Math.ceil((extent - first) / period);
  // Dense repeats use a pixel-bounded raster path, never an unbounded stop expansion.
  if ((end - start + 1) * stops.length > 2048) return null;
  const result: ColorStop[] = [
    { position: 0, color: sampleGradient(gradient, repeatPosition(gradient, 0)) },
  ];
  for (let cycle = start; cycle <= end; cycle++) {
    for (const stop of stops) {
      const position = (stop.position * span + cycle * period) / extent;
      if (position >= 0 && position <= 1) result.push({ position, color: stop.color });
    }
  }
  result.push({ position: 1, color: sampleGradient(gradient, repeatPosition(gradient, extent)) });
  return result;
}

function linearGeometry(
  gradient: Extract<Gradient, { type: 'linear' }>,
  width: number,
  height: number
) {
  const angle = (gradient.angle * Math.PI) / 180;
  const x = Math.sin(angle),
    y = -Math.cos(angle);
  const length = Math.abs(width * x) + Math.abs(height * y);
  return { x, y, length };
}

function radialExtent(gradient: Extract<Gradient, { type: 'radial' }>) {
  if (!gradient.repeat.enabled) return 1;
  const x = Math.max(gradient.center.x, 1 - gradient.center.x) / gradient.radius.x;
  const y = Math.max(gradient.center.y, 1 - gradient.center.y) / gradient.radius.y;
  return Math.hypot(x, y);
}

/** Draws canonical product gradients in the preview and export Canvas2D pipeline. */
export function drawSceneGradient(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  gradient: Gradient,
  width: number,
  height: number,
  raster?: GradientRaster
) {
  const extent = gradient.type === 'radial' ? radialExtent(gradient) : 1;
  const stops = createCanvasStops(gradient, extent);
  if (!stops) {
    if (raster) drawManagedDenseGradient(context, gradient, width, height, raster);
    else drawDenseGradient(context, gradient, width, height);
    return;
  }
  context.save();
  let fill: CanvasGradient;
  switch (gradient.type) {
    case 'linear': {
      const line = linearGeometry(gradient, width, height);
      fill = context.createLinearGradient(
        width / 2 - (line.x * line.length) / 2,
        height / 2 - (line.y * line.length) / 2,
        width / 2 + (line.x * line.length) / 2,
        height / 2 + (line.y * line.length) / 2
      );
      break;
    }
    case 'radial':
      context.translate(gradient.center.x * width, gradient.center.y * height);
      context.scale(gradient.radius.x * width, gradient.radius.y * height);
      fill = context.createRadialGradient(0, 0, 0, 0, 0, extent);
      break;
    case 'conic':
      fill = context.createConicGradient(
        ((gradient.startAngle - 90) * Math.PI) / 180,
        gradient.center.x * width,
        gradient.center.y * height
      );
  }
  for (const stop of stops) fill.addColorStop(stop.position, stop.color);
  context.fillStyle = fill;
  if (gradient.type === 'radial') {
    context.fillRect(
      -gradient.center.x / gradient.radius.x,
      -gradient.center.y / gradient.radius.y,
      1 / gradient.radius.x,
      1 / gradient.radius.y
    );
  } else context.fillRect(0, 0, width, height);
  context.restore();
}

function createColorTable(gradient: Gradient) {
  const table = new Uint8ClampedArray(4097 * 4);
  for (let index = 0; index <= 4096; index++) {
    const color = sampleGradient(gradient, index / 4096);
    for (let channel = 0; channel < 4; channel++) {
      table[index * 4 + channel] = Number.parseInt(
        color.slice(1 + channel * 2, 3 + channel * 2),
        16
      );
    }
  }
  return table;
}

function createPositionSampler(gradient: Gradient, width: number, height: number) {
  if (gradient.type === 'linear') {
    const line = linearGeometry(gradient, width, height);
    return (x: number, y: number) =>
      ((x - width / 2) * line.x + (y - height / 2) * line.y) / line.length + 0.5;
  }
  const cx = gradient.center.x * width,
    cy = gradient.center.y * height;
  if (gradient.type === 'radial') {
    const rx = gradient.radius.x * width,
      ry = gradient.radius.y * height;
    return (x: number, y: number) => Math.hypot((x - cx) / rx, (y - cy) / ry);
  }
  return (x: number, y: number) => {
    const angle = Math.atan2(x - cx, -(y - cy)) / (2 * Math.PI) - gradient.startAngle / 360;
    return ((angle % 1) + 1) % 1;
  };
}

function drawDenseGradient(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  gradient: Gradient,
  width: number,
  height: number
) {
  const rasterWidth = Math.max(1, Math.ceil(width));
  const rasterHeight = Math.max(1, Math.ceil(height));
  const buffer = new OffscreenCanvas(rasterWidth, rasterHeight);
  const output = buffer.getContext('2d');
  if (!output) return;
  const pixels = output.createImageData(rasterWidth, rasterHeight);
  const table = createColorTable(gradient);
  paintDensePixels(
    pixels.data,
    table,
    gradient,
    rasterWidth,
    rasterHeight,
    rasterWidth,
    rasterHeight
  );
  output.putImageData(pixels, 0, 0);
  context.drawImage(buffer, 0, 0, width, height);
}

/** Managed backing samples the canonical gradient, including anisotropic raster scaling. */
function drawManagedDenseGradient(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  gradient: Gradient,
  width: number,
  height: number,
  raster: GradientRaster
) {
  const { width: rasterWidth, height: rasterHeight } = raster.backing;
  const pixelBytes = rasterWidth * rasterHeight * 4;
  if (
    ![rasterWidth, rasterHeight].every((value) => Number.isSafeInteger(value) && value > 0) ||
    !Number.isSafeInteger(pixelBytes) ||
    ![width, height].every((value) => Number.isFinite(value) && value > 0)
  )
    throw new Error('Invalid managed gradient raster');
  const canvas = raster.resources.canvas('gradient-dense', raster.backing);
  try {
    const imageBytes = raster.resources.bytes('gradient-pixels', pixelBytes);
    try {
      const tableBytes = raster.resources.bytes('gradient-colors', 4097 * 4);
      try {
        const pixels = canvas.context.createImageData(rasterWidth, rasterHeight);
        const table = createColorTable(gradient);
        paintDensePixels(pixels.data, table, gradient, rasterWidth, rasterHeight, width, height);
        canvas.context.putImageData(pixels, 0, 0);
        context.drawImage(canvas.canvas, 0, 0, width, height);
      } finally {
        tableBytes.release();
      }
    } finally {
      imageBytes.release();
    }
  } finally {
    canvas.release();
  }
}

function paintDensePixels(
  pixels: Uint8ClampedArray,
  table: Uint8ClampedArray,
  gradient: Gradient,
  rasterWidth: number,
  rasterHeight: number,
  width: number,
  height: number
) {
  const positionAt = createPositionSampler(gradient, width, height);
  for (let y = 0; y < rasterHeight; y++) {
    for (let x = 0; x < rasterWidth; x++) {
      const position = Math.max(
        0,
        Math.min(
          1,
          repeatPosition(
            gradient,
            positionAt(
              width === rasterWidth ? x + 0.5 : ((x + 0.5) * width) / rasterWidth,
              height === rasterHeight ? y + 0.5 : ((y + 0.5) * height) / rasterHeight
            )
          )
        )
      );
      const source = Math.round(position * 4096) * 4;
      const target = (y * rasterWidth + x) * 4;
      pixels[target] = table[source]!;
      pixels[target + 1] = table[source + 1]!;
      pixels[target + 2] = table[source + 2]!;
      pixels[target + 3] = table[source + 3]!;
    }
  }
}
