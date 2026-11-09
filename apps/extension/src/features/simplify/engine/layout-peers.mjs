import { intersects, centerX, centerY, median } from './structure-topology.mjs';
import { inkParts } from './structure.mjs';

export function compact(b) {
  return (
    b.shape !== 'image' &&
    b.roleEvidence !== 'separator' &&
    b.w >= 6 &&
    b.w <= 24 &&
    b.h >= 6 &&
    b.h <= 24 &&
    b.w / b.h >= 0.5 &&
    b.w / b.h <= 2 &&
    (b.componentCount || 1) <= 3
  );
}
function fingerprint(image, b) {
  if (!image.data || !b.bg) return null;
  const values = [];
  // Ignore detector padding and normalize to a common grid.
  const insetX = Math.min(2, Math.floor(b.w / 4)),
    insetY = Math.min(2, Math.floor(b.h / 4));
  for (let gy = 0; gy < 6; gy++)
    for (let gx = 0; gx < 6; gx++) {
      const x = Math.max(
        0,
        Math.min(image.width - 1, Math.floor(b.x + insetX + ((gx + 0.5) * (b.w - 2 * insetX)) / 6))
      );
      const y = Math.max(
        0,
        Math.min(image.height - 1, Math.floor(b.y + insetY + ((gy + 0.5) * (b.h - 2 * insetY)) / 6))
      );
      const i = (y * image.width + x) * 4;
      values.push(Math.max(...b.bg.map((v, c) => Math.abs(v - image.data[i + c]))) > 35 ? 1 : 0);
    }
  return values;
}
function sameInk(a, b) {
  if (!a || !b) return false;
  let direct = 0,
    mirror = 0,
    ink = 0;
  for (let i = 0; i < a.length; i++) {
    direct += a[i] !== b[i];
    mirror += a[i] !== b[Math.floor(i / 6) * 6 + (5 - (i % 6))];
    ink += a[i] || b[i];
  }
  return ink >= 3 && Math.min(direct, mirror) <= Math.max(3, ink * 0.35);
}
export function markRepeatedIcons(image, boxes, measure) {
  const candidates = boxes.filter(
      (b) => compact(b) && (!repeatedPeerTextLike(image, b, measure) || b.roleEvidence)
    ),
    signatures = new Map(candidates.map((b) => [b, fingerprint(image, b)]));
  const marks = new Set();
  markMatchingIconPeers(candidates, boxes, signatures, marks);
  // Repeated slots in a horizontal toolbar can contain different icon shapes.
  markToolbarIconPeers(candidates, marks);
  // Normalize each peer family, not icons in unrelated areas of the image.
  for (const b of marks) {
    // A confirmed toolbar slot already owns the common replacement size.
    if (b.roleEvidence === 'toolbar-slot') continue;
    const peers = [...marks].filter(
      (q) =>
        Math.abs(q.w - b.w) <= 5 &&
        Math.abs(q.h - b.h) <= 5 &&
        (sameInk(signatures.get(b), signatures.get(q)) ||
          (Math.abs(centerY(q) - centerY(b)) <= 5 && Math.abs(q.x - b.x) <= 160))
    );
    const size = Math.max(
      4,
      2 * Math.round(median(peers.map((q) => Math.max(4, Math.min(q.w, q.h) - 4))) / 2)
    );
    if (b.shape !== 'icon') {
      delete b.typeMetrics;
      delete b.contrast;
    }
    b.shape = 'icon';
    b.iconSize = size;
    b.roleEvidence = 'repeated-symbol';
  }
}
// A mirrored pair is recovered only with a confirmed image surface, an
// established chevron, and a matching opposite-side raster silhouette.
export function recoverMediaPeer(image, boxes, media, obstacles) {
  if (!image.data) return [];
  const out = [];
  for (const m of media) {
    if (m.w < 100 || m.h < 80) continue;
    for (const b of boxes) {
      if (b.shape !== 'icon' || b.w < 10 || b.h < 10 || b.w > 44 || b.h > 44 || !b.bg) continue;
      if (Math.abs(centerY(b) - centerY(m)) > m.h * 0.2) continue;
      const isLeft = centerX(b) < m.x,
        isRight = centerX(b) > m.x + m.w;
      if (!isLeft && !isRight) continue;
      const gap = isLeft ? m.x - (b.x + b.w) : b.x - (m.x + m.w);
      if (gap < 0 || gap > Math.max(50, b.w * 3)) continue;
      const silhouette = mediaChevronMask(image, b);
      if (!silhouette) continue;
      const { width, height } = silhouette;
      const best = findMirroredMediaPeer(image, b, m, boxes, obstacles, silhouette);
      if (best)
        out.push({
          ...best,
          shape: 'icon',
          kind: 'paired-media-symbol',
          componentCount: 1,
          compact: true,
          iconSize: b.iconSize || Math.max(4, Math.min(width, height) - 4),
          roleEvidence: 'paired-symbol',
        });
    }
  }
  return out;
}

function repeatedPeerTextLike(image, b, measure) {
  const m = measure?.(image, b);
  if (
    !m ||
    m.glyphs < 2 ||
    m.baselineAgreement < 0.7 ||
    m.heightAgreement < 0.7 ||
    m.stroke / m.xHeight > 0.4
  )
    return false;
  const parts = inkParts(image, b)
    .filter((p) => p.h >= m.xHeight * 0.6)
    .sort((a, c) => a.x - c.x);
  return (
    parts.length >= 2 &&
    parts
      .slice(1)
      .some(
        (p, i) =>
          p.x >= parts[i].x + parts[i].w &&
          Math.abs(p.y + p.h - parts[i].y - parts[i].h) <= Math.max(2, m.xHeight * 0.3)
      )
  );
}

