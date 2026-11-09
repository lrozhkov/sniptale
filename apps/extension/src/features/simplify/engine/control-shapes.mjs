/** Compare the three RGB channels at an RGBA byte offset. */
export const colorDistanceAt = (data, i, bg) =>
  Math.max(Math.abs(bg[0] - data[i]), Math.abs(bg[1] - data[i + 1]), Math.abs(bg[2] - data[i + 2]));
export const colorDistance = (a, b) =>
  Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
export const luminance = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
export const saturated = (c) => Math.max(...c) - Math.min(...c) >= 48 && Math.min(...c) < 190;
export function pixel({ data, width }, x, y) {
  const i = (y * width + x) * 4;
  return [data[i], data[i + 1], data[i + 2]];
}
export const inBounds = ({ width, height }, x, y) => x >= 0 && y >= 0 && x < width && y < height;

export function addRect(arr, r) {
  if (
    !arr.some(
      (a) =>
        Math.abs(a.x - r.x) <= 2 &&
        Math.abs(a.y - r.y) <= 2 &&
        Math.abs(a.w - r.w) <= 4 &&
        Math.abs(a.h - r.h) <= 4
    )
  )
    arr.push(r);
}

export function recognizeRepeatedSymbols(image, iconSeeds, marks) {
  const { width, height } = image,
    get = (x, y) => pixel(image, x, y);
  // Repeated matching silhouettes with a regular pitch and both vivid and
  // neutral members identify separate repeated compact symbols.
  const shapeAt = (box, x, y) => {
    if (x < 2 || y < 2 || x + box.w + 1 >= width || y + box.h + 1 >= height) return null;
    const bg = get(x - 2, y - 2),
      bits = [];
    for (let yy = 0; yy < box.h; yy++)
      for (let xx = 0; xx < box.w; xx++) bits.push(colorDistance(get(x + xx, y + yy), bg) >= 24);
    return bits;
  };
  const similarity = (a, b) => {
    if (!a || !b) return 0;
    let both = 0,
      either = 0;
    for (let i = 0; i < a.length; i++) {
      if (a[i] && b[i]) both++;
      if (a[i] || b[i]) either++;
    }
    return either ? both / either : 0;
  };
  for (const a of iconSeeds) {
    const template = shapeAt(a, a.x, a.y);
    if (!template) continue;
    for (const b of iconSeeds) {
      const pitch = b.x - a.x;
      if (
        pitch < a.w + 2 ||
        pitch > a.w + 8 ||
        Math.abs(b.y - a.y) > 1 ||
        Math.abs(a.w - b.w) > 1 ||
        Math.abs(a.h - b.h) > 1
      )
        continue;
      if (similarity(template, shapeAt(a, b.x, a.y)) < 0.78) continue;
      const c = iconSeeds.find(
        (q) =>
          Math.abs(q.x - (a.x + pitch * 2)) <= 1 &&
          Math.abs(q.y - a.y) <= 1 &&
          Math.abs(q.w - a.w) <= 1 &&
          Math.abs(q.h - a.h) <= 1
      );
      if (!c || similarity(template, shapeAt(a, c.x, a.y)) < 0.78) continue;
      let count = 3,
        neutral = 0;
      for (let k = 3; k < 8; k++) {
        const x = a.x + k * pitch,
          bits = shapeAt(a, x, a.y);
        if (similarity(template, bits) < 0.7) break;
        let vividPixels = 0;
        for (let yy = 0; yy < a.h; yy++)
          for (let xx = 0; xx < a.w; xx++) if (saturated(get(x + xx, a.y + yy))) vividPixels++;
        if (vividPixels < a.w * a.h * 0.08) neutral++;
        count++;
      }
      if (neutral && count >= 4)
        for (let k = 0; k < count; k++)
          addRect(marks, { x: a.x + k * pitch, y: a.y, w: a.w, h: a.h });
    }
  }
}

