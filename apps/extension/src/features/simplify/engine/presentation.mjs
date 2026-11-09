// Presentation is separate from recognition and source erasure ownership.
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const centerX = (b) => b.x + b.w / 2;
const centerY = (b) => b.y + b.h / 2;
const contains = (a, b) =>
  b.x >= a.x - 1 && b.y >= a.y - 1 && b.x + b.w <= a.x + a.w + 1 && b.y + b.h <= a.y + a.h + 1;
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const colorDistance = (a, b) => Math.max(...a.map((v, k) => Math.abs(v - b[k])));
const even = (value) => Math.max(6, 2 * Math.round(value / 2));

/** Geometry of an ungrouped icon, also used to reserve its occupied space. */
export function naturalIconGeometry(box) {
  const inset = Math.min(3, Math.min(box.w, box.h) * 0.12);
  const sourceLimit =
    box.kind === 'control-symbol' && box.roleEvidence !== 'toolbar-slot' && box.sourceBounds
      ? Math.min(box.sourceBounds.w, box.sourceBounds.h)
      : Infinity;
  const side = Math.min(
    sourceLimit,
    box.w,
    box.h,
    box.iconSize || Math.max(1, Math.min(box.w, box.h) - 2 * inset)
  );
  return {
    x: Math.round(box.x + (box.w - side) / 2),
    y: Math.round(box.y + (box.h - side) / 2),
    w: side,
    h: side,
  };
}
function textExtent(box) {
  const inset = Math.min(2, box.w * 0.05);
  return { x: Math.round(box.x + inset), y: box.y, w: Math.max(1, box.w - inset * 2), h: box.h };
}

/** Build stable visual slots from the full, unfiltered recognition catalog. */
export function buildPresentation(catalog, width, height) {
  const descriptors = presentationDescriptors(catalog);
  const members = groupPresentationRows(descriptors);
  const plan = new Map(),
    rows = [],
    drafts = new Map();
  for (let i = 0; i < members.length; i++) {
    if (members[i].length < 2) continue;
    const row = members[i].map((k) => descriptors[k]),
      icons = row.filter((d) => d.box.shape === 'icon'),
      texts = row.filter((d) => d.box.shape === 'text');
    const cellCenters = row.filter((d) => d.centerOnCell).map((d) => centerY(d.cell));
    const cy = cellCenters.length ? median(cellCenters) : median(row.map((d) => d.cy));
    const textSizes = texts.map((d) => d.font);
    const preferred = icons.map((d) => d.box.iconSize || Math.min(d.ink.w, d.ink.h));
    const target =
      icons.length === 1 && texts.length
        ? even(median(textSizes) + 2)
        : even(median([...preferred, ...textSizes.map((s) => s + 2)]));
    rows.push({ row, texts, cy, target });
    for (const d of row) drafts.set(d.box, { cx: d.cx, cy, target, font: d.font });
  }
  for (const { row, texts, cy, target } of rows)
    placePresentationRow(plan, row, texts, cy, target, catalog, drafts, width, height);
  return plan;
}

function presentationDescriptors(catalog) {
  const frames = (catalog.protected || []).filter((f) => f.kind === 'outline' && f.h <= 64);
  const source = (b) => b.sourceBounds || b.typeMetrics?.glyphBounds || b;
  const descriptors = catalog
    .filter((b) => ['text', 'icon'].includes(b.shape))
    .map((box) => {
      const ink = source(box),
        frame = frames.filter((f) => contains(f, ink)).sort((a, b) => a.w * a.h - b.w * b.h)[0];
      const cell = frame || box.surfaceBounds;
      const cx = cell && cell.w <= cell.h * 1.6 ? centerX(cell) : centerX(ink);
      const cy = cell
        ? centerY(cell)
        : box.shape === 'text'
          ? (box.textCenterY ?? centerY(ink))
          : centerY(ink);
      const font = box.textSize || Math.max(4, box.h - 4);
      const scale = box.shape === 'text' ? font : cell?.h || Math.max(ink.h, Math.min(box.h, 32));
      return {
        box,
        ink,
        cell,
        cx,
        cy,
        font,
        scale,
        sourceX: centerX(ink),
        sourceY: box.shape === 'text' ? (box.textCenterY ?? centerY(ink)) : centerY(ink),
        centerOnCell: !!cell,
      };
    })
    .filter((d) => d.ink.h <= 32 && (d.box.shape === 'text' || d.ink.w <= 64));
  // A container is a clipping boundary; it is not automatically one content slot.
  for (const d of descriptors) {
    if (!d.cell) continue;
    const occupants = catalog.filter((b) => contains(d.cell, source(b)));
    const content = descriptors.filter((p) => occupants.includes(p.box));
    const ys = content.map((p) => p.sourceY),
      spread = ys.length ? Math.max(...ys) - Math.min(...ys) : 0;
    d.centerOnCell = spread <= Math.max(3, median(content.map((p) => p.scale)) * 0.35);
    if (!d.centerOnCell) d.cy = d.sourceY;
    if (occupants.length > 1) d.cx = d.sourceX;
  }
  return descriptors;
}

