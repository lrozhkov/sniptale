// A clipped frame can enclose a flat navigation surface. Require both a
// dominant surface color and several independent, coherent glyph rows before
// allowing its contents to participate in ordinary detection.
function isFlatTextPanel(image, box, measure) {
  const { data, width, height } = image;
  const x0 = Math.max(0, Math.floor(box.x)),
    y0 = Math.max(0, Math.floor(box.y));
  const w = Math.min(width - x0, Math.floor(box.w)),
    h = Math.min(height - y0, Math.floor(box.h));
  if (w < 80 || h < 100) return false;
  const bins = new Map();
  let count = 0;
  for (let y = y0 + 2; y < y0 + h - 2; y += 2)
    for (let x = x0 + 2; x < x0 + w - 2; x += 2) {
      const i = (y * width + x) * 4,
        key = (data[i] >> 3) * 1024 + (data[i + 1] >> 3) * 32 + (data[i + 2] >> 3);
      bins.set(key, (bins.get(key) || 0) + 1);
      count++;
    }
  const dominant = [...bins.values()].sort((a, b) => b - a);
  if ((dominant[0] + (dominant[1] || 0)) / count < 0.64) return false;
  const bands = panelEdgeBands(data, width, x0, y0, w, h);
  const rows = [];
  for (const [y, bh] of bands) {
    if (bh < 6 || bh > Math.min(45, h * 0.12)) continue;
    const top = Math.max(y0, y - 2),
      bottom = Math.min(y0 + h, y + bh + 2),
      samples = [[], [], []];
    for (let x = x0 + 4; x < x0 + w - 4; x++) {
      const i = (top * width + x) * 4;
      for (let c = 0; c < 3; c++) samples[c].push(data[i + c]);
    }
    const bg = samples.map((a) => a.sort((a, b) => a - b)[Math.floor(a.length / 2)]);
    const { bestStart, bestEnd } = panelRowSurfaceExtent(data, width, x0, w, top, bg);
    if (bestEnd - bestStart < w * 0.5) continue;
    const rowLeft = bestStart;
    const m = measure(image, { x: rowLeft, y: top, w: bestEnd - rowLeft, h: bottom - top, bg }, 3);
    if (
      m &&
      m.glyphs >= 5 &&
      m.baselineAgreement >= 0.8 &&
      m.heightAgreement >= 0.8 &&
      m.foregroundCoverage >= 0.65 &&
      m.stroke / Math.max(1, m.xHeight) <= 0.4
    )
      rows.push(m);
  }
  if (rows.length < 4) return false;
  const heights = rows.map((m) => m.xHeight).sort((a, b) => a - b),
    median = heights[Math.floor(heights.length / 2)];
  return rows.filter((m) => Math.abs(m.xHeight - median) <= Math.max(1, median * 0.15)).length >= 4;
}

// Reject a media proposal only when its residual closely resembles one centered
// text line over a smooth surface interpolated between its upper and lower edges. Uncertain surfaces remain media.
export function rejectPlanarMedia(image, media, measure, sourceRows = []) {
  const { data, width, height } = image;
  return media.filter((box) => {
    if (box.kind === 'media-surface') {
      if (hasAlignedPanelRows(sourceRows, box)) return false;
    }
    if (
      (box.kind === 'clipped-framed-image' || box.kind === 'media-surface') &&
      isFlatTextPanel(image, box, measure)
    )
      return false;
    if (box.kind !== 'isolated-graphic') return true;
    const x0 = Math.max(0, Math.floor(box.x)),
      y0 = Math.max(0, Math.floor(box.y)),
      w = Math.min(width - x0, Math.floor(box.w)),
      h = Math.min(height - y0, Math.floor(box.h));
    if (w < 32 || h < 24 || w > 512 || h > 512) return true;
    const sample = (x, y) => {
      const channels = [[], [], []];
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = Math.max(0, Math.min(w - 1, x + dx)),
            yy = Math.max(0, Math.min(h - 1, y + dy)),
            i = ((y0 + yy) * width + x0 + xx) * 4;
          for (let c = 0; c < 3; c++) channels[c].push(data[i + c]);
        }
      return channels.map((a) => a.sort((a, b) => a - b)[4]);
    };
    const inset = Math.max(2, Math.min(5, Math.floor(Math.min(w, h) * 0.04))),
      left = inset,
      right = w - 1 - inset,
      top = inset,
      bottom = h - 1 - inset;
    if (right <= left || bottom <= top) return true;
    const columns = Array.from({ length: w }, (_, x) => {
      const xx = Math.max(left, Math.min(right, x));
      return [sample(xx, top), sample(xx, bottom)];
    });
    const { residual, smooth, strong } = planarColumnResidual(
      data,
      width,
      x0,
      y0,
      w,
      h,
      columns,
      top,
      bottom
    );
    if (smooth / (w * h) < 0.85 || strong < 12 || strong / (w * h) > 0.15) return true;
    const metrics = measure(
      { width: w, height: h, data: residual },
      { x: 0, y: 0, w, h, bg: [255, 255, 255] },
      3
    );
    if (
      !metrics ||
      metrics.glyphs < 3 ||
      metrics.baselineAgreement < 0.8 ||
      metrics.heightAgreement < 0.8 ||
      metrics.stroke / Math.max(1, metrics.xHeight) > 0.4 ||
      metrics.foregroundCoverage < 0.85 ||
      metrics.unexplained?.length
    )
      return true;
    const b = metrics.glyphBounds,
      cx = b.x + b.w / 2,
      cy = b.y + b.h / 2;
    if (Math.abs(cx - w / 2) > w * 0.25 || Math.abs(cy - h / 2) > h * 0.25 || b.h > h * 0.4)
      return true;
    return false;
  });
}

