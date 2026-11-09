const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
export function bounds(parts) {
  const x = Math.min(...parts.map((p) => p.x)),
    y = Math.min(...parts.map((p) => p.y));
  return {
    x,
    y,
    w: Math.max(...parts.map((p) => p.x + p.w)) - x,
    h: Math.max(...parts.map((p) => p.y + p.h)) - y,
  };
}

export function unique(parts) {
  return [...new Map(parts.map((p) => [[p.x, p.y, p.w, p.h].join(','), p])).values()];
}

export function inkParts(image, box) {
  const pixels = image.data,
    stride = image.width,
    rasterHeight = image.height;
  if (box.atoms?.length) return unique(box.atoms);
  const x0 = Math.max(0, Math.floor(box.x)),
    y0 = Math.max(0, Math.floor(box.y));
  const w = Math.min(stride - x0, Math.ceil(box.w)),
    h = Math.min(rasterHeight - y0, Math.ceil(box.h));
  const mask = new Uint8Array(w * h),
    parts = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = ((y + y0) * stride + x + x0) * 4;
      mask[y * w + x] =
        pixels[i + 3] >= 128 &&
        Math.max(
          Math.abs(box.bg[0] - pixels[i]),
          Math.abs(box.bg[1] - pixels[i + 1]),
          Math.abs(box.bg[2] - pixels[i + 2])
        ) > 40
          ? 1
          : 0;
    }
  for (let k = mask.indexOf(1); k !== -1; k = mask.indexOf(1, k + 1)) {
    const queue = [k];
    mask[k] = 2;
    let left = w,
      right = 0,
      top = h,
      bottom = 0;
    const rgb = [0, 0, 0];
    for (let n = 0; n < queue.length; n++) {
      const at = queue[n],
        x = at % w,
        y = Math.floor(at / w),
        i = ((y + y0) * stride + x + x0) * 4;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
      for (let c = 0; c < 3; c++) rgb[c] += pixels[i + c];
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx,
            yy = y + dy,
            j = yy * w + xx;
          if (xx < 0 || xx >= w || yy < 0 || yy >= h || mask[j] !== 1) continue;
          mask[j] = 2;
          queue.push(j);
        }
    }
    if (queue.length >= 2)
      parts.push({
        x: x0 + left,
        y: y0 + top,
        w: right - left + 1,
        h: bottom - top + 1,
        n: queue.length,
        rgb: rgb.map((v) => v / queue.length),
      });
  }
  return parts;
}

export function partBox(box, parts, group, shape = 'text', sameLine = false) {
  const tight = bounds(parts),
    padding = shape === 'text' ? 2 : 1,
    x = Math.max(0, tight.x - padding),
    y = Math.max(0, tight.y - padding);
  const result = {
    ...box,
    x,
    y,
    w: tight.w + padding * 2,
    h: tight.h + padding * 2,
    atoms: parts,
    shape,
    structureGroup: group,
    componentCount: parts.length,
    compact: shape === 'icon',
  };
  if (shape === 'text' && sameLine) {
    result.y = box.y;
    result.h = box.h;
  }
  delete result.typeMetrics;
  delete result.textCenterY;
  delete result.rowTextSize;
  delete result.textSize;
  delete result.contrast;
  if (shape === 'icon') {
    result.roleEvidence = 'structured-symbol';
    result.iconSize = Math.max(4, Math.min(tight.w, tight.h));
    result.sourceBounds = { x, y, w: tight.w + 2, h: tight.h + 2 };
  } else {
    delete result.roleEvidence;
    delete result.iconSize;
    delete result.sourceBounds;
  }
  return result;
}

export function sortedRuns(parts) {
  const runs = [];
  for (const p of [...parts].sort((a, b) => a.x - b.x)) {
    const last = runs.at(-1);
    if (last && p.x <= last.right) {
      last.parts.push(p);
      last.right = Math.max(last.right, p.x + p.w);
    } else runs.push({ x: p.x, right: p.x + p.w, parts: [p] });
  }
  return runs;
}

