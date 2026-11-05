const intersects = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const bottom = (b) => b.y + b.h;
const right = (b) => b.x + b.w;

// An unproven dense claim that joins the same texture on all four sides is
// surface variation, so preserve its original pixels with the uncertain row.
export function continuousTextureClaim(image, box, area) {
  if (
    box.shape !== 'icon' ||
    box.kind !== 'auto' ||
    box.roleEvidence ||
    box.compact ||
    box.contrast > 100 ||
    box.backgroundSupport > 0.25 ||
    box.inkDensity < 0.75 ||
    !box.sourceBounds ||
    !box.sourceRuns
  )
    return false;
  const b = box.sourceBounds;
  if (
    !intersects(b, area) ||
    b.w < 8 ||
    b.h < 8 ||
    b.w > 48 ||
    b.h > 48 ||
    b.x < 1 ||
    b.y < 1 ||
    right(b) >= image.width - 1 ||
    bottom(b) >= image.height - 1
  )
    return false;
  const support = box.sourceRuns.reduce((n, r) => n + r[2], 0);
  if (support / (b.w * b.h) < 0.8) return false;
  const distance = (x, y, dx, dy) => {
    const i = (y * image.width + x) * 4,
      j = ((y + dy) * image.width + x + dx) * 4;
    return Math.max(...[0, 1, 2].map((k) => Math.abs(image.data[i + k] - image.data[j + k])));
  };
  for (const side of ['top', 'bottom', 'left', 'right']) {
    const horizontal = side === 'top' || side === 'bottom',
      length = horizontal ? b.w : b.h;
    let smooth = 0,
      total = 0;
    for (let n = 2; n < length - 2; n++) {
      const x = horizontal ? b.x + n : side === 'left' ? b.x : right(b) - 1,
        y = horizontal ? (side === 'top' ? b.y : bottom(b) - 1) : b.y + n;
      const dx = horizontal ? 0 : side === 'left' ? -1 : 1,
        dy = horizontal ? (side === 'top' ? -1 : 1) : 0;
      total++;
      if (distance(x, y, dx, dy) <= 15) smooth++;
    }
    if (!total || smooth / total < 0.85) return false;
  }
  return true;
}
export function preserveTextureClaim(box) {
  const result = {
    ...box,
    ...box.sourceBounds,
    shape: 'unknown',
    kind: 'texture-continuity',
    roleEvidence: 'texture-continuity',
  };
  delete result.eraseRuns;
  delete result.erasePlane;
  delete result.sourceRuns;
  delete result.iconSize;
  return result;
}

// Find a long line of repeated, baseline-aligned source strokes on a textured
// surface. The purpose is only to preserve a fragmented line, not to label it.
export function texturedRow(image, seed, boxes) {
  const nominal = seed.typeMetrics.xHeight;
  if (nominal < 7) return null;
  const x0 = Math.max(0, Math.floor(seed.x - nominal * 26)),
    x1 = Math.min(image.width, Math.ceil(right(seed) + nominal * 26));
  const y0 = Math.max(0, Math.floor(seed.y - nominal)),
    y1 = Math.min(image.height, Math.ceil(bottom(seed) + nominal * 0.25));
  // Conservative bright-on-dark case: darkest samples estimate the surface, not the bright
  // foreground or the texture baked into it.
  const bg = darkRowBackground(image, seed, nominal, x0, x1, y0, y1);
  if (!bg) return null;
  const strong = textureColumns(image, bg, x0, x1, 105, y0, y1).filter(
    (g) =>
      g.bottom - g.top + 1 >= nominal * 0.6 &&
      g.bottom - g.top + 1 <= nominal * 2.3 &&
      g.r - g.x + 1 <= nominal * 2 &&
      g.n >= nominal
  );
  const run = alignedTextureRun(strong, seed, nominal);
  if (!run) return null;
  const geometry = textureRunGeometry(run);
  if (!geometry) return null;
  const { h, baseline } = geometry;
  // Measure high-frequency local surface variation immediately below the row.
  // A smooth gradient has small neighbouring differences and does not qualify.
  if (!hasRowSurfaceVariation(image, bg, run, h, baseline)) return null;
  let left = run[0].x,
    end = run.at(-1).r + 1,
    top = Math.min(...run.map((g) => g.top)),
    bot = Math.max(...run.map((g) => g.bottom)) + 1;
  // Extend through any number of lower-contrast aligned glyph-sized components
  // and small baseline punctuation. A separately evidenced icon stops the row.
  end = extendTextureRun(image, bg, x0, x1, top, bot, h, baseline, end, boxes);
  let area = {
    x: Math.max(0, left - 2),
    y: Math.max(0, top - 2),
    w: Math.min(image.width, end + 2) - Math.max(0, left - 2),
    h: Math.min(image.height, bot + 2) - Math.max(0, top - 2),
  };
  const support = (b) =>
    b.shape === 'text' && b.typeMetrics?.glyphBounds
      ? b.typeMetrics.glyphBounds
      : b.sourceBounds || b;
  // A generic icon claim can include several glyphs and underlying
  // texture. Require matching source-color glyph bands on both sides before
  // treating the full claim as part of this uncertain line.
  const structured = structuredRowClaims(image, boxes, area, run, nominal, bg, support);
  for (const b of structured) {
    const source = support(b),
      x = Math.min(area.x, source.x),
      y = Math.min(area.y, source.y),
      r = Math.max(right(area), right(source)),
      bt = Math.max(bottom(area), bottom(source));
    area = { x, y, w: r - x, h: bt - y };
  }
  const members = textureRowMembers(image, boxes, seed, area, structured, left, end, support);
  return members ? { area, members, bg } : null;
}

