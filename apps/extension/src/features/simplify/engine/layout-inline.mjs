import { fitsTextFlow, hasLayeredContours, isDirectionalArrow, isCheckMark } from './structure.mjs';
const intersects = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const centerY = (b) => b.y + b.h / 2;
const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};

function foreground(image, b, x, y) {
  const i = (y * image.width + x) * 4;
  return (
    image.data[i + 3] >= 128 &&
    Math.max(...(b.bg || [255, 255, 255]).map((v, c) => Math.abs(v - image.data[i + c]))) > 40
  );
}
export function columnRuns(image, b) {
  const left = Math.max(0, Math.ceil(b.x)),
    right = Math.min(image.width, Math.floor(b.x + b.w));
  const top = Math.max(0, Math.ceil(b.y)),
    bottom = Math.min(image.height, Math.floor(b.y + b.h));
  const runs = [];
  let cur = null;
  for (let x = left; x < right; x++) {
    let n = 0,
      ymin = bottom,
      ymax = top,
      rgb = [0, 0, 0];
    for (let y = top; y < bottom; y++)
      if (foreground(image, b, x, y)) {
        const k = (y * image.width + x) * 4;
        n++;
        ymin = Math.min(ymin, y);
        ymax = Math.max(ymax, y);
        for (let c = 0; c < 3; c++) rgb[c] += image.data[k + c];
      }
    if (!n) {
      cur = null;
      continue;
    }
    if (!cur) {
      cur = { x, r: x, y: ymin, b: ymax, n: 0, rgb: [0, 0, 0] };
      runs.push(cur);
    }
    cur.r = x;
    cur.y = Math.min(cur.y, ymin);
    cur.b = Math.max(cur.b, ymax);
    cur.n += n;
    for (let c = 0; c < 3; c++) cur.rgb[c] += rgb[c];
  }
  for (const r of runs) {
    r.w = r.r - r.x + 1;
    r.h = r.b - r.y + 1;
    r.rgb = r.rgb.map((v) => v / r.n);
  }
  return runs;
}
function caret(image, b, r) {
  if (r.w < 5 || r.w > 22 || r.h < 3 || r.h > 14 || r.w / r.h < 0.75 || r.w / r.h > 3) return false;
  const spans = [],
    centers = [];
  for (let y = r.y; y <= r.b; y++) {
    const xs = [];
    for (let x = r.x; x <= r.r; x++) if (foreground(image, b, x, y)) xs.push(x);
    if (xs.length) {
      spans.push(Math.max(...xs) - Math.min(...xs) + 1);
      centers.push((Math.max(...xs) + Math.min(...xs)) / 2);
    }
  }
  if (spans.length < 3) return false;
  // Symmetric narrowing towards either end identifies an up/down chevron.
  const third = Math.max(1, Math.floor(spans.length / 3));
  const first = median(spans.slice(0, third)),
    last = median(spans.slice(-third));
  return (
    Math.abs(median(centers.slice(0, third)) - median(centers.slice(-third))) <=
      Math.max(0.75, r.w * 0.12) &&
    Math.max(first, last) >= Math.min(first, last) * 1.7 &&
    Math.max(first, last) >= 5
  );
}
export function boundsFromRuns(b, runs, kind) {
  const x = Math.max(b.x, runs[0].x - 1),
    right = Math.min(b.x + b.w, runs.at(-1).r + 2);
  const y = Math.max(b.y, Math.min(...runs.map((r) => r.y)) - 1),
    bottom = Math.min(b.y + b.h, Math.max(...runs.map((r) => r.b)) + 2);
  const result = {
    ...b,
    x,
    y,
    w: right - x,
    h: bottom - y,
    shape: kind,
    componentCount: kind === 'icon' ? 1 : Math.max(3, runs.length),
    compact: kind === 'icon',
  };
  delete result.typeMetrics;
  delete result.contrast;
  delete result.textCenterY;
  delete result.rowTextSize;
  if (kind === 'icon') {
    result.iconSize = Math.max(4, Math.min(result.w, result.h) - 2);
    result.roleEvidence = 'inline-symbol';
  } else {
    delete result.iconSize;
    result.roleEvidence = 'inline-label';
  }
  return result;
}
export function textBands(image, b) {
  const rows = [];
  let current = null;
  for (
    let y = Math.max(0, Math.ceil(b.y));
    y < Math.min(image.height, Math.floor(b.y + b.h));
    y++
  ) {
    let count = 0;
    for (let x = Math.max(0, Math.ceil(b.x)); x < Math.min(image.width, Math.floor(b.x + b.w)); x++)
      if (foreground(image, b, x, y)) count++;
    if (!count) {
      current = null;
      continue;
    }
    if (!current) {
      current = { y, b: y };
      rows.push(current);
    } else current.b = y;
  }
  const bands = rows.filter((r) => r.b - r.y + 1 >= 5);
  if (bands.length < 2 || bands.length > 3 || bands.some((r, i) => i && r.y - bands[i - 1].b < 3))
    return [b];
  return bands.map((r) => ({
    ...b,
    y: Math.max(b.y, r.y - 1),
    h: Math.min(b.y + b.h, r.b + 2) - Math.max(b.y, r.y - 1),
  }));
}