export function recognizeCircularPeers(image, marks) {
  const { height } = image,
    get = (x, y) => pixel(image, x, y),
    inImage = (x, y) => inBounds(image, x, y);
  // Search along columns with a confirmed circular symbol for
  // its empty peers. A label-like shape alone cannot establish this context.
  const selected = marks.filter((b) => !b.kind && b.w >= 12 && b.w <= 20 && b.h >= 12 && b.h <= 20);
  for (const peer of selected) {
    const cx = Math.round(peer.x + peer.w / 2),
      r = Math.round(peer.w / 2) + 1;
    for (let cy = Math.max(r, peer.y - 180); cy < Math.min(height - r, peer.y + 180); cy++) {
      if (Math.abs(cy - (peer.y + peer.h / 2)) < r * 2) continue;
      const center = get(cx, cy);
      let outer = 0,
        inner = 0;
      for (let k = 0; k < 16; k++) {
        const a = (2 * Math.PI * k) / 16,
          x = Math.round(cx + Math.cos(a) * r),
          y = Math.round(cy + Math.sin(a) * r);
        if (!inImage(x, y)) continue;
        const edge = get(x, y);
        if (colorDistance(edge, center) >= 25) outer++;
        const xx = Math.round(cx + Math.cos(a) * r * 0.45),
          yy = Math.round(cy + Math.sin(a) * r * 0.45);
        if (colorDistance(get(xx, yy), center) < 15) inner++;
      }
      if (outer >= 10 && inner >= 14) {
        addRect(marks, { x: cx - r - 1, y: cy - r - 1, w: r * 2 + 3, h: r * 2 + 3 });
        cy += r;
      }
    }
  }
}

export function horizontalSpans(image) {
  const { width, height } = image,
    get = (x, y) => pixel(image, x, y);
  const spans = [];
  for (let y = 2; y < height - 2; y++) {
    let start = -1;
    for (let x = 1; x < width - 1; x++) {
      const c = get(x, y),
        isStroke = colorDistance(c, get(x, y - 2)) >= 9 && colorDistance(c, get(x, y + 2)) >= 9;
      if (isStroke && start < 0) start = x;
      if ((!isStroke || x === width - 2) && start >= 0) {
        const end = isStroke ? x + 1 : x,
          len = end - start;
        if (len >= 6 && len <= 55) spans.push({ x: start, y, w: len });
        start = -1;
      }
    }
  }
  return spans;
}

export function recognizeCapsules(image, spans, marks) {
  const { width, height } = image,
    get = (x, y) => pixel(image, x, y),
    inImage = (x, y) => inBounds(image, x, y);
  // An outlined capsule with an independently filled round thumb is one compact symbol.
  // The thumb evidence excludes ordinary pill buttons with text.
  for (let i = 0; i < spans.length; i++) {
    const top = spans[i];
    for (let j = i + 1; j < spans.length; j++) {
      const bottom = spans[j],
        dy = bottom.y - top.y;
      if (dy > 28) break;
      if (dy < 11 || Math.abs(top.x - bottom.x) > 4 || Math.abs(top.w - bottom.w) > 6) continue;
      const h = dy + 1;
      if (top.w < h * 0.7 || top.w > h * 1.8) continue;
      const x = Math.round((top.x + bottom.x) / 2 - h * 0.4),
        right = Math.round((top.x + top.w + bottom.x + bottom.w) / 2 + h * 0.4),
        cy = Math.round((top.y + bottom.y) / 2);
      if (
        !inImage(x - 3, cy) ||
        !inImage(right + 3, cy) ||
        right - x < h * 1.4 ||
        right - x > h * 2.5
      )
        continue;
      const bg = get(x - 3, cy),
        edgeAt = (xs) =>
          xs
            .map((xx) => get(xx, cy))
            .sort((a, b) => colorDistance(b, bg) - colorDistance(a, bg))[0],
        edgeLeft = edgeAt([x, x + 1, x + 2]),
        edgeRight = edgeAt([right - 1, right - 2, right - 3]);
      if (
        colorDistance(edgeLeft, bg) < 12 ||
        colorDistance(edgeRight, bg) < 12 ||
        colorDistance(edgeLeft, edgeRight) > 25
      )
        continue;
      let found = false;
      for (const cx of [Math.round(x + h * 0.5), Math.round(right - h * 0.5)].flatMap((n) => [
        n - 2,
        n - 1,
        n,
        n + 1,
        n + 2,
      ])) {
        if (filledThumb(image, cx, cy, x, right, h)) {
          found = true;
          break;
        }
      }
      if (found)
        addRect(marks, {
          x: Math.max(0, x - 2),
          y: Math.max(0, top.y - 2),
          w: Math.min(width - Math.max(0, x - 2), right - x + 4),
          h: Math.min(height - Math.max(0, top.y - 2), h + 4),
        });
    }
  }
}

