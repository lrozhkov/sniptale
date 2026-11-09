import {
  pixel,
  inBounds,
  colorDistance,
  luminance,
  saturated,
  addRect,
} from './control-shapes.mjs';

function matchesComponentColor(data, n, seen, base) {
  const i = n * 4;
  return (
    !seen[n] &&
    data[i + 3] >= 128 &&
    Math.max(
      Math.abs(data[i] - base[0]),
      Math.abs(data[i + 1] - base[1]),
      Math.abs(data[i + 2] - base[2])
    ) <= 7
  );
}

export function colorComponent(data, width, height, p, seen, queue, base) {
  let begin = 0,
    end = 1,
    minX = width,
    minY = height,
    maxX = 0,
    maxY = 0;
  queue[0] = p;
  seen[p] = 1;
  while (begin < end) {
    const q = queue[begin++],
      x = q % width,
      y = (q / width) | 0;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    if (x > 0) {
      const n = q - 1;
      if (matchesComponentColor(data, n, seen, base)) {
        seen[n] = 1;
        queue[end++] = n;
      }
    }
    if (x + 1 < width) {
      const n = q + 1;
      if (matchesComponentColor(data, n, seen, base)) {
        seen[n] = 1;
        queue[end++] = n;
      }
    }
    if (y > 0) {
      const n = q - width;
      if (matchesComponentColor(data, n, seen, base)) {
        seen[n] = 1;
        queue[end++] = n;
      }
    }
    if (y + 1 < height) {
      const n = q + width;
      if (matchesComponentColor(data, n, seen, base)) {
        seen[n] = 1;
        queue[end++] = n;
      }
    }
  }
  return { end, minX, minY, maxX, maxY };
}

function filledDisk(image, left, top, right, bottom) {
  const get = (x, y) => pixel(image, x, y);
  const w = right - left + 1,
    h = bottom - top + 1,
    spans = [];
  let solid = 0;
  for (let y = top; y <= bottom; y++) {
    const xs = [];
    for (let x = left; x <= right; x++) if (saturated(get(x, y))) xs.push(x);
    if (!xs.length) return false;
    const first = xs[0],
      last = xs.at(-1),
      span = last - first + 1;
    if (xs.length / span >= 0.9) solid++;
    if (Math.abs((first + last) / 2 - (left + right) / 2) > w * 0.2 + 0.5) return false;
    spans.push(span);
  }
  // A filled disk has a convex raster profile; allow one-pixel edge noise.
  if (spans.some((span, i) => i > 0 && i < h - 1 && 2 * span + 3 < spans[i - 1] + spans[i + 1]))
    return false;
  const center = spans.slice(Math.floor(h * 0.3), Math.ceil(h * 0.7));
  const middle = Math.max(...center),
    edge = Math.max(spans[0], spans.at(-1));
  return solid / h >= 0.8 && middle >= edge + Math.max(1, w * 0.15);
}

export function recognizeColoredDisc(image, component, marks) {
  const get = (x, y) => pixel(image, x, y),
    inImage = (x, y) => inBounds(image, x, y);
  const { minX, minY, maxX, maxY, w, h, fill, vivid, base } = component;
  // Isolated compact colored discs supply icon proposals.
  if (
    vivid &&
    w >= 4 &&
    w <= 10 &&
    h >= 4 &&
    h <= 10 &&
    w / h > 0.8 &&
    w / h < 1.25 &&
    fill > 0.5 &&
    fill <= 1 &&
    filledDisk(image, minX, minY, maxX, maxY)
  ) {
    const cx = Math.round((minX + maxX) / 2),
      cy = Math.round((minY + maxY) / 2),
      points = [
        [minX - 3, cy],
        [maxX + 3, cy],
        [cx, minY - 3],
        [cx, maxY + 3],
      ];
    if (points.every(([x, y]) => inImage(x, y))) {
      const colors = points.map(([x, y]) => get(x, y));
      if (
        colors.every((c) => colorDistance(c, base) > 30) &&
        colors.some((ref) => colors.filter((c) => colorDistance(c, ref) < 16).length >= 3)
      )
        addRect(marks, { x: minX - 1, y: minY - 1, w: w + 2, h: h + 2, kind: 'compact-disc' });
    }
  }
}

