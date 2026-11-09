// Pixel-only proposals and boundary alignment for visible textured media surfaces.
export function resemblesTextList(image, box) {
  const { data, width } = image,
    bands = [];
  let start = -1;
  for (let y = box.y; y < box.y + box.h; y++) {
    const edges = horizontalEdgeCount(data, width, y, box.x, box.x + box.w - 1);
    const active = edges > Math.max(3, box.w * 0.012);
    if (active && start < 0) start = y;
    if (!active && start >= 0) {
      bands.push(y - start);
      start = -1;
    }
  }
  if (start >= 0) bands.push(box.y + box.h - start);
  return (
    bands.length >= 2 &&
    Math.max(...bands) <= 32 &&
    bands.filter((h) => h <= 22).length / bands.length >= 0.8
  );
}

export function detectSurfaces(image) {
  const out = detectTextureSeeds(image);
  // Extend texture seeds only when two long pixel transitions support a surface.
  const lines = findSurfaceTransitions(image);
  // An image clipped by the screenshot can end at the raster boundary.
  // It still needs both continuous side boundaries; texture alone is insufficient.
  appendClippedSurfaceTransitions(image, lines);
  lines.sort((a, b) => a.y - b.y);
  const surfaces = [];
  for (let i = 0; i < lines.length; i++)
    for (let j = i + 1; j < lines.length; j++) {
      const surface = proposeSupportedSurface(image, lines[i], lines[j], out);
      if (surface) surfaces.push(surface);
    }
  return chooseMediaSurfaces(surfaces);
}

function isMediaTextureTile(image, tx, ty, step) {
  const { data, width: w, height: h } = image;
  const colors = new Set();
  let edges = 0,
    n = 0,
    sum = 0,
    sum2 = 0;
  for (let y = ty * step; y < Math.min(h, (ty + 1) * step); y += 2)
    for (let x = tx * step; x < Math.min(w, (tx + 1) * step); x += 2) {
      const i = (y * w + x) * 4,
        r = data[i],
        g = data[i + 1],
        b = data[i + 2];
      if (data[i + 3] < 128) continue;
      colors.add(((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4));
      const l = (r + g + b) / 3;
      sum += l;
      sum2 += l * l;
      n++;
      if (x + 2 < w) {
        const j = i + 8;
        if (Math.abs(r - data[j]) + Math.abs(g - data[j + 1]) + Math.abs(b - data[j + 2]) > 36)
          edges++;
      }
    }
  const variance = n ? sum2 / n - (sum / n) ** 2 : 0;
  return colors.size >= 12 && variance > 110 && edges >= 10;
}

function traceMediaTextureTiles(active, seen, cols, rows, k) {
  const q = [k];
  seen[k] = 1;
  let minx = cols,
    miny = rows,
    maxx = 0,
    maxy = 0;
  for (let i = 0; i < q.length; i++) {
    const p = q[i],
      x = p % cols,
      y = Math.floor(p / cols);
    minx = Math.min(minx, x);
    maxx = Math.max(maxx, x);
    miny = Math.min(miny, y);
    maxy = Math.max(maxy, y);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx,
          ny = y + dy,
          j = ny * cols + nx;
        if (nx >= 0 && ny >= 0 && nx < cols && ny < rows && active[j] && !seen[j]) {
          seen[j] = 1;
          q.push(j);
        }
      }
  }
  return { count: q.length, minx, miny, maxx, maxy };
}

function textureSeedHasTextBands(image, x, y, bw, bh) {
  const { data, width: w } = image;
  let bands = 0,
    inBand = false;
  for (let yy = y; yy < y + bh; yy++) {
    let changes = 0;
    for (let xx = x; xx < x + bw - 1; xx++) {
      const i = (yy * w + xx) * 4,
        j = i + 4;
      if (
        Math.abs(data[i] - data[j]) +
          Math.abs(data[i + 1] - data[j + 1]) +
          Math.abs(data[i + 2] - data[j + 2]) >
        45
      )
        changes++;
    }
    const on = changes > Math.max(3, bw * 0.012);
    if (on && !inBand) bands++;
    inBand = on;
  }
  return bands >= 5 && bands > bh / 32;
}

