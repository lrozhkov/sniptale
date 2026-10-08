import {
  resolveQuickEditWatermarkBounds,
  resolveQuickEditWatermarkTile,
  type QuickEditWatermarkSettings,
} from '../../features/video/review/advanced/watermark';
import { resolveReviewAssetBytes } from './asset-bytes';
import { QuickEditExportUnavailable } from './export-unavailable';

type Size = { width: number; height: number };
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

function allocate(canvas: HTMLCanvasElement, size: Size) {
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
  canvas.width = width;
  canvas.height = height;
}

function textFont(text: QuickEditWatermarkSettings['text'], pixels: number) {
  const family =
    text.font === 'sans' ? '"Sniptale Sans"' : text.font === 'serif' ? 'serif' : 'monospace';
  return `${text.weight === 'bold' ? 700 : 400} ${pixels}px ${family}`;
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
function paintText(
  canvas: HTMLCanvasElement,
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
  allocate(canvas, {
    width: advance + left + right + padding * 2,
    height: ascent + descent + (lines.length - 1) * lineHeight + padding * 2,
  });
  context.font = font;
  context.textBaseline = 'alphabetic';
  context.textAlign = 'left';
  context.fillStyle = text.color;
  context.globalAlpha = 1;
  if (text.shadow) {
    context.shadowColor = '#00000080';
    context.shadowBlur = blur;
    context.shadowOffsetY = offset;
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
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  settings: QuickEditWatermarkSettings,
  output: Size,
  readAsset: typeof resolveReviewAssetBytes,
  signal?: AbortSignal
) {
  const image = settings.image;
  if (!image) throw new QuickEditExportUnavailable(['asset-missing']);
  const bitmap = await readWatermarkBitmap(image.assetId, readAsset, signal);
  try {
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
    allocate(canvas, bounds);
    context.globalAlpha = image.opacity;
    context.drawImage(bitmap, 0, 0, bounds.width, bounds.height);
    return { width: bounds.width, height: bounds.height };
  } finally {
    bitmap.close();
  }
}

/** Resource preparation occurs once per immutable settings/output snapshot, never per video frame. */
export async function createReviewWatermarkRenderer(
  settings: QuickEditWatermarkSettings | undefined,
  output: Size,
  signal?: AbortSignal,
  readAsset: typeof resolveReviewAssetBytes = resolveReviewAssetBytes
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
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Watermark canvas is unavailable.');
  try {
    let painted: Size;
    if (settings.mode === 'text') {
      paintText(canvas, context, settings, output);
      painted = { width: canvas.width, height: canvas.height };
    } else painted = await paintImage(canvas, context, settings, output, readAsset, signal);
    signal?.throwIfAborted();
    const bounds = resolveQuickEditWatermarkBounds(settings, output, painted);
    const tile =
      settings.layout === 'tiled' ? resolveQuickEditWatermarkTile(settings, output, bounds) : null;
    let disposed = false;
    const dispose = () => {
      disposed = true;
      canvas.width = 0;
      canvas.height = 0;
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
              painted.width,
              painted.height,
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
                  painted.width,
                  painted.height,
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
  } catch (failure) {
    canvas.width = 0;
    canvas.height = 0;
    throw failure;
  }
}
