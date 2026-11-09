import {
  addRect,
  recognizeRepeatedSymbols,
  recognizeCircularPeers,
  horizontalSpans,
  recognizeCapsules,
  protectBorderPointers,
  recognizeFrames,
} from './control-shapes.mjs';
import {
  colorComponent,
  recognizeColoredDisc,
  recognizeLabelDisc,
  protectColoredDivider,
  recognizeFilledSquare,
  recognizeAnnulus,
  recognizeSurfaceForeground,
} from './control-surfaces.mjs';

// Detect compact flat control surfaces and compact symbols from pixels alone.
// Rectangles use exclusive right/bottom edges, as do detector boxes.
export function analyzeControls(image, scratch = null) {
  const labels = [],
    protectedRects = [],
    boundaries = [],
    icons = [],
    marks = [],
    iconSeeds = [];
  const { data, width, height } = image,
    size = width * height;
  const seen = new Uint8Array(size),
    queue = scratch && scratch.length >= size ? scratch : new Int32Array(size);
  for (let p = 0; p < size; p++) {
    if (data[p * 4] === data[p * 4 + 1] && data[p * 4] === data[p * 4 + 2]) continue;
    if (seen[p] || data[p * 4 + 3] < 128) continue;
    const i = p * 4,
      r = data[i],
      g = data[i + 1],
      b = data[i + 2],
      low = Math.min(r, g, b),
      high = Math.max(r, g, b),
      vivid = high - low >= 48 && low < 190;
    if (!vivid && !(low >= 185 && high - low >= 18)) continue;
    let base = [r, g, b];
    const { end, minX, minY, maxX, maxY } = colorComponent(
      data,
      width,
      height,
      p,
      seen,
      queue,
      base
    );
    const w = maxX - minX + 1,
      h = maxY - minY + 1,
      fill = end / (w * h);
    base = dominantComponentColor(data, queue, end);
    const component = { end, minX, minY, maxX, maxY, w, h, fill, vivid, base };
    recognizeColoredDisc(image, component, marks);
    recognizeLabelDisc(image, component, marks);
    protectColoredDivider(image, component, protectedRects);
    if (
      vivid &&
      w >= 9 &&
      w <= 20 &&
      h >= 9 &&
      h <= 20 &&
      w / h > 0.78 &&
      w / h < 1.28 &&
      fill > 0.28 &&
      fill < 0.85
    )
      iconSeeds.push({ x: minX, y: minY, w, h });
    recognizeFilledSquare(image, component, marks);
    if (recognizeAnnulus(image, component, marks)) continue;
    // A bounded flat colored surface supplies a reliable local background. Reject
    // large panels and avoid returning an entire surface as a text rectangle.
    if (w < 20 || w > 350 || h < 20 || h > 65 || w / h < 0.8 || fill < 0.5) continue;
    const rect = { x: minX, y: minY, w, h, kind: 'control' };
    if (w >= 28 && w <= 220 && w / h >= 1.3) addRect(boundaries, rect);
    if (h < 20 || w > 220) continue;
    recognizeSurfaceForeground(image, component, labels, icons);
  }
  recognizeRepeatedSymbols(image, iconSeeds, marks);
  recognizeCircularPeers(image, marks);
  const spans = horizontalSpans(image);
  recognizeCapsules(image, spans, marks);
  protectBorderPointers(image, protectedRects);
  recognizeFrames(image, spans, marks, boundaries, protectedRects, icons);
  return { labels, protected: protectedRects, boundaries, icons, marks };
}

function dominantComponentColor(data, queue, end) {
  const counts = new Map();
  for (let k = 0; k < end; k++) {
    const i = queue[k] * 4,
      key = data[i] * 65536 + data[i + 1] * 256 + data[i + 2];
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const dominant = [...counts].sort((a, b) => b[1] - a[1])[0][0];
  return [dominant >>> 16, (dominant >>> 8) & 255, dominant & 255];
}
