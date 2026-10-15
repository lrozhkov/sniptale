import {
  resolveQuickEditWatermarkBounds,
  resolveQuickEditWatermarkTile,
  type QuickEditWatermarkSettings,
} from '../../features/video/review/advanced/watermark';
import type {
  RenderCanvasLease,
  RenderResources,
} from '../../features/video/composition/canvas/render-resources';
import { resolveReviewAssetBytes } from './asset-bytes';
import { QuickEditExportUnavailable } from './export-unavailable';

type Size = { width: number; height: number };
type Raster = { scaleX: number; scaleY: number; resources: RenderResources };
const MAX_CACHE_PIXELS = 4_194_304;
const MAX_LOGO_PIXELS = 16_000_000;

/** Prepared final-canvas pixels shared by Gallery preview and full/fragment export. */
export interface ReviewWatermarkRenderer {
  bounds: { x: number; y: number; width: number; height: number };
  draw(context: CanvasRenderingContext2D): void;
  dispose(): void;
}

function emptyRenderer(): ReviewWatermarkRenderer {
  return { bounds: { x: 0, y: 0, width: 0, height: 0 }, draw() {}, dispose() {} };
}

function cacheSize(size: Size): Size {
  const width = Math.ceil(size.width);
  const height = Math.ceil(size.height);
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 1 ||
    height < 1 ||
    width > 8192 ||
    height > 8192 ||
    width * height > MAX_CACHE_PIXELS
  )
    throw new Error('Watermark cache budget exceeded.');
  return { width, height };
}

function createCache(size: Size, raster?: Raster): RenderCanvasLease {
  const backing = cacheSize({
    width: size.width * (raster?.scaleX ?? 1),
    height: size.height * (raster?.scaleY ?? 1),
  });
  if (raster) return raster.resources.canvas('watermark-cache', backing);
  const canvas = document.createElement('canvas');
  canvas.width = backing.width;
  canvas.height = backing.height;
  const context = canvas.getContext('2d');
  if (!context) {
    canvas.width = 0;
    canvas.height = 0;
    throw new Error('Watermark canvas is unavailable.');
  }
  return {
    canvas,
    context,
    release() {
      canvas.width = 0;
      canvas.height = 0;
    },
  };
}

function textFont(text: QuickEditWatermarkSettings['text'], pixels: number) {
  const family =
    text.font === 'sans' ? '"Sniptale Sans"' : text.font === 'serif' ? 'serif' : 'monospace';
  return `${text.italic ? 'italic ' : ''}${text.weight === 'bold' ? 700 : 400} ${pixels}px ${family}`;
}

async function prepareTextFont(
  text: QuickEditWatermarkSettings['text'],
  font: string,
  signal?: AbortSignal
) {
  signal?.throwIfAborted();
  if (!document.fonts) throw new Error('Watermark font loading is unavailable.');
  const faces = await document.fonts.load(font, text.value);
  signal?.throwIfAborted();
  if (
    (text.font === 'sans' && (!faces.length || faces.some((face) => face.status !== 'loaded'))) ||
    !document.fonts.check(font, text.value)
  )
    throw new Error('Watermark font is unavailable.');
}

function wrapText(context: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const character of Array.from(paragraph)) {
      const candidate = line + character;
      if (line && context.measureText(candidate).width > width) {
        lines.push(line);
        line = character;
      } else line = candidate;
    }
    lines.push(line);
  }
  return lines;
}

