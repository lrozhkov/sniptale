import { inkParts } from './structure.mjs';

const bounds = (parts) => {
  const x = Math.min(...parts.map((p) => p.x)),
    y = Math.min(...parts.map((p) => p.y));
  return {
    x,
    y,
    w: Math.max(...parts.map((p) => p.x + p.w)) - x,
    h: Math.max(...parts.map((p) => p.y + p.h)) - y,
  };
};
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
// A filled central disk and rays in all four cardinal directions form a sun.
// Diagonal rays may touch the disk at small raster sizes. They still must put
// foreground ink beyond both axes of the disk.
function sun(image, parts, bg) {
  for (const core of parts) {
    const d = (core.w + core.h) / 2;
    if (
      d < 6 ||
      d > 30 ||
      core.w / core.h < 0.75 ||
      core.w / core.h > 1.33 ||
      core.n / (core.w * core.h) < 0.42
    )
      continue;
    const cx = core.x + (core.w - 1) / 2,
      cy = core.y + (core.h - 1) / 2;
    const rays = parts
      .filter((p) => p !== core && p.n >= 2 && p.n < core.n * 0.45)
      .filter((p) => {
        const dx = p.x + (p.w - 1) / 2 - cx,
          dy = p.y + (p.h - 1) / 2 - cy,
          dist = Math.hypot(dx, dy);
        return dist >= d * 0.48 && dist <= d * 1.15;
      });
    const cardinal = [0, 0, 0, 0];
    for (const p of rays) {
      const dx = p.x + (p.w - 1) / 2 - cx,
        dy = p.y + (p.h - 1) / 2 - cy;
      if (Math.abs(dx) > Math.abs(dy) * 2) cardinal[dx > 0 ? 0 : 1]++;
      if (Math.abs(dy) > Math.abs(dx) * 2) cardinal[dy > 0 ? 2 : 3]++;
    }
    if (cardinal.some((n) => n !== 1)) continue;
    const pixel = (x, y) => {
      if (x < 0 || y < 0 || x >= image.width || y >= image.height) return false;
      const i = (y * image.width + x) * 4;
      return Math.max(...bg.map((v, c) => Math.abs(v - image.data[i + c]))) > 40;
    };
    // Four quadrants must contain diagonal foreground beyond the disk's
    // central cross. This rejects a plus with four separate dots and spinners.
    let diagonals = 0;
    for (const sx of [-1, 1])
      for (const sy of [-1, 1]) {
        let found = false;
        for (let y = core.y; y < core.y + core.h; y++)
          for (let x = core.x; x < core.x + core.w; x++)
            if ((x - cx) * sx >= d * 0.31 && (y - cy) * sy >= d * 0.31 && pixel(x, y)) found = true;
        if (found) diagonals++;
      }
    if (diagonals < 4) continue;
    return [core, ...rays];
  }
  return null;
}

// Two disconnected arcs that jointly cover an empty ellipse provide graphic
// evidence that neither an open letter nor a closed single-component ring has.
export function segmentedAnnulus(image, parts, bg) {
  if (parts.length !== 2) return null;
  const [major, minor] = [...parts].sort((a, b) => b.n - a.n),
    box = bounds(parts);
  if (
    box.w < 12 ||
    box.h < 12 ||
    box.w > 40 ||
    box.h > 40 ||
    box.w / box.h < 0.75 ||
    box.w / box.h > 1.33 ||
    minor.n < 8 ||
    minor.n > major.n * 0.55
  )
    return null;
  const cx = box.x + (box.w - 1) / 2,
    cy = box.y + (box.h - 1) / 2,
    rx = box.w / 2,
    ry = box.h / 2;
  const angles = [new Set(), new Set()];
  let ink = 0,
    inner = 0,
    outer = 0;
  for (let y = box.y; y < box.y + box.h; y++)
    for (let x = box.x; x < box.x + box.w; x++) {
      const i = (y * image.width + x) * 4;
      if (Math.max(...bg.map((v, c) => Math.abs(v - image.data[i + c]))) <= 40) continue;
      const dx = (x - cx) / rx,
        dy = (y - cy) / ry,
        r = Math.hypot(dx, dy),
        bin = Math.floor(((Math.atan2(dy, dx) + Math.PI) * 8) / Math.PI) % 16;
      ink++;
      if (r < 0.35) inner++;
      if (r > 1.25) outer++;
      for (const [j, p] of [major, minor].entries())
        if (x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h) angles[j].add(bin);
    }
  const total = new Set([...angles[0], ...angles[1]]);
  if (
    !ink ||
    inner > ink * 0.025 ||
    outer > ink * 0.05 ||
    total.size < 15 ||
    angles[0].size < 9 ||
    angles[1].size < 2 ||
    angles[1].size > 6
  )
    return null;
  return [major, minor];
}

