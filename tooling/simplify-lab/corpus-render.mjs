import {
  createCanvas,
  loadImage,
  version as canvasVersion,
  cairoVersion,
  pangoVersion,
} from 'canvas';
import { renderRecipe, CORPUS_VIEWPORT } from './corpus-recipes.mjs';
import { installFonts, verifyBrowserFonts, verifyArabicShaping } from './corpus-fonts.mjs';

export const CORPUS_RASTER_RUNTIME = Object.freeze({
  node: process.version,
  canvas: canvasVersion,
  cairo: cairoVersion,
  pango: pangoVersion,
});
const failure = (kind, message) => Object.assign(new Error(message), { kind });
const checkAbort = (signal) => {
  if (signal?.aborted) throw failure('cancelled', 'Corpus generation cancelled');
};

export async function decodeCorpusPng(bytes) {
  const image = await loadImage(bytes),
    canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  return {
    width: image.width,
    height: image.height,
    data: context.getImageData(0, 0, image.width, image.height).data,
  };
}

function channelNoise(a, b) {
  if (a.width !== b.width || a.height !== b.height)
    throw failure('oracle-error', 'Repeated raster dimensions changed');
  let maximum = 0;
  for (let index = 0; index < a.data.length; index++)
    maximum = Math.max(maximum, Math.abs(a.data[index] - b.data[index]));
  return maximum;
}

function binaryMask(a, b) {
  if (a.width !== b.width || a.height !== b.height)
    throw failure('oracle-error', 'Paired raster dimensions changed');
  const canvas = createCanvas(a.width, a.height),
    context = canvas.getContext('2d');
  const output = context.createImageData(a.width, a.height),
    mask = new Uint8Array(a.width * a.height);
  for (let index = 0; index < mask.length; index++) {
    const offset = index * 4;
    const changed =
      a.data[offset] !== b.data[offset] ||
      a.data[offset + 1] !== b.data[offset + 1] ||
      a.data[offset + 2] !== b.data[offset + 2] ||
      a.data[offset + 3] !== b.data[offset + 3];
    mask[index] = changed ? 255 : 0;
    output.data.set([mask[index], mask[index], mask[index], 255], offset);
  }
  context.putImageData(output, 0, 0);
  return { bytes: canvas.toBuffer('image/png'), mask };
}

async function geometry(page, entry) {
  return page.evaluate(
    ({ entry }) =>
      entry.fragments.map((fragment) => {
        const element = globalThis.document.querySelector(`[data-fragment="${fragment.id}"]`);
        if (!element) throw new Error('Recipe fragment missing');
        const range = globalThis.document.createRange();
        range.selectNodeContents(element);
        const rects = [...range.getClientRects()]
          .filter((rect) => rect.width > 0 && rect.height > 0)
          .map(({ x, y, width, height }) => ({
            x: x * entry.dpr,
            y: y * entry.dpr,
            width: width * entry.dpr,
            height: height * entry.dpr,
          }));
        const panel = element.parentElement.getBoundingClientRect();
        return {
          id: fragment.id,
          text: element.textContent,
          rects,
          tags: fragment.tags,
          fontId: fragment.fontId,
          container: {
            x: panel.x * entry.dpr,
            y: panel.y * entry.dpr,
            width: panel.width * entry.dpr,
            height: panel.height * entry.dpr,
          },
        };
      }),
    { entry }
  );
}

function verifyOracle(entry, ink, protectedPixels, fragments) {
  if (fragments.length !== entry.fragments.length)
    throw failure('oracle-error', 'Annotation count changed');
  const counts = new Map(fragments.map((fragment) => [fragment.id, 0]));
  const bounds = new Map(fragments.map((fragment) => [fragment.id, null]));
  const firstInk = [];
  for (let index = 0; index < fragments.length; index++) {
    const a = fragments[index].container;
    for (const other of fragments.slice(index + 1)) {
      const b = other.container;
      if (
        Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x) &&
        Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y)
      )
        throw failure('oracle-error', 'Fragment containers overlap');
    }
  }
  const inkRects = new Map(
    fragments.map((fragment) => [fragment.id, fragment.rects.map((rect) => ({ ...rect }))])
  );
  for (let index = 0; index < ink.mask.length; index++) {
    if (ink.mask[index] && protectedPixels.mask[index])
      throw failure('oracle-error', 'Text overlaps protected geometry');
    if (!ink.mask[index]) continue;
    const x = index % (CORPUS_VIEWPORT.width * entry.dpr),
      y = Math.floor(index / (CORPUS_VIEWPORT.width * entry.dpr));
    const owner = fragments.find(
      ({ container: box }) =>
        x >= box.x && y >= box.y && x < box.x + box.width && y < box.y + box.height
    );
    if (!owner)
      throw failure('oracle-error', 'Text ink changed outside annotated fragment containers');
    counts.set(owner.id, counts.get(owner.id) + 1);
    if (owner.id === fragments[0].id) firstInk.push({ x, y });
    const previous = bounds.get(owner.id);
    if (!previous) bounds.set(owner.id, { x, y, width: 1, height: 1 });
    else {
      const right = Math.max(previous.x + previous.width, x + 1),
        bottom = Math.max(previous.y + previous.height, y + 1);
      previous.x = Math.min(previous.x, x);
      previous.y = Math.min(previous.y, y);
      previous.width = right - previous.x;
      previous.height = bottom - previous.y;
    }
    const rects = inkRects.get(owner.id);
    if (!rects.length) throw failure('oracle-error', 'Visible fragment has no DOM line rectangles');
    const rect = rects.reduce((nearest, candidate) => {
      const distance = (box) => Math.max(box.y - y, y - box.y - box.height, 0);
      return distance(candidate) < distance(nearest) ? candidate : nearest;
    });
    const right = Math.max(rect.x + rect.width, x + 1),
      bottom = Math.max(rect.y + rect.height, y + 1);
    rect.x = Math.min(rect.x, x);
    rect.y = Math.min(rect.y, y);
    rect.width = right - rect.x;
    rect.height = bottom - rect.y;
  }
  if (fragments.some((fragment) => !counts.get(fragment.id)))
    throw failure('oracle-error', 'Visible fragment has no raster ink');
  if (!protectedPixels.mask.some(Boolean))
    throw failure('oracle-error', 'Protected geometry mask is empty');
  return {
    counts: Object.fromEntries(counts),
    rects: Object.fromEntries(inkRects),
    bounds: Object.fromEntries(bounds),
    firstInk,
  };
}