export function protectBorderPointers(image, protectedRects) {
  const { width, height } = image,
    get = (x, y) => pixel(image, x, y);
  // A small triangular protrusion with matching, extended strokes on both
  // sides belongs to that border, rather than to a standalone icon.
  for (let y = 8; y < height - 1; y++)
    for (let x = 8; x < width - 8; x++) {
      const c = get(x, y);
      if (Math.max(...c) - Math.min(...c) < 18 || colorDistance(c, get(x, y - 3)) < 20) continue;
      const previousDistance = colorDistance(c, get(x - 1, y));
      if (previousDistance > 25) continue;
      let left = x;
      if (x > 8) {
        // Admission requires exactly one matching predecessor; longer runs fail.
        if (!(previousDistance < 25) || colorDistance(get(x - 2, y), c) < 25) continue;
        left = x - 1;
      } else while (left > 0 && colorDistance(get(left - 1, y), c) < 25) left--;
      if (x !== Math.max(8, left + 1)) continue;
      let l = x;
      while (l < width && colorDistance(get(l, y), c) < 25) l++;
      for (let gap = 5; gap <= 28 && l + gap + 8 < width; gap++) {
        const r = l + gap;
        if (colorDistance(get(r, y), c) > 25) continue;
        let length = 0;
        while (r + length < width && colorDistance(get(r + length, y), c) < 25) length++;
        // Both sides must extend well beyond the protrusion as isolated strokes.
        // A colored field interrupted by a small icon can otherwise look like
        // two border segments, as can the short edges of a segmented ring.
        const extent = Math.max(20, Math.ceil(gap * 2));
        if (l - left < extent || length < extent) continue;
        if (!isolatedStroke(image, l - extent, l, y) || !isolatedStroke(image, r, r + extent, y))
          continue;
        const half = (r - l) / 2;
        if (half < 3) continue;
        protectProtrusion(image, x, y, l, r, c, extent, protectedRects);
        break;
      }
    }
}

export function recognizeFrames(image, spans, marks, boundaries, protectedRects, icons) {
  const smallFrames = [];
  for (let i = 0; i < spans.length; i++) {
    const top = spans[i];
    for (let j = i + 1; j < spans.length; j++) {
      const bottom = spans[j],
        dy = bottom.y - top.y;
      if (dy > 50) break;
      recognizeSmallFrame(image, top, bottom, smallFrames);
      const outline = recognizeOutline(image, top, bottom, marks);
      if (!outline) continue;
      if (outline.stop) break;
      const { x, y, w, h } = outline;
      const frame = { x, y, w, h, kind: 'control' };
      if (
        boundaries.some(
          (b) =>
            Math.abs(b.x - x) < 4 &&
            Math.abs(b.y - y) < 4 &&
            Math.abs(b.w - w) < 8 &&
            Math.abs(b.h - h) < 8
        )
      )
        continue;
      addRect(boundaries, frame);
      addRect(protectedRects, { x, y, w, h, kind: 'outline', stroke: 2 });
      recognizeFrameInterior(image, frame, icons);
      break;
    }
  }
  recognizeRepeatedFrames(smallFrames, marks);
}

