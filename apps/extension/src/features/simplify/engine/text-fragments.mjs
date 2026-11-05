import { attachEraseSupport } from './erasures.mjs';

// Experimental ownership resolver. Run before erase support is attached.
// Only remove an unknown when its source components belong to overlapping text.
export function resolveOverlappingTextFragments(image, input, measure) {
  let boxes = [...input];
  const overlap = (a, b) =>
    Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  for (const unknown of input.filter((b) => b.shape === 'unknown' && !b.roleEvidence)) {
    const text = boxes.find(
      (b) =>
        b.shape === 'text' &&
        b.textConfidence &&
        unknown.h < b.h * 0.65 &&
        overlap(b, unknown) >= unknown.w * unknown.h * 0.5 &&
        Math.max(...b.bg.map((v, i) => Math.abs(v - unknown.bg[i]))) <= 3
    );
    if (!text) continue;
    const x0 = Math.max(0, Math.floor(Math.min(text.x, unknown.x))),
      y0 = Math.max(0, Math.floor(Math.min(text.y, unknown.y))),
      x1 = Math.min(image.width, Math.ceil(Math.max(text.x + text.w, unknown.x + unknown.w))),
      y1 = Math.min(image.height, Math.ceil(Math.max(text.y + text.h, unknown.y + unknown.h))),
      w = x1 - x0,
      h = y1 - y0;
    const components = traceOverlappingInk(image, text.bg, unknown, x0, y0, x1, y1, w, h);
    const anchors = components.filter(
      (c) => c.touches && c.bottom >= unknown.y + unknown.h + 1 && c.top < unknown.y + unknown.h
    );
    if (!anchors.length) continue;
    const fragments = components.filter((c) => c.touches);
    if (
      !fragments.every(
        (c) =>
          anchors.includes(c) ||
          anchors.some(
            (a) =>
              c.bottom < a.top &&
              a.top - c.bottom <= 3 &&
              Math.min(c.right, a.right) >= Math.max(c.left, a.left)
          )
      )
    )
      continue;
    const union = { ...text, x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
      m = measure(image, union),
      previous = text.typeMetrics;
    if (
      !m ||
      !previous ||
      m.glyphs < previous.glyphs ||
      (Number.isFinite(previous.foregroundCoverage) &&
        (!Number.isFinite(m.foregroundCoverage) ||
          m.foregroundCoverage < previous.foregroundCoverage - 0.05)) ||
      m.baselineAgreement < 0.7 ||
      m.heightAgreement < 0.7 ||
      m.stroke / Math.max(1, m.xHeight) > 0.4
    )
      continue;
    const replacement = { ...union, typeMetrics: m, roleEvidence: 'text-overlap-fragment' };
    delete replacement.eraseRuns;
    delete replacement.erasePlane;
    boxes = boxes.filter((b) => b !== unknown && b !== text);
    boxes.push(replacement);
  }
  return recoverClippedTextClaims(image, boxes, measure);
}

const right = (b) => b.x + b.w;
const bottom = (b) => b.y + b.h;
const intersects = (a, b) => a.x < right(b) && right(a) > b.x && a.y < bottom(b) && bottom(a) > b.y;

// Split text claims retain their original source atoms. Recover the excluded
// aligned atoms only when a neighboring claim shares the same source group.
function recoverClippedTextClaims(image, boxes, measure) {
  return boxes.map((seed) => {
    const group = seed.structureGroup?.replace(/:\d+$/, ''),
      m = seed.typeMetrics;
    if (
      seed.shape !== 'text' ||
      !seed.textConfidence ||
      !group ||
      !m?.glyphBounds ||
      !Number.isFinite(m.xHeight) ||
      m.xHeight <= 0 ||
      seed.supportConstraint ||
      seed.surfaceClip
    )
      return seed;
    const atoms = seed.atoms || seed.eraseFragments?.find((f) => f.atoms)?.atoms || [],
      h = m.xHeight;
    const outside = atoms
      .filter(
        (a) =>
          right(a) <= seed.x &&
          a.h >= h * 0.65 &&
          a.h <= seed.h * 1.2 &&
          Math.abs(bottom(a) - (m.glyphBounds.y + m.glyphBounds.h)) <= Math.max(2, h * 0.3)
      )
      .sort((a, b) => a.x - b.x);
    if (outside.length < 3) return seed;
    const neighbor = boxes.find(
      (b) =>
        b !== seed &&
        b.shape === 'text' &&
        b.textConfidence &&
        b.structureGroup?.replace(/:\d+$/, '') === group &&
        !b.supportConstraint &&
        !b.surfaceClip &&
        right(b) <= outside[0].x &&
        outside[0].x - right(b) <= h &&
        Math.abs(bottom(b) - bottom(seed)) <= Math.max(3, seed.h * 0.25)
    );
    if (!neighbor) return seed;
    const left = Math.max(right(neighbor), outside[0].x - 1),
      area = { x: left, y: seed.y, w: right(seed) - left, h: seed.h };
    if (
      boxes.some(
        (b) =>
          b !== seed &&
          b !== neighbor &&
          ['icon', 'image', 'graphic', 'unknown'].includes(b.shape) &&
          intersects(b, area)
      )
    )
      return seed;
    const union = { ...seed, ...area },
      metrics = measure(image, union);
    if (
      !metrics ||
      metrics.glyphs < m.glyphs ||
      metrics.baselineAgreement < 0.7 ||
      metrics.heightAgreement < 0.7 ||
      metrics.stroke / Math.max(1, metrics.xHeight) > 0.4 ||
      metrics.foregroundCoverage < m.foregroundCoverage - 0.05
    )
      return seed;
    const replacement = { ...union, typeMetrics: metrics, roleEvidence: 'text-source-continuity' };
    delete replacement.eraseRuns;
    delete replacement.erasePlane;
    delete replacement.eraseFragments;
    delete replacement.eraseLayers;
    return attachEraseSupport(image, replacement);
  });
}

function traceOverlappingInk(image, bg, unknown, x0, y0, x1, y1, w, h) {
  const ink = new Uint8Array(w * h),
    seen = new Uint8Array(w * h),
    components = [];
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const p = (y * image.width + x) * 4;
      if (
        image.data[p + 3] >= 128 &&
        Math.max(...bg.map((v, i) => Math.abs(v - image.data[p + i]))) > 8
      )
        ink[(y - y0) * w + x - x0] = 1;
    }
  for (let p = 0; p < ink.length; p++)
    if (ink[p] && !seen[p]) {
      const q = [p];
      seen[p] = 1;
      let left = x1,
        right = x0,
        top = y1,
        bottom = y0,
        touches = false;
      for (let i = 0; i < q.length; i++) {
        const n = q[i],
          x = n % w,
          y = Math.floor(n / w),
          ax = x + x0,
          ay = y + y0;
        left = Math.min(left, ax);
        right = Math.max(right, ax);
        top = Math.min(top, ay);
        bottom = Math.max(bottom, ay);
        touches ||=
          ax >= unknown.x &&
          ax < unknown.x + unknown.w &&
          ay >= unknown.y &&
          ay < unknown.y + unknown.h;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx,
              yy = y + dy;
            if (xx < 0 || xx >= w || yy < 0 || yy >= h) continue;
            const k = yy * w + xx;
            if (ink[k] && !seen[k]) {
              seen[k] = 1;
              q.push(k);
            }
          }
      }
      components.push({ left, right, top, bottom, touches });
    }
  return components;
}
