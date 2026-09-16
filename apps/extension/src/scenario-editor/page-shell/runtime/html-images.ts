import type {
  GuideImageBlock,
  GuideHtmlImageSettings,
  GuideProject,
} from '@sniptale/runtime-contracts/scenario/types/guide';
import { getScenarioAssetBlob } from '../../../composition/persistence/scenario/store/public';
import {
  assertImportableProjectImage,
  PROJECT_ASSET_IMAGE_MIME_TYPES,
} from '../../../features/media-hub/project-assets';
import {
  guideHtmlImages,
  htmlImageRasterKey,
  resolveHtmlImageSettings,
} from '../html-image-settings';
import { renderGuideImageFrame } from './image-frame';

/** A unique saved raster, independent of the number of document occurrences. */
export interface HtmlRaster {
  block: GuideImageBlock;
  settings: GuideHtmlImageSettings;
  width: number;
  height: number;
  size: number;
  mime: string;
}

/** Sequential native rendering retains at most one source and output bitmap. */
export async function prepareHtmlImage(
  block: GuideImageBlock,
  settings: GuideHtmlImageSettings,
  signal: AbortSignal
) {
  const source = await getScenarioAssetBlob(block.assetId);
  signal.throwIfAborted();
  if (!source) throw new Error('Missing export image.');
  await assertImportableProjectImage(source);
  const blob =
    settings.content === 'frame' ? await renderGuideImageFrame(source, block, signal) : source;
  const bitmap = await createImageBitmap(blob);
  let canvas: OffscreenCanvas | undefined;
  try {
    signal.throwIfAborted();
    const ratio = settings.optimize
      ? Math.min(
          1,
          settings.maxEdge / Math.max(bitmap.width, bitmap.height),
          Math.sqrt(16_000_000 / (bitmap.width * bitmap.height))
        )
      : 1;
    const width = Math.max(1, Math.floor(bitmap.width * ratio));
    const height = Math.max(1, Math.floor(bitmap.height * ratio));
    let output = blob;
    if (settings.optimize) {
      canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Image rendering unavailable.');
      ctx.drawImage(bitmap, 0, 0, width, height);
      const encoded = await canvas.convertToBlob({ type: 'image/webp', quality: settings.quality });
      if (ratio < 1 || encoded.size < blob.size) output = encoded;
    }
    signal.throwIfAborted();
    const mime = PROJECT_ASSET_IMAGE_MIME_TYPES.find(
      (type) => type === output.type.toLowerCase().split(';', 1)[0]?.trim()
    );
    if (!mime) throw new Error('Unsupported export image.');
    return { blob: output, width, height, size: output.size, mime };
  } finally {
    bitmap.close();
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}

/** Measurement keeps metadata only; payloads are prepared again when the file is streamed. */
export async function measureHtmlImages(project: GuideProject, signal: AbortSignal) {
  const rasters: HtmlRaster[] = [];
  const indices = new Map<string, number>();
  const blocks = new Map<string, number>();
  for (const { block } of guideHtmlImages(project)) {
    const settings = resolveHtmlImageSettings(project, block);
    const key = htmlImageRasterKey(block, settings);
    let index = indices.get(key);
    if (index === undefined) {
      index = rasters.length;
      const { blob, ...metadata } = await prepareHtmlImage(block, settings, signal);
      void blob;
      rasters.push({ block, settings, ...metadata });
      indices.set(key, index);
    }
    blocks.set(block.id, index);
  }
  return { rasters, blocks };
}
