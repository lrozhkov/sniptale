import { sampleBackground } from './detector-background.mjs';
import { normalizeTypeface } from './detector-typeface.mjs';
function mergeConsolidatedRows(image, boxes, flow) {
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const p = boxes[i],
          q = boxes[j];
        if (q.y > p.y + p.h) break;
        if (p.backgroundSupport < 0.5 || q.backgroundSupport < 0.5 || (!flow(p) && !flow(q)))
          continue;
        if (p.shape !== 'text' || q.shape !== 'text') continue;
        const centerDelta = Math.abs(p.y + p.h / 2 - q.y - q.h / 2),
          gap = Math.max(p.x - q.x - q.w, q.x - p.x - p.w, 0);
        const bgDelta = Math.max(...p.bg.map((v, c) => Math.abs(v - q.bg[c])));
        if (
          centerDelta > Math.min(p.h, q.h) * 0.28 ||
          Math.min(p.h, q.h) < Math.max(p.h, q.h) * 0.55 ||
          gap > Math.max(2, (Math.min(p.h, q.h) - 4) * 0.55) ||
          bgDelta > 28 ||
          hasSeparator(image, p, q)
        )
          continue;
        const x = Math.min(p.x, q.x),
          y = Math.min(p.y, q.y),
          r = Math.max(p.x + p.w, q.x + q.w),
          bottom = Math.max(p.y + p.h, q.y + q.h);
        const merged = {
          ...p,
          x,
          y,
          w: r - x,
          h: bottom - y,
          atoms: [...(p.atoms || []), ...(q.atoms || [])],
          componentCount: (p.componentCount || 1) + (q.componentCount || 1),
          compact: false,
          shape: 'text',
        };
        merged.bg = sampleBackground(image, merged);
        merged.backgroundSupport = surfaceEvidence(image, merged).background;
        if (merged.backgroundSupport < 0.5) continue;
        boxes[i] = merged;
        boxes.splice(j, 1);
        changed = true;
        break outer;
      }
  }
}
function trimTextRowMember(image, b, center, height) {
  if (b.h > height * 1.5) {
    const right = b.x + b.w;
    for (let x = b.x; x < Math.min(right, b.x + 12); x++) {
      let hits = 0,
        total = 0;
      for (let y = Math.floor(center - height / 2); y < Math.ceil(center + height / 2); y++) {
        if (y < 0 || y >= image.height) continue;
        const i = (y * image.width + x) * 4;
        total++;
        if (Math.max(...b.bg.map((v, c) => Math.abs(v - image.data[i + c]))) > 25) hits++;
      }
      if (hits / Math.max(1, total) > 0.9) {
        b.x = x + 1;
        b.w = right - b.x;
        break;
      }
    }
  }
}
function findToolbarRailSeeds(image, boxes) {
  const compact = (b) => b.w <= 36 && b.h <= 36 && b.w >= 6;
  const railSeeds = boxes.filter(compact).filter((b) => {
    if (b.roleEvidence?.startsWith('text-')) return false;
    const cx = b.x + b.w / 2;
    const peers = boxes.filter((q) => compact(q) && Math.abs(q.x + q.w / 2 - cx) <= 5);
    const centers = [...new Set(peers.map((q) => q.y + q.h / 2))].sort((a, b) => a - b);
    const gaps = centers
      .slice(1)
      .map((v, i) => v - centers[i])
      .filter((v) => v > 6)
      .sort((a, b) => a - b);
    const heights = peers.map((q) => q.h).sort((a, b) => a - b);
    const pitch = gaps[Math.floor(gaps.length / 2)] || 0,
      extent = heights[Math.floor(heights.length / 2)] || 1;
    if (
      centers.length < 6 ||
      pitch < extent * 1.6 ||
      pitch > extent * 5 ||
      peers.filter((q) => q.shape === 'icon').length < peers.length * 0.25
    )
      return false;
    const top = Math.max(0, Math.floor(Math.min(...peers.map((q) => q.y)))),
      bottom = Math.min(image.height, Math.ceil(Math.max(...peers.map((q) => q.y + q.h))));
    const reach = Math.max(32, extent * 2);
    for (
      let x = Math.max(3, Math.floor(cx - reach));
      x < Math.min(image.width - 3, cx + reach);
      x++
    ) {
      let different = 0,
        total = 0;
      for (let y = top; y < bottom; y += 4) {
        const l = (y * image.width + x - 3) * 4,
          r = (y * image.width + x + 3) * 4;
        total++;
        if (Math.max(...[0, 1, 2].map((c) => Math.abs(image.data[l + c] - image.data[r + c]))) > 8)
          different++;
      }
      if (different / Math.max(1, total) >= 0.75) return true;
    }
    return false;
  });
  return railSeeds;
}
function mergeToolbarRailStrokes(boxes, railSeeds) {
  // Disconnected strokes within a toolbar slot belong to the same icon.
  for (let i = 0; i < railSeeds.length; i++)
    for (let j = i + 1; j < railSeeds.length; j++) {
      const a = railSeeds[i],
        b = railSeeds[j];
      if (!boxes.includes(a) || !boxes.includes(b)) continue;
      const x = Math.min(a.x, b.x),
        y = Math.min(a.y, b.y);
      const right = Math.max(a.x + a.w, b.x + b.w),
        bottom = Math.max(a.y + a.h, b.y + b.h);
      const gap = Math.max(a.y - b.y - b.h, b.y - a.y - a.h, 0);
      if (
        Math.abs(a.x + a.w / 2 - b.x - b.w / 2) > 5 ||
        gap > 3 ||
        bottom - y > 32 ||
        right - x > 32
      )
        continue;
      Object.assign(a, {
        x,
        y,
        w: right - x,
        h: bottom - y,
        componentCount: (a.componentCount || 1) + (b.componentCount || 1),
      });
      boxes.splice(boxes.indexOf(b), 1);
    }
}
function normalizeIconExtents(image, boxes, railSeeds) {
  const icons = boxes.filter((b) => b.shape === 'icon');
  for (const b of icons) {
    const peers = icons.filter((q) => Math.abs(Math.max(q.w, q.h) - Math.max(b.w, b.h)) <= 6);
    const sizes = peers.map((q) => Math.max(q.w, q.h) - 4).sort((a, b) => a - b);
    b.iconSize = Math.max(6, 2 * Math.round(sizes[Math.floor(sizes.length / 2)] / 2));
    if (railSeeds.includes(b)) {
      const rail = icons.filter(
        (q) => railSeeds.includes(q) && Math.abs(q.x + q.w / 2 - b.x - b.w / 2) <= 5
      );
      const sizes = rail.map((q) => Math.max(q.w, q.h) - 4).sort((a, b) => a - b);
      b.iconSize = Math.max(6, 2 * Math.round(sizes[Math.floor(sizes.length / 2)] / 2));
    }
    b.sourceBounds ??= { x: b.x, y: b.y, w: b.w, h: b.h };
    const side = b.iconSize + 4,
      cx = b.x + b.w / 2,
      cy = b.y + b.h / 2;
    const left = Math.max(0, Math.floor(cx - Math.max(b.w, side) / 2)),
      top = Math.max(0, Math.floor(cy - Math.max(b.h, side) / 2));
    b.w = Math.min(image.width - left, Math.max(b.w, side));
    b.h = Math.min(image.height - top, Math.max(b.h, side));
    b.x = left;
    b.y = top;
    b.bg = sampleBackground(image, b);
  }
}
function normalizeNeighborTextSizes(boxes) {
  const text = boxes.filter((b) => b.shape === 'text');
  for (const b of text) {
    const neighbors = text.filter((q) => {
      if ((q.componentCount || 1) < 3 && q.w < q.h * 2) return false;
      const aligned = Math.abs(q.x - b.x) <= 8 && Math.abs(q.y - b.y) <= 120;
      const row =
        Math.abs(q.y + q.h / 2 - b.y - b.h / 2) <= 3 &&
        Math.max(q.x - b.x - b.w, b.x - q.x - q.w, 0) <= 70;
      return (
        (aligned || row) &&
        Math.min(q.h, b.h) >= Math.max(q.h, b.h) * 0.64 &&
        q.h >= 24 === b.h >= 24
      );
    });
    const heights = neighbors.map((q) => q.h).sort((a, b) => a - b);
    const representative = heights.length ? heights[Math.floor((heights.length - 1) * 0.75)] : b.h;
    b.textSize = b.rowTextSize || Math.max(4, 2 * Math.round((representative - 4) / 2));
  }
}
export function candidateContrast(image, box) {
  const values = [];
  const left = Math.max(0, Math.floor(box.x));
  const top = Math.max(0, Math.floor(box.y));
  const right = Math.min(image.width, Math.ceil(box.x + box.w));
  const bottom = Math.min(image.height, Math.ceil(box.y + box.h));
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const i = (y * image.width + x) * 4;
      if (image.data[i + 3] < 128) continue;
      const distance = Math.max(...box.bg.map((v, c) => Math.abs(image.data[i + c] - v)));
      if (distance >= 12) values.push(distance);
    }
  }
  values.sort((a, b) => a - b);
  return values.length ? values[Math.floor((values.length - 1) * 0.8)] : 0;
}