function sharePresentationCell(a, b) {
  return (
    a.cell &&
    b.cell &&
    a.cell.x === b.cell.x &&
    a.cell.y === b.cell.y &&
    a.cell.w === b.cell.w &&
    a.cell.h === b.cell.h
  );
}

function nearPresentationDescriptors(a, b) {
  if (colorDistance(a.box.bg, b.box.bg) > 16) return false;
  if (sharePresentationCell(a, b))
    return Math.abs(a.cy - b.cy) <= Math.max(3, Math.min(a.scale, b.scale) * 0.3);
  if (overlap(a.ink, b.ink) || (a.ink.x < b.ink.x + b.ink.w && a.ink.x + a.ink.w > b.ink.x))
    return false;
  const scale = Math.min(a.scale, b.scale),
    gap = Math.max(a.ink.x - b.ink.x - b.ink.w, b.ink.x - a.ink.x - a.ink.w, 0);
  return Math.abs(a.cy - b.cy) <= Math.max(3, scale * 0.3) && gap <= Math.max(12, scale * 3);
}

function presentationRoot(parents, i) {
  while (parents[i] !== i) i = parents[i];
  return i;
}

function groupPresentationRows(descriptors) {
  const parents = descriptors.map((_, i) => i),
    members = descriptors.map((_, i) => [i]);
  const root = (i) => presentationRoot(parents, i);
  // Resolve the closest relationships first; a staircase cannot become one row.
  const edges = [];
  for (let i = 0; i < descriptors.length; i++)
    for (let j = i + 1; j < descriptors.length; j++) {
      const a = descriptors[i],
        b = descriptors[j];
      if (nearPresentationDescriptors(a, b))
        edges.push({
          i,
          j,
          cost:
            Math.abs(a.cy - b.cy) * 10 +
            Math.max(a.ink.x - b.ink.x - b.ink.w, b.ink.x - a.ink.x - a.ink.w, 0),
        });
    }
  edges.sort((a, b) => a.cost - b.cost || a.i - b.i || a.j - b.j);
  for (const { i, j } of edges) {
    const a = root(i),
      b = root(j);
    if (a === b) continue;
    const merged = [...members[a], ...members[b]],
      row = merged.map((k) => descriptors[k]);
    const spread = Math.max(...row.map((d) => d.cy)) - Math.min(...row.map((d) => d.cy));
    if (spread > Math.max(4, median(row.map((d) => d.scale)) * 0.35)) continue;
    parents[b] = a;
    members[a] = merged;
  }
  return members.map((row, i) => (root(i) === i ? row : []));
}

