import { inkParts, isDirectionalArrow } from './structure.mjs';
import { inkRuns, runBounds, inkOverlap, mergeRuns } from './ownership-ink.mjs';
const intersects = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// A late boundary row can include a distinct direction indicator.
export function separateBoundaryDirection(image, input, measure) {
  const result = [];
  for (const box of input) {
    if (box.kind !== 'boundary-text' || box.shape !== 'text' || !box.textConfidence) {
      result.push(box);
      continue;
    }
    const parts = inkParts(image, { ...box, atoms: null })
        .filter((p) => p.n >= 5)
        .sort((a, b) => a.x - b.x),
      end = parts.at(-1),
      previous = parts.at(-2);
    if (
      parts.length < 3 ||
      !end ||
      !previous ||
      end.x - previous.x - previous.w < 2 ||
      end.x - previous.x - previous.w > box.h ||
      Math.max(...end.rgb) - Math.min(...end.rgb) < 40 ||
      !isDirectionalArrow(image, { ...end, bg: box.bg })
    ) {
      result.push(box);
      continue;
    }
    const right = end.x - 1,
      label = { ...box, w: right - box.x };
    const m = measure(image, label, 1);
    if (
      !m ||
      m.glyphs < 2 ||
      m.baselineAgreement < 0.8 ||
      m.heightAgreement < 0.8 ||
      m.foregroundCoverage < 0.9 ||
      m.stroke / m.xHeight > 0.4
    ) {
      result.push(box);
      continue;
    }
    prepareBoundaryLabel(label, m);
    const x = Math.max(0, end.x - 1),
      y = Math.max(0, end.y - 1),
      r = Math.min(image.width, end.x + end.w + 1),
      bottom = Math.min(image.height, end.y + end.h + 1);
    result.push(label, {
      x,
      y,
      w: r - x,
      h: bottom - y,
      bg: box.bg,
      shape: 'icon',
      kind: 'direction-symbol',
      roleEvidence: 'direction-symbol',
    });
  }
  return result;
}

export function resolveRepeatedInlineGraphics(image, input, measure) {
  const output = [];
  const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  for (const box of input) {
    if (box.shape !== 'text' || box.h > 32 || box.w > 220) {
      output.push(box);
      continue;
    }
    const parts = inkParts(image, { ...box, atoms: null }).sort((a, b) => a.x - b.x);
    const [a, b, c] = parts;
    if (
      parts.length < 4 ||
      !a ||
      !b ||
      a.w / a.h < 1.4 ||
      a.n / (a.w * a.h) < 0.5 ||
      b.x - a.x - a.w < 2 ||
      b.x - a.x - a.w > a.h * 1.5 ||
      !sameInlineGraphicInk(image, a, b, box.bg) ||
      c.h < a.h * 1.45 ||
      c.w < a.h * 0.6 ||
      c.w > c.h * 1.2 ||
      c.x - b.x - b.w > a.h * 2
    ) {
      output.push(box);
      continue;
    }
    const label = repeatedInlineCaption(image, box, parts, measure);
    if (!label) {
      output.push(box);
      continue;
    }
    const side = median([a, b, c].map((p) => Math.max(p.w, p.h))) + 2;
    for (const p of [a, b, c])
      output.push({
        x: Math.floor(p.x + p.w / 2 - side / 2),
        y: Math.floor(p.y + p.h / 2 - side / 2),
        w: side,
        h: side,
        bg: box.bg,
        shape: 'icon',
        kind: 'inline-graphic',
        roleEvidence: 'repeated-inline-graphic',
        iconSize: side - 4,
        contrast: box.contrast,
        sourceBounds: { x: p.x - 1, y: p.y - 1, w: p.w + 2, h: p.h + 2 },
      });
    output.push(label);
  }
  return output;
}

export function completeIconSupport(image, input) {
  return input.map((box) => {
    if (box.shape !== 'icon') return box;
    const original = box.sourceBounds || box,
      margin = Math.max(4, Math.ceil(Math.max(original.w, original.h) * 0.85));
    const best = peakIconPixel(image, original, box.bg);
    if (!best) return box;
    const search = {
      x: original.x - margin,
      y: original.y - margin,
      w: original.w + margin * 2,
      h: original.h + margin * 2,
    };
    const seeds = iconComponentSeeds(image, original, box.bg, best);
    let runs = mergeRuns(
      [
        inkRuns(image, original, box.bg),
        ...seeds.slice(0, 16).map((seed) => inkRuns(image, search, box.bg, seed)),
      ].flat()
    );
    if (!runs.length) return box;
    let bounds = runBounds(runs);
    if (
      bounds.w > Math.max(36, original.w * 2.5) ||
      bounds.h > Math.max(36, original.h * 2.5) ||
      input.some(
        (other) =>
          other !== box &&
          other.shape === 'text' &&
          other.textConfidence &&
          inkOverlap(image, other, runs) > 0.2
      )
    ) {
      runs = inkRuns(image, original, box.bg);
      if (!runs.length) return box;
      bounds = runBounds(runs);
    }
    // A compact outlined symbol can have a small detached, centered lower part.
    // Require a broad base and an open interior before considering that part.
    runs = attachDetachedIconBase(image, box, input, bounds, runs);
    bounds = runBounds(runs);
    const oldX = original.x + original.w / 2,
      oldY = original.y + original.h / 2,
      cx = bounds.x + bounds.w / 2,
      cy = bounds.y + bounds.h / 2;
    return {
      ...box,
      x: box.x + Math.round(cx - oldX),
      y: box.y + Math.round(cy - oldY),
      sourceBounds: bounds,
      sourceRuns: runs,
    };
  });
}