function detectTextureSeeds(image) {
  const { data, width: w, height: h } = image,
    step = 16,
    cols = Math.ceil(w / step),
    rows = Math.ceil(h / step);
  const active = new Uint8Array(cols * rows);
  for (let ty = 0; ty < rows; ty++)
    for (let tx = 0; tx < cols; tx++) {
      if (isMediaTextureTile(image, tx, ty, step)) active[ty * cols + tx] = 1;
    }
  const seen = new Uint8Array(active.length),
    out = [];
  for (let k = 0; k < active.length; k++) {
    if (!active[k] || seen[k]) continue;
    const { count, minx, miny, maxx, maxy } = traceMediaTextureTiles(active, seen, cols, rows, k);
    const x = minx * step,
      y = miny * step,
      bw = Math.min(w, (maxx + 1) * step) - x,
      bh = Math.min(h, (maxy + 1) * step) - y;
    if (
      bw < 64 ||
      bh < 64 ||
      bw / bh > 5 ||
      count < 12 ||
      count / ((maxx - minx + 1) * (maxy - miny + 1)) < 0.22
    )
      continue;
    // Repeated horizontal stroke bands are more likely text than a photograph.
    if (textureSeedHasTextBands(image, x, y, bw, bh)) continue;
    const samples = [];
    for (let xx = x; xx < x + bw; xx += 8) {
      for (const yy of [y - 2, y + bh + 1])
        if (yy >= 0 && yy < h) {
          let i = (yy * w + xx) * 4;
          samples.push([data[i], data[i + 1], data[i + 2]]);
        }
    }
    const bg = [0, 1, 2].map((ch) => {
      const a = samples.map((s) => s[ch]).sort((a, b) => a - b);
      return a.length ? a[Math.floor(a.length / 2)] : 255;
    });
    out.push({
      x,
      y,
      w: bw,
      h: bh,
      shape: 'image',
      bg,
      contrast: 255,
      kind: 'media',
      tileCount: count,
    });
  }
  return out;
}

function findSurfaceTransitions(image) {
  const { data, width: w, height: h } = image;
  const lines = [];
  for (let y = 2; y < h - 2; y++) {
    let start = -1,
      last = -1;
    for (let x = 0; x < w; x++) {
      const a = ((y - 2) * w + x) * 4,
        b = ((y + 2) * w + x) * 4;
      const diff =
        Math.abs(data[a] - data[b]) +
        Math.abs(data[a + 1] - data[b + 1]) +
        Math.abs(data[a + 2] - data[b + 2]);
      if (diff > 24) {
        if (start < 0) start = x;
        last = x;
      }
      if (start >= 0 && (x - last > 2 || x === w - 1)) {
        if (last - start >= 96) lines.push({ y, x: start, r: last + 1 });
        start = -1;
      }
    }
  }
  return lines;
}

function clippedSurfaceSideSupport(image, a, x) {
  const { data, width: w, height: h } = image;

  let hits = 0,
    total = 0;
  for (let y = a.y + 4; y < h; y += 3) {
    let min = 255,
      max = 0;
    for (let dx = -2; dx <= 2; dx++) {
      const xx = Math.max(0, Math.min(w - 1, x + dx)),
        i = (y * w + xx) * 4;
      const l = (data[i] + data[i + 1] + data[i + 2]) / 3;
      min = Math.min(min, l);
      max = Math.max(max, l);
    }
    total++;
    if (max - min > 14) hits++;
  }
  return hits / Math.max(1, total);
}

function clippedSurfaceTerminalSupport(image, a, x) {
  const { data, width: w, height: h } = image;

  let hits = 0,
    total = 0;
  for (let y = Math.max(a.y + 4, h - 16); y < h; y++) {
    let lo = 255,
      hi = 0;
    for (let dx = -2; dx <= 2; dx++) {
      const xx = Math.max(0, Math.min(w - 1, x + dx)),
        i = (y * w + xx) * 4,
        l = (data[i] + data[i + 1] + data[i + 2]) / 3;
      lo = Math.min(lo, l);
      hi = Math.max(hi, l);
    }
    total++;
    if (hi - lo > 14) hits++;
  }
  return hits / Math.max(1, total);
}

