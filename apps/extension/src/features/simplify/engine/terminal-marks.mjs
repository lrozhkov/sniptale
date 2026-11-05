import { inkParts } from './structure.mjs';

const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const contains = (a, b) =>
  a.x <= b.x && a.y <= b.y && a.x + a.w >= b.x + b.w && a.y + a.h >= b.y + b.h;
const difference = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));

// Call before attachEraseSupport. Extend only confirmed text, never a separate icon.
export function recoverTerminalMarks(
  image,
  input,
  { protected: protectedRects = [], boundaries = [] } = {}
) {
  return input.map((label) =>
    recoverLabelTerminalMarks(image, label, input, protectedRects, boundaries)
  );
}

function recoverLabelTerminalMarks(image, label, input, protectedRects, boundaries) {
  const m = label.typeMetrics,
    g = m?.glyphBounds,
    xh = m?.xHeight;
  if (
    label.shape !== 'text' ||
    !label.textConfidence ||
    !g ||
    m.glyphs < 3 ||
    !xh ||
    !m.stroke ||
    m.baselineAgreement < 0.7 ||
    m.heightAgreement < 0.7
  )
    return label;
  const start = Math.max(0, Math.floor(g.x + g.w)),
    top = Math.max(0, Math.floor(g.y - xh * 0.15));
  const scan = {
    x: start,
    y: top,
    w: Math.min(image.width - start, Math.ceil(xh * 1.2)),
    h: Math.min(
      image.height - top,
      Math.ceil(Math.max(g.y + g.h, label.y + label.h) - top + xh * 0.2)
    ),
    bg: label.bg,
  };
  if (scan.w <= 0 || scan.h <= 0) return label;
  const parts = inkParts(image, scan).sort((a, b) => a.x - b.x);
  const eligible = (p) =>
    p.h >= 2 &&
    p.h < xh * 0.65 &&
    p.w <= xh * 0.65 &&
    p.y >= g.y - xh * 0.2 &&
    p.y + p.h <= g.y + xh * 0.65;
  const candidates = parts.filter(eligible);
  const labelParts = inkParts(image, { ...label, atoms: null }).filter(
    (p) => p.h >= xh * 0.65 && p.x + p.w <= start
  );
  if (!labelParts.length) return label;
  const reference = labelParts.sort((a, b) => b.x - a.x)[0].rgb;
  const quote = recoverTerminalQuote(
    image,
    label,
    input,
    protectedRects,
    boundaries,
    candidates,
    parts,
    scan,
    start,
    g,
    xh,
    m,
    reference
  );
  if (quote) return quote;
  return recoverTerminalBaselineDot(
    image,
    label,
    input,
    protectedRects,
    boundaries,
    start,
    xh,
    g,
    m,
    labelParts,
    reference
  );
}

function recoverTerminalQuote(
  image,
  label,
  input,
  protectedRects,
  boundaries,
  candidates,
  parts,
  scan,
  start,
  g,
  xh,
  m,
  reference
) {
  for (let i = 0; i < candidates.length; i++) {
    const a = candidates[i],
      b = candidates[i + 1];
    let mark;
    if (a.x - start > xh * 0.5) continue;
    if (
      b &&
      b.x - a.x - a.w <= Math.max(1, xh * 0.3) &&
      Math.abs(a.y - b.y) <= Math.max(1, xh * 0.15) &&
      Math.abs(a.h - b.h) <= Math.max(1, xh * 0.15) &&
      Math.max(a.w, b.w) <= Math.max(2, m.stroke * 2.5) &&
      Math.min(a.w, b.w) >= Math.max(1, m.stroke * 0.4) &&
      Math.max(a.w, b.w) <= Math.max(a.h, b.h) * 0.75 &&
      difference(a.rgb, b.rgb) <= 35 &&
      difference(b.rgb, reference) <= 65
    ) {
      mark = {
        x: a.x,
        y: Math.min(a.y, b.y),
        w: b.x + b.w - a.x,
        h: Math.max(a.y + a.h, b.y + b.h) - Math.min(a.y, b.y),
      };
    } else if (a.w >= 3 && a.w <= Math.max(4, m.stroke * 3.5)) {
      // Antialiased quote strokes can form one connected component. Require two
      // dark column peaks with an intervening lighter column.
      const split = hasSplitQuoteStrokes(image, a, label.bg);
      if (split) mark = { x: a.x, y: a.y, w: a.w, h: a.h };
    }
    if (
      !mark ||
      mark.x + mark.w >= scan.x + scan.w ||
      mark.y + mark.h >= scan.y + scan.h ||
      difference(a.rgb, reference) > 65
    )
      continue;
    if (parts.some((p) => p !== a && p !== b && overlaps(p, mark))) continue;
    if (
      [
        ...protectedRects,
        ...input.filter((q) => q !== label && ['icon', 'graphic', 'image'].includes(q.shape)),
      ].some((q) => overlaps(q, mark))
    )
      continue;
    if (boundaries.some((f) => contains(f, mark) && !contains(f, label))) continue;
    const right = Math.max(label.x + label.w, mark.x + mark.w + 1);
    return { ...label, w: right - label.x, terminalMark: mark };
  }
  return null;
}