function isChevron(image, box) {
  const ratio = box.w / box.h;
  if (box.h < 18 || box.h > 34 || ratio < 0.5 || ratio > 1.1 || (box.componentCount || 1) > 2)
    return false;
  const groups = [[], [], []],
    bgL = box.bg.reduce((a, b) => a + b, 0);
  for (let y = Math.ceil(box.y + 2); y < box.y + box.h - 2; y++)
    for (let x = Math.ceil(box.x + 2); x < box.x + box.w - 2; x++) {
      if (x < 0 || x >= image.width || y < 0 || y >= image.height) continue;
      const i = (y * image.width + x) * 4,
        l = image.data[i] + image.data[i + 1] + image.data[i + 2];
      if (l > bgL + 80)
        groups[Math.min(2, Math.floor(((y - box.y - 2) / Math.max(1, box.h - 4)) * 3))].push(x);
    }
  if (groups.some((g) => g.length < 2)) return false;
  const [top, mid, bottom] = groups.map((g) => g.reduce((a, b) => a + b, 0) / g.length);
  return Math.abs(top - bottom) < box.w * 0.25 && Math.abs(mid - (top + bottom) / 2) > box.w * 0.18;
}
function classify(box, image) {
  const ratio = box.w / box.h,
    count = box.componentCount || 1;
  // Disconnected small glyphs in a number or short word are text. Compact
  // stacked strokes remain eligible as icons; no character dictionary is used.
  box.shape =
    isChevron(image, box) ||
    (box.h >= 18 && ratio > 0.5 && ratio < 1.1 && count <= 2 && box.inkDensity < 0.35) ||
    (box.compact && ratio > 0.55 && ratio < 1.8 && count <= 6) ||
    (count === 1 && ratio > 0.85 && ratio < 1.5 && box.h >= 13)
      ? 'icon'
      : 'text';
  return box;
}
export function surfaceEvidence(image, box) {
  const { data, width, height } = image,
    bins = new Uint32Array(512);
  let near = 0,
    total = 0,
    dominant = 0;
  for (let y = Math.max(0, Math.ceil(box.y)); y < Math.min(height, box.y + box.h); y += 2)
    for (let x = Math.max(0, Math.ceil(box.x)); x < Math.min(width, box.x + box.w); x += 2) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 128) continue;
      total++;
      const r = data[i],
        g = data[i + 1],
        b = data[i + 2];
      if (Math.max(Math.abs(r - box.bg[0]), Math.abs(g - box.bg[1]), Math.abs(b - box.bg[2])) <= 20)
        near++;
      const key = (r >> 5) * 64 + (g >> 5) * 8 + (b >> 5),
        count = ++bins[key];
      if (count > dominant) dominant = count;
    }
  return { background: near / Math.max(1, total), dominant: dominant / Math.max(1, total) };
}
export function safeSupport(image, box, glyphMetrics, measureSurface = surfaceEvidence) {
  if (box.h < 25 || box.w < box.h * 1.6) return true;
  const e = measureSurface(image, box);
  if (e.background >= 0.45 || e.dominant <= 0.3) return true;
  // Dense, large type can occupy most of its tight proposal. Admit it only
  // when the original pixels establish a coherent, consistently coloured row.
  const atoms = (box.atoms || []).filter((a) => a.rgb && a.h >= box.h * 0.5);
  if (atoms.length < 4) return false;
  const color = [0, 1, 2].map(
    (c) => atoms.map((a) => a.rgb[c]).sort((a, b) => a - b)[Math.floor(atoms.length / 2)]
  );
  if (
    atoms.filter((a) => Math.max(...a.rgb.map((v, c) => Math.abs(v - color[c]))) <= 20).length <
    atoms.length * 0.85
  )
    return false;
  const m = glyphMetrics(image, box);
  return (
    !!m &&
    m.glyphs >= 6 &&
    m.baselineAgreement >= 0.9 &&
    m.heightAgreement >= 0.9 &&
    m.foregroundCoverage >= 0.95 &&
    m.stroke / m.xHeight <= 0.35 &&
    m.glyphBounds.w >= box.w * 0.85
  );
}
function hasSeparator(image, p, q) {
  const left = p.x + p.w <= q.x ? p : q,
    right = left === p ? q : p,
    start = Math.ceil(left.x + left.w),
    end = Math.floor(right.x);
  if (end <= start) return false;
  const top = Math.max(0, Math.floor(Math.max(p.y, q.y))),
    bottom = Math.min(image.height, Math.ceil(Math.min(p.y + p.h, q.y + q.h)));
  if (bottom - top < 8) return false;
  for (let x = start; x < end; x++) {
    let dark = 0;
    for (let y = top; y < bottom; y++) {
      const i = (y * image.width + x) * 4;
      if (Math.max(...p.bg.map((v, c) => Math.abs(v - image.data[i + c]))) > 35) dark++;
    }
    if (dark / (bottom - top) > 0.65) return true;
  }
  return false;
}
export function consolidate(image, input, glyphMetrics) {
  const measured = new Map(),
    measureSurface = (source, box) => {
      let result = measured.get(box);
      if (!result) {
        result = surfaceEvidence(source, box);
        measured.set(box, result);
      }
      return result;
    };
  const boxes = input
    .filter((box) => safeSupport(image, box, glyphMetrics, measureSurface))
    .map((box) =>
      classify({ ...box, backgroundSupport: measureSurface(image, box).background }, image)
    )
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const flow = (box) =>
    box.h >= 24 ||
    box.w >= box.h * 8 ||
    boxes.some(
      (other) =>
        other !== box &&
        Math.abs(other.x - box.x) <= 6 &&
        Math.abs(other.h - box.h) < Math.max(box.h, other.h) * 0.25 &&
        Math.abs(other.y - box.y) > box.h * 0.8 &&
        Math.abs(other.y - box.y) < box.h * 2.7
    );
  mergeConsolidatedRows(image, boxes, flow);
  return boxes;
}
function normalizeTextRows(image, input) {
  const boxes = input.map((b) => ({ ...b })),
    used = new Set();
  const anchors = boxes.filter((b) => b.shape === 'text' && b.w >= 24 && b.h >= 9 && b.h <= 26);
  for (const seed of anchors) {
    if (used.has(seed)) continue;
    const cy = seed.y + seed.h / 2;
    const peers = anchors
      .filter(
        (b) =>
          !used.has(b) &&
          Math.abs(b.y + b.h / 2 - cy) <= 3 &&
          Math.min(b.h, seed.h) >= Math.max(b.h, seed.h) * 0.64
      )
      .sort((a, b) => a.x - b.x);
    const segments = [];
    for (const b of peers) {
      const last = segments.at(-1);
      if (!last || b.x - last.at(-1).x - last.at(-1).w > Math.max(160, seed.h * 10))
        segments.push([b]);
      else last.push(b);
    }
    const group = segments.find((g) => g.includes(seed));
    if (!group || group.length < 3 || group.at(-1).x + group.at(-1).w - group[0].x < 180) continue;
    const centers = group.map((b) => b.y + b.h / 2).sort((a, b) => a - b),
      heights = group.map((b) => b.h).sort((a, b) => a - b);
    const center = centers[Math.floor(centers.length / 2)],
      height = heights[Math.floor(heights.length * 0.75)];
    const left = group[0].x,
      right = group.at(-1).x + group.at(-1).w;
    const members = boxes.filter(
      (b) =>
        b.shape === 'text' &&
        b.x >= left &&
        b.x + b.w <= right &&
        b.y < center &&
        b.y + b.h > center &&
        b.h <= height * 2.5
    );
    for (const b of members) {
      b.textCenterY = center;
      b.rowTextSize = Math.max(4, 2 * Math.round((height - 4) / 2));
      used.add(b);
      trimTextRowMember(image, b, center, height);
    }
  }
  // A small component inside a recognized label is not a second icon.
  return boxes.filter(
    (b) =>
      b.shape !== 'icon' ||
      !boxes.some(
        (t) =>
          t.textCenterY !== undefined &&
          t.x <= b.x &&
          t.x + t.w >= b.x + b.w &&
          t.y <= b.y &&
          t.y + t.h >= b.y + b.h
      )
  );
}