// A closed counter and a tail in the lower-right quadrant are necessary but
// not sufficient: the glyph Q can have the same shape. The caller also needs
// an independent icon peer in the same row or column.
function magnifier(image, parts, bg) {
  const p = [...parts].sort((a, b) => b.n - a.n)[0];
  if (!p || p.w < 10 || p.h < 10 || p.w / p.h < 0.7 || p.w / p.h > 1.4) return null;
  const mask = new Uint8Array(p.w * p.h),
    seen = new Uint8Array(p.w * p.h);
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      const i = ((p.y + y) * image.width + p.x + x) * 4;
      mask[y * p.w + x] =
        Math.max(...bg.map((v, c) => Math.abs(v - image.data[i + c]))) > 40 ? 1 : 0;
    }
  const holes = [];
  for (let k = 0; k < mask.length; k++) {
    if (mask[k] || seen[k]) continue;
    const q = [k];
    seen[k] = 1;
    let l = p.w,
      r = 0,
      t = p.h,
      b = 0,
      edge = false;
    for (let z = 0; z < q.length; z++) {
      const x = q[z] % p.w,
        y = Math.floor(q[z] / p.w);
      l = Math.min(l, x);
      r = Math.max(r, x);
      t = Math.min(t, y);
      b = Math.max(b, y);
      if (!x || !y || x === p.w - 1 || y === p.h - 1) edge = true;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const xx = x + dx,
          yy = y + dy,
          j = yy * p.w + xx;
        if (xx >= 0 && yy >= 0 && xx < p.w && yy < p.h && !mask[j] && !seen[j]) {
          seen[j] = 1;
          q.push(j);
        }
      }
    }
    if (!edge) holes.push({ l, r, t, b, n: q.length });
  }
  const h = holes.sort((a, b) => b.n - a.n)[0];
  if (
    holes.length !== 1 ||
    !h ||
    h.n < p.w * p.h * 0.09 ||
    (h.r - h.l + 1) / (h.b - h.t + 1) < 0.65 ||
    (h.r - h.l + 1) / (h.b - h.t + 1) > 1.5
  )
    return null;
  const left = h.l,
    top = h.t,
    right = p.w - 1 - h.r,
    bottom = p.h - 1 - h.b;
  if (right < left * 1.3 || bottom < top * 1.3) return null;
  // The terminal pixels must extend diagonally past the closed counter.
  let tail = 0;
  for (let y = h.b + 1; y < p.h; y++)
    for (let x = h.r + 1; x < p.w; x++)
      if (mask[y * p.w + x] && Math.abs(x - h.r - (y - h.b)) <= Math.max(2, p.w * 0.2)) tail++;
  return tail >= 2 ? p : null;
}
function iconPeer(input, area, ids) {
  // Text on the same baseline supplies a competing glyph interpretation.
  const textNeighbor = input.some(
    (b, k) =>
      !ids.includes(k) &&
      b.shape === 'text' &&
      b.textConfidence &&
      Math.abs(b.y + b.h - (area.y + area.h)) <= Math.max(3, area.h * 0.25) &&
      Math.max(b.x - area.x - area.w, area.x - b.x - b.w, 0) <= area.w * 3
  );
  if (textNeighbor) return false;
  return input.some((b, k) => {
    if (ids.includes(k) || b.shape !== 'icon' || b.w > area.w * 2 || b.h > area.h * 2) return false;
    const dx = Math.abs(b.x + b.w / 2 - area.x - area.w / 2),
      dy = Math.abs(b.y + b.h / 2 - area.y - area.h / 2),
      unit = Math.max(area.w, area.h, b.w, b.h);
    return (
      (dx <= unit * 0.35 && dy >= unit && dy <= unit * 5) ||
      (dy <= unit * 0.35 && dx >= unit && dx <= unit * 5)
    );
  });
}

