import type { Locator } from '@playwright/test';

type Point = { x: number; y: number };

// Read the actual painted document canvas, independently of the SVG feedback and selection layer.
export async function inkBounds(surface: Locator) {
  return surface
    .locator('canvas.sniptale-drawing-canvas')
    .first()
    .evaluate((node) => {
      if (!(node instanceof HTMLCanvasElement)) throw new Error('Drawing document canvas missing');
      const rect = node.getBoundingClientRect();
      const context = node.getContext('2d');
      if (!context) throw new Error('Drawing document context missing');
      const data = context.getImageData(0, 0, node.width, node.height).data;
      let left = node.width,
        top = node.height,
        right = -1,
        bottom = -1;
      for (let y = 0; y < node.height; y++)
        for (let x = 0; x < node.width; x++) {
          if (data[(y * node.width + x) * 4 + 3]! < 80) continue;
          left = Math.min(left, x);
          right = Math.max(right, x);
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
        }
      const scale = node.width / rect.width;
      return {
        hasInk: right >= 0,
        left: rect.x + left / scale,
        top: rect.y + top / scale,
        right: rect.x + (right + 1) / scale,
        bottom: rect.y + (bottom + 1) / scale,
        centerX: rect.x + (left + right + 1) / 2 / scale,
        centerY: rect.y + (top + bottom + 1) / 2 / scale,
      };
    });
}

export async function corePixels(canvas: Locator, point: Point) {
  return canvas.evaluate((node, point) => {
    if (!(node instanceof HTMLCanvasElement)) throw new Error('Drawing canvas missing');
    const bounds = node.getBoundingClientRect();
    const scaleX = node.width / bounds.width;
    const scaleY = node.height / bounds.height;
    const data = node
      .getContext('2d')!
      .getImageData(
        Math.round((point.x - bounds.x - 1) * scaleX),
        Math.round((point.y - bounds.y - 1) * scaleY),
        Math.max(1, Math.round(3 * scaleX)),
        Math.max(1, Math.round(3 * scaleY))
      ).data;
    let blue = 0,
      painted = 0;
    for (let offset = 0; offset < data.length; offset += 4) {
      if (data[offset + 3]! < 100) continue;
      painted++;
      if (data[offset + 2]! > data[offset]! + 40) blue++;
    }
    return { blue, painted };
  }, point);
}

export async function paintedRegion(
  surface: Locator,
  region: { x: number; y: number; width: number; height: number }
) {
  return surface
    .locator('canvas.sniptale-drawing-canvas')
    .first()
    .evaluate((node, region) => {
      if (!(node instanceof HTMLCanvasElement)) throw new Error('Drawing document canvas missing');
      const rect = node.getBoundingClientRect();
      const scale = node.width / rect.width;
      const x0 = Math.max(0, Math.floor((region.x - rect.x) * scale));
      const y0 = Math.max(0, Math.floor((region.y - rect.y) * scale));
      const width = Math.min(node.width - x0, Math.ceil(region.width * scale));
      const height = Math.min(node.height - y0, Math.ceil(region.height * scale));
      const data = node.getContext('2d')!.getImageData(x0, y0, width, height).data;
      let left = width,
        top = height,
        right = -1,
        bottom = -1;
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          if (data[(y * width + x) * 4 + 3]! < 80) continue;
          left = Math.min(left, x);
          right = Math.max(right, x);
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
        }
      return {
        hasInk: right >= 0,
        left: rect.x + (x0 + left) / scale,
        top: rect.y + (y0 + top) / scale,
        width: (right - left + 1) / scale,
        height: (bottom - top + 1) / scale,
        centerX: rect.x + (x0 + (left + right + 1) / 2) / scale,
        centerY: rect.y + (y0 + (top + bottom + 1) / 2) / scale,
      };
    }, region);
}

export async function measuredSpans(guides: Locator, kind: 'gap' | 'dimension') {
  return guides.locator(`[data-relation-kind="${kind}"]`).evaluateAll((nodes) =>
    nodes
      .map((node) => {
        if (!(node instanceof SVGGraphicsElement)) throw new Error('Relation group missing');
        const line = node.querySelector('polyline');
        if (!line) throw new Error('Relation span missing');
        const points = line.points;
        const matrix = line.getScreenCTM();
        if (!matrix) throw new Error('Relation projection missing');
        const from = new DOMPoint(points[0]!.x, points[0]!.y).matrixTransform(matrix);
        const to = new DOMPoint(points[1]!.x, points[1]!.y).matrixTransform(matrix);
        return {
          axis: node.getAttribute('data-relation-axis'),
          from: { x: from.x, y: from.y },
          to: { x: to.x, y: to.y },
          label: node.querySelector('text')?.textContent,
          caps: node.querySelectorAll('polyline').length,
          visibility: getComputedStyle(node).visibility,
          opacity: getComputedStyle(node).opacity,
        };
      })
      .sort((a, b) => a.from.x - b.from.x || a.from.y - b.from.y)
  );
}
