import { readImageDataUrlDimensions } from '@sniptale/runtime-contracts/validation/data-url';
import { FULL_PAGE_QUALITY_ABSOLUTE_LIMITS } from '../../../contracts/full-page-capture';
import type { QuickActionAppearance } from '../../../contracts/quick-action-appearance';
import type { QuickActionHeaderRasterInput } from '../../../contracts/messaging/contracts/runtime-message/quick-action-appearance.types';
import {
  quickActionAppearanceGeometry,
  quickActionInformationLines,
  resolveQuickActionHeader,
  type QuickActionAppearanceMetadata,
} from '../../../features/quick-actions-presets/appearance';
import { drawSceneGradient } from '../../../features/video/project/scene/background-gradient-canvas';
import { dataUrlToBlob } from '../../../platform/media-utils/data-url';

export interface QuickActionRasterOptions {
  appearance: QuickActionAppearance;
  dataUrl: string;
  metadata: QuickActionAppearanceMetadata;
  imageFormat: 'png' | 'jpeg' | 'webp';
  imageQuality: number;
  assertCurrent(): void;
  renderHeader(input: QuickActionHeaderRasterInput): Promise<string>;
}

async function encodeRaster(
  canvas: OffscreenCanvas,
  format: QuickActionRasterOptions['imageFormat'],
  quality: number
) {
  const blob = await canvas.convertToBlob({ type: `image/${format}`, quality: quality / 100 });
  if (blob.type !== `image/${format}`)
    throw new Error('Requested screenshot encoding is unavailable');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 32768)
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 32768)));
  return `data:${blob.type};base64,${btoa(chunks.join(''))}`;
}

function paintImage(
  context: OffscreenCanvasRenderingContext2D,
  image: ImageBitmap,
  width: number,
  height: number,
  fit: 'cover' | 'contain'
) {
  const scale = (fit === 'cover' ? Math.max : Math.min)(width / image.width, height / image.height);
  context.drawImage(
    image,
    (width - image.width * scale) / 2,
    (height - image.height * scale) / 2,
    image.width * scale,
    image.height * scale
  );
}

function drawInformation(
  context: OffscreenCanvasRenderingContext2D,
  lines: string[],
  options: QuickActionRasterOptions,
  geometry: ReturnType<typeof quickActionAppearanceGeometry>
) {
  context.fillStyle = options.appearance.information.color;
  context.font = `${options.appearance.information.size}px sans-serif`;
  context.textBaseline = 'top';
  const available = geometry.width - geometry.padding * 2;
  for (const [index, line] of lines.entries()) {
    let text = line;
    if (context.measureText(text).width > available) {
      let low = 0,
        high = text.length;
      while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if (context.measureText(text.slice(0, middle) + '…').width <= available) low = middle;
        else high = middle - 1;
      }
      text = text.slice(0, low) + '…';
    }
    context.fillText(
      text,
      geometry.padding,
      geometry.informationY + index * geometry.lineHeight,
      available
    );
  }
}

function readRasterLayout(options: QuickActionRasterOptions) {
  const sourceDimensions = readImageDataUrlDimensions(
    options.dataUrl,
    FULL_PAGE_QUALITY_ABSOLUTE_LIMITS.maxFileSizeMiB * 1024 * 1024
  );
  if (!sourceDimensions) throw new Error('Unsupported screenshot raster');
  const lines = quickActionInformationLines(options.appearance, sourceDimensions, options.metadata);
  const geometry = quickActionAppearanceGeometry(
    options.appearance,
    sourceDimensions,
    lines.length
  );
  const background = options.appearance.background;
  const backgroundDimensions =
    background.kind === 'image' ? readImageDataUrlDimensions(background.imageDataUrl) : null;
  if (
    background.kind === 'image' &&
    (!backgroundDimensions ||
      backgroundDimensions.width > 16384 ||
      backgroundDimensions.height > 16384 ||
      backgroundDimensions.width * backgroundDimensions.height > 40_000_000)
  )
    throw new Error('Quick-action background exceeds raster limits');
  const workingBytes =
    sourceDimensions.width * sourceDimensions.height * 4 +
    geometry.width * geometry.height * 8 +
    sourceDimensions.width * geometry.headerHeight * 4 +
    (backgroundDimensions ? backgroundDimensions.width * backgroundDimensions.height * 4 : 0);
  if (workingBytes > FULL_PAGE_QUALITY_ABSOLUTE_LIMITS.maxWorkingSetBytes)
    throw new Error('Quick-action appearance exceeds working-set limits');
  return { sourceDimensions, lines, geometry };
}