function componentRuns(image, parts, bg) {
  const pixels = new Set();
  for (const p of parts) {
    const direction = p.rgb.map((v, c) => v - bg[c]),
      length = direction.reduce((n, v) => n + v * v, 0);
    if (length < 25) continue;
    const core = new Set();
    for (let y = p.y; y < p.y + p.h; y++)
      for (let x = p.x; x < p.x + p.w; x++) {
        const i = (y * image.width + x) * 4,
          d = bg.map((v, c) => image.data[i + c] - v),
          alpha = d.reduce((n, v, c) => n + v * direction[c], 0) / length;
        if (
          alpha >= 0.5 &&
          alpha <= 1.3 &&
          Math.max(...d.map((v, c) => Math.abs(v - alpha * direction[c]))) <= 15
        )
          core.add(y * image.width + x);
      }
    for (let y = Math.max(0, p.y - 1); y < Math.min(image.height, p.y + p.h + 1); y++)
      for (let x = Math.max(0, p.x - 1); x < Math.min(image.width, p.x + p.w + 1); x++) {
        const i = (y * image.width + x) * 4,
          d = bg.map((v, c) => image.data[i + c] - v),
          alpha = d.reduce((n, v, c) => n + v * direction[c], 0) / length;
        if (
          alpha < 0.025 ||
          alpha > 1.3 ||
          Math.max(...d.map((v, c) => Math.abs(v - alpha * direction[c]))) > 15
        )
          continue;
        let adjacent = false;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++)
            if (core.has((y + dy) * image.width + x + dx)) adjacent = true;
        if (adjacent) pixels.add(y * image.width + x);
      }
  }
  const sorted = [...pixels].sort((a, b) => a - b),
    runs = [];
  for (const v of sorted) {
    const y = Math.floor(v / image.width),
      x = v % image.width,
      last = runs.at(-1);
    if (last && last[0] === y && last[1] + last[2] === x) last[2]++;
    else runs.push([y, x, 1]);
  }
  return runs;
}
function caret(image, p, sun, bg) {
  if (
    p.w < 5 ||
    p.w > sun.w * 0.7 ||
    p.h < 2 ||
    p.h > p.w * 0.75 ||
    p.x - (sun.x + sun.w) < 2 ||
    p.x - (sun.x + sun.w) > sun.w * 0.7 ||
    Math.abs(p.y + p.h / 2 - sun.y - sun.h / 2) > sun.h * 0.2
  )
    return false;
  const rows = [];
  for (let y = p.y; y < p.y + p.h; y++) {
    const xs = [];
    for (let x = p.x; x < p.x + p.w; x++) {
      const i = (y * image.width + x) * 4;
      if (Math.max(...bg.map((v, c) => Math.abs(v - image.data[i + c]))) > 40) xs.push(x);
    }
    if (!xs.length) return false;
    rows.push({ n: xs.length, center: (xs[0] + xs.at(-1)) / 2 });
  }
  return (
    rows[0].n >= p.w * 0.8 &&
    rows.at(-1).n <= rows[0].n * 0.5 &&
    rows.every((r, i) => !i || r.n <= rows[i - 1].n) &&
    rows.every((r) => Math.abs(r.center - (p.x + (p.w - 1) / 2)) <= 1)
  );
}

/** Claim positively identified radial icons from existing proposals. */
export function claimRadialIcons(image, input, measure, options = {}) {
  const protectedRects = (options.protected || input.protected || []).filter(
    (b) => b.kind !== 'outline'
  );
  const used = new Set(),
    out = [];
  for (let i = 0; i < input.length; i++) {
    const first = input[i];
    if (
      used.has(i) ||
      !['unknown', 'text'].includes(first.shape) ||
      first.roleEvidence ||
      !first.bg
    )
      continue;
    const candidates = radialProposalGroups(input, i, first, used);
    for (const ids of candidates) {
      const proposals = ids.map((k) => input[k]),
        area = bounds(proposals);
      if (area.w < 8 || area.h < 8 || area.w > 42 || area.h > 42) continue;
      if (protectedRects.some((p) => overlap(area, p))) continue;
      const parts = inkParts(image, { ...area, bg: first.bg, atoms: null });
      const { found, reason } = recognizeRadialParts(image, parts, first.bg, input, area, ids);
      if (!found) continue;
      const tight = bounds(found);
      // A proposal can include a nearby dropdown caret; retain its full source.
      // Reject a proposal that also has typography or a different nearby owner.
      if (
        proposals.some((p) => {
          const m = measure(image, p, 1);
          return m?.glyphs >= 3 && m.baselineAgreement >= 0.7 && m.heightAgreement >= 0.7;
        })
      )
        continue;
      if (
        proposals.some((p) => !overlap(p, tight)) ||
        input.some((p, k) => !ids.includes(k) && !used.has(k) && overlap(p, area))
      )
        continue;
      const sourceBounds = { x: tight.x, y: tight.y, w: tight.w, h: tight.h };
      out.push({
        ...first,
        ...sourceBounds,
        sourceBounds,
        sourceRuns: componentRuns(image, found, first.bg),
        atoms: found,
        componentCount: found.length,
        shape: 'icon',
        compact: true,
        kind: 'radial-icon',
        roleEvidence: reason,
        iconSize: Math.min(tight.w, tight.h),
      });
      appendRadialResiduals(image, out, first, parts, found, tight, reason);
      ids.forEach((k) => used.add(k));
      break;
    }
  }
  const result = [...input.filter((_, i) => !used.has(i)), ...out];
  if (input.protected) result.protected = input.protected;
  return result;
}