function darkRowBackground(image, seed, nominal, x0, x1, y0, y1) {
  const samples = [];
  for (let y = y0; y < Math.min(y1, y0 + Math.max(2, Math.floor(nominal * 0.4))); y++)
    for (let x = Math.max(x0, seed.x); x < Math.min(x1, right(seed)); x++) {
      const i = (y * image.width + x) * 4;
      samples.push([image.data[i], image.data[i + 1], image.data[i + 2]]);
    }
  if (!samples.length) return null;
  samples.sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]));
  const bg = samples[Math.floor(samples.length * 0.1)];
  return bg;
}

function textureColumns(image, bg, x0, x1, threshold, from, to) {
  const groups = [];
  for (let x = x0; x < x1; x++) {
    let n = 0,
      t = to,
      b = from;
    for (let y = from; y < to; y++) {
      const i = (y * image.width + x) * 4;
      if (
        image.data[i + 3] >= 128 &&
        Math.max(
          Math.abs(bg[0] - image.data[i]),
          Math.abs(bg[1] - image.data[i + 1]),
          Math.abs(bg[2] - image.data[i + 2])
        ) >= threshold
      ) {
        n++;
        t = Math.min(t, y);
        b = Math.max(b, y);
      }
    }
    if (!n) continue;
    const last = groups.at(-1);
    if (last && x === last.r + 1) {
      last.r = x;
      last.top = Math.min(last.top, t);
      last.bottom = Math.max(last.bottom, b);
      last.n += n;
    } else groups.push({ x, r: x, top: t, bottom: b, n });
  }
  return groups;
}

function hasRowSurfaceVariation(image, bg, run, h, baseline) {
  const step = Math.max(1, Math.round(h / 14));
  let variable = 0,
    total = 0;
  for (
    let y = baseline + 2;
    y < Math.min(image.height, baseline + 2 + Math.max(3, Math.ceil(h * 0.5)));
    y++
  )
    for (let x = run[0].x; x < run.at(-1).r - step + 1; x++) {
      const i = (y * image.width + x) * 4,
        j = i + step * 4;
      const aa = Math.max(
          Math.abs(bg[0] - image.data[i]),
          Math.abs(bg[1] - image.data[i + 1]),
          Math.abs(bg[2] - image.data[i + 2])
        ),
        bb = Math.max(
          Math.abs(bg[0] - image.data[j]),
          Math.abs(bg[1] - image.data[j + 1]),
          Math.abs(bg[2] - image.data[j + 2])
        );
      if (aa >= 80 || bb >= 80) continue;
      const d = Math.max(...[0, 1, 2].map((k) => Math.abs(image.data[i + k] - image.data[j + k])));
      total++;
      if (d >= 8) variable++;
    }
  return total >= 30 && variable / total >= 0.02;
}

function rowFontColor(image, bg, g) {
  const channels = [[], [], []];
  for (let y = g.top; y <= g.bottom; y++)
    for (let x = g.x; x <= g.r; x++) {
      const i = (y * image.width + x) * 4;
      if (
        Math.max(
          Math.abs(bg[0] - image.data[i]),
          Math.abs(bg[1] - image.data[i + 1]),
          Math.abs(bg[2] - image.data[i + 2])
        ) < 105
      )
        continue;
      for (let c = 0; c < 3; c++) channels[c].push(image.data[i + c]);
    }
  return channels.map((values) => {
    values.sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)];
  });
}