/** Glyph overhang and a conservative blur envelope are included before placement and tiling. */
function measureText(
  context: CanvasRenderingContext2D,
  settings: QuickEditWatermarkSettings,
  output: Size
) {
  const text = settings.text;
  const pixels = Math.min(output.width, output.height) * text.size;
  const font = textFont(text, pixels);
  context.font = font;
  const lines = wrapText(context, text.value, Math.max(1, output.width * text.wrapWidth));
  const metrics = lines.map((line) => context.measureText(line));
  const advance = Math.max(1, ...metrics.map((metric) => metric.width));
  const left = Math.max(0, ...metrics.map((metric) => metric.actualBoundingBoxLeft));
  const right = Math.max(
    0,
    ...metrics.map((metric) => metric.actualBoundingBoxRight - metric.width)
  );
  const ascent = Math.max(pixels, ...metrics.map((metric) => metric.actualBoundingBoxAscent));
  const descent = Math.max(
    pixels * 0.3,
    ...metrics.map((metric) => metric.actualBoundingBoxDescent)
  );
  const lineHeight = Math.max(pixels * 1.25, ascent + descent);
  const blur = text.shadow ? Math.max(1, pixels * 0.12) : 0;
  const offset = text.shadow ? Math.max(1, pixels * 0.06) : 0;
  const padding = Math.ceil(blur * 3 + offset + 2);
  const size = cacheSize({
    width: advance + left + right + padding * 2,
    height: ascent + descent + (lines.length - 1) * lineHeight + padding * 2,
  });
  return {
    size,
    pixels,
    font,
    lines,
    metrics,
    advance,
    left,
    ascent,
    lineHeight,
    blur,
    offset,
    padding,
  };
}

function paintText(
  context: CanvasRenderingContext2D,
  text: QuickEditWatermarkSettings['text'],
  measured: ReturnType<typeof measureText>,
  raster?: Raster
) {
  const { pixels, font, lines, metrics, advance, left, ascent, lineHeight, blur, offset, padding } =
    measured;
  if (raster) context.scale(raster.scaleX, raster.scaleY);
  context.font = font;
  context.textBaseline = 'alphabetic';
  context.textAlign = 'left';
  context.fillStyle = text.color;
  context.globalAlpha = 1;
  if (text.shadow) {
    context.shadowColor = '#00000080';
    context.shadowBlur = blur * Math.max(raster?.scaleX ?? 1, raster?.scaleY ?? 1);
    context.shadowOffsetY = offset * (raster?.scaleY ?? 1);
  }
  lines.forEach((line, index) => {
    const width = metrics[index]!.width;
    const alignment =
      text.align === 'center'
        ? (advance - width) / 2
        : text.align === 'right'
          ? advance - width
          : 0;
    context.fillText(line, padding + left + alignment, padding + ascent + index * lineHeight);
    if (text.strike) {
      context.fillRect(
        padding + left + alignment,
        padding + ascent + index * lineHeight - pixels * 0.3,
        width,
        Math.max(1, pixels * 0.06)
      );
    }
  });
}

async function readWatermarkBitmap(
  assetId: string,
  readAsset: typeof resolveReviewAssetBytes,
  signal?: AbortSignal
): Promise<ImageBitmap> {
  try {
    const blob = await readAsset(assetId);
    signal?.throwIfAborted();
    if (!blob) throw new QuickEditExportUnavailable(['asset-missing']);
    return await createImageBitmap(blob);
  } catch (failure) {
    signal?.throwIfAborted();
    if (failure instanceof Error && failure.name === 'AbortError') throw failure;
    throw new QuickEditExportUnavailable(['asset-missing']);
  }
}

async function paintImage(
  settings: QuickEditWatermarkSettings,
  output: Size,
  readAsset: typeof resolveReviewAssetBytes,
  signal?: AbortSignal,
  raster?: Raster
) {
  const image = settings.image;
  if (!image) throw new QuickEditExportUnavailable(['asset-missing']);
  const reservation = raster?.resources.bytes(
    'watermark-source-bitmap',
    image.width * image.height * 4
  );
  let bitmap: ImageBitmap | undefined;
  let cache: RenderCanvasLease | undefined;
  try {
    bitmap = await readWatermarkBitmap(image.assetId, readAsset, signal);
    signal?.throwIfAborted();
    if (
      bitmap.width !== image.width ||
      bitmap.height !== image.height ||
      bitmap.width > 4096 ||
      bitmap.height > 4096 ||
      bitmap.width * bitmap.height > MAX_LOGO_PIXELS
    )
      throw new QuickEditExportUnavailable(['asset-missing']);
    const width = output.width * image.size;
    const bounds = resolveQuickEditWatermarkBounds(settings, output, {
      width,
      height: (width * image.height) / image.width,
    });
    cache = createCache(bounds, raster);
    cache.context.globalAlpha = image.opacity;
    cache.context.drawImage(
      bitmap,
      0,
      0,
      raster ? cache.canvas.width : bounds.width,
      raster ? cache.canvas.height : bounds.height
    );
    return { cache, painted: { width: bounds.width, height: bounds.height } };
  } catch (failure) {
    cache?.release();
    throw failure;
  } finally {
    bitmap?.close();
    reservation?.release();
  }
}