export function inlineSymbolEdge(
  image,
  b,
  original,
  input,
  options,
  { edge, neighbor, others, side }
) {
  const gap = side === 'left' ? neighbor.x - (edge.r + 1) : edge.x - (neighbor.r + 1);
  if (!eligibleInlineEdge(edge, gap)) return false;
  const sample = others.filter((r) => r.n >= 5);
  if (!sample.length) return false;
  const textArea = boundsFromRuns(b, others, 'text'),
    bands = textBands(image, textArea);
  const typicalH =
    bands.length > 1
      ? median(bands.map((r) => Math.max(1, r.h - 2)))
      : median(sample.map((r) => r.h));
  const tick =
    gap >= 3 && isCheckMark(image, { x: edge.x, y: edge.y, w: edge.w, h: edge.h, bg: b.bg });
  const caretLike = inlineCaretEvidence(image, b, edge, sample, typicalH, gap);
  if (
    !tick &&
    !caretLike &&
    edge.h <= typicalH * 1.25 &&
    options.measure &&
    fitsTextFlow(
      image,
      { x: edge.x, y: edge.y, w: edge.w, h: edge.h, bg: b.bg },
      original,
      input,
      options.measure
    )
  )
    return false;
  const directional = isDirectionalArrow(image, {
    x: edge.x,
    y: edge.y,
    w: edge.w,
    h: edge.h,
    bg: b.bg,
  });
  const edgeMetrics = options.measure?.(
    image,
    { x: edge.x, y: edge.y, w: edge.w, h: edge.h, bg: b.bg },
    1
  );
  const textMetrics = options.measure?.(image, textArea);
  if (!confirmedInlineLabel(textMetrics)) return false;
  // Multiple fully explained glyphs remain text even when a neighbouring
  // style has a different size, colour, or baseline (for example a citation).
  if (!tick && !caretLike && explainedInlineGlyphs(edgeMetrics)) return false;
  if (
    !directional &&
    !tick &&
    !caretLike &&
    matchesInlineTypography(edgeMetrics, textMetrics, edge, sample, gap)
  )
    return false;
  const distinct = distinctInlineAppearance(edge, sample, typicalH, gap);
  return (
    tick ||
    caretLike ||
    distinct ||
    isDirectionalArrow(image, { x: edge.x, y: edge.y, w: edge.w, h: edge.h, bg: b.bg })
  );
}
export function inlineToolbarSlots(image, original, b, input, runs, obstacles) {
  const iconNeighbor = input.some(
    (q) =>
      q !== original &&
      q.shape === 'icon' &&
      Math.abs(centerY(q) - centerY(b)) <= Math.max(q.h, b.h) * 0.5 &&
      Math.max(q.x - (b.x + b.w), b.x - (q.x + q.w), 0) <= Math.max(30, b.h * 3)
  );
  if (
    iconNeighbor &&
    runs.length >= 2 &&
    runs.length <= 8 &&
    (runs.length >= 3 ||
      runs.some((r) =>
        hasLayeredContours(image, { x: r.x - 1, y: r.y - 1, w: r.w + 2, h: r.h + 2, bg: b.bg })
      )) &&
    runs.every((r) => r.w >= 8 && r.h >= 8 && r.w / r.h >= 0.5 && r.w / r.h <= 2 && r.n >= 25)
  ) {
    const gaps = runs.slice(1).map((r, i) => r.x - runs[i].r - 1),
      spacing = median(gaps);
    if (
      spacing >= Math.max(5, median(runs.map((r) => r.w)) * 0.6) &&
      gaps.every((g) => Math.abs(g - spacing) <= Math.max(3, spacing * 0.25))
    ) {
      const slots = runs.map((r) => boundsFromRuns(b, [r], 'icon'));
      if (!slots.some((s) => obstacles.some((o) => intersects(s, o)))) {
        return slots;
      }
    }
  }
  return null;
}