function drawFramedSource(
  context: OffscreenCanvasRenderingContext2D,
  background: QuickActionAppearance['background'],
  geometry: ReturnType<typeof quickActionAppearanceGeometry>,
  source: ImageBitmap,
  headerBitmap: ImageBitmap | undefined
) {
  const top = geometry.sourceY - geometry.headerHeight;
  const radius =
    background.kind === 'none'
      ? 0
      : Math.min(background.radius, source.width / 2, (source.height + geometry.headerHeight) / 2);
  context.save();
  context.beginPath();
  context.roundRect(
    geometry.sourceX,
    top,
    source.width,
    source.height + geometry.headerHeight,
    radius
  );
  if (background.kind !== 'none' && background.shadow) {
    context.shadowColor = '#00000040';
    context.shadowBlur = background.shadow;
    context.shadowOffsetY = background.shadow / 3;
  }
  if (background.kind !== 'none' && background.shadow) {
    context.fillStyle = '#ffffff';
    context.fill();
  }
  context.shadowColor = 'transparent';
  context.clip();
  if (headerBitmap) context.drawImage(headerBitmap, geometry.sourceX, top);
  context.drawImage(source, geometry.sourceX, geometry.sourceY);
  context.restore();
}

export async function renderQuickActionAppearance(
  options: QuickActionRasterOptions
): Promise<string> {
  const bitmaps: ImageBitmap[] = [];
  let canvas: OffscreenCanvas | undefined;
  try {
    options.assertCurrent();
    const { sourceDimensions, lines, geometry } = readRasterLayout(options);
    const background = options.appearance.background;
    const source = await createImageBitmap(await dataUrlToBlob(options.dataUrl));
    if (source.width !== sourceDimensions.width || source.height !== sourceDimensions.height) {
      source.close();
      throw new Error('Screenshot raster dimensions do not match');
    }
    bitmaps.push(source);
    options.assertCurrent();
    const header = resolveQuickActionHeader(options.appearance, options.metadata);
    let headerBitmap: ImageBitmap | undefined;
    if (header) {
      const faviconWebsite =
        options.appearance.faviconMode === 'website'
          ? options.appearance.faviconWebsite
          : options.appearance.faviconMode === 'page'
            ? options.metadata.url
            : undefined;
      const dataUrl = await options.renderHeader({
        header,
        source: { width: source.width, height: source.height },
        ...(faviconWebsite ? { faviconWebsite } : {}),
      });
      options.assertCurrent();
      headerBitmap = await createImageBitmap(await dataUrlToBlob(dataUrl));
      bitmaps.push(headerBitmap);
      if (headerBitmap.width !== source.width || headerBitmap.height !== geometry.headerHeight)
        throw new Error('Quick-action header dimensions do not match');
    }
    let backgroundBitmap: ImageBitmap | undefined;
    if (background.kind === 'image' && background.imageDataUrl) {
      backgroundBitmap = await createImageBitmap(await dataUrlToBlob(background.imageDataUrl));
      bitmaps.push(backgroundBitmap);
      if (
        backgroundBitmap.width > 16384 ||
        backgroundBitmap.height > 16384 ||
        backgroundBitmap.width * backgroundBitmap.height > 40_000_000
      )
        throw new Error('Quick-action background exceeds raster limits');
    }
    options.assertCurrent();
    canvas = new OffscreenCanvas(geometry.width, geometry.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Quick-action appearance canvas is unavailable');
    if (background.kind !== 'none') {
      if (background.paint.kind === 'solid') {
        context.fillStyle = background.paint.color;
        context.fillRect(0, 0, geometry.width, geometry.height);
      } else drawSceneGradient(context, background.paint.gradient, geometry.width, geometry.height);
      if (backgroundBitmap)
        paintImage(context, backgroundBitmap, geometry.width, geometry.height, background.fit);
    }
    drawFramedSource(context, background, geometry, source, headerBitmap);
    drawInformation(context, lines, options, geometry);
    options.assertCurrent();
    const result = await encodeRaster(canvas, options.imageFormat, options.imageQuality);
    options.assertCurrent();
    return result;
  } finally {
    for (const bitmap of bitmaps) bitmap.close();
    if (canvas) canvas.width = canvas.height = 0;
  }
}