function filledThumb(image, cx, cy, x, right, h) {
  const get = (x, y) => pixel(image, x, y),
    inImage = (x, y) => inBounds(image, x, y);
  const otherX = Math.round(cx < (x + right) / 2 ? right - h * 0.55 : x + h * 0.55),
    center = get(cx, cy),
    other = get(otherX, cy);
  if (colorDistance(center, other) < 8) return false;
  let disk = 0,
    track = 0,
    boundary = 0;
  for (let k = 0; k < 12; k++) {
    const a = (k * Math.PI) / 6,
      dx = Math.cos(a),
      dy = Math.sin(a),
      px = Math.round(cx + dx * h * 0.27),
      py = Math.round(cy + dy * h * 0.27),
      tx = Math.round(otherX + dx * h * 0.2),
      ty = Math.round(cy + dy * h * 0.2);
    if (inImage(px, py) && colorDistance(get(px, py), center) < 8) disk++;
    if (inImage(tx, ty) && colorDistance(get(tx, ty), other) < 8) track++;
    // The inner-facing half of the thumb must meet the track at a
    // consistent radius; a uniform field beside a glyph is not a disk.
    if (cx < (x + right) / 2 ? dx > 0.25 : dx < -0.25) {
      const bx = Math.round(cx + dx * h * 0.5),
        by = Math.round(cy + dy * h * 0.5);
      if (inImage(bx, by) && colorDistance(get(bx, by), center) >= 8) boundary++;
    }
  }
  return disk >= 11 && track >= 10 && boundary >= 4;
}

function isolatedStroke(image, start, end, y) {
  const get = (x, y) => pixel(image, x, y);
  let n = 0;
  for (let xx = start; xx < end; xx++) {
    const ink = get(xx, y);
    if (colorDistance(ink, get(xx, y - 2)) >= 12 && colorDistance(ink, get(xx, y + 2)) >= 12) n++;
  }
  return n >= (end - start) * 0.8;
}

function protectProtrusion(image, x, y, l, r, c, extent, protectedRects) {
  const { height } = image,
    get = (x, y) => pixel(image, x, y),
    inImage = (x, y) => inBounds(image, x, y);
  const rise = Math.round((r - l) * 0.8);
  let hits = 0;
  const tolerance = Math.min(110, Math.max(12, colorDistance(c, get(x, y - 3)) * 0.9));
  for (let k = 1; k <= rise; k++) {
    const yy = y - k,
      lx = Math.round(l - 2 + k * 0.55),
      rx = Math.round(r + 1 - k * 0.55);
    const near = (px) =>
      [-1, 0, 1].some(
        (dx) => inImage(px + dx, yy) && colorDistance(get(px + dx, yy), c) < tolerance
      );
    if (near(lx) && near(rx)) hits++;
  }
  // Text close to the line is evidence of an underline with descenders.
  // A pointer is isolated above the adjoining frame strokes.
  const surface = get(x, Math.min(height - 1, y + 3));
  let adjacentInk = 0;
  for (let yy = Math.max(0, y - rise); yy <= y - 2; yy++)
    for (const [start, end] of [
      [l - extent, l],
      [r, r + extent],
    ])
      for (let xx = start; xx < end; xx++)
        if (colorDistance(get(xx, yy), surface) > 30) adjacentInk++;
  if (hits >= rise * 0.7 && adjacentInk < extent * rise * 0.1)
    addRect(protectedRects, {
      x: l - 2,
      y: Math.max(0, y - rise - 3),
      w: r - l + 4,
      h: rise + 5,
      kind: 'border-pointer',
    });
}