/** Canonical measurement finishes before the retained raster cache is admitted. */
function prepareTextCache(settings: QuickEditWatermarkSettings, output: Size, raster?: Raster) {
  const measurement = raster?.resources.canvas('watermark-measurement', {
    width: 1,
    height: 1,
  });
  const canvas = measurement?.canvas ?? document.createElement('canvas');
  const context = measurement?.context ?? canvas.getContext('2d');
  if (!context) throw new Error('Watermark canvas is unavailable.');
  let measured: ReturnType<typeof measureText>;
  try {
    measured = measureText(context, settings, output);
  } catch (failure) {
    if (!measurement) {
      canvas.width = 0;
      canvas.height = 0;
    }
    throw failure;
  } finally {
    measurement?.release();
  }
  const painted = measured.size;
  let cache: RenderCanvasLease;
  if (raster) cache = createCache(painted, raster);
  else {
    canvas.width = painted.width;
    canvas.height = painted.height;
    cache = {
      canvas,
      context,
      release() {
        canvas.width = 0;
        canvas.height = 0;
      },
    };
  }
  try {
    paintText(cache.context, settings.text, measured, raster);
    return { cache, painted };
  } catch (failure) {
    cache.release();
    throw failure;
  }
}

/** Resource preparation occurs once per immutable settings/output snapshot, never per video frame. */
export async function createReviewWatermarkRenderer(
  settings: QuickEditWatermarkSettings | undefined,
  output: Size,
  signal?: AbortSignal,
  readAsset: typeof resolveReviewAssetBytes = resolveReviewAssetBytes,
  raster?: Raster
): Promise<ReviewWatermarkRenderer> {
  signal?.throwIfAborted();
  if (
    !settings ||
    settings.mode === 'none' ||
    (settings.mode === 'text' && !settings.text.value) ||
    (settings.mode === 'image' && !settings.image)
  )
    return emptyRenderer();
  if (
    !Number.isFinite(output.width) ||
    !Number.isFinite(output.height) ||
    output.width < 1 ||
    output.height < 1
  )
    throw new Error('Invalid watermark output.');
  if (settings.mode === 'text')
    await prepareTextFont(
      settings.text,
      textFont(settings.text, Math.min(output.width, output.height) * settings.text.size),
      signal
    );
  if (
    raster &&
    ![raster.scaleX, raster.scaleY].every((scale) => Number.isFinite(scale) && scale > 0)
  )
    throw new Error('Invalid watermark raster scale.');
  let cache: RenderCanvasLease | undefined;
  try {
    let painted: Size;
    if (settings.mode === 'text') {
      const text = prepareTextCache(settings, output, raster);
      cache = text.cache;
      painted = text.painted;
    } else {
      const image = await paintImage(settings, output, readAsset, signal, raster);
      cache = image.cache;
      painted = image.painted;
    }
    return rendererFromCache(cache, painted, settings, output, signal, raster);
  } catch (failure) {
    cache?.release();
    throw failure;
  }
}