export function recognizeLabelDisc(image, component, marks) {
  const { width, height } = image,
    get = (x, y) => pixel(image, x, y),
    inImage = (x, y) => inBounds(image, x, y);
  const { minX, minY, maxX, maxY, w, h, vivid, end } = component;
  // Aggregate compact discs beside an isolated text run.
  // Aggregate nearby colored pixels because antialiasing can fragment its core.
  if (
    vivid &&
    end >= 2 &&
    w <= 11 &&
    h <= 11 &&
    inImage(minX - 12, minY - 12) &&
    inImage(maxX + 75, maxY + 12)
  ) {
    let ax = width,
      ay = height,
      bx = 0,
      by = 0,
      n = 0;
    const cx = Math.round((minX + maxX) / 2),
      cy = Math.round((minY + maxY) / 2);
    for (let yy = cy - 6; yy <= cy + 6; yy++)
      for (let xx = cx - 6; xx <= cx + 6; xx++)
        if (saturated(get(xx, yy))) {
          ax = Math.min(ax, xx);
          ay = Math.min(ay, yy);
          bx = Math.max(bx, xx);
          by = Math.max(by, yy);
          n++;
        }
    const dw = bx - ax + 1,
      dh = by - ay + 1;
    if (
      dw >= 5 &&
      dw <= 11 &&
      dh >= 5 &&
      dh <= 11 &&
      dw / dh > 0.75 &&
      dw / dh < 1.3 &&
      n / (dw * dh) > 0.5 &&
      filledDisk(image, ax, ay, bx, by)
    ) {
      const background = get(ax - 3, Math.round((ay + by) / 2));
      let leftClear = true;
      for (let xx = ax - 7; xx < ax; xx++)
        for (let yy = ay - 4; yy <= by + 4; yy++)
          if (!inImage(xx, yy) || colorDistance(get(xx, yy), background) > 40) leftClear = false;
      let runs = 0,
        inRun = false,
        first = -1;
      for (let xx = bx + 2; xx < Math.min(width, bx + 65); xx++) {
        let ink = false;
        for (let yy = ay; yy <= by; yy++)
          if (colorDistance(get(xx, yy), background) > 65) {
            ink = true;
            break;
          }
        if (ink && !inRun) {
          runs++;
          if (first < 0) first = xx;
        }
        inRun = ink;
      }
      if (leftClear && runs >= 3 && first >= bx + 3 && first <= bx + 18)
        addRect(marks, { x: ax - 2, y: ay - 2, w: dw + 4, h: dh + 4, kind: 'compact-disc' });
    }
  }
}

export function protectColoredDivider(image, component, protectedRects) {
  const { height } = image,
    get = (x, y) => pixel(image, x, y),
    inImage = (x, y) => inBounds(image, x, y);
  const { minX, minY, maxX, maxY, w, h, fill, vivid } = component;
  if (
    vivid &&
    w >= 2 &&
    w <= 4 &&
    h >= 12 &&
    h <= 40 &&
    maxY < height - 2 &&
    fill > 0.75 &&
    inImage(minX - 2, minY + (h >> 1)) &&
    inImage(maxX + 3, minY + (h >> 1))
  ) {
    const left = get(minX - 2, minY + (h >> 1)),
      right = get(maxX + 3, minY + (h >> 1));
    let stable = 0;
    for (let yy = minY; yy <= maxY; yy++)
      if (colorDistance(left, get(minX - 2, yy)) < 8 && colorDistance(right, get(maxX + 3, yy)) < 8)
        stable++;
    if (
      stable >= h * 0.85 &&
      colorDistance(left, right) >= 8 &&
      !saturated(left) &&
      !saturated(right)
    )
      addRect(protectedRects, { x: minX, y: minY, w, h });
  }
}