function rasterRegion(entry, evidence, width, height) {
  const first = entry.fragments[0],
    box = first ? evidence.bounds[first.id] : null;
  const kind = first ? entry.tags.find((tag) => tag.startsWith('roi-'))?.slice(4) : 'negative';
  const x =
    box && kind === 'partial'
      ? box.x + Math.floor(box.width / 2)
      : box && kind === 'edge'
        ? box.x
        : 0;
  const y = box && ['edge', 'partial'].includes(kind) ? box.y : 0;
  const inside = evidence.firstInk.filter(
    (point) => point.x >= x && point.y >= y && point.x < width && point.y < height
  ).length;
  const outside = evidence.firstInk.length - inside;
  if (first && (!inside || (kind === 'partial' ? !outside : outside !== 0)))
    throw failure('oracle-error', 'ROI label does not match actual fragment ink');
  if (kind === 'edge' && (x !== box.x || y !== box.y))
    throw failure('oracle-error', 'Edge ROI does not touch visible raster ink');
  return {
    region: { x, y, width: width - x, height: height - y },
    evidence: {
      kind,
      fragmentId: first?.id ?? null,
      insideInkPixels: inside,
      outsideInkPixels: outside,
      touchesLeft: box ? x === box.x : null,
      touchesTop: box ? y === box.y : null,
    },
  };
}

export async function renderCorpusCase(browser, entry, fonts, signal) {
  checkAbort(signal);
  const context = await browser.newContext({
    viewport: CORPUS_VIEWPORT,
    deviceScaleFactor: entry.dpr,
    locale: 'en-US',
    colorScheme: 'light',
    reducedMotion: 'reduce',
    offline: true,
  });
  const page = await context.newPage();
  const requests = [];
  await context.route('**/*', (route) => {
    requests.push(route.request().url());
    return route.abort();
  });
  try {
    const html = renderRecipe(entry);
    await page.setContent(html);
    const used = fonts.filter((font) =>
      entry.fragments.some((fragment) => fragment.fontId === font.id)
    );
    await installFonts(page, used);
    const fontEvidence = await verifyBrowserFonts(page, entry.fragments, used);
    const shaping = await verifyArabicShaping(page, used);
    const before = await geometry(page, entry);
    const source = await page.screenshot({ animations: 'disabled', fullPage: false });
    const repeatedSource = await page.screenshot({ animations: 'disabled', fullPage: false });
    await page.evaluate(() => globalThis.document.body.classList.add('hide-text'));
    const reference = await page.screenshot({ animations: 'disabled', fullPage: false });
    const repeatedReference = await page.screenshot({ animations: 'disabled', fullPage: false });
    const after = await geometry(page, entry);
    if (JSON.stringify(before) !== JSON.stringify(after))
      throw failure('oracle-error', 'Paired text hiding changed layout');
    await page.evaluate(() => globalThis.document.body.classList.add('hide-geometry'));
    const withoutGeometry = await page.screenshot({ animations: 'disabled', fullPage: false });
    checkAbort(signal);
    const [
      sourcePixels,
      sourceRepeatPixels,
      referencePixels,
      referenceRepeatPixels,
      noGeometryPixels,
    ] = await Promise.all(
      [source, repeatedSource, reference, repeatedReference, withoutGeometry].map(decodeCorpusPng)
    );
    const noise = {
      sourceMaxChannel: channelNoise(sourcePixels, sourceRepeatPixels),
      referenceMaxChannel: channelNoise(referencePixels, referenceRepeatPixels),
    };
    if (noise.sourceMaxChannel || noise.referenceMaxChannel)
      throw failure('oracle-error', 'Repeated render pixels are nondeterministic');
    const ink = binaryMask(sourcePixels, referencePixels),
      protectedPixels = binaryMask(referencePixels, noGeometryPixels);
    const inkEvidence = verifyOracle(entry, ink, protectedPixels, before);
    const roi = rasterRegion(entry, inkEvidence, sourcePixels.width, sourcePixels.height);
    if (requests.length)
      throw failure('generation-error', 'Offline generation attempted a network request');
    return {
      html,
      source,
      reference,
      inkMask: ink.bytes,
      protectedMask: protectedPixels.bytes,
      fragments: before.map(({ container: _container, ...fragment }) => ({
        ...fragment,
        layoutRects: fragment.rects,
        rects: inkEvidence.rects[fragment.id],
        inkPixels: inkEvidence.counts[fragment.id],
        inkBounds: inkEvidence.bounds[fragment.id],
      })),
      noise,
      fontEvidence,
      shaping,
      region: roi.region,
      roiEvidence: roi.evidence,
    };
  } finally {
    await context.close();
  }
}