export function confirmedText(metrics) {
  return (
    !!metrics &&
    metrics.baselineAgreement >= 0.7 &&
    metrics.heightAgreement >= 0.7 &&
    metrics.stroke / Math.max(1, metrics.xHeight) <= 0.4
  );
}

export function rectangularGrid(image, parts) {
  if (parts.length !== 4) return false;
  const w = median(parts.map((p) => p.w)),
    h = median(parts.map((p) => p.h));
  if (
    w < 3 ||
    h < 3 ||
    w / h < 0.6 ||
    w / h > 1.6 ||
    parts.some((p) => Math.abs(p.w - w) > 1 || Math.abs(p.h - h) > Math.max(2, h * 0.35))
  )
    return false;
  const xs = [...new Set(parts.map((p) => p.x))].sort((a, b) => a - b);
  if (xs.length !== 2 || xs[1] - xs[0] < w + 1 || xs[1] - xs[0] > w + 5) return false;
  const columns = xs.map((x) => parts.filter((p) => p.x === x).sort((a, b) => a.y - b.y));
  if (
    columns.some(
      (c) => c.length !== 2 || c[1].y - c[0].y - c[0].h < 1 || c[1].y - c[0].y - c[0].h > 5
    )
  )
    return false;
  if (
    Math.abs(columns[0][0].y - columns[1][0].y) > 1 ||
    Math.abs(columns[0][1].y + columns[0][1].h - columns[1][1].y - columns[1][1].h) > 1
  )
    return false;
  return parts.every((p) => {
    const i = ((p.y - 2) * image.width + p.x - 2) * 4,
      bg = [image.data[i], image.data[i + 1], image.data[i + 2]];
    const edges = [p.y, p.y + p.h - 1].map((edge) => {
      let best = 0;
      for (const y of [edge, edge === p.y ? edge + 1 : edge - 1]) {
        let ink = 0;
        for (let x = p.x; x < p.x + p.w; x++) {
          const at = (y * image.width + x) * 4;
          if (Math.max(...bg.map((v, c) => Math.abs(v - image.data[at + c]))) > 35) ink++;
        }
        best = Math.max(best, ink / p.w);
      }
      return best;
    });
    return Math.min(...edges) >= 0.6 && Math.max(...edges) >= 0.85;
  });
}

export function opposedStrokes(image, leftParts, rightParts, bg) {
  const a = bounds(leftParts),
    b = bounds(rightParts),
    h = Math.max(a.h, b.h);
  if (
    a.w / a.h < 0.25 ||
    a.w / a.h > 1 ||
    b.w / b.h < 0.25 ||
    b.w / b.h > 1 ||
    Math.abs(a.h - b.h) > h * 0.2 ||
    Math.abs(a.y - b.y) > h * 0.15 ||
    b.x - a.x - a.w > h * 0.75
  )
    return false;
  const profile = (p) => {
    const groups = [[], [], []];
    for (let y = p.y; y < p.y + p.h; y++)
      for (let x = p.x; x < p.x + p.w; x++) {
        const i = (y * image.width + x) * 4;
        if (Math.max(...bg.map((v, c) => Math.abs(v - image.data[i + c]))) > 40)
          groups[Math.min(2, Math.floor(((y - p.y) * 3) / p.h))].push(x - p.x);
      }
    if (groups.some((g) => !g.length)) return null;
    const centers = groups.map((g) => g.reduce((n, v) => n + v, 0) / g.length);
    if (Math.abs(centers[0] - centers[2]) > p.w * 0.25) return null;
    const turn = centers[1] - (centers[0] + centers[2]) / 2;
    return Math.abs(turn) >= p.w * 0.2 ? turn : null;
  };
  const one = profile(a),
    two = profile(b);
  return one !== null && two !== null && one * two < 0;
}

