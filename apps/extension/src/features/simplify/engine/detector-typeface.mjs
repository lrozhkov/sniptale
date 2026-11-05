function measureTypefaceRows(image, boxes, final, glyphMetrics) {
  // The observed height of one line depends on its letters. Measure the ink
  // first, then share a scale where the source glyph evidence matches.
  const measured = [],
    short = [],
    strongRows = [];
  for (const box of boxes) {
    if (box.shape !== 'text') continue;
    if (final) delete box.textHeightLimit;
    const metrics = glyphMetrics(image, box, final ? 1 : 2);
    if (
      final &&
      metrics &&
      metrics.baselineAgreement >= 0.7 &&
      metrics.heightAgreement >= 0.7 &&
      metrics.stroke / Math.max(1, metrics.xHeight) <= 0.4
    )
      box.textHeightLimit = metrics.glyphBounds.h;
    if (final && metrics && Number.isFinite(box.textSize)) {
      const m = box.typeMetrics || metrics,
        compactThree = m.glyphs === 3 && box.w <= box.h * 1.7 && m.xHeight <= m.upperHeight * 0.8;
      if ((metrics.glyphs <= 2 && m.glyphs <= 2) || compactThree) short.push({ box, metrics: m });
    }
    if (final && box.rowTextSize && metrics?.glyphs >= 5) strongRows.push({ box, metrics });
    if (box.rowTextSize || !metrics || metrics.glyphs < 3) continue;
    box.textSize = Math.max(4, 2 * Math.round(metrics.xHeight * 0.8));
    box.typeMetrics = metrics;
    measured.push({ box, metrics });
  }
  return { measured, short, strongRows };
}
function styleCompatible(a, b) {
  const p = a.metrics.glyphBounds,
    q = b.metrics.glyphBounds;
  const h = Math.max(p.h, q.h),
    stroke = Math.max(
      a.metrics.typeStroke || a.metrics.stroke,
      b.metrics.typeStroke || b.metrics.stroke
    );
  if (
    Math.min(p.h, q.h) < h * 0.88 &&
    Math.min(a.metrics.upperHeight, b.metrics.upperHeight) <
      Math.max(a.metrics.upperHeight, b.metrics.upperHeight) * 0.88
  )
    return false;
  if (
    Math.min(a.metrics.typeStroke || a.metrics.stroke, b.metrics.typeStroke || b.metrics.stroke) <
    stroke * 0.8
  )
    return false;
  return Math.max(...a.box.bg.map((v, i) => Math.abs(v - b.box.bg[i]))) <= 20;
}
function globalStyleCompatible(a, b) {
  const p = a.metrics.glyphBounds,
    q = b.metrics.glyphBounds;
  const heightRatio = Math.min(p.h, q.h) / Math.max(p.h, q.h);
  const sa = a.metrics.typeStroke || a.metrics.stroke,
    sb = b.metrics.typeStroke || b.metrics.stroke;
  const strokeRatio = Math.min(sa, sb) / Math.max(sa, sb);
  const upperRatio =
    Math.min(a.metrics.upperHeight, b.metrics.upperHeight) /
    Math.max(a.metrics.upperHeight, b.metrics.upperHeight);
  const reliableUpper = p.h <= a.metrics.upperHeight * 1.5 && q.h <= b.metrics.upperHeight * 1.5;
  return (
    styleCompatible(a, b) &&
    ((heightRatio >= 0.88 && strokeRatio >= 0.85) ||
      (reliableUpper && upperRatio >= 0.88 && strokeRatio >= 0.8))
  );
}
function adjacent(a, b) {
  const p = a.metrics.glyphBounds,
    q = b.metrics.glyphBounds,
    h = Math.max(p.h, q.h);
  const dx = Math.max(p.x - q.x - q.w, q.x - p.x - p.w, 0),
    dy = Math.max(p.y - q.y - q.h, q.y - p.y - p.h, 0);
  const leftAligned = Math.abs(p.x - q.x) <= Math.max(3, h * 0.15);
  const rightAligned = Math.abs(p.x + p.w - q.x - q.w) <= Math.max(3, h * 0.15);
  const overlap = Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x);
  const vertical =
    dy > 0 && dy <= h * 0.9 && (leftAligned || rightAligned || overlap >= Math.min(p.w, q.w) * 0.8);
  const row =
    dy === 0 && dx > 0 && dx <= h * 0.5 && Math.abs(p.y + p.h - q.y - q.h) <= Math.max(2, h * 0.1);
  return vertical || row;
}
function rowContext(a, b) {
  const p = a.metrics.glyphBounds,
    q = b.metrics.glyphBounds,
    h = Math.max(p.h, q.h);
  const gap = Math.max(p.x - q.x - q.w, q.x - p.x - p.w, 0);
  return gap <= h * 1.1 && Math.abs(p.y + p.h - q.y - q.h) <= Math.max(2, h * 0.1);
}
function groupTypefaceMeasurements(measured) {
  const groups = [];
  for (const item of measured) {
    const group = groups.find((g) => {
      const contextual = (peer) => {
        if (styleCompatible(item, peer)) return true;
        const m = peer.metrics,
          p = m.glyphBounds,
          im = item.metrics;
        if (p.h <= m.upperHeight * 1.5 || im.glyphBounds.h > im.upperHeight * 1.5) return false;
        if (p.h < im.upperHeight * 0.88 || p.h > im.upperHeight * 1.5) return false;
        const sa = m.typeStroke || m.stroke,
          sb = im.typeStroke || im.stroke;
        if (
          Math.min(sa, sb) < Math.max(sa, sb) * 0.8 ||
          Math.max(...peer.box.bg.map((v, i) => Math.abs(v - item.box.bg[i]))) > 20
        )
          return false;
        return g.some(
          (anchor) =>
            anchor !== peer && rowContext(peer, anchor) && globalStyleCompatible(item, anchor)
        );
      };
      return (
        g.every(contextual) &&
        (g.some((peer) => adjacent(item, peer)) ||
          (g.some((peer) => globalStyleCompatible(item, peer)) &&
            g.every((peer) => globalStyleCompatible(item, peer) || !styleCompatible(item, peer))))
      );
    });
    if (group) group.push(item);
    else groups.push([item]);
  }
  return groups;
}
function shareTypefaceScale(groups, final) {
  for (const group of groups) {
    if (group.length < 2) continue;
    // The line with more glyphs is less sensitive to individual letter forms.
    const reference = group.reduce((a, b) => (b.metrics.glyphs > a.metrics.glyphs ? b : a));
    const heightLimit = Math.min(...group.map((item) => item.metrics.glyphBounds.h));
    for (const item of group) {
      item.box.textSize = reference.box.textSize;
      if (final) item.box.textHeightLimit = heightLimit;
    }
  }
}
function createSkeletonMask(image, box) {
  const w = Math.floor(box.w),
    h = Math.floor(box.h),
    mask = new Uint8Array(w * h);
  let ink = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = ((box.y + y) * image.width + box.x + x) * 4;
      if (
        Math.max(
          Math.abs(box.bg[0] - image.data[i]),
          Math.abs(box.bg[1] - image.data[i + 1]),
          Math.abs(box.bg[2] - image.data[i + 2])
        ) > 90
      ) {
        mask[y * w + x] = 1;
        ink++;
      }
    }
  return { w, h, mask, ink };
}
function thinSkeletonPhase(mask, w, h, phase) {
  const remove = [];
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const k = y * w + x;
      if (!mask[k]) continue;
      const n = [
        mask[k - w],
        mask[k - w + 1],
        mask[k + 1],
        mask[k + w + 1],
        mask[k + w],
        mask[k + w - 1],
        mask[k - 1],
        mask[k - w - 1],
      ];
      const count = n.reduce((sum, v) => sum + v, 0),
        transitions = n.reduce((sum, v, i) => sum + (!v && n[(i + 1) % 8] ? 1 : 0), 0);
      if (count < 2 || count > 6 || transitions !== 1) continue;
      if (
        phase === 0
          ? n[0] * n[2] * n[4] || n[2] * n[4] * n[6]
          : n[0] * n[2] * n[6] || n[0] * n[4] * n[6]
      )
        continue;
      remove.push(k);
    }
  for (const k of remove) mask[k] = 0;
  return remove.length;
}
function skeletonStroke(image, { box }, strokeCache) {
  if (strokeCache.has(box)) return strokeCache.get(box);
  const { w, h, mask, ink } = createSkeletonMask(image, box);
  let changed = true;
  while (changed) {
    changed = false;
    for (let phase = 0; phase < 2; phase++) {
      if (thinSkeletonPhase(mask, w, h, phase)) changed = true;
    }
  }

  const stroke =
    ink /
    Math.max(
      1,
      mask.reduce((sum, v) => sum + v, 0)
    );
  strokeCache.set(box, stroke);
  return stroke;
}
function shortTypefaceAnchor(image, item, anchor, stroke, strokeCache) {
  const m = item.metrics;
  const a = anchor.metrics,
    p = m.glyphBounds,
    q = a.glyphBounds;
  if (
    a.glyphs < 5 ||
    a.baselineAgreement < 0.8 ||
    a.heightAgreement < 0.8 ||
    a.foregroundCoverage < 0.85
  )
    return null;
  if (Math.max(...item.box.bg.map((v, i) => Math.abs(v - anchor.box.bg[i]))) > 20) return null;
  const ratio = stroke / skeletonStroke(image, anchor, strokeCache);
  if (ratio < 0.6 || ratio > 1.25 || p.h < a.xHeight * 0.85 || p.h > q.h * 1.1) return null;
  const h = Math.max(p.h, q.h),
    dx = Math.max(p.x - q.x - q.w, q.x - p.x - p.w, 0),
    dy = Math.max(p.y - q.y - q.h, q.y - p.y - p.h, 0);
  const aligned =
    Math.abs(p.x - q.x) <= Math.max(4, h * 0.25) ||
    Math.abs(p.x + p.w - q.x - q.w) <= Math.max(4, h * 0.25);
  const overlap = Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y);
  const sameRow = overlap >= Math.min(p.h, q.h) * 0.5 && dx <= h * 8;
  if (anchor.box === item.box) return null;
  return {
    anchor,
    sameRow,
    ratio,
    local: sameRow || (aligned && dy <= h * 3),
    distance: Math.hypot(dx, dy),
  };
}
function matchShortTypeface(image, short, measured, strongRows, groups) {
  const strokeCache = new Map();
  for (const item of short) {
    const m = item.metrics,
      stroke = skeletonStroke(image, item, strokeCache);
    if (m.baselineAgreement < 0.7 || m.heightAgreement < 0.7 || m.foregroundCoverage < 0.85)
      continue;
    const anchors = [...measured, ...strongRows]
      .map((anchor) => shortTypefaceAnchor(image, item, anchor, stroke, strokeCache))
      .filter(Boolean)
      .sort((a, b) => a.distance - b.distance);
    if (!anchors.length) continue;
    const local = anchors.filter((a) => a.local);
    let selected;
    if (local.length) selected = local[0];
    else {
      const classes = new Set(anchors.map((a) => groups.findIndex((g) => g.includes(a.anchor))));
      if (classes.has(-1) || classes.size !== 1) continue;
      selected = anchors[0];
    }
    const reference = selected.anchor,
      sameRow = selected.sameRow;
    item.box.textSize = reference.box.textSize;
    item.box.textHeightLimit = reference.box.textHeightLimit;
    if (sameRow)
      item.box.textCenterY = reference.box.textCenterY ?? reference.box.y + reference.box.h / 2;
  }
}
function constrainTypefaceRows(image, boxes, glyphMetrics) {
  const rows = boxes
    .filter((box) => box.shape === 'text')
    .map((box) => ({ box, metrics: glyphMetrics(image, box, 1) }))
    .filter((row) => row.metrics?.glyphBounds);
  for (const row of rows) {
    const p = row.metrics.glyphBounds,
      center = row.box.textCenterY ?? row.box.y + row.box.h / 2;
    let top = -Infinity,
      bottom = Infinity;
    for (const other of rows) {
      if (other === row) continue;
      const q = other.metrics.glyphBounds;
      if (Math.min(p.x + p.w, q.x + q.w) <= Math.max(p.x, q.x)) continue;
      if (q.y + q.h <= p.y) top = Math.max(top, (q.y + q.h + p.y) / 2 + 0.5);
      else if (p.y + p.h <= q.y) bottom = Math.min(bottom, (p.y + p.h + q.y) / 2 - 0.5);
    }
    row.box.textHeightLimit = Math.max(
      1,
      Math.floor(2 * Math.min(center - top, bottom - center, 500000))
    );
  }
}
export function normalizeTypeface(image, boxes, final, glyphMetrics) {
  const { measured, short, strongRows } = measureTypefaceRows(image, boxes, final, glyphMetrics);
  const groups = groupTypefaceMeasurements(measured);
  shareTypefaceScale(groups, final);

  if (final) matchShortTypeface(image, short, measured, strongRows, groups);

  if (final) constrainTypefaceRows(image, boxes, glyphMetrics);
}