function markMatchingIconPeers(candidates, boxes, signatures, marks) {
  for (const b of candidates) {
    if (b.shape === 'text' && !b.roleEvidence && ((b.componentCount || 1) > 1 || b.w < b.h * 1.1))
      continue;
    // Repeated inline glyphs: use both matching pixels and a nearby text label.
    const hasLabel = (p) =>
      boxes.some(
        (q) =>
          q !== p &&
          q.shape === 'text' &&
          q.w > p.w * 2 &&
          Math.max(q.x - (p.x + p.w), p.x - (q.x + q.w)) >= 0 &&
          Math.max(q.x - (p.x + p.w), p.x - (q.x + q.w)) <= Math.max(20, p.h * 2) &&
          Math.abs(centerY(q) - centerY(p)) <= Math.max(q.h, p.h) * 0.5
      );
    const peers = candidates.filter(
      (q) =>
        q !== b &&
        (q.shape === 'icon' ||
          q.roleEvidence ||
          ((q.componentCount || 1) === 1 && q.w >= q.h * 1.1)) &&
        Math.abs(q.w - b.w) <= 4 &&
        Math.abs(q.h - b.h) <= 4 &&
        sameInk(signatures.get(b), signatures.get(q)) &&
        hasLabel(q)
    );
    if (peers.length >= 2 && hasLabel(b)) {
      marks.add(b);
      for (const p of peers) marks.add(p);
    }
  }
}

function markToolbarIconPeers(candidates, marks) {
  for (const b of candidates) {
    const row = candidates
      .filter(
        (q) => Math.abs(centerY(q) - centerY(b)) <= 5 && Math.abs(centerX(q) - centerX(b)) <= 160
      )
      .sort((a, c) => centerX(a) - centerX(c));
    if (row.length < 4 || row.filter((q) => q.shape === 'icon').length < 2) continue;
    const gaps = row.slice(1).map((q, i) => centerX(q) - centerX(row[i]));
    const spacing = median(gaps);
    if (
      spacing < 12 ||
      gaps.some((g) => {
        const slots = Math.round(g / spacing);
        return slots < 1 || slots > 2 || Math.abs(g - slots * spacing) > Math.max(5, spacing * 0.2);
      })
    )
      continue;
    for (const p of row) marks.add(p);
  }
}

function mediaChevronMask(image, b) {
  const width = Math.round(b.w),
    height = Math.round(b.h),
    mask = [];
  let count = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const px = Math.floor(b.x + x),
        py = Math.floor(b.y + y),
        i = (py * image.width + px) * 4;
      const ink = Math.max(...b.bg.map((v, c) => Math.abs(v - image.data[i + c]))) > 40;
      mask.push(ink);
      count += ink;
    }
  if (count < 10) return null;
  const groups = [[], [], []];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (mask[y * width + x]) groups[Math.min(2, Math.floor((y * 3) / height))].push(x);
  if (groups.some((g) => g.length < 2)) return null;
  const means = groups.map((g) => g.reduce((a, v) => a + v, 0) / g.length);
  if (
    Math.abs(means[0] - means[2]) > width * 0.25 ||
    Math.abs(means[1] - (means[0] + means[2]) / 2) < width * 0.12
  )
    return null;
  return { width, height, mask, count };
}

function mirroredInkMatch(image, x, y, width, height, mask, count) {
  const samples = [
    [x, y],
    [x + width - 1, y],
    [x, y + height - 1],
    [x + width - 1, y + height - 1],
  ].map(([px, py]) => {
    const i = (py * image.width + px) * 4;
    return [image.data[i], image.data[i + 1], image.data[i + 2]];
  });
  const bg = [0, 1, 2].map((c) => median(samples.map((p) => p[c])));
  let found = 0,
    match = 0;
  for (let py = 0; py < height; py++)
    for (let px = 0; px < width; px++) {
      const i = ((y + py) * image.width + x + px) * 4,
        ink = Math.max(...bg.map((v, c) => Math.abs(v - image.data[i + c]))) > 40;
      if (ink) {
        found++;
        if (mask[py * width + (width - 1 - px)]) match++;
      }
    }
  const score = match / Math.max(count, found);
  return { bg, score };
}

function findMirroredMediaPeer(image, b, m, boxes, obstacles, { width, height, mask, count }) {
  const expected = Math.round(2 * centerX(m) - centerX(b) - width / 2),
    top = Math.round(b.y);
  let best = null;
  for (let x = expected - 12; x <= expected + 12; x++)
    for (let y = top - 3; y <= top + 3; y++) {
      const target = { x, y, w: width, h: height };
      if (
        x < 0 ||
        y < 0 ||
        x + width >= image.width ||
        y + height >= image.height ||
        intersects(target, m) ||
        obstacles.some((o) => intersects(target, o)) ||
        boxes.some((q) => q !== b && intersects(target, q))
      )
        continue;
      const { bg, score } = mirroredInkMatch(image, x, y, width, height, mask, count);
      if (score >= 0.78 && (!best || score > best.score)) best = { ...target, bg, score };
    }
  return best;
}
