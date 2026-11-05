import { computeRaw } from './detector-raw.mjs';
import { computeGlyphMetricsAt } from './detector-glyphs.mjs';
import { normalizeTypeface as normalizeTypefaceStage } from './detector-typeface.mjs';
import { buildCatalog } from './detector-catalog.mjs';
export { sampleBackground } from './detector-background.mjs';
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
function detectRaw(
  image,
  detail = 55,
  brightPass = false,
  tileSize = 32,
  scratch = null,
  backgrounds = null
) {
  if (!brightPass || !brightCache)
    return computeRaw(image, detail, brightPass, tileSize, scratch, backgrounds, detectRaw);
  let cache = brightCache.get(image);
  if (!cache) {
    cache = new Map();
    brightCache.set(image, cache);
  }
  if (!cache.has(detail))
    cache.set(detail, computeRaw(image, detail, true, tileSize, scratch, backgrounds, detectRaw));
  return structuredClone(cache.get(detail));
}
function glyphMetricsAt(image, box, minimumGlyphs, luminance, factor) {
  if (!metricPassCache) return computeGlyphMetricsAt(image, box, minimumGlyphs, luminance, factor);
  let cache = metricPassCache.get(image);
  if (!cache) {
    cache = new Map();
    metricPassCache.set(image, cache);
  }
  const key = [box.x, box.y, box.w, box.h, ...box.bg, luminance, factor].join(',');
  const previous = cache.get(key),
    minimum = Number.isFinite(minimumGlyphs) && minimumGlyphs > 1 ? minimumGlyphs : 1;
  if (previous?.result) return previous.result.glyphs >= minimumGlyphs ? previous.result : null;
  // A failed lower minimum also proves failure for every higher minimum.
  if (previous && previous.minimum <= minimum) return null;
  const result = computeGlyphMetricsAt(image, box, minimum, luminance, factor);
  cache.set(key, { minimum, result });
  return result && result.glyphs >= minimumGlyphs ? result : null;
}
let metricsCache = null,
  brightCache = null,
  metricPassCache = null;
export function glyphMetrics(image, box, minimumGlyphs = 2) {
  if (!metricsCache) return measureGlyphs(image, box, minimumGlyphs);
  let cache = metricsCache.get(image);
  if (!cache) {
    cache = new Map();
    metricsCache.set(image, cache);
  }
  const key = [box.x, box.y, box.w, box.h, ...box.bg, minimumGlyphs].join(',');
  if (cache.has(key)) return cache.get(key);
  const result = measureGlyphs(image, box, minimumGlyphs);
  cache.set(key, result);
  return result;
}
function measureGlyphs(image, box, minimumGlyphs) {
  const coherent = (m) =>
    m &&
    m.baselineAgreement >= 0.7 &&
    m.heightAgreement >= 0.7 &&
    m.stroke / Math.max(1, m.xHeight) <= 0.4;
  const primary = glyphMetricsAt(image, box, minimumGlyphs, false, 0.35);
  if (coherent(primary)) return primary;
  const luminance = glyphMetricsAt(image, box, minimumGlyphs, true, 0.35);
  if (coherent(luminance)) return luminance;
  // Faint bridges can join several glyphs beyond the supported component width.
  // A stronger threshold must restore coherent coverage before it can replace evidence.
  if ([primary, luminance].some((m) => m?.unexplained.some((p) => p.w > p.h * 2.5))) {
    for (const luma of [false, true]) {
      const separated = glyphMetricsAt(image, box, Math.max(2, minimumGlyphs), luma, 0.55);
      if (
        coherent(separated) &&
        separated.xHeight >= 5 &&
        separated.foregroundCoverage >
          Math.max(primary?.foregroundCoverage || 0, luminance?.foregroundCoverage || 0)
      )
        return separated;
    }
  }
  // Thin antialiased strokes can break at the normal analysis threshold.
  // Accept a lower threshold only when multiple coherent glyphs reappear.
  for (const luma of [false, true]) {
    const gentle = glyphMetricsAt(
      image,
      box,
      minimumGlyphs === 1 && box.w <= box.h * 0.9 ? 1 : Math.max(2, minimumGlyphs),
      luma,
      0.15
    );
    if (coherent(gentle) && gentle.xHeight >= 5) return gentle;
  }
  return primary || luminance;
}
export function normalizeTypeface(image, boxes, final = false) {
  normalizeTypefaceStage(image, boxes, final, glyphMetrics);
}
export function buildDetectionCatalog(image) {
  const previous = metricsCache,
    previousBright = brightCache,
    previousPass = metricPassCache;
  metricsCache = new WeakMap();
  brightCache = new WeakMap();
  metricPassCache = new WeakMap();
  try {
    return buildCatalog(image, detectRaw, glyphMetrics);
  } finally {
    metricsCache = previous;
    brightCache = previousBright;
    metricPassCache = previousPass;
  }
}
export function selectDetection(catalog, detail = 55) {
  const value = clamp(detail, 10, 90);
  const threshold = value <= 55 ? 92 - ((value - 10) * 44) / 45 : 48 - ((value - 55) * 28) / 35;
  return catalog.filter((box) => box.contrast >= threshold);
}

export function detect(image, detail = 55) {
  return selectDetection(buildDetectionCatalog(image), detail);
}

export function paintMask(ctx, box, palette = 'adaptive') {
  const bg = box.bg,
    dark = bg[0] * 0.2126 + bg[1] * 0.7152 + bg[2] * 0.0722 < 130;
  const colors = {
    neutral: dark ? [111, 121, 138] : [175, 184, 196],
    blue: dark ? [103, 152, 204] : [127, 160, 197],
    orange: dark ? [195, 138, 109] : [196, 156, 135],
  };
  const bar =
    colors[palette] || bg.map((v) => Math.round(v * (dark ? 0.66 : 0.76) + (dark ? 105 : 0)));
  ctx.fillStyle = `rgb(${bg.join(',')})`;
  ctx.fillRect(box.x, box.y, box.w, box.h);
  const bh = Math.max(3, box.h * 0.57),
    inset = Math.min(3, box.w * 0.08);
  ctx.fillStyle = `rgb(${bar.join(',')})`;
  ctx.beginPath();
  if (box.shape === 'icon') {
    const inset = Math.min(3, Math.min(box.w, box.h) * 0.12);
    ctx.roundRect(
      box.x + inset,
      box.y + inset,
      Math.max(1, box.w - 2 * inset),
      Math.max(1, box.h - 2 * inset),
      Math.min(6, box.h * 0.2)
    );
    ctx.fill();
    return;
  }
  ctx.roundRect(
    box.x + inset,
    box.y + (box.h - bh) / 2,
    Math.max(1, box.w - 2 * inset),
    bh,
    Math.min(3, bh / 2)
  );
  ctx.fill();
}
