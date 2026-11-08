import type { SimplifyPixelSource, SimplifyPaintContext, SimplifyCanvasSource } from '../raster';

interface PaintSettings {
  content: 'text' | 'all';
  sensitivity: number;
  thickness: number;
  color: 'auto' | 'custom';
  customColor: string;
}

export const ENGINE_VERSION: string;
export function prepare(image: SimplifyPixelSource): object;
export function render(
  context: SimplifyPaintContext,
  source: SimplifyCanvasSource,
  catalog: object,
  settings: PaintSettings,
  region: { x: number; y: number; w: number; h: number }
): void;
export function paint(context: SimplifyPaintContext, box: object, settings: PaintSettings): void;

export function drawReplacement(context: SimplifyPaintContext, box: object, settings: PaintSettings): void;
