const intersects = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
function translate(box, offset) {
  return { ...box, y: box.y + offset, atoms: box.atoms?.map((p) => ({ ...p, y: p.y + offset })) };
}
function metricsAtSource(m, offset) {
  return {
    ...m,
    glyphBounds: { ...m.glyphBounds, y: m.glyphBounds.y + offset },
    unexplained: (m.unexplained || []).map((p) => ({
      ...p,
      y: p.y + offset,
      seedY: p.seedY + offset,
    })),
  };
}

/** Recover visible glyph bands beside actual raster occlusion edges. */
export function recoverBoundaryText(image, input, scan, measure) {
  const boundaries = findRasterBoundaries(image);
  let boxes = [...input];
  for (const edge of boundaries)
    for (const side of ['above', 'below']) {
      const top = side === 'above' ? Math.max(0, edge - 32) : edge,
        bottom = side === 'above' ? edge : Math.min(image.height, edge + 32);
      if (bottom - top < 5) continue;
      const data = image.data.slice(top * image.width * 4, bottom * image.width * 4),
        strip = { width: image.width, height: bottom - top, data };
      for (const local of scan(strip)) {
        if (local.h > 20 || local.w / local.h < 2) continue;
        if (side === 'below' ? local.y > 2 : strip.height - local.y - local.h > 2) continue;
        const m = measure(strip, local);
        if (
          !m ||
          m.glyphs < 3 ||
          m.xHeight < 4 ||
          m.baselineAgreement < 0.75 ||
          m.heightAgreement < 0.75 ||
          m.stroke / m.xHeight > 0.4
        )
          continue;
        const candidate = translate(local, top),
          sourceMetrics = metricsAtSource(m, top);
        boxes = mergeBoundaryTextClaim(
          boxes,
          candidate,
          m,
          sourceMetrics,
          image.width,
          top,
          bottom
        );
      }
    }
  return boxes;
}

function findRasterBoundaries(image) {
  const boundaries = [0, image.height];
  for (let y = 1; y < image.height; y++) {
    let total = 0,
      strong = 0;
    for (let x = 2; x < image.width - 2; x += 4) {
      const a = ((y - 1) * image.width + x) * 4,
        b = (y * image.width + x) * 4;
      total++;
      if (
        Math.max(
          Math.abs(image.data[a] - image.data[b]),
          Math.abs(image.data[a + 1] - image.data[b + 1]),
          Math.abs(image.data[a + 2] - image.data[b + 2])
        ) >= 24
      )
        strong++;
    }
    if (strong / Math.max(1, total) < 0.6) continue;
    if (boundaries.some((b) => Math.abs(b - y) < 4)) continue;
    boundaries.push(y);
  }
  return boundaries;
}

function mergeBoundaryTextClaim(boxes, candidate, m, sourceMetrics, width, top, bottom) {
  const near = boxes.filter(
    (b) =>
      b.shape === 'text' &&
      Math.abs(b.y + b.h / 2 - candidate.y - candidate.h / 2) <= Math.max(b.h, candidate.h) * 0.5 &&
      Math.max(b.x - candidate.x - candidate.w, candidate.x - b.x - b.w, 0) <=
        Math.max(24, m.xHeight * 4)
  );
  const paragraph = boxes.some(
    (b) =>
      b.shape === 'text' &&
      Math.abs(b.x - candidate.x) <= 6 &&
      b.y + b.h <= candidate.y + 2 &&
      candidate.y - b.y - b.h <= b.h * 2.5 &&
      Math.min(b.w, candidate.w) >= Math.max(b.w, candidate.w) * 0.3
  );
  if (!near.length && !paragraph) return boxes;
  if (
    boxes.some(
      (b) =>
        b.shape === 'text' &&
        b.x <= candidate.x &&
        b.y <= candidate.y &&
        b.x + b.w >= candidate.x + candidate.w &&
        b.y + b.h >= candidate.y + candidate.h
    )
  )
    return boxes;
  const overlaps = near.filter(
    (b) =>
      intersects(b, candidate) &&
      b.x >= candidate.x - 2 &&
      b.x + b.w <= candidate.x + candidate.w + 2
  );
  const fragments = [
    ...overlaps.map((b) => ({ ...b, eraseFragments: undefined })),
    { ...candidate, surfaceClip: { x: 0, y: top, w: width, h: bottom - top } },
  ];
  const x = Math.min(...fragments.map((b) => b.x)),
    y = Math.min(...fragments.map((b) => b.y)),
    right = Math.max(...fragments.map((b) => b.x + b.w)),
    end = Math.max(...fragments.map((b) => b.y + b.h));
  const resolved = {
    ...candidate,
    x,
    y,
    w: right - x,
    h: end - y,
    shape: 'text',
    kind: 'boundary-text',
    roleEvidence: 'text-boundary',
    typeMetrics: sourceMetrics,
    textConfidence: true,
    eraseFragments: fragments,
  };
  const removed = new Set(overlaps);
  boxes = boxes.filter((b) => !removed.has(b));
  boxes.push(resolved);
  return boxes;
}