function recognizeSmallFrame(image, top, bottom, smallFrames) {
  const { width } = image,
    get = (x, y) => pixel(image, x, y),
    dy = bottom.y - top.y;
  if (
    dy >= 7 &&
    dy <= 14 &&
    Math.abs(top.x + top.w / 2 - (bottom.x + bottom.w / 2)) <= 2 &&
    Math.abs(top.w - bottom.w) <= 3
  ) {
    const side = (x) => {
      if (x < 2 || x >= width - 2) return 0;
      let score = 0;
      for (let yy = top.y + 2; yy < bottom.y - 1; yy++) {
        const c = get(x, yy);
        if (colorDistance(c, get(x - 2, yy)) >= 9 && colorDistance(c, get(x + 2, yy)) >= 9) score++;
      }
      return score;
    };
    let left = null,
      right = null;
    for (let x = top.x - 3; x <= top.x + 1; x++) {
      const n = side(x);
      if (n >= dy * 0.5 && (!left || n > left.n)) left = { x, n };
    }
    for (let x = top.x + top.w - 2; x <= top.x + top.w + 2; x++) {
      const n = side(x);
      if (n >= dy * 0.5 && (!right || n > right.n)) right = { x, n };
    }
    if (left && right) {
      const w = right.x - left.x + 1,
        h = dy + 1,
        cy = top.y + (h >> 1);
      if (w >= 10 && w <= 15 && h >= 10 && w / h > 0.9 && w / h < 1.1) {
        const bg = get(left.x + 3, top.y + 3);
        let bar = 0;
        for (let x = left.x + 2; x < right.x - 1; x++)
          if (colorDistance(get(x, cy), bg) >= 18) bar++;
        let blank = 0;
        for (let xx = right.x + 2; xx <= Math.min(width - 1, right.x + 5); xx++)
          if (colorDistance(get(xx, cy), bg) < 18) blank++;
        if (bar >= w * 0.3 && blank === 4) addRect(smallFrames, { x: left.x, y: top.y, w, h });
      }
    }
  }
}

function recognizeOutline(image, top, bottom, marks) {
  const { width } = image,
    get = (x, y) => pixel(image, x, y),
    inImage = (x, y) => inBounds(image, x, y),
    dy = bottom.y - top.y;
  if (
    dy < 9 ||
    Math.abs(top.x + top.w / 2 - (bottom.x + bottom.w / 2)) > 3 ||
    Math.abs(top.w - bottom.w) > 6
  )
    return null;
  const y = top.y,
    h = dy + 1;
  let left = null,
    right = null;
  const scoreSide = (x) => {
    if (x < 2 || x >= width - 2) return 0;
    let matches = 0;
    for (let yy = y + 5; yy < bottom.y - 4; yy++) {
      const c = get(x, yy);
      if (colorDistance(c, get(x - 2, yy)) >= 7 && colorDistance(c, get(x + 2, yy)) >= 7) matches++;
    }
    return matches / Math.max(1, dy - 9);
  };
  for (let x = Math.max(2, top.x - 10); x <= top.x + 1; x++) {
    const score = scoreSide(x);
    if (score >= 0.65 && (!left || score > left.score || (score === left.score && x > left.x)))
      left = { x, score };
  }
  for (let x = top.x + top.w - 2; x <= Math.min(width - 3, top.x + top.w + 9); x++) {
    const score = scoreSide(x);
    if (score >= 0.65 && (!right || score > right.score)) right = { x, score };
  }
  if (!left || !right) return null;
  const x = left.x,
    w = right.x - left.x + 1;
  if (w < 10 || w > 52 || h < 10 || h > 52 || w / h < 0.84 || w / h > 1.19) return null;
  // A frame needs clear space immediately above and below. Parts of two
  // text rows or a large glyph can otherwise mimic four frame edges.
  if (!inImage(x - 3, y - 3) || !inImage(x + w + 2, y + h + 2)) return null;
  const outsideBg = get(x - 3, y - 3);
  let above = 0,
    below = 0,
    total = 0;
  for (let xx = x; xx < x + w; xx++)
    for (let k = 1; k <= 3; k++) {
      if (colorDistance(get(xx, y - k), outsideBg) > 32) above++;
      if (colorDistance(get(xx, y + h - 1 + k), outsideBg) > 32) below++;
      total++;
    }
  if (above > total * 0.14 || below > total * 0.14) return null;
  const mid = y + (h >> 1);
  if (!inImage(x - 3, mid) || !inImage(x + w + 2, mid)) return null;
  const matchesOuter = (inside, direction, edge) =>
    [3, 4, 5, 6, 7, 8].some(
      (d) =>
        inImage(edge + direction * d, mid) &&
        colorDistance(inside, get(edge + direction * d, mid)) <= 18
    );
  if (!matchesOuter(get(x + 3, mid), -1, x) || !matchesOuter(get(x + w - 4, mid), 1, x + w - 1))
    return null;
  if (w < 22 || h < 22) {
    recognizeFaintOutline(image, { x, y, w, h }, outsideBg, marks);
    return { stop: true };
  }
  return { x, y, w, h };
}