function peakIconPixel(image, original, bg) {
  let best = null,
    peak = 0;
  for (
    let y = Math.max(0, Math.floor(original.y));
    y < Math.min(image.height, original.y + original.h);
    y++
  )
    for (
      let x = Math.max(0, Math.floor(original.x));
      x < Math.min(image.width, original.x + original.w);
      x++
    ) {
      const i = (y * image.width + x) * 4;
      if (!image.data[i + 3]) continue;
      const distance = Math.max(...bg.map((v, c) => Math.abs(v - image.data[i + c])));
      if (distance > peak) {
        peak = distance;
        best = { x, y };
      }
    }
  return best;
}

function iconComponentSeeds(image, original, bg, best) {
  const seeds = [best];
  for (const part of inkParts(image, { ...original, bg: bg, atoms: null })) {
    let seed = null,
      value = 0;
    for (let y = part.y; y < part.y + part.h; y++)
      for (let x = part.x; x < part.x + part.w; x++) {
        const i = (y * image.width + x) * 4,
          d = Math.max(...bg.map((v, c) => Math.abs(v - image.data[i + c])));
        if (d > value) {
          value = d;
          seed = { x, y };
        }
      }
    if (seed && !seeds.some((p) => p.x === seed.x && p.y === seed.y)) seeds.push(seed);
  }
  return seeds;
}

function attachDetachedIconBase(image, box, input, bounds, runs) {
  const base = runs.filter((r) => r[0] === bounds.y + bounds.h - 1).reduce((n, r) => n + r[2], 0);
  const middle = runs
    .filter((r) => r[0] === bounds.y + Math.floor(bounds.h / 2))
    .reduce((n, r) => n + r[2], 0);
  if (
    box.roleEvidence === 'structured-symbol' &&
    bounds.w >= 8 &&
    bounds.h >= 8 &&
    bounds.w / bounds.h >= 0.7 &&
    bounds.w / bounds.h <= 1.5 &&
    base >= bounds.w * 0.7 &&
    middle <= bounds.w * 0.65
  ) {
    const region = {
      x: bounds.x,
      y: bounds.y + bounds.h,
      w: bounds.w,
      h: Math.max(3, Math.ceil(bounds.h * 0.3)),
      bg: box.bg,
    };
    const body = inkParts(image, { ...bounds, bg: box.bg, atoms: null }).sort(
      (a, b) => b.n - a.n
    )[0];
    const candidates = inkParts(image, region).filter((p) => {
      const gap = p.y - (bounds.y + bounds.h),
        center = Math.abs(p.x + p.w / 2 - bounds.x - bounds.w / 2);
      return (
        body &&
        gap <= Math.max(1, Math.floor(bounds.h * 0.12)) &&
        p.w <= bounds.w * 0.45 &&
        p.h <= bounds.h * 0.25 &&
        p.w >= p.h &&
        center <= Math.max(1, bounds.w * 0.12) &&
        Math.max(...p.rgb.map((v, c) => Math.abs(v - body.rgb[c]))) <= 30 &&
        !input.some((other) => other !== box && intersects(other.sourceBounds || other, p))
      );
    });
    if (candidates.length === 1) {
      const p = candidates[0],
        extra = inkRuns(image, { x: p.x - 1, y: p.y - 1, w: p.w + 2, h: p.h + 2 }, box.bg, {
          x: p.x,
          y: p.y,
        });
      return mergeRuns([...runs, ...extra]);
    }
  }
  return runs;
}

function prepareBoundaryLabel(label, m) {
  for (const key of [
    'sourceBounds',
    'sourceRuns',
    'eraseRuns',
    'erasePlane',
    'eraseLayers',
    'eraseFragments',
    'atoms',
    'iconSize',
    'rowTextSize',
    'textDecorations',
  ])
    delete label[key];
  label.typeMetrics = m;
  label.textSize = Math.max(4, 2 * Math.round(m.xHeight * 0.8));
  label.textCenterY = m.glyphBounds.y + m.glyphBounds.h / 2;
  label.contrast = m.foregroundContrast;
}

function sameInlineGraphicInk(image, a, b, bg) {
  if (a.w !== b.w || a.h !== b.h) return false;
  let union = 0,
    different = 0;
  for (let y = 0; y < a.h; y++)
    for (let x = 0; x < a.w; x++) {
      const p = ((a.y + y) * image.width + a.x + x) * 4,
        q = ((b.y + y) * image.width + b.x + x) * 4;
      const aa = Math.max(...bg.map((v, c) => Math.abs(v - image.data[p + c]))) > 40;
      const bb = Math.max(...bg.map((v, c) => Math.abs(v - image.data[q + c]))) > 40;
      if (aa || bb) union++;
      if (aa !== bb) different++;
    }
  return union > 12 && different / union < 0.08;
}

function repeatedInlineCaption(image, box, parts, measure) {
  const remaining = parts.slice(3),
    x = Math.min(...remaining.map((p) => p.x)),
    y = Math.min(...remaining.map((p) => p.y));
  const right = Math.max(...remaining.map((p) => p.x + p.w)),
    bottom = Math.max(...remaining.map((p) => p.y + p.h));
  const label = {
    x: x - 1,
    y: y - 1,
    w: right - x + 2,
    h: bottom - y + 2,
    bg: box.bg,
    shape: 'text',
    componentCount: remaining.length,
    kind: 'separate-caption',
  };
  const m = measure(image, label, 1);
  if (
    !m ||
    m.glyphs < 2 ||
    m.baselineAgreement < 0.8 ||
    m.heightAgreement < 0.8 ||
    m.stroke / m.xHeight > 0.35
  ) {
    return null;
  }
  label.typeMetrics = m;
  label.textConfidence = true;
  label.contrast = m.foregroundContrast;
  label.textSize = Math.max(4, 2 * Math.round((label.h - 2) / 2));
  return label;
}
