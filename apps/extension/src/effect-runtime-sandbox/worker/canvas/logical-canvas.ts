import type { RuntimeCanvas, RuntimeCanvasContext } from '../model/types.js';

type CanvasFactory = (width: number, height: number) => RuntimeCanvas;

type LogicalCanvas = RuntimeCanvas;

type LogicalCanvasContext = RuntimeCanvasContext;

type LogicalCanvasScale = {
  uniform: number;
  x: number;
  y: number;
};

export function createLogicalCanvasFactory({
  createCanvas,
  outputHeight,
  outputWidth,
  renderHeight,
  renderWidth,
}: {
  createCanvas: CanvasFactory;
  outputHeight: number;
  outputWidth: number;
  renderHeight: number;
  renderWidth: number;
}): CanvasFactory {
  const scaleX = normalizeScale(renderWidth, outputWidth);
  const scaleY = normalizeScale(renderHeight, outputHeight);
  return (logicalWidth, logicalHeight) => {
    const width = normalizeDimension(logicalWidth);
    const height = normalizeDimension(logicalHeight);
    const canvas = createCanvas(
      Math.max(1, Math.round(width * scaleX)),
      Math.max(1, Math.round(height * scaleY))
    );
    canvas.__sniptaleLogicalWidth = width;
    canvas.__sniptaleLogicalHeight = height;
    const context: LogicalCanvasContext | null = canvas.getContext('2d', {
      desynchronized: true,
    });
    if (context) {
      context.__sniptaleLogicalScaleX = scaleX;
      context.__sniptaleLogicalScaleY = scaleY;
    }
    context?.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    return canvas;
  };
}

export function getLogicalCanvasSize(canvas: LogicalCanvas): {
  height: number;
  width: number;
} {
  return {
    height: normalizeDimension(canvas.__sniptaleLogicalHeight ?? canvas.height),
    width: normalizeDimension(canvas.__sniptaleLogicalWidth ?? canvas.width),
  };
}

export function getLogicalCanvasScale(context: LogicalCanvasContext): LogicalCanvasScale {
  const x = normalizeContextScale(context.__sniptaleLogicalScaleX);
  const y = normalizeContextScale(context.__sniptaleLogicalScaleY);
  return { uniform: Math.sqrt(x * y), x, y };
}

function normalizeScale(renderSize: number, outputSize: number): number {
  return Math.max(0.0001, normalizeDimension(renderSize) / normalizeDimension(outputSize));
}

function normalizeDimension(value: number): number {
  return Math.max(1, Math.round(Number(value) || 1));
}

function normalizeContextScale(value: unknown): number {
  const scale = Number(value);
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}
