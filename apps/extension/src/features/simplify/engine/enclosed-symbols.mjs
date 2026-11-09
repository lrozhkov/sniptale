// Pixel evidence for an elliptical outline surrounding a non-solid drawing.
// The caller supplies the proposed symbol bounds and its local background.
export function enclosedSymbolEvidence(image, bounds, bg) {
  const { x, y, w, h } = bounds;
  if (
    w < 12 ||
    h < 12 ||
    w / h < 0.75 ||
    w / h > 1.33 ||
    x < 0 ||
    y < 0 ||
    x + w > image.width ||
    y + h > image.height
  )
    return false;
  const {
    bins,
    outerBins,
    inner,
    innerTotal,
    transitions,
    rows,
    center,
    centerTotal,
    corners,
    cornerTotal,
    outerDirection,
    outerSamples,
    innerDirections,
  } = measureEnclosedContour(image, bounds, bg);
  // A closed low-threshold contour must surround background. Flood the
  // background from the patch edge; pixels not reached are interior holes.
  const { holes, outerHoles, holeQuadrants } = enclosedBackgroundHoles(image, bounds, bg);
  const outerLength = Math.hypot(...outerDirection);
  const distinct = outerLength
    ? innerDirections.filter(
        (v) => v.reduce((n, c, k) => n + c * outerDirection[k], 0) / outerLength < 0.995
      ).length
    : 0;
  const coverage = bins.filter((v) => v > 15).length,
    strong = bins.filter((v) => v > 40).length,
    density = inner / innerTotal;
  return (
    center / centerTotal >= 0.2 &&
    holeQuadrants.filter((n) => n >= 2).length >= 3 &&
    outerSamples >= 8 &&
    distinct >= Math.max(5, innerDirections.length * 0.15) &&
    holes >= 3 &&
    outerHoles >= 2 &&
    outerBins.filter((v) => v > 15).length >= 15 &&
    center / centerTotal < 0.85 &&
    corners / cornerTotal < 0.12 &&
    coverage >= 15 &&
    strong >= 11 &&
    density >= 0.27 &&
    density <= 0.78 &&
    transitions >= rows * 1.15
  );
}

import { inkParts } from './structure.mjs';

// Split only a bounded component from the leading portion of a confident text row.
export function resolveEnclosedSymbols(image, input, measure, inkRuns, protectedRects = []) {
  const output = [];
  for (const box of input) {
    if (box.shape !== 'text' || !box.textConfidence || box.w < box.h * 3) {
      output.push(box);
      continue;
    }
    const parts = inkParts(image, { ...box, atoms: null });
    const match = findEnclosedSymbolSplit(image, box, parts, input, protectedRects, measure);
    if (!match) {
      output.push(box);
      continue;
    }
    const { bounds, remainder, m } = match;
    clearEnclosedDerived(remainder);
    setEnclosedMetrics(remainder, m);
    retainEnclosedFragments(image, box, remainder);
    const leftParts = parts.filter((p) => p.x + p.w <= bounds.x);
    if (leftParts.length) {
      const left = { ...box, w: bounds.x - box.x };
      clearEnclosedDerived(left);
      const lm = measure(image, left);
      if (lm && lm.glyphs >= 3 && lm.baselineAgreement >= 0.7) {
        setEnclosedMetrics(left, lm);
        retainEnclosedFragments(image, box, left);
        output.push(left);
      } else {
        const runs = inkRuns(image, left, box.bg);
        if (runs.length)
          output.push({
            x: left.x,
            y: left.y,
            w: left.w,
            h: left.h,
            bg: box.bg,
            shape: 'unknown',
            kind: 'enclosed-symbol-neighbor',
            sourceBounds: { x: left.x, y: left.y, w: left.w, h: left.h },
            sourceRuns: runs,
          });
      }
    }
    output.push(
      {
        ...bounds,
        bg: box.bg,
        kind: 'auto',
        shape: 'icon',
        compact: true,
        contrast: box.contrast,
        iconSize: Math.min(bounds.w, bounds.h),
        sourceBounds: bounds,
        sourceRuns: inkRuns(image, bounds, box.bg),
        roleEvidence: 'enclosed-symbol',
      },
      remainder
    );
  }
  return output;
}

function measureEnclosedContour(image, bounds, bg) {
  const { h } = bounds;
  const bins = Array(16).fill(0),
    outerBins = Array(16).fill(0);
  let inner = 0,
    innerTotal = 0,
    transitions = 0,
    rows = 0,
    center = 0,
    centerTotal = 0,
    corners = 0,
    cornerTotal = 0,
    outerDirection = [0, 0, 0],
    outerSamples = 0,
    innerDirections = [];
  for (let yy = 0; yy < h; yy++) {
    const row = measureEnclosedContourRow(
      image,
      bounds,
      bg,
      yy,
      bins,
      outerBins,
      outerDirection,
      innerDirections
    );
    inner += row.inner;
    innerTotal += row.innerTotal;
    center += row.center;
    centerTotal += row.centerTotal;
    corners += row.corners;
    cornerTotal += row.cornerTotal;
    outerSamples += row.outerSamples;
    const { hasInterior, changes } = row;
    if (hasInterior) {
      transitions += changes;
      rows++;
    }
  }
  return {
    bins,
    outerBins,
    inner,
    innerTotal,
    transitions,
    rows,
    center,
    centerTotal,
    corners,
    cornerTotal,
    outerDirection,
    outerSamples,
    innerDirections,
  };
}