function appendClippedSurfaceTransitions(image, lines) {
  const { height: h } = image;
  const clipped = [];
  for (const a of lines) {
    if (h - a.y < 80 || h - a.y > h * 0.8) continue;

    if (
      Math.min(
        clippedSurfaceSideSupport(image, a, a.x),
        clippedSurfaceSideSupport(image, a, a.r - 1)
      ) > 0.65 &&
      Math.min(
        clippedSurfaceTerminalSupport(image, a, a.x),
        clippedSurfaceTerminalSupport(image, a, a.r - 1)
      ) > 0.65
    )
      clipped.push({ ...a, y: h, clipped: true });
  }
  lines.push(...clipped);
}

function surfaceVerticalSupport(image, box, edge) {
  const { data, width: w } = image;

  let hits = 0,
    total = 0;
  for (let yy = box.y; yy < box.y + box.h; yy += 2) {
    const l = Math.max(0, edge - 3),
      r = Math.min(w - 1, edge + 3),
      a = (yy * w + l) * 4,
      b = (yy * w + r) * 4;
    total++;
    if (
      Math.abs(data[a] - data[b]) +
        Math.abs(data[a + 1] - data[b + 1]) +
        Math.abs(data[a + 2] - data[b + 2]) >
      24
    )
      hits++;
  }
  return hits / total;
}

function alignClippedSurface(image, box) {
  const { data, width: w } = image;
  const score = (x) => {
    let sum = 0,
      n = 0;
    for (let yy = box.y + 3; yy < box.y + box.h; yy += 2) {
      const a = (yy * w + Math.max(0, x - 2)) * 4,
        b = (yy * w + Math.min(w - 1, x + 2)) * 4;
      sum +=
        Math.abs(data[a] - data[b]) +
        Math.abs(data[a + 1] - data[b + 1]) +
        Math.abs(data[a + 2] - data[b + 2]);
      n++;
    }
    return sum / Math.max(1, n);
  };
  const edge = (start, end) => {
    let best = start,
      value = 0;
    for (let x = start; x <= end; x++) {
      const s = score(x);
      if (s > value) {
        best = x;
        value = s;
      }
    }
    return { position: best, value };
  };
  const left = edge(box.x, Math.floor(box.x + box.w * 0.12)),
    right = edge(Math.ceil(box.x + box.w * 0.88), box.x + box.w - 1);
  if (left.value > 80 && right.value > 80) {
    box.w = right.position - left.position;
    box.x = left.position;
  }
}

function surfaceBackground(image, box) {
  const { data, width: w, height: h } = image;
  const bins = new Map();
  const sample = (xx, yy) => {
    if (xx < 0 || yy < 0 || xx >= w || yy >= h) return;
    const i = (yy * w + xx) * 4,
      r = data[i],
      g = data[i + 1],
      b = data[i + 2],
      key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const n = bins.get(key) || [0, 0, 0, 0];
    n[0]++;
    n[1] += r;
    n[2] += g;
    n[3] += b;
    bins.set(key, n);
  };
  for (let xx = box.x; xx < box.x + box.w; xx += 4) {
    sample(xx, box.y - 3);
    sample(xx, box.y + box.h + 3);
  }
  for (let yy = box.y; yy < box.y + box.h; yy += 4) {
    sample(box.x - 3, yy);
    sample(box.x + box.w + 3, yy);
  }
  const bin = [...bins.values()].sort((a, b) => b[0] - a[0])[0];
  return bin ? bin.slice(1).map((c) => Math.round(c / bin[0])) : [255, 255, 255];
}