function recognizeFrameInterior(image, { x, y, w, h }, icons) {
  const { width, height } = image,
    get = (x, y) => pixel(image, x, y);
  // Interior ink must be compact in both axes; narrow single glyphs are
  // ambiguous and remain available to the normal text detector.
  const bg = get(x + 3, y + 3);
  let minX = width,
    minY = height,
    maxX = 0,
    maxY = 0,
    n = 0;
  for (let yy = y + 4; yy < y + h - 4; yy++)
    for (let xx = x + 4; xx < x + w - 4; xx++)
      if (colorDistance(get(xx, yy), bg) >= 48) {
        minX = Math.min(minX, xx);
        maxX = Math.max(maxX, xx);
        minY = Math.min(minY, yy);
        maxY = Math.max(maxY, yy);
        n++;
      }
  if (
    n >= 12 &&
    maxX - minX + 1 >= 8 &&
    maxY - minY + 1 >= 8 &&
    maxX - minX + 1 <= w * 0.7 &&
    maxY - minY + 1 <= h * 0.7
  )
    icons.push({
      x: minX - 1,
      y: minY - 1,
      w: maxX - minX + 3,
      h: maxY - minY + 3,
      bg,
      shape: 'icon',
      kind: 'control-icon',
      contrast: 100,
    });
}

function recognizeRepeatedFrames(smallFrames, marks) {
  const repeated = smallFrames.filter(
    (b) =>
      smallFrames.filter(
        (q) =>
          q !== b &&
          Math.abs(q.x - b.x) <= 1 &&
          Math.abs(q.y - b.y) >= 18 &&
          Math.abs(q.y - b.y) <= 240 &&
          Math.abs(q.w - b.w) <= 1 &&
          Math.abs(q.h - b.h) <= 1
      ).length >= 2
  );
  for (const b of smallFrames)
    if (
      repeated.includes(b) ||
      repeated.some(
        (q) =>
          Math.abs(q.x - b.x) <= 8 &&
          Math.abs(q.y - b.y) >= 18 &&
          Math.abs(q.y - b.y) <= 100 &&
          Math.abs(q.w - b.w) <= 1 &&
          Math.abs(q.h - b.h) <= 1
      )
    )
      addRect(marks, b);
}

function recognizeFaintOutline(image, { x, y, w, h }, outsideBg, marks) {
  const get = (x, y) => pixel(image, x, y);
  // Strong compact contours already enter the regular foreground pass.
  // Only fill its faint-outline gap; otherwise font counters become icons.
  let peak = 0;
  for (let yy = y; yy < y + h; yy++)
    for (let xx = x; xx < x + w; xx++) peak = Math.max(peak, colorDistance(get(xx, yy), outsideBg));
  const peer = marks.some(
    (b) =>
      Math.abs(b.x + b.w / 2 - x - w / 2) <= 2 &&
      Math.abs(b.w - w) <= 2 &&
      Math.abs(b.h - h) <= 2 &&
      Math.abs(b.y - y) >= Math.max(h, b.h) &&
      Math.abs(b.y - y) <= Math.max(h, b.h) * 5
  );
  if (peak <= 48 && peer) addRect(marks, { x, y, w, h });
}