export function recognizeFilledSquare(image, component, marks) {
  const { width } = image,
    get = (x, y) => pixel(image, x, y);
  const { minX, minY, maxX, maxY, w, h, fill, vivid, base } = component;
  // Compact filled symbol: a high-contrast mark lies inside a filled square.
  if (
    vivid &&
    w >= 10 &&
    w <= 26 &&
    h >= 10 &&
    h <= 26 &&
    w / h > 0.84 &&
    w / h < 1.19 &&
    fill > 0.42
  ) {
    let light = 0;
    for (let y = minY + 2; y < maxY - 1; y++)
      for (let x = minX + 2; x < maxX - 1; x++)
        if (Math.abs(luminance(get(x, y)) - luminance(base)) > 75) light++;
    const center = get(Math.round((minX + maxX) / 2), Math.round((minY + maxY) / 2));
    let runs = 0,
      inside = false;
    const bg = get(Math.min(width - 1, maxX + 4), Math.round((minY + maxY) / 2));
    for (let xx = maxX + 4; xx < Math.min(width, maxX + 70); xx++) {
      let ink = false;
      for (let yy = minY; yy <= maxY; yy++)
        if (colorDistance(get(xx, yy), bg) > 65) {
          ink = true;
          break;
        }
      if (ink && !inside) runs++;
      inside = ink;
    }
    const mx = Math.round((minX + maxX) / 2),
      my = Math.round((minY + maxY) / 2);
    const corners = [
      [minX + 1, minY + 1],
      [maxX - 1, minY + 1],
      [minX + 1, maxY - 1],
      [maxX - 1, maxY - 1],
    ];
    const cardinals = [
      [mx, minY + 2],
      [mx, maxY - 2],
      [minX + 2, my],
      [maxX - 2, my],
    ];
    const ring =
      corners.filter(([x, y]) => colorDistance(get(x, y), base) > 45).length >= 3 &&
      cardinals.filter(([x, y]) => colorDistance(get(x, y), base) < 30).length >= 3;
    if (
      light >= 3 &&
      light < w * h * 0.38 &&
      Math.abs(luminance(center) - luminance(base)) > 60 &&
      (runs >= 2 || ring)
    )
      addRect(marks, { x: minX, y: minY, w, h });
  }
}

export function recognizeAnnulus(image, component, marks) {
  const { width, height } = image,
    get = (x, y) => pixel(image, x, y),
    inImage = (x, y) => inBounds(image, x, y);
  const { minX, minY, maxX, maxY, fill, vivid } = component;
  // Test the same annulus in four quarter-turn coordinate systems.
  let spinner = false;
  for (let turn = 0; vivid && turn < 4 && !spinner; turn++) {
    const [toVirtual, toSource] = annulusCoordinates(width, height, turn);
    const pts = [
      [minX, minY],
      [maxX, minY],
      [minX, maxY],
      [maxX, maxY],
    ].map(([x, y]) => toVirtual(x, y));
    const vx = Math.min(...pts.map((p) => p[0])),
      vy = Math.min(...pts.map((p) => p[1])),
      vw = Math.max(...pts.map((p) => p[0])) - vx + 1,
      vh = Math.max(...pts.map((p) => p[1])) - vy + 1;
    if (vw < 28 || vw > 140 || vh < 5 || vh > vw * 0.4 || fill <= 0.25) continue;
    const cx = vx + (vw - 1) / 2,
      radius = vw * 0.72,
      cy = vy + radius;
    const vget = (x, y) => {
      const [sx, sy] = toSource(Math.round(x), Math.round(y));
      return inImage(sx, sy) ? get(sx, sy) : null;
    };
    const center = vget(cx, cy);
    if (!center) continue;
    let ring = 0,
      field = 0;
    for (const a of [Math.PI * 0.2, Math.PI * 0.35, Math.PI * 0.5, Math.PI * 0.65, Math.PI * 0.8]) {
      const c = vget(cx + Math.cos(a) * radius * 0.86, cy + Math.sin(a) * radius * 0.86);
      if (
        c &&
        Math.max(...c) - Math.min(...c) < 20 &&
        Math.abs(luminance(c) - luminance(center)) >= 5
      )
        ring++;
    }
    for (const a of [0, Math.PI / 2, Math.PI]) {
      const c = vget(cx + Math.cos(a) * radius * 0.45, cy + Math.sin(a) * radius * 0.45);
      if (c && colorDistance(c, center) < 18) field++;
    }
    if (ring >= 5 && field === 3) {
      const corners = [
        [cx - radius - 2, vy - 2],
        [cx + radius + 2, vy + 2 * radius + 2],
      ].map(([x, y]) => toSource(x, y));
      const x = Math.max(0, Math.floor(Math.min(corners[0][0], corners[1][0]))),
        y = Math.max(0, Math.floor(Math.min(corners[0][1], corners[1][1])));
      addRect(marks, {
        x,
        y,
        w: Math.min(width - x, Math.ceil(radius * 2 + 4)),
        h: Math.min(height - y, Math.ceil(radius * 2 + 4)),
      });
      spinner = true;
    }
  }
  return spinner;
}