function enclosedBackgroundHoles(image, bounds, bg) {
  const { x, y, w, h } = bounds;
  const exterior = new Uint8Array(w * h),
    queue = [];
  const open = (xx, yy) => {
    const p = ((y + yy) * image.width + x + xx) * 4;
    return Math.max(...bg.map((v, k) => Math.abs(v - image.data[p + k]))) <= 15;
  };
  const add = (xx, yy) => {
    const i = yy * w + xx;
    if (!exterior[i] && open(xx, yy)) {
      exterior[i] = 1;
      queue.push(i);
    }
  };
  for (let xx = 0; xx < w; xx++) {
    add(xx, 0);
    add(xx, h - 1);
  }
  for (let yy = 0; yy < h; yy++) {
    add(0, yy);
    add(w - 1, yy);
  }
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i],
      xx = p % w,
      yy = Math.floor(p / w);
    if (xx > 0) add(xx - 1, yy);
    if (xx + 1 < w) add(xx + 1, yy);
    if (yy > 0) add(xx, yy - 1);
    if (yy + 1 < h) add(xx, yy + 1);
  }
  let holes = 0,
    outerHoles = 0;
  const holeQuadrants = [0, 0, 0, 0];
  for (let yy = 0; yy < h; yy++)
    for (let xx = 0; xx < w; xx++)
      if (!exterior[yy * w + xx] && open(xx, yy)) {
        holes++;
        const nx = (xx + 0.5 - w / 2) / (w / 2),
          ny = (yy + 0.5 - h / 2) / (h / 2);
        if (Math.hypot(nx, ny) > 0.48) {
          outerHoles++;
          holeQuadrants[(ny >= 0 ? 2 : 0) + (nx >= 0 ? 1 : 0)]++;
        }
      }
  return { holes, outerHoles, holeQuadrants };
}

function findEnclosedSymbolSplit(image, box, parts, input, protectedRects, measure) {
  const candidates = parts
    .filter(
      (p) =>
        p.x <= box.x + box.h * 1.5 &&
        p.w >= 12 &&
        p.h >= 12 &&
        p.w / p.h >= 0.75 &&
        p.w / p.h <= 1.33 &&
        p.h <= box.h + 2
    )
    .sort((a, b) => a.x - b.x);
  let match = null;
  for (const p of candidates) {
    const bounds = { x: p.x, y: p.y, w: p.w, h: p.h };
    if (!enclosedSymbolEvidence(image, bounds, box.bg)) continue;
    if (!isExclusiveEnclosedSource(bounds, p, box, parts, input, protectedRects)) continue;
    const remainder = {
      ...box,
      x: bounds.x + bounds.w,
      w: box.x + box.w - (bounds.x + bounds.w),
    };
    const m = measure(image, remainder);
    if (!m || m.glyphs < 3 || m.baselineAgreement < 0.7) continue;
    // A nearby preceding glyph with the same font metrics is text-row
    // evidence, even when that prefix is too short to be a text owner.
    const preceding = parts
      .filter((q) => q.x + q.w <= bounds.x)
      .sort((a, b) => b.x + b.w - (a.x + a.w))[0];
    if (
      preceding &&
      bounds.x - (preceding.x + preceding.w) <= Math.max(2, Math.ceil(m.xHeight * 0.2))
    ) {
      const lm = measure(image, { ...box, w: bounds.x - box.x }, 1);
      if (
        lm?.glyphs >= 1 &&
        lm.glyphBounds &&
        m.glyphBounds &&
        lm.xHeight >= m.xHeight * 0.7 &&
        lm.xHeight <= m.xHeight * 1.3 &&
        Math.abs(lm.glyphBounds.y + lm.glyphBounds.h - (m.glyphBounds.y + m.glyphBounds.h)) <=
          Math.max(2, m.xHeight * 0.25)
      )
        continue;
    }
    match = { bounds, remainder, m };
    break;
  }
  return match;
}

function clearEnclosedDerived(b) {
  for (const key of [
    'sourceBounds',
    'sourceRuns',
    'eraseRuns',
    'erasePlane',
    'eraseFragments',
    'eraseLayers',
    'atoms',
    'textCenterY',
    'rowTextSize',
    'textSize',
    'typeMetrics',
    'textConfidence',
    'textDecorations',
  ])
    delete b[key];
}