// Enclosed negative regions and internal islands establish compact graphic structure.
export function graphicTopology(image, box, measure) {
  if (
    box.w < 14 ||
    box.h < 14 ||
    box.w > 48 ||
    box.h > 48 ||
    box.w / box.h < 0.55 ||
    box.w / box.h > 1.8
  )
    return null;
  const metrics = measure(image, box);
  if (confirmedText(metrics) && metrics.glyphs >= 2) return null;
  const parts = inkParts(image, { ...box, atoms: null }).sort((a, b) => b.n - a.n);
  const main = parts[0];
  if (!main || main.n < box.w * box.h * 0.35) return null;
  const holes = graphicInteriorHoles(image, box);
  for (const hole of holes) {
    if (hole.n < box.w * box.h * 0.06) continue;
    const islands = parts
      .slice(1)
      .filter(
        (p) =>
          p.x > hole.x &&
          p.y >= hole.y &&
          p.x + p.w < hole.x + hole.w &&
          p.y + p.h <= hole.y + hole.h &&
          p.w <= hole.w * 0.4 &&
          p.h <= hole.h * 0.7 &&
          p.n >= 3
      );
    if (islands.length) return 'nested-graphic';
  }
  if (holes.length >= 3 && main.w / main.h <= 1.1) return 'complex-contour';
  return null;
}

export function staggeredGraphic(image, box, typography) {
  if (box.w > 48 || box.h > 48 || (confirmedText(typography) && typography.glyphs >= 2))
    return false;
  const parts = inkParts(image, { ...box, atoms: null }).sort((a, b) => a.x - b.x);
  if (
    parts.length !== 2 ||
    parts.some(
      (p) => p.w < 4 || p.h < 4 || p.n < 16 || Math.max(...p.rgb) - Math.min(...p.rgb) < 48
    )
  )
    return false;
  const [a, b] = parts,
    gap = b.x - a.x - a.w;
  return (
    gap >= 0 &&
    gap <= Math.min(a.h, b.h) * 0.65 &&
    Math.abs(a.y + a.h - b.y - b.h) >= Math.min(a.h, b.h) * 0.5 &&
    Math.max(...a.rgb.map((v, c) => Math.abs(v - b.rgb[c]))) >= 24
  );
}

function graphicInteriorHoles(image, box) {
  const width = Math.floor(box.w),
    height = Math.floor(box.h),
    mask = new Uint8Array(width * height),
    holes = [];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = ((box.y + y) * image.width + box.x + x) * 4;
      if (
        image.data[i + 3] >= 128 &&
        Math.max(
          Math.abs(box.bg[0] - image.data[i]),
          Math.abs(box.bg[1] - image.data[i + 1]),
          Math.abs(box.bg[2] - image.data[i + 2])
        ) > 40
      )
        mask[y * width + x] = 1;
    }
  for (let k = 0; k < mask.length; k++) {
    if (mask[k]) continue;
    const hole = traceGraphicHole(mask, width, height, k, box);
    if (hole) holes.push(hole);
  }
  return holes;
}

function traceGraphicHole(mask, width, height, k, box) {
  const queue = [k];
  mask[k] = 2;
  let left = width,
    right = 0,
    top = height,
    bottom = 0,
    outside = false;
  for (let n = 0; n < queue.length; n++) {
    const p = queue[n],
      x = p % width,
      y = Math.floor(p / width);
    left = Math.min(left, x);
    right = Math.max(right, x);
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1) outside = true;
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) {
      const xx = x + dx,
        yy = y + dy,
        j = yy * width + xx;
      if (xx >= 0 && yy >= 0 && xx < width && yy < height && !mask[j]) {
        mask[j] = 2;
        queue.push(j);
      }
    }
  }
  if (!outside && queue.length >= 3)
    return {
      x: box.x + left,
      y: box.y + top,
      w: right - left + 1,
      h: bottom - top + 1,
      n: queue.length,
    };
  return null;
}
