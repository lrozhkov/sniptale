import { preserveUncertainRows } from './row-integrity.mjs';
import { attachTextDecorations } from './text-decoration.mjs';
import { claimRadialIcons } from './radial-icons.mjs';
import { resolveUncertainPartialRows } from './partial-row-uncertainty.mjs';
import { recoverTerminalMarks } from './terminal-marks.mjs';
import { resolveOverlappingTextFragments } from './text-fragments.mjs';
import { claimCompactGraphics } from './compact-graphics.mjs';
import { rejectMarkerHoles } from './marker-holes.mjs';
import {
  findTextFrames,
  constrainFrameChildren,
  recoverFramedCarets,
  recoverFramedLabels,
  preserveMixedFrameClaims,
} from './frame-support.mjs';
import {
  refineTextStructure,
  repairTextFragments,
  absorbTextMarks,
  resolveTextColumns,
  resolveTextBadges,
  resolveControlPeers,
  recoverTextFlow,
  mergeGraphicSupport,
  inkParts,
} from './structure.mjs';
import { analyzeControls } from './controls.mjs';
import { stabilizeLayout, separateInlineSymbols, reconcileIconPeers } from './layout.mjs';
import { detectMedia } from './media.mjs';
import {
  sourceDirectionIcons,
  resolveSurfaceClaims,
  resolveForegroundClaims,
  resolveOutlineClaims,
  confirmFaintColumn,
} from './ownership.mjs';
import { recoverBoundaryText } from './boundary-text.mjs';
import { interiorBackground, sampleBackground } from './detector-background.mjs';
import {
  candidateContrast,
  surfaceEvidence,
  safeSupport,
  consolidate,
  normalizeRoles,
} from './detector-roles.mjs';
import { normalizeTypeface } from './detector-typeface.mjs';
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
function createControlMarkIcons(image, controls) {
  const marks = rejectMarkerHoles(image, controls.marks || []);
  const markIcons = marks.map((mark) => {
    const foreground = controls.icons.filter(
      (b) =>
        b.kind === 'control-foreground' &&
        b.surfaceBounds &&
        Math.abs(b.surfaceBounds.x - mark.x) <= 1 &&
        Math.abs(b.surfaceBounds.y - mark.y) <= 1 &&
        Math.abs(b.surfaceBounds.w - mark.w) <= 2 &&
        Math.abs(b.surfaceBounds.h - mark.h) <= 2
    );
    if (foreground.length === 1) {
      const b = foreground[0];
      return {
        ...b,
        kind: 'control-symbol',
        roleEvidence: 'bounded-symbol',
        sourceBounds: { x: b.x, y: b.y, w: b.w, h: b.h },
      };
    }
    const margin = mark.kind === 'compact-disc' ? 0 : 2;
    const x = Math.max(0, mark.x - margin),
      y = Math.max(0, mark.y - margin),
      bounds = {
        x,
        y,
        w: Math.min(image.width - x, mark.w + margin * 2),
        h: Math.min(image.height - y, mark.h + margin * 2),
      };
    return {
      ...bounds,
      bg: sampleBackground(image, bounds),
      shape: 'icon',
      kind: 'control-symbol',
      roleEvidence: 'bounded-symbol',
      sourceBounds: { ...bounds },
    };
  });
  return markIcons;
}
function prepareAnalysisImage(image, media, controls, touchesMedia) {
  controls.protected = controls.protected
    .map((b) => {
      if (b.kind || b.w > 30 || b.h > 30) return b;
      const x = Math.max(0, b.x - 2),
        y = Math.max(0, b.y - 2);
      return {
        ...b,
        x,
        y,
        w: Math.min(image.width - x, b.w + 4),
        h: Math.min(image.height - y, b.h + 4),
      };
    })
    .filter((b) => !touchesMedia(b));
  controls.boundaries = controls.boundaries.filter((b) => !touchesMedia(b));
  const symbolicIcons = controls.icons.filter(
    (b) => ['control-symbol', 'direction-symbol'].includes(b.kind) && !touchesMedia(b)
  );
  const analysisImage =
    media.length || controls.protected.length || symbolicIcons.length
      ? { width: image.width, height: image.height, data: new Uint8ClampedArray(image.data) }
      : image;
  for (const box of media)
    for (let y = Math.max(0, box.y - 3); y < Math.min(image.height, box.y + box.h + 3); y++)
      for (let x = Math.max(0, box.x - 3); x < Math.min(image.width, box.x + box.w + 3); x++) {
        const i = (y * image.width + x) * 4;
        analysisImage.data[i] = box.bg[0];
        analysisImage.data[i + 1] = box.bg[1];
        analysisImage.data[i + 2] = box.bg[2];
        analysisImage.data[i + 3] = 255;
      }
  for (const box of [...controls.protected, ...symbolicIcons]) {
    if (box.kind === 'outline') continue;
    const bg = sampleBackground(image, box);
    for (let y = Math.max(0, box.y); y < Math.min(image.height, box.y + box.h); y++)
      for (let x = Math.max(0, box.x); x < Math.min(image.width, box.x + box.w); x++) {
        const i = (y * image.width + x) * 4;
        analysisImage.data[i] = bg[0];
        analysisImage.data[i + 1] = bg[1];
        analysisImage.data[i + 2] = bg[2];
      }
  }
  return analysisImage;
}
function deduplicateCatalog(image, catalog, glyphMetrics) {
  // Duplicate geometry can arise from the two fixed grids. Keep the larger
  // support when one compact component is already represented by another.
  catalog = catalog.filter((box) => safeSupport(image, box, glyphMetrics));
  catalog = catalog.filter(
    (box, i) =>
      !catalog.some((other, j) => {
        if (i === j || other.shape !== box.shape) return false;
        const area = box.w * box.h,
          otherArea = other.w * other.h;
        if (otherArea < area || (otherArea === area && j > i)) return false;
        const iw = Math.max(
            0,
            Math.min(box.x + box.w, other.x + other.w) - Math.max(box.x, other.x)
          ),
          ih = Math.max(0, Math.min(box.y + box.h, other.y + other.h) - Math.max(box.y, other.y));
        return iw * ih > area * 0.86;
      })
  );
  return catalog;
}
function acceptsFaintCompletion(image, box, overlaps, glyphMetrics) {
  const contained = overlaps.every(
    (b) =>
      b.x >= box.x - 1 &&
      b.y >= box.y - 1 &&
      b.x + b.w <= box.x + box.w + 1 &&
      b.y + b.h <= box.y + box.h + 1 &&
      Math.max(...b.bg.map((v, c) => Math.abs(v - box.bg[c]))) <= 20
  );
  if (!contained) return false;
  const established = overlaps
    .filter((b) => b.shape === 'text')
    .map((b) => ({ box: b, m: glyphMetrics(image, b) }))
    .filter(
      (p) => p.m && p.m.glyphs >= 3 && p.m.baselineAgreement >= 0.7 && p.m.heightAgreement >= 0.7
    )
    .sort((a, b) => a.box.x - b.box.x);
  if (
    established.some(
      (p, i) =>
        i &&
        p.box.x - established[i - 1].box.x - established[i - 1].box.w >
          Math.min(p.m.xHeight, established[i - 1].m.xHeight) * 0.65
    )
  )
    return false;
  const m = box.shape === 'text' ? glyphMetrics(image, box) : null;
  const completesText =
    m &&
    m.glyphs >= 3 &&
    m.baselineAgreement >= 0.7 &&
    m.heightAgreement >= 0.7 &&
    m.stroke / m.xHeight <= 0.4;
  const completesCompact =
    overlaps.length === 1 &&
    box.w <= 28 &&
    box.h <= 28 &&
    box.w * box.h > overlaps[0].w * overlaps[0].h * 1.3 &&
    box.w * box.h <= overlaps[0].w * overlaps[0].h * 2.5 &&
    Math.max(box.w, box.h) <= Math.max(overlaps[0].w, overlaps[0].h) * 1.5;
  const weakInk = (m?.foregroundContrast ?? candidateContrast(image, box)) <= 92;
  const union = {
    x: Math.min(...overlaps.map((b) => b.x)),
    y: Math.min(...overlaps.map((b) => b.y)),
    right: Math.max(...overlaps.map((b) => b.x + b.w)),
    bottom: Math.max(...overlaps.map((b) => b.y + b.h)),
  };
  const addsExtent =
    box.x < union.x - 2 ||
    box.y < union.y - 2 ||
    box.x + box.w > union.right + 2 ||
    box.y + box.h > union.bottom + 2;
  if (!weakInk || (!completesText && !completesCompact) || (!completesCompact && !addsExtent))
    return false;
  return true;
}
function completeFaintCatalog(image, analysisImage, catalog, faintProposals, glyphMetrics) {
  for (const candidate of faintProposals) {
    // A faint pass can complete a label already represented by fragments.
    // Resolve independent prefix figures before comparing support, so a larger
    // alternative cannot absorb an adjacent icon into the completed text.
    for (const box of refineTextStructure(analysisImage, [candidate], glyphMetrics)) {
      const overlaps = catalog.filter(
        (existing) =>
          Math.min(existing.x + existing.w, box.x + box.w) > Math.max(existing.x, box.x) &&
          Math.min(existing.y + existing.h, box.y + box.h) > Math.max(existing.y, box.y)
      );
      if (!overlaps.length) {
        catalog.push(box);
        continue;
      }
      if (!acceptsFaintCompletion(image, box, overlaps, glyphMetrics)) continue;
      const removed = new Set(overlaps);
      catalog = catalog.filter((b) => !removed.has(b));
      catalog.push(box);
    }
  }
  return catalog;
}
function discoverControlFrameLabels(image, controls, glyphMetrics) {
  for (const frame of controls.boundaries) {
    if (
      frame.kind !== 'control' ||
      frame.w < 22 ||
      frame.h < 22 ||
      frame.w > 52 ||
      frame.h > 52 ||
      !controls.protected.some(
        (p) => p.kind === 'outline' && Math.abs(p.x - frame.x) <= 2 && Math.abs(p.y - frame.y) <= 2
      )
    )
      continue;
    const inner = { x: frame.x + 3, y: frame.y + 3, w: frame.w - 6, h: frame.h - 6 };
    inner.bg = sampleBackground(image, inner);
    const parts = inkParts(image, inner);
    if (!parts.length || parts.length > 2) continue;
    const left = Math.min(...parts.map((p) => p.x)),
      top = Math.min(...parts.map((p) => p.y)),
      right = Math.max(...parts.map((p) => p.x + p.w)),
      bottom = Math.max(...parts.map((p) => p.y + p.h));
    const w = right - left,
      h = bottom - top;
    if (w < 2 || w > h * 0.65 || h < 6 || h > frame.h * 0.65) continue;
    let stem = 0;
    for (let x = left; x < right; x++) {
      let n = 0;
      for (let y = top; y < bottom; y++) {
        const i = (y * image.width + x) * 4;
        if (Math.max(...inner.bg.map((v, c) => Math.abs(v - image.data[i + c]))) > 40) n++;
      }
      stem = Math.max(stem, n);
    }
    if (stem < h * 0.7) continue;
    const box = {
        x: left - 1,
        y: top - 1,
        w: w + 2,
        h: h + 2,
        bg: inner.bg,
        shape: 'text',
        kind: 'control-text',
        componentCount: parts.length,
      },
      m = glyphMetrics(image, box, 1);
    if (!m || m.baselineAgreement < 0.7 || m.heightAgreement < 0.7 || m.stroke / m.xHeight > 0.4)
      continue;
    controls.labels.push({ ...box, typeMetrics: m, roleEvidence: 'text-control' });
  }
}
function admitControlLabels(
  image,
  analysisImage,
  catalog,
  controls,
  media,
  detectRaw,
  glyphMetrics,
  scratch,
  backgrounds
) {
  const intersects = (a, b) =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const labels = controls.labels
    .filter((b) => !media.some((m) => intersects(b, m)))
    .filter(
      (label) =>
        !catalog.some((b) => {
          if (b.shape !== 'text' || Math.max(...b.bg.map((v, c) => Math.abs(v - label.bg[c]))) > 16)
            return false;
          const overlap =
            Math.max(0, Math.min(b.x + b.w, label.x + label.w) - Math.max(b.x, label.x)) *
            Math.max(0, Math.min(b.y + b.h, label.y + label.h) - Math.max(b.y, label.y));
          if (overlap < Math.min(b.w * b.h, label.w * label.h) * 0.6) return false;
          const m = glyphMetrics(image, b);
          return m && m.glyphs >= 3 && m.baselineAgreement >= 0.7 && m.heightAgreement >= 0.7;
        })
    );
  catalog = catalog.filter((b) => !labels.some((label) => intersects(b, label)));
  catalog.push(...labels);
  for (const b of detectRaw(analysisImage, 55, true, 32, scratch, backgrounds)) {
    const owner = controls.boundaries.find(
      (f) => b.x >= f.x && b.y >= f.y && b.x + b.w <= f.x + f.w && b.y + b.h <= f.y + f.h
    );
    if (
      !owner ||
      labels.some((label) => intersects(b, label)) ||
      catalog.some((q) => intersects(b, q))
    )
      continue;
    if (b.w <= 28 && b.h <= 28) catalog.push({ ...b, shape: 'icon', kind: 'control-icon' });
  }
  return catalog;
}
function recoverControlForeground(image, catalog, controls, touchesMedia, glyphMetrics) {
  const intersects = (a, b) =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  // Resolve labels before filling unclaimed foreground slots. A missing icon
  // must not replace an existing text, image, state, or uncertain source owner.
  const recoveredControlIcons = (controls.icons || [])
    .filter(
      (b) =>
        b.kind === 'control-foreground' &&
        !touchesMedia(b) &&
        !controls.protected.some((p) => p.kind !== 'outline' && intersects(p, b)) &&
        !catalog.some((p) => intersects(p, b))
    )
    .filter((b) => {
      const [graphic] = refineTextStructure(image, [b], glyphMetrics);
      if (graphic?.shape === 'icon' && graphic.roleEvidence) return true;
      const m = glyphMetrics(image, b);
      return (
        !m ||
        m.glyphs < 2 ||
        m.baselineAgreement < 0.7 ||
        m.heightAgreement < 0.7 ||
        m.stroke / m.xHeight > 0.4
      );
    });
  catalog.push(
    ...recoveredControlIcons.map((b) => ({
      ...b,
      kind: 'control-icon',
      roleEvidence: 'bounded-control-foreground',
    }))
  );
}
function classifyCatalogConfidence(image, catalog, glyphMetrics) {
  for (const box of catalog) {
    if (box.shape === 'text' && !box.typeMetrics) box.typeMetrics = glyphMetrics(image, box);
    if (box.shape === 'text') {
      const m = box.typeMetrics;
      box.textConfidence =
        !!m &&
        (m.baselineAgreement >= 0.7 || (box.rowTextSize && m.glyphs >= 3)) &&
        m.heightAgreement >= 0.7 &&
        m.stroke / Math.max(1, m.xHeight) <= 0.4;
      if (!box.textConfidence) {
        if (
          box.w <= 88 &&
          box.h <= 88 &&
          Math.min(box.w, box.h) >= 28 &&
          box.w / box.h >= 0.6 &&
          box.w / box.h <= 1.7 &&
          (box.componentCount || 1) <= 2 &&
          box.inkDensity < 0.4
        ) {
          box.shape = 'icon';
          box.iconSize = Math.max(4, Math.min(box.w, box.h) - 4);
          box.kind = 'graphic-contour';
        } else box.shape = 'unknown';
        delete box.typeMetrics;
      }
    }
    box.contrast =
      box.shape === 'image'
        ? 255
        : (box.typeMetrics?.foregroundContrast ?? candidateContrast(image, box));
  }
}
function recoverInteriorSurfaceText(image, catalog, measure) {
  for (const box of catalog) {
    if (
      box.shape !== 'unknown' ||
      box.kind !== 'auto' ||
      box.roleEvidence ||
      box.w > 160 ||
      box.h > 88
    )
      continue;
    const bg = interiorBackground(image, box);
    if (!bg) continue;
    const previous = measure(image, box, 1);
    const candidate = { ...box, bg };
    const m = measure(image, candidate, 1);
    if (
      !m ||
      m.glyphs < 3 ||
      m.glyphs < (previous?.glyphs || 0) ||
      m.baselineAgreement < 0.7 ||
      m.heightAgreement < 0.7 ||
      m.stroke / Math.max(1, m.xHeight) > 0.4 ||
      m.foregroundCoverage < 0.9 ||
      m.foregroundCoverage < (previous?.foregroundCoverage || 0) + 0.1
    )
      continue;
    Object.assign(box, {
      bg,
      shape: 'text',
      typeMetrics: m,
      textConfidence: true,
      contrast: m.foregroundContrast,
    });
  }
}
function retainSupportedFaintBoxes(catalog) {
  catalog = catalog.filter((box) => {
    if (box.shape === 'image' || box.contrast >= 48) return true;
    if (box.h < 8 || box.w < 6) return false;
    if (box.shape === 'text')
      return (
        !!box.typeMetrics &&
        (box.typeMetrics.xHeight >= 5 ||
          box.typeMetrics.glyphs >= 5 ||
          confirmFaintColumn(box, catalog))
      );
    if (box.compact) return true;
    return catalog.some(
      (other) =>
        other !== box &&
        other.shape === 'icon' &&
        ((Math.abs(other.x + other.w / 2 - box.x - box.w / 2) <= 8 &&
          Math.abs(other.y - box.y) > box.h &&
          Math.abs(other.y - box.y) < box.h * 5) ||
          (Math.abs(other.y + other.h / 2 - box.y - box.h / 2) <= 5 &&
            Math.abs(other.x - box.x) > box.w &&
            Math.abs(other.x - box.x) < box.w * 5))
    );
  });
  return catalog;
}
function freezeCatalog(image, catalog, controls) {
  catalog = catalog
    .map((box) => {
      const x = clamp(box.x, 0, image.width),
        y = clamp(box.y, 0, image.height);
      return {
        ...box,
        x,
        y,
        w: Math.max(0, Math.min(image.width, box.x + box.w) - x),
        h: Math.max(0, Math.min(image.height, box.y + box.h) - y),
      };
    })
    .filter((box) => box.w > 0 && box.h > 0);
  for (const box of catalog) {
    delete box.atoms;
    if (box.sourceBounds) Object.freeze(box.sourceBounds);
    Object.freeze(box.bg);
    Object.freeze(box);
  }
  catalog.sort((a, b) => a.y - b.y || a.x - b.x);
  catalog.protected = Object.freeze(controls.protected.map((b) => Object.freeze({ ...b })));
  Object.freeze(catalog);
  return catalog;
}
export function buildCatalog(image, detectRaw, glyphMetrics) {
  // Raw passes finish consuming their queue before the next pass starts.
  const scratch = new Int32Array(image.width * image.height),
    backgrounds = new WeakMap();

  const sourceRaw = consolidate(
    image,
    detectRaw(image, 55, false, 16, scratch, backgrounds),
    glyphMetrics
  );
  const sourceRows = sourceRaw
    .filter((b) => b.shape === 'text')
    .map((b) => glyphMetrics(image, b))
    .filter(
      (m) =>
        m &&
        m.glyphs >= 5 &&
        m.baselineAgreement >= 0.8 &&
        m.heightAgreement >= 0.8 &&
        m.foregroundCoverage >= 0.85 &&
        m.stroke / Math.max(1, m.xHeight) <= 0.4
    );
  const proposals = resolveSurfaceClaims(
    image,
    detectMedia(image, glyphMetrics, sourceRows, scratch),
    analyzeControls(image, scratch),
    glyphMetrics
  );
  const { media, controls } = proposals;
  const markIcons = createControlMarkIcons(image, controls);
  controls.icons.push(...markIcons, ...sourceDirectionIcons(image, sourceRaw, glyphMetrics));
  const touchesMedia = (b) =>
    media.some((m) => b.x < m.x + m.w && b.x + b.w > m.x && b.y < m.y + m.h && b.y + b.h > m.y);
  const analysisImage = prepareAnalysisImage(image, media, controls, touchesMedia);
  const primaryRaw = detectRaw(analysisImage, 55, false, 32, scratch, backgrounds);
  const alternate = detectRaw(analysisImage, 55, false, 16, scratch, backgrounds).filter(
    (box) =>
      box.componentCount >= 3 && box.w / box.h >= 2 && surfaceEvidence(image, box).background >= 0.5
  );
  let catalog = consolidate(analysisImage, [...primaryRaw, ...alternate], glyphMetrics);
  catalog = deduplicateCatalog(image, catalog, glyphMetrics);
  const faintRaw = detectRaw(analysisImage, 100, false, 32, scratch, backgrounds);
  const faintProposals = consolidate(analysisImage, faintRaw, glyphMetrics);
  catalog = completeFaintCatalog(image, analysisImage, catalog, faintProposals, glyphMetrics);
  catalog = recoverBoundaryText(
    analysisImage,
    catalog,
    (strip) =>
      consolidate(strip, detectRaw(strip, 100, false, 16, scratch, backgrounds), glyphMetrics),
    glyphMetrics
  );
  catalog = catalog.filter(
    (b) =>
      !media.some((m) => b.x < m.x + m.w && b.x + b.w > m.x && b.y < m.y + m.h && b.y + b.h > m.y)
  );
  const intersects = (a, b) =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const controlIcons = (controls.icons || []).filter(
    (b) => b.kind !== 'control-foreground' && !touchesMedia(b)
  );
  catalog = catalog.filter((b) => !controlIcons.some((icon) => intersects(b, icon)));
  catalog.push(...controlIcons);
  discoverControlFrameLabels(image, controls, glyphMetrics);
  catalog = admitControlLabels(
    image,
    analysisImage,
    catalog,
    controls,
    media,
    detectRaw,
    glyphMetrics,
    scratch,
    backgrounds
  );
  const textFrames = findTextFrames(image, catalog);
  controls.protected.push(...textFrames);
  controls.boundaries.push(...textFrames.map((f) => ({ ...f, kind: 'control' })));
  catalog = recoverFramedLabels(image, catalog, textFrames, glyphMetrics);
  catalog = constrainFrameChildren(image, catalog, textFrames);
  catalog = refineTextStructure(image, catalog, glyphMetrics);
  recoverControlForeground(image, catalog, controls, touchesMedia, glyphMetrics);
  catalog = separateInlineSymbols(image, catalog, {
    boundaries: controls.boundaries,
    protected: controls.protected.filter((b) => b.kind !== 'outline'),
    measure: glyphMetrics,
  });
  catalog = mergeGraphicSupport(image, catalog, glyphMetrics);
  catalog = resolveTextColumns(image, catalog, glyphMetrics);
  catalog = normalizeRoles(analysisImage, catalog, glyphMetrics);
  catalog = stabilizeLayout(image, catalog, {
    media,
    boundaries: controls.boundaries,
    protected: controls.protected.filter((b) => b.kind !== 'outline'),
    measure: glyphMetrics,
  });
  catalog.push(...media);
  catalog = resolveControlPeers(image, catalog, controls.boundaries);
  classifyCatalogConfidence(image, catalog, glyphMetrics);
  recoverInteriorSurfaceText(image, catalog, glyphMetrics);
  catalog = recoverTextFlow(image, catalog, glyphMetrics);
  catalog = resolveTextBadges(image, catalog, glyphMetrics);
  catalog = absorbTextMarks(image, catalog, glyphMetrics);
  catalog = repairTextFragments(image, catalog, glyphMetrics, [
    ...controls.protected,
    ...controls.boundaries,
  ]);
  catalog = retainSupportedFaintBoxes(catalog);
  catalog = recoverFramedCarets(image, catalog, textFrames, glyphMetrics);
  catalog.protected = controls.protected;
  catalog = resolveUncertainPartialRows(image, catalog, faintProposals, glyphMetrics);
  catalog = attachTextDecorations(
    image,
    catalog,
    [...(primaryRaw.decorations || []), ...(faintRaw.decorations || [])],
    controls.protected
  );
  catalog = recoverTerminalMarks(image, catalog, controls);
  catalog = resolveOverlappingTextFragments(image, catalog, glyphMetrics);
  catalog = claimCompactGraphics(image, catalog, glyphMetrics, controls);
  catalog = claimRadialIcons(image, catalog, glyphMetrics, controls);
  catalog = reconcileIconPeers(image, catalog, glyphMetrics, controls.protected);
  catalog = resolveForegroundClaims(
    image,
    catalog,
    glyphMetrics,
    sampleBackground,
    controls.protected
  );
  controls.protected = resolveOutlineClaims(image, catalog, controls.protected, sampleBackground);
  controls.protected.push(...findTextFrames(image, catalog));
  catalog = preserveMixedFrameClaims(catalog, controls.protected, image);
  catalog = preserveUncertainRows(image, catalog);
  normalizeTypeface(image, catalog, true, glyphMetrics);
  return freezeCatalog(image, catalog, controls);
}