function setEnclosedMetrics(b, m) {
  b.typeMetrics = m;
  b.textConfidence = true;
  if (m.glyphBounds) {
    b.textCenterY = m.glyphBounds.y + m.glyphBounds.h / 2;
    b.textSize = Math.max(4, 2 * Math.round(m.xHeight * 0.8));
  }
}

function retainEnclosedFragments(image, box, child) {
  if (!box.eraseFragments) return;
  const fragments = [];
  for (const f of box.eraseFragments) {
    const x = Math.max(child.x, f.x),
      right = Math.min(child.x + child.w, f.x + f.w);
    if (right <= x) continue;
    const fragment = { ...f, x, w: right - x };
    clearEnclosedDerived(fragment);
    const clip = f.surfaceClip || { x: 0, y: 0, w: image.width, h: image.height };
    const cx = Math.max(clip.x, child.x),
      cr = Math.min(clip.x + clip.w, child.x + child.w);
    if (cr <= cx) continue;
    fragment.surfaceClip = { ...clip, x: cx, w: cr - cx };
    fragments.push(fragment);
  }
  if (fragments.length) child.eraseFragments = fragments;
}

function accumulateEnclosedDirections(image, p, bg, r, contrast, outerDirection, innerDirections) {
  let outerSamples = 0;
  if (contrast > 40) {
    const v = bg.map((v, k) => v - image.data[p + k]),
      length = Math.hypot(...v);
    if (length) {
      const unit = v.map((n) => n / length);
      if (r >= 0.85 && r <= 1.1) {
        outerSamples++;
        for (let k = 0; k < 3; k++) outerDirection[k] += unit[k];
      }
      if (r < 0.6) innerDirections.push(unit);
    }
  }
  return outerSamples;
}

function isExclusiveEnclosedSource(bounds, p, box, parts, input, protectedRects) {
  if (
    protectedRects.some(
      (q) =>
        q.x < bounds.x + bounds.w &&
        q.x + q.w > bounds.x &&
        q.y < bounds.y + bounds.h &&
        q.y + q.h > bounds.y
    )
  )
    return false;
  // No part may cross the split, and a separate owner cannot claim these pixels.
  if (
    parts.some(
      (q) =>
        q !== p &&
        q.x < bounds.x + bounds.w &&
        q.x + q.w > bounds.x &&
        !(
          q.x >= bounds.x &&
          q.x + q.w <= bounds.x + bounds.w &&
          q.y >= bounds.y &&
          q.y + q.h <= bounds.y + bounds.h
        )
    )
  )
    return false;
  if (
    input.some(
      (q) =>
        q !== box &&
        q.x < bounds.x + bounds.w &&
        q.x + q.w > bounds.x &&
        q.y < bounds.y + bounds.h &&
        q.y + q.h > bounds.y
    )
  )
    return false;
  return true;
}

function accumulateEnclosedArcCoverage(bins, outerBins, nx, ny, r, contrast) {
  if (r >= 0.72 && r <= 1.12 && contrast > 15) {
    const bin = Math.floor(((Math.atan2(ny, nx) + Math.PI) / (Math.PI * 2)) * 16) % 16;
    bins[bin] = Math.max(bins[bin], contrast);
    if (r >= 0.85) outerBins[bin] = Math.max(outerBins[bin], contrast);
  }
}

function measureEnclosedContourRow(
  image,
  bounds,
  bg,
  yy,
  bins,
  outerBins,
  outerDirection,
  innerDirections
) {
  const { x, y, w, h } = bounds;
  let inner = 0,
    innerTotal = 0,
    center = 0,
    centerTotal = 0,
    corners = 0,
    cornerTotal = 0,
    outerSamples = 0;
  let prev = false,
    changes = 0,
    hasInterior = false;
  for (let xx = 0; xx < w; xx++) {
    const nx = (xx + 0.5 - w / 2) / (w / 2),
      ny = (yy + 0.5 - h / 2) / (h / 2),
      r = Math.hypot(nx, ny);
    const p = ((y + yy) * image.width + x + xx) * 4;
    const contrast = Math.max(...bg.map((v, k) => Math.abs(v - image.data[p + k])));
    outerSamples += accumulateEnclosedDirections(
      image,
      p,
      bg,
      r,
      contrast,
      outerDirection,
      innerDirections
    );
    if (r < 0.35) {
      centerTotal++;
      if (contrast > 40) center++;
    }
    if (r > 1.15) {
      cornerTotal++;
      if (contrast > 40) corners++;
    }
    accumulateEnclosedArcCoverage(bins, outerBins, nx, ny, r, contrast);
    if (Math.abs(nx) < 0.58 && Math.abs(ny) < 0.58) {
      const ink = contrast > 40;
      innerTotal++;
      if (ink) inner++;
      if (ink !== prev) changes++;
      prev = ink;
      hasInterior = true;
    }
  }
  return {
    inner,
    innerTotal,
    center,
    centerTotal,
    corners,
    cornerTotal,
    outerSamples,
    hasInterior,
    changes,
  };
}