function proposeSupportedSurface(image, a, b, textureSeeds) {
  const { width: w, height: h } = image;
  const height = b.y - a.y;
  if (height < 80 || height > h * 0.8) return null;
  const left = Math.max(a.x, b.x),
    right = Math.min(a.r, b.r),
    width = right - left;
  if (width < 96 || width < Math.max(a.r - a.x, b.r - b.x) * 0.8 || (b.clipped && width > w * 0.65))
    return null;
  if (Math.abs(a.x - b.x) > 40 || Math.abs(a.r - b.r) > 40) return null;
  const box = {
    x: Math.round((a.x + b.x) / 2),
    y: a.y,
    w: Math.round((a.r + b.r - (a.x + b.x)) / 2),
    h: height,
  };
  const seeds = textureSeeds.filter((p) => {
    const iw = Math.max(0, Math.min(p.x + p.w, box.x + box.w) - Math.max(p.x, box.x));
    const ih = Math.max(0, Math.min(p.y + p.h, box.y + box.h) - Math.max(p.y, box.y));
    return iw * ih > Math.min(p.w * p.h, box.w * box.h) * 0.9;
  });
  if (!seeds.length) return null;

  if (
    !b.clipped &&
    Math.max(
      surfaceVerticalSupport(image, box, box.x),
      surfaceVerticalSupport(image, box, box.x + box.w)
    ) < 0.55
  )
    return null;
  if (box.w * box.h > w * h * 0.8) return null;
  box.w = Math.min(box.w, w - box.x);
  box.h = Math.min(box.h, h - box.y);
  if (b.clipped && box.w > box.h * 1.5) alignClippedSurface(image, box);
  const bg = surfaceBackground(image, box);
  const exteriorSupported = hasSurfaceExterior(image, box, bg);
  if (
    !exteriorSupported &&
    !seeds.some((p) => {
      const iw = Math.max(0, Math.min(p.x + p.w, box.x + box.w) - Math.max(p.x, box.x));
      const ih = Math.max(0, Math.min(p.y + p.h, box.y + box.h) - Math.max(p.y, box.y));
      return iw * ih > p.w * p.h * 0.9;
    })
  )
    return null;
  if (resemblesTextList(image, box)) return null;
  return {
    ...box,
    shape: 'image',
    bg,
    contrast: 255,
    kind: 'media-surface',
    exteriorSupported,
    seedCount: seeds.length,
  };
}

// A uniform surround distinguishes a complete picture from an internal texture
// transition. A seed can include its nearby caption; it is evidence, not geometry.
function hasSurfaceExterior(image, box, bg) {
  const { data, width, height } = image;
  for (const vertical of [false, true]) {
    const edges = vertical ? [box.x - 1, box.x + box.w] : [box.y - 1, box.y + box.h];
    for (const edge of edges) {
      if (edge < 0 || edge >= (vertical ? width : height)) continue;
      let hits = 0,
        total = 0;
      const start = vertical ? box.y : box.x;
      const length = vertical ? box.h : box.w;
      for (let n = start; n < start + length; n += 2) {
        const k = ((vertical ? n : edge) * width + (vertical ? edge : n)) * 4;
        if (Math.max(...bg.map((v, c) => Math.abs(v - data[k + c]))) <= 16) hits++;
        total++;
      }
      if (hits / Math.max(1, total) < 0.8) return false;
    }
  }
  return true;
}

function chooseMediaSurfaces(surfaces) {
  surfaces.sort(
    (a, b) => Number(b.exteriorSupported) - Number(a.exteriorSupported) || a.w * a.h - b.w * b.h
  );
  const chosen = [];
  for (const p of surfaces) {
    if (
      chosen.some((q) => {
        const iw = Math.max(0, Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x));
        const ih = Math.max(0, Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y));
        return iw * ih > p.w * p.h * 0.35;
      })
    )
      continue;
    chosen.push(p);
  }
  for (const box of chosen) delete box.exteriorSupported;
  return chosen.filter(
    (p) =>
      !chosen.some(
        (q) =>
          q !== p &&
          q.w * q.h > p.w * p.h &&
          q.x <= p.x + 2 &&
          q.y <= p.y + 2 &&
          q.x + q.w >= p.x + p.w - 2 &&
          q.y + q.h >= p.y + p.h - 2
      )
  );
}