function recognizeRadialParts(image, parts, bg, input, area, ids) {
  let found = segmentedAnnulus(image, parts, bg),
    reason = 'segmented-annulus';
  if (!found) {
    found = sun(image, parts, bg);
    reason = 'sun-rays';
  }
  if (!found && iconPeer(input, area, ids)) {
    const ring = magnifier(image, parts, bg);
    if (ring) {
      found = [ring];
      reason = 'magnifier-peer';
      // A small same-colour round badge at the upper-right of the lens is a
      // detached part of the symbol. Other parts remain independent owners.
      const badges = parts.filter(
        (p) =>
          p !== ring &&
          p.w >= 2 &&
          p.h >= 2 &&
          p.w <= ring.w * 0.3 &&
          p.h <= ring.h * 0.3 &&
          p.w / p.h >= 0.6 &&
          p.w / p.h <= 1.5 &&
          p.n / (p.w * p.h) >= 0.45 &&
          p.x >= ring.x + ring.w * 0.65 &&
          p.x <= ring.x + ring.w * 1.25 &&
          p.y + p.h >= ring.y - ring.h * 0.2 &&
          p.y <= ring.y + ring.h * 0.35 &&
          Math.max(...p.rgb.map((v, k) => Math.abs(v - ring.rgb[k]))) <= 35
      );
      if (badges.length === 1) found.push(badges[0]);
    }
  }
  return { found, reason };
}

function appendRadialResiduals(image, out, first, parts, found, tight, reason) {
  // Keep every unrelated component as an unknown owner. In particular a
  // neighbouring dropdown caret does not become part of the sun.
  for (const part of parts.filter((p) => !found.includes(p))) {
    const residual = { x: part.x, y: part.y, w: part.w, h: part.h },
      sourceRuns = componentRuns(image, [part], first.bg);
    if (reason === 'sun-rays' && caret(image, part, tight, first.bg)) {
      const pad = 2;
      out.push({
        ...first,
        x: Math.max(0, part.x - pad),
        y: Math.max(0, part.y - pad),
        w: part.w + 2 * pad,
        h: part.h + 2 * pad,
        sourceBounds: residual,
        sourceRuns,
        atoms: [part],
        componentCount: 1,
        shape: 'icon',
        compact: true,
        kind: 'radial-icon',
        roleEvidence: 'radial-caret',
        iconSize: 2 * Math.round(part.w * 0.4),
      });
    } else
      out.push({
        ...first,
        ...residual,
        sourceBounds: residual,
        sourceRuns,
        atoms: [part],
        componentCount: 1,
        shape: 'unknown',
        compact: false,
        kind: 'radial-residual',
        roleEvidence: 'radial-residual',
      });
  }
}

function radialProposalGroups(input, i, first, used) {
  const candidates = [[i]];
  for (let j = i + 1; j < input.length; j++) {
    const q = input[j];
    if (
      used.has(j) ||
      !['unknown', 'text'].includes(q.shape) ||
      q.roleEvidence ||
      !q.bg ||
      Math.max(...q.bg.map((v, k) => Math.abs(v - first.bg[k]))) > 8
    )
      continue;
    const b = bounds([first, q]);
    if (b.w <= 42 && b.h <= 42) candidates.push([i, j]);
  }
  return candidates;
}