function unionPresentationBounds(a, b) {
  const x = Math.min(a.x, b.x),
    y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

function reservedPresentationSpace(box, drafts) {
  const draft = drafts.get(box);
  if (box.shape === 'icon') {
    const natural = unionPresentationBounds(naturalIconGeometry(box), presentationSource(box));
    if (!draft) return natural;
    return unionPresentationBounds(natural, {
      x: draft.cx - draft.target / 2,
      y: draft.cy - draft.target / 2,
      w: draft.target,
      h: draft.target,
    });
  }
  if (box.shape === 'text') {
    const natural = textExtent(box);
    if (!draft) return natural;
    return unionPresentationBounds(natural, {
      x: natural.x,
      y: draft.cy - draft.font / 2,
      w: natural.w,
      h: draft.font,
    });
  }
  return presentationSource(box);
}

const presentationSource = (b) => b.sourceBounds || b.typeMetrics?.glyphBounds || b;

function presentationRoom(d, row, cy, target, catalog, drafts, width, height) {
  const { box, ink, cell } = d;
  const clip = cell
    ? { x: cell.x + 2, y: cell.y + 2, w: Math.max(0, cell.w - 4), h: Math.max(0, cell.h - 4) }
    : { x: 0, y: 0, w: width, h: height };
  let left = clip.x,
    right = clip.x + clip.w,
    top = clip.y,
    bottom = clip.y + clip.h;
  const band = Math.max(d.scale, target) / 2 + 2;
  for (const other of catalog) {
    if (other === box) continue;
    const rowPeer = row.find((p) => p.box === other);
    const otherDraft = drafts.get(other);
    if (box.shape === 'icon' && other.shape === 'icon' && otherDraft) {
      // The neighboring source can remain visible at lower sensitivity.
      const raw = presentationSource(other);
      if (raw.y < cy + band && raw.y + raw.h > cy - band) {
        if (raw.x + raw.w <= ink.x) left = Math.max(left, raw.x + raw.w + 2);
        if (raw.x >= ink.x + ink.w) right = Math.min(right, raw.x - 2);
      }
      if (raw.x < d.cx + target / 2 && raw.x + raw.w > d.cx - target / 2) {
        if (raw.y + raw.h <= ink.y) top = Math.max(top, raw.y + raw.h + 2);
        if (raw.y >= ink.y + ink.h) bottom = Math.min(bottom, raw.y - 2);
      }
      // Both replacements reserve space before either one is drawn.
      const dx = otherDraft.cx - d.cx,
        dy = otherDraft.cy - cy;
      if (Math.abs(dx) >= Math.abs(dy)) {
        const middle = (d.cx + otherDraft.cx) / 2;
        if (dx < 0) left = Math.max(left, middle + 1);
        if (dx > 0) right = Math.min(right, middle - 1);
      } else {
        const middle = (cy + otherDraft.cy) / 2;
        if (dy < 0) top = Math.max(top, middle + 1);
        if (dy > 0) bottom = Math.min(bottom, middle - 1);
      }
      continue;
    }
    const q = reservedPresentationSpace(other, drafts),
      original = presentationSource(other);
    if (q.y < cy + band && q.y + q.h > cy - band) {
      if (original.x + original.w <= ink.x) left = Math.max(left, q.x + q.w + 2);
      if (original.x >= ink.x + ink.w) right = Math.min(right, q.x - 2);
    }
    const extent = box.shape === 'text' ? textExtent(box) : { x: d.cx - target / 2, w: target };
    if (!rowPeer && q.x < extent.x + extent.w && q.x + q.w > extent.x) {
      if (original.y + original.h <= ink.y) top = Math.max(top, q.y + q.h + 2);
      if (original.y >= ink.y + ink.h) bottom = Math.min(bottom, q.y - 2);
    }
  }
  return { left, right, top, bottom };
}

function placePresentationRow(plan, row, texts, cy, target, catalog, drafts, width, height) {
  for (const d of row) {
    const { box } = d;
    const { left, right, top, bottom } = presentationRoom(
      d,
      row,
      cy,
      target,
      catalog,
      drafts,
      width,
      height
    );
    if (box.shape === 'icon') {
      const capacity = Math.min(
        2 * (d.cx - left),
        2 * (right - d.cx),
        2 * (cy - top),
        2 * (bottom - cy)
      );
      const side = Math.floor(Math.min(target, capacity));
      if (side < 2) continue;
      plan.set(
        box,
        Object.freeze({
          shape: 'icon',
          x: Math.round(d.cx - side / 2),
          y: Math.round(cy - side / 2),
          w: side,
          h: side,
          limited: side < target,
          target,
          centerY: cy,
        })
      );
    } else {
      // Existing font families retain their scale; glyph padding is not a cap.
      const peers = texts.filter((p) => Math.abs(p.font - d.font) < 1);
      const textSize = median(peers.map((p) => p.font)),
        heightLimit = Math.min(2 * (cy - top), 2 * (bottom - cy));
      if (heightLimit < 2) {
        const originalRoom = Math.min(2 * (d.cy - top), 2 * (bottom - d.cy));
        if (originalRoom >= 2)
          plan.set(
            box,
            Object.freeze({
              shape: 'text',
              centerY: d.cy,
              textSize: d.font,
              heightLimit: originalRoom,
              limited: true,
              targetCenterY: cy,
            })
          );
        continue;
      }
      plan.set(box, Object.freeze({ shape: 'text', centerY: cy, textSize, heightLimit }));
    }
  }
}