function strongestSurfaceRow(image, box, start, end) {
  let position = start,
    score = 0;
  for (let y = start; y < end; y++) {
    let sum = 0,
      total = 0;
    for (let x = box.x + 4; x < box.x + box.w - 4; x += 3) {
      const a = ((y - 1) * image.width + x) * 4,
        b = (y * image.width + x) * 4;
      sum +=
        Math.abs(image.data[a] - image.data[b]) +
        Math.abs(image.data[a + 1] - image.data[b + 1]) +
        Math.abs(image.data[a + 2] - image.data[b + 2]);
      total++;
    }
    const mean = sum / Math.max(1, total);
    if (mean > score) {
      score = mean;
      position = y;
    }
  }
  return { position, score };
}

export function alignMediaSurfaceRows(image, surfaces) {
  for (const box of surfaces) {
    if (box.w < image.width * 0.5) continue;
    const bottom = box.y + box.h;
    const reach = Math.min(24, Math.max(3, Math.round(box.h * 0.09)));
    const upper =
      box.y > 0
        ? strongestSurfaceRow(
            image,
            box,
            Math.max(1, box.y - 3),
            Math.min(image.height - 1, box.y + 4)
          )
        : { position: box.y, score: 0 };
    const lower =
      bottom < image.height
        ? strongestSurfaceRow(
            image,
            box,
            Math.max(box.y + 1, bottom - reach),
            Math.min(image.height - 1, bottom + reach + 1)
          )
        : { position: bottom, score: 0 };
    const top = upper.score > 35 ? upper.position : box.y;
    const end = lower.score > 35 ? lower.position : bottom;
    if (end > top) {
      box.y = top;
      box.h = end - top;
    }
  }
}

export function alignMediaSurfaceSides(image, surfaces) {
  // Align only large media boxes to a coherent nearby vertical transition.
  for (const box of surfaces) {
    if (box.w < image.width * 0.5 || box.h < 80) continue;
    const reach = Math.min(24, Math.max(3, Math.round(box.h * 0.09)));
    const score = (x) => {
      if (x <= 0 || x >= image.width) return { mean: 0, coherence: 0 };
      let sum = 0,
        hits = 0,
        n = 0;
      for (let y = box.y + 3; y < box.y + box.h - 3; y += 2) {
        const i = (y * image.width + x) * 4,
          j = i - 4,
          d =
            Math.abs(image.data[i] - image.data[j]) +
            Math.abs(image.data[i + 1] - image.data[j + 1]) +
            Math.abs(image.data[i + 2] - image.data[j + 2]);
        sum += d;
        if (d > 60) hits++;
        n++;
      }
      return { mean: sum / Math.max(1, n), coherence: hits / Math.max(1, n) };
    };
    const align = (edge) => {
      if (edge <= 0 || edge >= image.width) return edge;
      const current = score(edge);
      let best = edge,
        bestDistance = Infinity,
        bestScore = 0;
      for (let x = Math.max(1, edge - reach); x <= Math.min(image.width - 1, edge + reach); x++) {
        const value = score(x),
          distance = Math.abs(x - edge);
        if (
          value.coherence > 0.75 &&
          value.mean > 200 &&
          value.mean > current.mean + 20 &&
          (distance < bestDistance || (distance === bestDistance && value.mean > bestScore))
        ) {
          best = x;
          bestDistance = distance;
          bestScore = value.mean;
        }
      }
      return best;
    };
    const right = align(box.x + box.w),
      left = align(box.x);
    if (right - left > box.w * 0.9) {
      box.x = left;
      box.w = right - left;
    }
  }
}

/** Count adjacent RGB edges over the specified half-open horizontal sample range. */
export function horizontalEdgeCount(data, width, y, from, to) {
  let edges = 0;
  for (let x = from; x < to; x++) {
    const i = (y * width + x) * 4;
    if (
      Math.abs(data[i] - data[i + 4]) +
        Math.abs(data[i + 1] - data[i + 5]) +
        Math.abs(data[i + 2] - data[i + 6]) >
      45
    )
      edges++;
  }
  return edges;
}
