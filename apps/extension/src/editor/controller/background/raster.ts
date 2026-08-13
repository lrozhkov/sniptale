import { FabricImage, StaticCanvas, type FabricObject } from 'fabric';

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

  return new FabricImage(output, {
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
}
