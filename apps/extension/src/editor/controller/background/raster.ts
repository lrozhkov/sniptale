import { FabricImage, StaticCanvas, type FabricObject } from 'fabric';
import {
  normalizePaintColor,
  sampleGradient,
  type LinearGradient,
} from '@sniptale/foundation/paint';
import type { EditorFrameSettings } from '../../../features/editor/document/types';

import type { BackgroundCanvasSize } from './geometry';

const MAX_BACKGROUND_RASTER_EDGE = 2048;
const MAX_BACKGROUND_RASTER_PIXELS = 4_194_304;

export function resolveBackgroundRasterSize(size: BackgroundCanvasSize): BackgroundCanvasSize {
  const edgeScale = Math.min(1, MAX_BACKGROUND_RASTER_EDGE / Math.max(size.width, size.height));
  const pixelScale = Math.min(
    1,
    Math.sqrt(MAX_BACKGROUND_RASTER_PIXELS / (size.width * size.height))
  );
  const scale = Math.min(edgeScale, pixelScale);
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  };
}

function drawEdgeSafeSource(
  context: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  padding: number
): void {
  const width = source.width;
  const height = source.height;
  context.drawImage(source, padding, padding);
  context.drawImage(source, 0, 0, 1, height, 0, padding, padding, height);
  context.drawImage(source, width - 1, 0, 1, height, padding + width, padding, padding, height);
  context.drawImage(source, 0, 0, width, 1, padding, 0, width, padding);
  context.drawImage(source, 0, height - 1, width, 1, padding, padding + height, width, padding);
  context.drawImage(source, 0, 0, 1, 1, 0, 0, padding, padding);
  context.drawImage(source, width - 1, 0, 1, 1, padding + width, 0, padding, padding);
  context.drawImage(source, 0, height - 1, 1, 1, 0, padding + height, padding, padding);
  context.drawImage(
    source,
    width - 1,
    height - 1,
    1,
    1,
    padding + width,
    padding + height,
    padding,
    padding
  );
}

export function rasterizeBlurredBackground(options: {
  amount: number;
  object: FabricObject;
  rasterSize: BackgroundCanvasSize;
  targetSize: BackgroundCanvasSize;
}): FabricObject {
  const source = document.createElement('canvas');
  source.width = options.rasterSize.width;
  source.height = options.rasterSize.height;
  const renderer = new StaticCanvas(source, {
    height: options.rasterSize.height,
    renderOnAddRemove: false,
    width: options.rasterSize.width,
  });
  renderer.add(options.object);
  renderer.renderAll();

  const scale = Math.min(
    1,
    options.rasterSize.width / options.targetSize.width,
    options.rasterSize.height / options.targetSize.height
  );
  const blur = Math.max(0, options.amount * scale);
  const padding = Math.max(1, Math.ceil(blur * 2));
  const padded = document.createElement('canvas');
  padded.width = source.width + padding * 2;
  padded.height = source.height + padding * 2;
  const paddedContext = padded.getContext('2d');
  if (!paddedContext) {
    void renderer.dispose();
    throw new Error('Editor background raster context is unavailable');
  }
  drawEdgeSafeSource(paddedContext, source, padding);

  const output = document.createElement('canvas');
  output.width = source.width;
  output.height = source.height;
  const outputContext = output.getContext('2d');
  if (!outputContext) {
    void renderer.dispose();
    throw new Error('Editor background blur context is unavailable');
  }
  outputContext.filter = `blur(${blur}px)`;
  outputContext.drawImage(padded, -padding, -padding);
  outputContext.filter = 'none';
  void renderer.dispose();

  const image = new FabricImage(output, {
    height: output.height,
    left: 0,
    originX: 'left',
    originY: 'top',
    scaleX: options.targetSize.width / output.width,
    scaleY: options.targetSize.height / output.height,
    strokeWidth: 0,
    top: 0,
    width: output.width,
  });
  const getSrc = image.getSrc.bind(image);
  let encoded: string | undefined;
  // This owner never mutates the completed raster; changed backgrounds create a new image.
  image.getSrc = (filtered) => {
    const element = filtered ? image.getElement() : image._originalElement;
    if (element !== output) return getSrc(filtered);
    encoded ??= getSrc(filtered);
    return encoded;
  };
  return image;
}

function resolveRepeatedGradientPosition(gradient: LinearGradient, position: number): number {
  if (!gradient.repeat.enabled) return position;
  const first = gradient.stops[0]!.position;
  const last = gradient.stops.at(-1)!.position;
  const period = (last - first) * gradient.repeat.span;
  return period > 0
    ? first +
        ((((position - first * gradient.repeat.span) % period) + period) % period) /
          gradient.repeat.span
    : last;
}

function createGradientColorLookup(gradient: LinearGradient, steps: number): Uint8ClampedArray {
  const colors = new Uint8ClampedArray((steps + 1) * 4);
  for (let index = 0; index <= steps; index++) {
    const position = resolveRepeatedGradientPosition(gradient, index / steps);
    const color = normalizePaintColor(sampleGradient(gradient, position))!;
    for (let channel = 0; channel < 4; channel++) {
      colors[index * 4 + channel] = Number.parseInt(
        color.slice(1 + channel * 2, 3 + channel * 2),
        16
      );
    }
  }
  return colors;
}

function paintGradientRaster(
  image: ImageData,
  size: BackgroundCanvasSize,
  gradient: LinearGradient
): void {
  const angle = ((gradient.angle - 90) * Math.PI) / 180;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const length = Math.abs(dx) * size.width + Math.abs(dy) * size.height;
  // Quarter-raster-pixel lookup resolution bounds work independently of canvas area.
  const steps = Math.max(1, Math.ceil(length * 4));
  const colors = createGradientColorLookup(gradient, steps);
  for (let y = 0; y < size.height; y++) {
    for (let x = 0; x < size.width; x++) {
      const position =
        0.5 + ((x + 0.5 - size.width / 2) * dx + (y + 0.5 - size.height / 2) * dy) / length;
      const sample = Math.max(0, Math.min(steps, Math.round(position * steps))) * 4;
      const pixel = (y * size.width + x) * 4;
      image.data[pixel] = colors[sample]!;
      image.data[pixel + 1] = colors[sample + 1]!;
      image.data[pixel + 2] = colors[sample + 2]!;
      image.data[pixel + 3] = colors[sample + 3]!;
    }
  }
}

/** Render complete linear gradients within the existing background raster budget. */
export function createAdvancedBackgroundImage(
  size: BackgroundCanvasSize,
  frame: EditorFrameSettings
): FabricImage | null {
  const gradient = frame.backgroundGradient;
  if (
    !gradient ||
    (gradient.interpolation === 'srgb' &&
      !gradient.repeat.enabled &&
      gradient.stops.every((stop) => stop.midpoint === 0.5))
  )
    return null;
  const raster = resolveBackgroundRasterSize(size);
  const source = document.createElement('canvas');
  source.width = raster.width;
  source.height = raster.height;
  const context = source.getContext('2d');
  if (!context) throw new Error('Editor gradient raster context is unavailable');
  const image = context.createImageData(source.width, source.height);
  paintGradientRaster(image, raster, gradient);
  context.putImageData(image, 0, 0);
  return new FabricImage(source, {
    left: 0,
    top: 0,
    originX: 'left',
    originY: 'top',
    strokeWidth: 0,
    scaleX: size.width / source.width,
    scaleY: size.height / source.height,
  });
}
