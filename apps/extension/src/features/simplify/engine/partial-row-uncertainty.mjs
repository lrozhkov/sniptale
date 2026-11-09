// Experimental paragraph-context recovery. Call before erase support is attached.
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const center = (b) => b.y + b.h / 2;
const sameBg = (a, b) => Math.max(...a.bg.map((v, i) => Math.abs(v - b.bg[i]))) <= 5;
function trace(image, box, nominal) {
  const x0 = Math.max(0, Math.floor(box.x)),
    y0 = Math.max(0, Math.floor(box.y)),
    w = Math.min(image.width - x0, Math.ceil(box.w)),
    h = Math.min(image.height - y0, Math.ceil(box.h)),
    mask = new Uint8Array(w * h),
    seen = new Uint8Array(w * h);
  let flat = 0,
    total = 0,
    colored = 0,
    ink = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const p = ((y0 + y) * image.width + x0 + x) * 4,
        d = box.bg.map((v, k) => image.data[p + k] - v),
        delta = Math.max(...d.map(Math.abs));
      total++;
      if (delta <= 5) flat++;
      if (delta > 12) {
        mask[y * w + x] = 1;
        ink++;
        if (Math.max(...d) - Math.min(...d) > 12) colored++;
      }
    }
  if (flat / Math.max(1, total) < 0.55 || colored / Math.max(1, ink) > 0.1) return null;
  const parts = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || seen[i]) continue;
    const queue = [i];
    seen[i] = 1;
    let left = w,
      right = 0,
      top = h,
      bottom = 0;
    for (let k = 0; k < queue.length; k++) {
      let p = queue[k],
        x = p % w,
        y = Math.floor(p / w);
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx,
            yy = y + dy,
            j = yy * w + xx;
          if (xx >= 0 && xx < w && yy >= 0 && yy < h && mask[j] && !seen[j]) {
            seen[j] = 1;
            queue.push(j);
          }
        }
    }
    if (queue.length >= 2)
      parts.push({ w: right - left + 1, h: bottom - top + 1, n: queue.length });
  }
  if (parts.length < 8 || parts.some((p) => p.w >= 2 * nominal || p.h >= 2 * nominal)) return null;
  const nonSolid = parts.filter((p) => p.w >= 2 && p.h >= 2 && p.n / (p.w * p.h) < 0.85);
  if (nonSolid.length < 4) return null;
  return { parts: parts.length, nonSolid: nonSolid.length };
}
export function resolveUncertainPartialRows(image, catalog, rawProposals, measure) {
  let result = [...catalog];
  const proposals = rawProposals
    .filter((b) => b.bg && b.w >= 6 && b.h >= 3)
    .sort((a, b) => a.y - b.y || a.x - b.x);
  for (const seed of proposals) {
    const paragraph = partialRowParagraph(seed, result);
    if (!paragraph) continue;
    const { last, previous, p } = paragraph;
    const group = growPartialRowProposals(image, proposals, seed, p, measure);
    const x = Math.min(...group.map((b) => b.x)),
      y = Math.min(...group.map((b) => b.y)),
      right = Math.max(...group.map((b) => b.x + b.w)),
      bottom = Math.max(...group.map((b) => b.y + b.h));
    const candidate = { ...seed, x, y, w: right - x, h: bottom - y };
    if (candidate.h >= last.h * 0.85 || candidate.w > last.w * 1.1 || candidate.w < last.w * 0.2)
      continue;
    const m = measure(image, candidate);
    if (!m || m.xHeight >= p.xHeight * 0.75) continue;
    // A symbol inferred from the same label fragments can be a pair of partial
    // glyphs. Only reconsider it when its source atoms fit this row and another
    // text fragment shares the detector's label group.
    const rowFragment = (b) => isPartialRowSymbolFragment(b, result, candidate, p);
    const protectedBoxes = catalog.protected || [];
    if (
      protectedBoxes.some((b) => overlap(b, candidate)) ||
      result.some(
        (b) =>
          b !== last &&
          b !== previous &&
          (['icon', 'image', 'graphic'].includes(b.shape) ||
            b.kind === 'outline' ||
            b.kind === 'control' ||
            b.kind === 'direction-symbol') &&
          overlap(b, candidate) &&
          !rowFragment(b)
      )
    )
      continue;
    const evidence = trace(image, candidate, p.xHeight);
    if (!evidence) continue;
    const overlapping = result.filter((b) => overlap(b, candidate));
    if (
      overlapping.some(
        (b) =>
          (!['text', 'unknown'].includes(b.shape) && !rowFragment(b)) ||
          (b.shape === 'text' && (!sameBg(b, candidate) || b.h >= last.h * 0.85))
      )
    )
      continue;
    const removed = new Set(overlapping);
    result = result.filter((b) => !removed.has(b));
    result.push({
      ...candidate,
      shape: 'unknown',
      kind: 'incomplete-text-row',
      roleEvidence: 'incomplete-text-row',
      sourceBounds: { x: candidate.x, y: candidate.y, w: candidate.w, h: candidate.h },
      partialEvidence: evidence,
    });
  }
  if (catalog.protected) result.protected = catalog.protected;
  return result;
}

