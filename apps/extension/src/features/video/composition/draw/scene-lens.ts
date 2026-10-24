import { drawOpticalGlass } from './optical-lens';
import type { SceneSpotlightFrame } from '../scene-spotlight';

type Rect = SceneSpotlightFrame['opening'];

/** Paint original scene pixels inside a caller-owned lens clip. */
export function drawSceneLens(
  context: CanvasRenderingContext2D,
  source: HTMLCanvasElement | OffscreenCanvas,
  bounds: Rect,
  lens: NonNullable<SceneSpotlightFrame['lens']>,
  radius = 0
): void {
  if (lens.scale <= 1 || bounds.width <= 0 || bounds.height <= 0) return;
  if (lens.optics === 'flat') {
    drawFlatLens(context, source, bounds, lens.scale);
    return;
  }
  drawOpticalGlass(
    context,
    bounds,
    lens.scale,
    Math.min(1, radius / (Math.min(bounds.width, bounds.height) / 2)),
    (sample) =>
      sample.drawImage(
        source,
        bounds.x,
        bounds.y,
        bounds.width,
        bounds.height,
        0,
        0,
        bounds.width,
        bounds.height
      ),
    () => drawFlatLens(context, source, bounds, lens.scale),
    lens.edgeWidth
  );
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