// Exclude thin top and bottom contour proposals only when both connect to
// continuous side strokes around multiple independent compact children.
function excludeEnclosingRailEdges(image, input) {
  const { width, height, data } = image;
  const thin = (b) =>
    b.atoms?.length === 1 &&
    b.atoms[0].w >= 8 &&
    b.atoms[0].h <= Math.max(2, b.atoms[0].w * 0.12) &&
    b.atoms[0].w >= b.atoms[0].h * 5;
  const candidates = input.filter(thin),
    excluded = new Set();
  const near = (x, y, color) => {
    const i = (y * width + x) * 4;
    return Math.max(...color.map((v, c) => Math.abs(data[i + c] - v))) <= 15;
  };
  for (let i = 0; i < candidates.length; i++)
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i].atoms[0],
        b = candidates[j].atoms[0],
        top = a.y < b.y ? a : b,
        bottom = top === a ? b : a;
      const span = bottom.y - top.y,
        mid = (top.x + top.w / 2 + bottom.x + bottom.w / 2) / 2;
      if (
        span < top.w * 1.5 ||
        span > top.w * 8 ||
        Math.abs(top.x - bottom.x) > Math.max(3, top.w * 0.15) ||
        Math.abs(top.w - bottom.w) > Math.max(3, top.w * 0.15) ||
        Math.max(...top.rgb.map((v, c) => Math.abs(v - bottom.rgb[c]))) > 12
      )
        continue;
      const children = input.filter(
        (q) =>
          q !== candidates[i] &&
          q !== candidates[j] &&
          q.x >= mid - top.w &&
          q.x + q.w <= mid + top.w &&
          q.y > top.y + 2 &&
          q.y + q.h < bottom.y - 1 &&
          q.w <= top.w * 1.5 &&
          q.h <= top.w * 1.5
      );
      if (children.length < 3 || !children.some((q) => q.shape === 'icon')) continue;
      const margin = Math.max(3, Math.ceil(top.w * 0.5)),
        findSide = (from, to) => {
          for (let x = Math.max(0, from); x <= Math.min(width - 1, to); x++) {
            let hits = 0,
              total = 0;
            for (
              let y = Math.max(0, Math.ceil(top.y + margin));
              y < Math.min(height, Math.floor(bottom.y - margin));
              y++
            ) {
              total++;
              if (near(x, y, top.rgb)) hits++;
            }
            if (total && hits / total >= 0.75) return true;
          }
          return false;
        };
      if (
        findSide(Math.floor(top.x - margin), Math.floor(top.x - 1)) &&
        findSide(Math.ceil(top.x + top.w), Math.ceil(top.x + top.w + margin))
      ) {
        excluded.add(candidates[i]);
        excluded.add(candidates[j]);
      }
    }
  return excluded;
}

export function normalizeRoles(image, input, glyphMetrics) {
  let boxes = normalizeTextRows(image, input);
  const frameEdges = excludeEnclosingRailEdges(image, boxes);
  const railSeeds = findToolbarRailSeeds(image, boxes);
  for (const b of railSeeds) {
    b.shape = 'icon';
    b.roleEvidence = 'toolbar-slot';
  }
  boxes = boxes.filter((b) => !frameEdges.has(b));
  mergeToolbarRailStrokes(boxes, railSeeds);
  normalizeIconExtents(image, boxes, railSeeds);
  normalizeNeighborTextSizes(boxes);
  normalizeTypeface(image, boxes, false, glyphMetrics);
  return boxes;
}