function surfaceForegroundGroups(image, component) {
  const get = (x, y) => pixel(image, x, y);
  const { minX, minY, maxX, maxY, base } = component;
  const cols = [];
  for (let x = minX + 3; x <= maxX - 3; x++) {
    const pixels = [];
    for (let y = minY + 3; y <= maxY - 3; y++)
      if (Math.abs(luminance(get(x, y)) - luminance(base)) >= 60) pixels.push(y);
    cols.push({ x, pixels });
  }
  const groups = [];
  let group = null,
    gap = 0;
  for (const col of cols) {
    if (!col.pixels.length) {
      gap++;
      continue;
    }
    if (!group || gap >= 6) {
      group = { cols: [], runs: 0 };
      groups.push(group);
    }
    if (gap > 0 || !group.cols.length) group.runs++;
    group.cols.push(col);
    gap = 0;
  }
  return groups;
}

export function recognizeSurfaceForeground(image, component, labels, icons) {
  const get = (x, y) => pixel(image, x, y);
  const { minX, minY, maxX, maxY, w, h, base } = component;
  const groups = surfaceForegroundGroups(image, component);
  for (const group of groups) {
    const xs = group.cols.map((c) => c.x),
      ys = group.cols.flatMap((c) => c.pixels),
      ink = ys.length;
    if (ink < 12) continue;
    const x = Math.min(...xs),
      right = Math.max(...xs),
      y = Math.min(...ys),
      bottom = Math.max(...ys);
    const tw = right - x + 1,
      th = bottom - y + 1;
    if (th >= 5 && th <= h * 0.75 && tw >= 5 && tw <= h * 0.85 && tw <= w * 0.85) {
      icons.push({
        x: x - 1,
        y: y - 1,
        w: tw + 2,
        h: th + 2,
        bg: base,
        shape: 'icon',
        kind: 'control-foreground',
        surfaceBounds: { x: minX, y: minY, w, h },
        componentCount: group.runs,
        contrast: Math.round(
          Math.max(
            ...group.cols.flatMap((c) => c.pixels.map((yy) => colorDistance(get(c.x, yy), base)))
          )
        ),
      });
    }
    if (
      group.runs < 3 ||
      tw < 12 ||
      th < 5 ||
      th > h * 0.72 ||
      tw > w * 0.85 ||
      ink / (tw * th) > 0.75
    )
      continue;
    labels.push({
      x: Math.max(minX + 1, x - 1),
      y: Math.max(minY + 1, y - 1),
      w: Math.min(maxX, x + tw + 1) - Math.max(minX + 1, x - 1) + 1,
      h: Math.min(maxY, y + th + 1) - Math.max(minY + 1, y - 1) + 1,
      bg: base,
      shape: 'text',
      kind: 'auto',
      componentCount: group.runs,
      contrast: Math.round(
        group.cols.reduce(
          (n, c) =>
            n +
            c.pixels.reduce(
              (sum, yy) => sum + Math.abs(luminance(get(c.x, yy)) - luminance(base)),
              0
            ),
          0
        ) / ink
      ),
    });
  }
}

function annulusCoordinates(width, height, turn) {
  const toVirtual = (x, y) =>
    turn === 0
      ? [x, y]
      : turn === 1
        ? [height - 1 - y, x]
        : turn === 2
          ? [width - 1 - x, height - 1 - y]
          : [y, width - 1 - x];
  const toSource = (x, y) =>
    turn === 0
      ? [x, y]
      : turn === 1
        ? [y, height - 1 - x]
        : turn === 2
          ? [width - 1 - x, height - 1 - y]
          : [width - 1 - y, x];
  return [toVirtual, toSource];
}