function appendIsolatedTerminalDots(
  image,
  label,
  region,
  commonBaseline,
  start,
  xh,
  reference,
  dots
) {
  // A small antialiased period can have only one pixel above the inkParts
  // threshold. Include isolated strong pixels with a matching fringe.
  for (
    let y = Math.max(region.y, commonBaseline - 2);
    y < Math.min(region.y + region.h, commonBaseline + 1);
    y++
  )
    for (
      let x = Math.max(start, label.x + label.w);
      x < Math.min(region.x + region.w, start + Math.ceil(xh * 2.7));
      x++
    ) {
      if (dots.some((p) => x >= p.x - 1 && x < p.x + p.w + 1 && y >= p.y - 1 && y < p.y + p.h + 1))
        continue;
      const i = (y * image.width + x) * 4,
        rgb = [image.data[i], image.data[i + 1], image.data[i + 2]];
      if (difference(rgb, label.bg) <= 40 || difference(rgb, reference) > 40) continue;
      let strong = 0,
        fringe = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx,
            yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= image.width || yy >= image.height) continue;
          const k = (yy * image.width + xx) * 4,
            d = difference([image.data[k], image.data[k + 1], image.data[k + 2]], label.bg);
          if (d > 40) strong++;
          else if (d > 3) fringe++;
        }
      if (strong === 1 && fringe >= 1)
        dots.push({ x, y, w: 1, h: 1, n: 1, rgb, singlePixel: true });
    }
}

function terminalDotSurface(image, dot) {
  const samples = [];
  for (let y = dot.y - 2; y <= dot.y + dot.h + 1; y++)
    for (let x = dot.x - 2; x <= dot.x + dot.w + 1; x++) {
      if (
        x < 0 ||
        y < 0 ||
        x >= image.width ||
        y >= image.height ||
        overlaps({ x, y, w: 1, h: 1 }, dot)
      )
        continue;
      const i = (y * image.width + x) * 4;
      samples.push([image.data[i], image.data[i + 1], image.data[i + 2]]);
    }
  if (!samples.length) return null;
  const bg = [0, 1, 2].map(
    (c) => samples.map((p) => p[c]).sort((a, b) => a - b)[Math.floor(samples.length / 2)]
  );
  return bg;
}

function hasSplitQuoteStrokes(image, a, bg) {
  const profile = [];
  for (let x = a.x; x < a.x + a.w; x++) {
    let strength = 0;
    for (let y = a.y; y < a.y + a.h; y++) {
      const k = (y * image.width + x) * 4;
      strength += Math.max(...bg.map((v, c) => Math.abs(v - image.data[k + c])));
    }
    profile.push(strength);
  }
  let split = false;
  for (let k = 1; k < profile.length - 1; k++)
    if (
      profile[k] <
      Math.min(Math.max(...profile.slice(0, k)), Math.max(...profile.slice(k + 1))) * 0.8
    )
      split = true;
  return split;
}

function recoverTerminalBaselineDot(
  image,
  label,
  input,
  protectedRects,
  boundaries,
  start,
  xh,
  g,
  m,
  labelParts,
  reference
) {
  // A baseline dot needs independent font and spacing evidence. Scan the
  // whole component, including its surroundings, to reject dot sequences.
  const { dots, commonBaseline, baseline } = terminalDotCandidates(
    image,
    label,
    start,
    xh,
    g,
    m,
    labelParts,
    reference
  );
  for (const dot of dots) {
    if (
      dot.x < start ||
      dot.x - start > xh * 1.2 ||
      Math.abs(dot.y + dot.h - (dot.singlePixel ? commonBaseline : baseline)) >
        Math.max(1, xh * 0.15)
    )
      continue;
    if (
      dots.some(
        (q) =>
          q !== dot &&
          ((Math.abs(q.y + q.h - (dot.y + dot.h)) <= Math.max(1, xh * 0.15) &&
            Math.abs(q.x - dot.x) <= xh * 1.5) ||
            (Math.abs(q.x - dot.x) <= Math.max(1, m.stroke) &&
              Math.abs(q.y - dot.y) >= xh &&
              Math.abs(q.y - dot.y) <= xh * 3))
      )
    )
      continue;
    if (
      [...protectedRects, ...input.filter((q) => q !== label && q.shape !== 'text')].some((q) =>
        overlaps(q, dot)
      )
    )
      continue;
    if (boundaries.some((f) => contains(f, dot) && !contains(f, label))) continue;
    const right = Math.max(label.x + label.w, dot.x + dot.w + 1);
    // The dot can sit on a surface outside the label, such as inline code.
    // Give it its own sampled surface instead of extending the label plane.
    const bg = terminalDotSurface(image, dot);
    if (!bg) continue;
    const fragment = { ...dot, bg, shape: 'text' };
    return {
      ...label,
      w: right - label.x,
      terminalMark: dot,
      eraseFragments: [...(label.eraseFragments || [label]), fragment],
    };
  }
  return label;
}

function terminalDotCandidates(image, label, start, xh, g, m, labelParts, reference) {
  const region = {
    x: Math.max(0, start - Math.ceil(xh)),
    y: Math.max(0, Math.floor(g.y - xh * 3)),
    w: Math.min(image.width - Math.max(0, start - Math.ceil(xh)), Math.ceil(xh * 4)),
    h: Math.min(image.height - Math.max(0, Math.floor(g.y - xh * 3)), Math.ceil(g.h + xh * 6)),
    bg: label.bg,
  };
  const dots = inkParts(image, region).filter(
    (p) =>
      p.w <= Math.max(2, Math.ceil(m.stroke * 2)) &&
      p.h <= Math.max(3, Math.ceil(m.stroke * 2)) &&
      p.w >= 1 &&
      p.h >= 1 &&
      difference(p.rgb, reference) <= 40
  );
  // Descenders can extend the glyph bounds below the common baseline.
  const bottoms = labelParts.map((p) => p.y + p.h).sort((a, b) => a - b);
  const commonBaseline = bottoms[Math.floor(bottoms.length / 2)],
    baseline = g.y + g.h;
  appendIsolatedTerminalDots(image, label, region, commonBaseline, start, xh, reference, dots);
  return { dots, commonBaseline, baseline };
}