function growPartialRowProposals(image, proposals, seed, p, measure) {
  const group = [seed];
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const b of proposals) {
      if (group.includes(b) || !sameBg(b, seed) || b.x < seed.x - 3) continue;
      const v = Math.min(b.y + b.h, seed.y + seed.h) - Math.max(b.y, seed.y),
        gap = Math.min(...group.map((g) => Math.max(b.x - g.x - g.w, g.x - b.x - b.w, 0)));
      const bm = measure(image, b);
      if (
        v >= Math.min(b.h, seed.h) * 0.5 &&
        gap <= p.xHeight * 1.1 &&
        (bm
          ? bm.glyphs >= 2 && bm.baselineAgreement >= 0.7 && bm.heightAgreement >= 0.3
          : b.w <= p.xHeight * 1.5)
      ) {
        group.push(b);
        expanded = true;
      }
    }
  }
  return group;
}

function isPartialRowSymbolFragment(b, result, candidate, p) {
  return (
    b.shape === 'icon' &&
    b.roleEvidence === 'structured-symbol' &&
    b.structureGroup &&
    result.some(
      (t) =>
        t !== b &&
        t.shape === 'text' &&
        t.structureGroup === b.structureGroup &&
        overlap(t, candidate)
    ) &&
    b.sourceBounds &&
    b.sourceBounds.x >= candidate.x &&
    b.sourceBounds.x + b.sourceBounds.w <= candidate.x + candidate.w &&
    b.sourceBounds.y >= candidate.y &&
    b.sourceBounds.y + b.sourceBounds.h <= candidate.y + candidate.h &&
    sameBg(b, candidate) &&
    b.atoms?.length === 2 &&
    b.atoms.every(
      (a) =>
        a.y >= candidate.y &&
        a.y + a.h <= candidate.y + candidate.h &&
        a.h <= p.xHeight &&
        a.w <= p.xHeight &&
        a.n / (a.w * a.h) < 0.8
    )
  );
}

function partialRowParagraph(seed, result) {
  const parents = result
    .filter(
      (b) =>
        b.shape === 'text' &&
        b.textConfidence &&
        b.typeMetrics?.glyphs >= 5 &&
        Math.abs(b.x - seed.x) <= 3 &&
        sameBg(b, seed) &&
        b.y + b.h <= seed.y
    )
    .sort((a, b) => b.y - a.y);
  if (parents.length < 2) return null;
  const [last, previous] = parents,
    p = last.typeMetrics,
    q = previous.typeMetrics;
  if (
    Math.min(p.xHeight, q.xHeight) < Math.max(p.xHeight, q.xHeight) * 0.75 ||
    Math.abs(last.h - previous.h) > Math.max(last.h, previous.h) * 0.2
  )
    return null;
  const spacing = center(last) - center(previous);
  if (
    spacing < last.h * 0.8 ||
    spacing > last.h * 2.5 ||
    Math.abs(center(seed) - (center(last) + spacing)) > Math.max(2, last.h * 0.3)
  )
    return null;
  return { last, previous, p };
}
