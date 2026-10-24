import { warpOpticalPixels } from './pointer-feedback';
import type { SceneSpotlightFrame } from '../scene-spotlight';

type Rect = SceneSpotlightFrame['opening'];

/** Paint original scene pixels inside a caller-owned lens clip. */
export function drawSceneLens(
  context: CanvasRenderingContext2D,
  source: HTMLCanvasElement | OffscreenCanvas,
  bounds: Rect,
  lens: NonNullable<SceneSpotlightFrame['lens']>
): void {
  if (lens.scale <= 1 || bounds.width <= 0 || bounds.height <= 0) return;
  if (lens.optics === 'flat') {
    drawFlatLens(context, source, bounds, lens.scale);
    return;
  }
  try {
    if (drawOpticalLens(context, source, bounds, lens.scale)) return;
  } catch {
    // A tainted or unavailable readback affects only this lens frame.
  }
  drawFlatLens(context, source, bounds, lens.scale);
}

function drawFlatLens(
  context: CanvasRenderingContext2D,
  source: HTMLCanvasElement | OffscreenCanvas,
  bounds: Rect,
  scale: number
) {
  const input = document.createElement('canvas');
  input.width = Math.max(1, Math.ceil(bounds.width));
  input.height = Math.max(1, Math.ceil(bounds.height));
  try {
    const sample = input.getContext('2d');
    if (!sample) return;
    const width = bounds.width / scale;
    const height = bounds.height / scale;
    sample.drawImage(
      source,
      bounds.x + (bounds.width - width) / 2,
      bounds.y + (bounds.height - height) / 2,
      width,
      height,
      0,
      0,
      input.width,
      input.height
    );
    context.drawImage(input, bounds.x, bounds.y, bounds.width, bounds.height);
  } finally {
    input.width = input.height = 0;
  }
}

/** Pixel work is capped independently of export resolution. */
function drawOpticalLens(
  context: CanvasRenderingContext2D,
  source: HTMLCanvasElement | OffscreenCanvas,
  bounds: Rect,
  scale: number
): boolean {
  const side = Math.max(1, Math.min(160, Math.ceil(Math.max(bounds.width, bounds.height))));
  const input = document.createElement('canvas');
  const output = document.createElement('canvas');
  input.width = input.height = output.width = output.height = side;
  try {
    const sample = input.getContext('2d', { willReadFrequently: true });
    const result = output.getContext('2d');
    if (!sample || !result) return false;
    sample.drawImage(source, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, side, side);
    const pixels = sample.getImageData(0, 0, side, side);
    const warped = result.createImageData(side, side);
    warpOpticalPixels(pixels.data, warped.data, side, side / 2, scale, 'rect');
    result.putImageData(warped, 0, 0);
    context.drawImage(output, bounds.x, bounds.y, bounds.width, bounds.height);
    return true;
  } finally {
    input.width = input.height = output.width = output.height = 0;
  }
}
