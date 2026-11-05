import { foregroundMask, brightForegroundMask } from './foreground-mask.mjs';
import { detachTextUnderlines } from './structure.mjs';
import { sampleBackground } from './detector-background.mjs';
function floodRawComponent(mask, queue, i, w, h) {
  let start = 0,
    end = 1,
    minX = w,
    minY = h,
    maxX = 0,
    maxY = 0;
  queue[0] = i;
  mask[i] = 3;
  while (start < end) {
    const p = queue[start++],
      x = p % w,
      y = Math.floor(p / w);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    for (let ny = Math.max(0, y - 1); ny <= Math.min(h - 1, y + 1); ny++)
      for (let nx = Math.max(0, x - 1); nx <= Math.min(w - 1, x + 1); nx++) {
        const n = ny * w + nx;
        if (mask[n] !== 1) continue;
        mask[n] = 3;
        queue[end++] = n;
      }
  }
  return { minX, minY, maxX, maxY, end };
}
function isRawOutline(mask, w, bounds, end) {
  const { minX, minY, maxX, maxY } = bounds;
  const bw = maxX - minX + 1,
    bh = maxY - minY + 1;
  let outline = false;
  if (bw >= 40 && bh >= 14) {
    const rowCount = (y) => {
      let count = 0;
      for (let x = minX; x <= maxX; x++) if (mask[y * w + x] === 3) count++;
      return count;
    };
    const columnCount = (x) => {
      let count = 0;
      for (let y = minY; y <= maxY; y++) if (mask[y * w + x] === 3) count++;
      return count;
    };
    const top = Math.max(...[0, 1, 2].map((d) => rowCount(Math.min(maxY, minY + d)))),
      bottom = Math.max(...[0, 1, 2].map((d) => rowCount(Math.max(minY, maxY - d))));
    const left = Math.max(...[0, 1, 2].map((d) => columnCount(Math.min(maxX, minX + d)))),
      right = Math.max(...[0, 1, 2].map((d) => columnCount(Math.max(minX, maxX - d))));
    outline =
      end / (bw * bh) < 0.3 &&
      top / bw > 0.7 &&
      bottom / bw > 0.7 &&
      left / bh > 0.65 &&
      right / bh > 0.65;
  }

  return outline;
}
function collectRawComponents(data, mask, queue, w, h) {
  const parts = [];
  for (let i = mask.indexOf(1); i !== -1; i = mask.indexOf(1, i + 1)) {
    const { minX, minY, maxX, maxY, end } = floodRawComponent(mask, queue, i, w, h);
    const bw = maxX - minX + 1,
      bh = maxY - minY + 1;
    const outline = isRawOutline(mask, w, { minX, minY, maxX, maxY }, end);

    if (
      end >= 2 &&
      !outline &&
      !(bw > bh * 2 && bw * bh > 600 && end / (bw * bh) > 0.78) &&
      bh >= 1 &&
      bh <= 88 &&
      bw <= Math.min(160, w * 0.4) &&
      end / (bw * bh) > 0.08
    ) {
      const rgb = [0, 0, 0];
      for (let k = 0; k < end; k++) for (let c = 0; c < 3; c++) rgb[c] += data[queue[k] * 4 + c];
      parts.push({ x: minX, y: minY, w: bw, h: bh, n: end, rgb: rgb.map((v) => v / end) });
    }
    for (let k = 0; k < end; k++) mask[queue[k]] = 2;
  }
  return parts;
}
function groupRawLineParts(parts) {
  parts.sort((a, b) => a.y - b.y || a.x - b.x);
  const lines = [];
  for (const p of parts) {
    let best = null;
    for (const line of lines) {
      const overlap = Math.min(line.y + line.h, p.y + p.h) - Math.max(line.y, p.y);
      const gap = Math.max(p.x - line.x - line.w, line.x - p.x - p.w, 0);
      const vertical = Math.abs(p.y + p.h / 2 - (line.y + line.h / 2));
      if (
        overlap >= Math.min(p.h, line.h) * 0.25 &&
        vertical < Math.max(line.h, p.h) * 0.65 &&
        gap <= Math.max(9, Math.min(line.h, p.h) * 0.9)
      ) {
        best = line;
        break;
      }
    }
    if (!best) {
      lines.push({ ...p, count: 1, atoms: [p] });
      continue;
    }
    const right = Math.max(best.x + best.w, p.x + p.w),
      bottom = Math.max(best.y + best.h, p.y + p.h);
    best.x = Math.min(best.x, p.x);
    best.y = Math.min(best.y, p.y);
    best.w = right - best.x;
    best.h = bottom - best.y;
    best.n += p.n;
    best.count++;
    best.atoms.push(p);
  }
  return lines;
}
function joinRawWordFragments(lines) {
  // Join word fragments after each line has acquired a representative height.
  for (let a = 0; a < lines.length; a++)
    for (let b = a + 1; b < lines.length; b++) {
      const p = lines[a],
        q = lines[b];
      const overlap = Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y);
      const gap = Math.max(p.x - q.x - q.w, q.x - p.x - p.w, 0);
      if (
        overlap > Math.min(p.h, q.h) * 0.55 &&
        Math.abs(p.h - q.h) < Math.max(p.h, q.h) * 0.7 &&
        gap < Math.max(3, Math.min(p.h, q.h) * 0.65)
      ) {
        const right = Math.max(p.x + p.w, q.x + q.w),
          bottom = Math.max(p.y + p.h, q.y + q.h);
        p.x = Math.min(p.x, q.x);
        p.y = Math.min(p.y, q.y);
        p.w = right - p.x;
        p.h = bottom - p.y;
        p.count += q.count;
        p.n += q.n;
        p.atoms.push(...q.atoms);
        lines.splice(b--, 1);
      }
    }
}
function joinRawStrokeStacks(lines) {
  // Compact stroke stacks include menus, sliders and dotted outlines.
  // Long lines cannot enter this union, so text columns keep their separation.
  for (let a = 0; a < lines.length; a++)
    for (let b = a + 1; b < lines.length; b++) {
      const p = lines[a],
        q = lines[b],
        left = Math.min(p.x, q.x),
        top = Math.min(p.y, q.y),
        right = Math.max(p.x + p.w, q.x + q.w),
        bottom = Math.max(p.y + p.h, q.y + q.h);
      const overlapX = Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x),
        gapY = Math.max(p.y - q.y - q.h, q.y - p.y - p.h, 0);
      if (
        right - left <= 36 &&
        bottom - top <= 36 &&
        gapY <= 5 &&
        overlapX >= Math.min(p.w, q.w) * 0.5 &&
        (p.h <= 4 || q.h <= 4 || p.compact || q.compact)
      ) {
        p.x = left;
        p.y = top;
        p.w = right - left;
        p.h = bottom - top;
        p.n += q.n;
        p.count += q.count;
        p.compact = true;
        p.atoms.push(...q.atoms);
        lines.splice(b--, 1);
      }
    }
}
function projectRawLines(image, lines) {
  const { width: w, height: h } = image;
  return lines
    .filter(
      (p) =>
        p.w >= 6 &&
        p.h >= 1 &&
        p.n >= 5 &&
        p.w >= p.h * 0.3 &&
        (p.count >= 2 || p.w <= 100) &&
        (p.n / (p.w * p.h) < 0.95 || p.h <= 3 || p.w <= 3)
    )
    .map((p) => {
      const box = {
        x: Math.max(0, p.x - 2),
        y: Math.max(0, p.y - 2),
        w: Math.min(w - Math.max(0, p.x - 2), p.w + 4),
        h: Math.min(h - Math.max(0, p.y - 2), p.h + 4),
      };
      return {
        ...box,
        bg: sampleBackground(image, box),
        kind: 'auto',
        atoms: p.atoms,
        componentCount: p.count,
        inkDensity: p.n / (p.w * p.h),
        compact: !!p.compact,
        shape:
          p.compact || (p.w / p.h > 0.55 && p.w / p.h < 1.8 && p.h >= 9 && p.count < 5)
            ? 'icon'
            : 'text',
      };
    })
    .sort((a, b) => a.y - b.y || a.x - b.x);
}
export function computeRaw(image, detail, brightPass, tileSize, scratch, backgrounds, detectRaw) {
  const { data, width: w, height: h } = image;
  const mask = brightPass
    ? brightForegroundMask(image, detail)
    : foregroundMask(image, detail, tileSize, backgrounds);
  const decorations = brightPass ? [] : detachTextUnderlines(mask, w, h);
  const queue = scratch && scratch.length >= w * h ? scratch : new Int32Array(w * h);
  const parts = collectRawComponents(data, mask, queue, w, h);
  const lines = groupRawLineParts(parts);
  joinRawWordFragments(lines);
  joinRawStrokeStacks(lines);
  const result = projectRawLines(image, lines);
  result.decorations = decorations;
  if (brightPass) return result;
  const extra = detectRaw(image, detail, true, tileSize, scratch, backgrounds);
  for (const b of extra) {
    const duplicate = result.some((a) => {
      const iw = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)),
        ih = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
      return iw * ih > Math.min(a.w * a.h, b.w * b.h) * 0.3;
    });
    if (!duplicate) result.push(b);
  }
  return result.sort((a, b) => a.y - b.y || a.x - b.x);
}