function structuredRowClaims(image, boxes, area, run, nominal, bg, support) {
  return boxes.filter((b) => {
    const source = support(b);
    if (
      b.shape !== 'icon' ||
      !(b.roleEvidence === 'structured-symbol' || (!b.roleEvidence && b.kind === 'auto')) ||
      !intersects(area, source) ||
      source.w > nominal * 3 ||
      source.h > nominal * 3
    )
      return false;
    const indexes = run
      .map((g, i) => ({ g, i }))
      .filter(({ g }) => (g.x + g.r) / 2 >= source.x - 2 && (g.x + g.r) / 2 < right(source) + 2)
      .map((v) => v.i);
    if (indexes.length < 2 || indexes[0] < 2 || indexes.at(-1) > run.length - 3) return false;
    const test = [run[indexes[0] - 1], ...indexes.map((i) => run[i]), run[indexes.at(-1) + 1]],
      colors = test.map((g) => rowFontColor(image, bg, g));
    if (colors.some((c) => c.some((v) => v === undefined))) return false;
    return colors.every((c) => Math.max(...c.map((v, i) => Math.abs(v - colors[0][i]))) <= 32);
  });
}

function alignedTextureRun(strong, seed, nominal) {
  const clusters = [];
  for (const g of strong) {
    const last = clusters.at(-1);
    if (
      last &&
      g.x - last.at(-1).r <= nominal * 0.8 &&
      Math.abs(g.bottom - last.at(-1).bottom) <= Math.max(2, nominal * 0.25)
    )
      last.push(g);
    else clusters.push([g]);
  }
  const run = clusters.find(
    (c) => c.length >= 8 && c.some((g) => g.x < right(seed) && g.r >= seed.x)
  );
  return run;
}

function textureRunGeometry(run) {
  const heights = run.map((g) => g.bottom - g.top + 1).sort((a, b) => a - b),
    h = heights[Math.floor(heights.length / 2)],
    bottoms = run.map((g) => g.bottom).sort((a, b) => a - b),
    baseline = bottoms[Math.floor(bottoms.length / 2)];
  if (
    run.filter(
      (g) =>
        Math.abs(g.bottom - baseline) <= Math.max(2, h * 0.2) &&
        Math.abs(g.bottom - g.top + 1 - h) <= Math.max(3, h * 0.3)
    ).length <
    run.length * 0.8
  )
    return null;
  return { h, baseline };
}

function extendTextureRun(image, bg, x0, x1, top, bot, h, baseline, initialEnd, boxes) {
  let end = initialEnd;
  const weak = textureColumns(image, bg, x0, x1, 28, top, bot).filter(
    (g) => g.x >= end && g.top >= top - 2 && g.bottom <= bot + 1
  );
  let cursor = end;
  for (const g of weak) {
    if (g.x - cursor > h) break;
    const gh = g.bottom - g.top + 1,
      gw = g.r - g.x + 1;
    const glyph =
      gh >= h * 0.6 &&
      gh <= h * 1.3 &&
      gw <= h * 1.4 &&
      Math.abs(g.bottom - baseline) <= Math.max(2, h * 0.2);
    const punctuation = gh <= h * 0.35 && gw <= h * 0.5 && g.bottom >= baseline - h * 0.25;
    if (!glyph && !punctuation) break;
    const fragment = { x: g.x, y: g.top, w: gw, h: gh };
    if (boxes.some((b) => b.shape === 'icon' && b.roleEvidence && intersects(b, fragment))) break;
    end = g.r + 1;
    cursor = end;
  }
  return end;
}

function textureRowMembers(image, boxes, seed, area, structured, left, end, support) {
  const members = boxes.filter((b) => {
    const source = support(b);
    return (
      ['text', 'icon'].includes(b.shape) &&
      intersects(area, source) &&
      source.x >= area.x - 2 &&
      right(source) <= right(area) + 2 &&
      source.y >= area.y - 3 &&
      bottom(source) <= bottom(area) + 3
    );
  });
  if (members.some((b) => b.shape === 'icon' && b.roleEvidence && !structured.includes(b)))
    return null;
  if (
    !members.includes(seed) ||
    members.some((b) => {
      const source = support(b);
      return b.shape === 'text' && source.x <= left && right(source) >= end;
    })
  )
    return null;
  // Do not suppress an owner whose source ink extends outside the row.
  if (
    boxes.some(
      (b) =>
        ['text', 'icon'].includes(b.shape) &&
        intersects(area, support(b)) &&
        !members.includes(b) &&
        !continuousTextureClaim(image, b, area)
    )
  )
    return null;
  return members;
}