function matchesInlineTypography(edgeMetrics, textMetrics, edge, sample, gap) {
  return (
    edgeMetrics &&
    textMetrics &&
    edgeMetrics.glyphs >= 1 &&
    (edgeMetrics.glyphs >= 2 || edgeMetrics.foregroundCoverage >= 0.8) &&
    edgeMetrics.baselineAgreement >= 0.7 &&
    edgeMetrics.heightAgreement >= 0.7 &&
    edgeMetrics.stroke / edgeMetrics.xHeight <= 0.4 &&
    (Math.min(edgeMetrics.xHeight, textMetrics.xHeight) >=
      Math.max(edgeMetrics.xHeight, textMetrics.xHeight) * 0.65 ||
      (gap <= Math.max(1, Math.floor(textMetrics.stroke)) &&
        Math.min(edgeMetrics.xHeight, textMetrics.xHeight) >=
          Math.max(edgeMetrics.xHeight, textMetrics.xHeight) * 0.55)) &&
    Math.min(edgeMetrics.stroke, textMetrics.stroke) >=
      Math.max(edgeMetrics.stroke, textMetrics.stroke) * 0.6 &&
    Math.abs(edge.b - median(sample.map((r) => r.b))) <= Math.max(2, textMetrics.xHeight * 0.3)
  );
}

function distinctInlineAppearance(edge, sample, typicalH, gap) {
  const colors = [0, 1, 2].map((c) => median(sample.map((r) => r.rgb[c])));
  const colorDiff = Math.max(...colors.map((c, i) => Math.abs(c - edge.rgb[i])));
  const saturation = Math.max(...edge.rgb) - Math.min(...edge.rgb),
    otherSat = Math.max(...colors) - Math.min(...colors);
  const colored = colorDiff > 48 && saturation > otherSat + 35;
  const above = Math.min(...sample.map((r) => r.y)) - edge.y,
    below = edge.b - Math.max(...sample.map((r) => r.b));
  const large =
    edge.h >= typicalH * 1.35 &&
    edge.w >= typicalH * 0.9 &&
    gap >= Math.max(1, Math.floor(typicalH * 0.15)) &&
    above >= Math.max(2, typicalH * 0.15) &&
    below >= 1;
  return colored || large;
}

function eligibleInlineEdge(edge, gap) {
  return !(
    gap < 1 ||
    edge.w < 5 ||
    edge.h < 4 ||
    edge.w > 45 ||
    edge.h > 45 ||
    edge.w / edge.h < 0.45 ||
    edge.w / edge.h > 2.5
  );
}

function confirmedInlineLabel(textMetrics) {
  return !(
    !textMetrics ||
    textMetrics.glyphs < 2 ||
    textMetrics.baselineAgreement < 0.7 ||
    textMetrics.heightAgreement < 0.7 ||
    textMetrics.stroke / textMetrics.xHeight > 0.4
  );
}

function explainedInlineGlyphs(edgeMetrics) {
  return (
    edgeMetrics?.glyphs >= 2 &&
    edgeMetrics.foregroundCoverage >= 0.8 &&
    edgeMetrics.baselineAgreement >= 0.7 &&
    edgeMetrics.heightAgreement >= 0.7 &&
    edgeMetrics.stroke / edgeMetrics.xHeight <= 0.4
  );
}

function inlineCaretEvidence(image, b, edge, sample, typicalH, gap) {
  return (
    edge.h <= typicalH * 0.8 &&
    gap >= Math.max(3, typicalH * 0.25) &&
    edge.b <= median(sample.map((r) => r.b)) - Math.max(1, typicalH * 0.1) &&
    caret(image, b, edge)
  );
}