function rendererFromCache(
  cache: RenderCanvasLease,
  painted: Size,
  settings: QuickEditWatermarkSettings,
  output: Size,
  signal?: AbortSignal,
  raster?: Raster
): ReviewWatermarkRenderer {
  const { canvas } = cache;
  const sampled = raster ? { width: canvas.width, height: canvas.height } : painted;
  signal?.throwIfAborted();
  const bounds = resolveQuickEditWatermarkBounds(settings, output, painted);
  const tile =
    settings.layout === 'tiled' ? resolveQuickEditWatermarkTile(settings, output, bounds) : null;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cache?.release();
    signal?.removeEventListener('abort', dispose);
  };
  signal?.addEventListener('abort', dispose, { once: true });
  return {
    bounds,
    draw(target) {
      if (disposed) return;
      target.save();
      try {
        if (!tile)
          target.drawImage(
            canvas,
            0,
            0,
            sampled.width,
            sampled.height,
            bounds.x,
            bounds.y,
            bounds.width,
            bounds.height
          );
        else
          for (let row = 0; row < tile.rows; row++)
            for (let column = 0; column < tile.columns; column++) {
              target.save();
              target.translate((column - 0.5) * tile.stepX, (row - 0.5) * tile.stepY);
              target.rotate(tile.rotation);
              target.drawImage(
                canvas,
                0,
                0,
                sampled.width,
                sampled.height,
                -bounds.width / 2,
                -bounds.height / 2,
                bounds.width,
                bounds.height
              );
              target.restore();
            }
      } finally {
        target.restore();
      }
    },
    dispose,
  };
}

/** Measures once before orchestration admits the exact cache and optional decoded-image storage. */
export async function measureReviewWatermark(
  settings: QuickEditWatermarkSettings | undefined,
  output: Size,
  signal: AbortSignal,
  raster: Raster
) {
  signal.throwIfAborted();
  if (![raster.scaleX, raster.scaleY].every((scale) => Number.isFinite(scale) && scale > 0))
    throw new Error('Invalid watermark raster scale.');
  if (
    !settings ||
    settings.mode === 'none' ||
    (settings.mode === 'text' && !settings.text.value) ||
    (settings.mode === 'image' && !settings.image)
  )
    return Object.freeze({
      kind: 'none' as const,
      cache: null,
      source: null,
      paint: async () => {
        signal.throwIfAborted();
        return emptyRenderer();
      },
    });
  if (![output.width, output.height].every((value) => Number.isFinite(value) && value >= 1))
    throw new Error('Invalid watermark output.');
  const captured = structuredClone(settings);
  const canonical = { ...output };
  const capturedRaster = { ...raster };
  let measured: ReturnType<typeof measureText> | undefined;
  let painted: Size;
  if (captured.mode === 'text') {
    await prepareTextFont(
      captured.text,
      textFont(captured.text, Math.min(output.width, output.height) * captured.text.size),
      signal
    );
    const measurement = raster.resources.canvas('watermark-measurement', { width: 1, height: 1 });
    try {
      measured = measureText(measurement.context, captured, canonical);
    } finally {
      measurement.release();
    }
    painted = measured.size;
  } else {
    const image = captured.image!;
    const width = output.width * image.size;
    const bounds = resolveQuickEditWatermarkBounds(captured, canonical, {
      width,
      height: (width * image.height) / image.width,
    });
    painted = { width: bounds.width, height: bounds.height };
  }
  const cache = Object.freeze(
    cacheSize({ width: painted.width * raster.scaleX, height: painted.height * raster.scaleY })
  );
  const source =
    captured.mode === 'image'
      ? Object.freeze({ width: captured.image!.width, height: captured.image!.height })
      : null;
  signal.throwIfAborted();
  return Object.freeze({
    kind: captured.mode === 'image' ? ('image' as const) : ('text' as const),
    cache,
    source,
    async paint(readAsset: typeof resolveReviewAssetBytes = resolveReviewAssetBytes) {
      signal.throwIfAborted();
      let lease: RenderCanvasLease | undefined;
      try {
        if (measured) {
          lease = createCache(painted, capturedRaster);
          paintText(lease.context, captured.text, measured, capturedRaster);
        } else
          lease = (await paintImage(captured, canonical, readAsset, signal, capturedRaster)).cache;
        signal.throwIfAborted();
        return rendererFromCache(lease, painted, captured, canonical, signal, capturedRaster);
      } catch (failure) {
        lease?.release();
        throw failure;
      }
    },
  });
}