function panelEdgeBands(data, width, x0, y0, w, h) {
  const bands = [];
  let start = -1;
  for (let y = y0; y < y0 + h; y++) {
    let edges = 0;
    for (let x = x0 + 2; x < x0 + w - 3; x++) {
      const i = (y * width + x) * 4;
      if (
        Math.abs(data[i] - data[i + 4]) +
          Math.abs(data[i + 1] - data[i + 5]) +
          Math.abs(data[i + 2] - data[i + 6]) >
        45
      )
        edges++;
    }
    if (edges > Math.max(3, w * 0.012)) {
      if (start < 0) start = y;
    } else if (start >= 0) {
      bands.push([start, y - start]);
      start = -1;
    }
  }
  if (start >= 0) bands.push([start, y0 + h - start]);
  return bands;
}

function panelRowSurfaceExtent(data, width, x0, w, top, bg) {
  // Follow the measured surface across this row. Brief interruptions can be
  // antialiased strokes; a sustained color change marks the surface edge.
  let bestStart = 0,
    bestEnd = 0,
    runStart = -1,
    lastMatch = -1;
  for (let x = x0 + 4; x <= x0 + w - 4; x++) {
    const i = (top * width + x) * 4;
    const match = x < x0 + w - 4 && Math.max(...bg.map((v, c) => Math.abs(data[i + c] - v))) <= 12;
    if (match) {
      if (runStart < 0) runStart = x;
      lastMatch = x;
    }
    if (runStart >= 0 && ((!match && x - lastMatch > 2) || x === x0 + w - 4)) {
      if (lastMatch + 1 - runStart > bestEnd - bestStart) {
        bestStart = runStart;
        bestEnd = lastMatch + 1;
      }
      runStart = -1;
    }
  }
  return { bestStart, bestEnd };
}

function hasAlignedPanelRows(sourceRows, box) {
  const rows = sourceRows.filter((m) => {
    const g = m.glyphBounds;
    return g.x >= box.x && g.y >= box.y && g.x + g.w <= box.x + box.w && g.y + g.h <= box.y + box.h;
  });
  if (
    rows.some((row) =>
      ['left', 'right'].some((side) => {
        const edge = (m) => m.glyphBounds.x + (side === 'right' ? m.glyphBounds.w : 0);
        const aligned = rows
          .filter(
            (other) => Math.abs(edge(row) - edge(other)) <= Math.max(2, row.stroke, other.stroke)
          )
          .sort((a, b) => a.glyphBounds.y - b.glyphBounds.y);
        const distinct = [];
        for (const candidate of aligned) {
          const a = candidate.glyphBounds;
          if (
            !distinct.some((other) => {
              const b = other.glyphBounds;
              return (
                Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) >= Math.min(a.h, b.h) * 0.5
              );
            })
          )
            distinct.push(candidate);
        }
        return distinct.length >= 4;
      })
    )
  )
    return true;
  return false;
}

function planarColumnResidual(data, width, x0, y0, w, h, columns, top, bottom) {
  const residual = new Uint8ClampedArray(w * h * 4);
  let smooth = 0,
    strong = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const ty = (y - top) / (bottom - top),
        i = ((y0 + y) * width + x0 + x) * 4,
        j = (y * w + x) * 4;
      let diff = 0;
      for (let c = 0; c < 3; c++) {
        const predicted = columns[x][0][c] * (1 - ty) + columns[x][1][c] * ty;
        diff = Math.max(diff, Math.abs(data[i + c] - predicted));
      }
      if (diff <= 12) smooth++;
      const foreground = diff > 20;
      if (foreground) strong++;
      residual[j] =
        residual[j + 1] =
        residual[j + 2] =
          diff > 12 ? 255 - Math.min(255, diff * 2) : 255;
      residual[j + 3] = 255;
    }
  return { residual, smooth, strong };
}
