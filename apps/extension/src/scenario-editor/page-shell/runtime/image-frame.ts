import { assertImportableProjectImage } from '../../../features/media-hub/project-assets';
import type { GuideImageBlock } from '@sniptale/runtime-contracts/scenario/types/guide';

/** Renders exactly the visible configured frame with bounded output and sequential native cleanup. */
export async function renderGuideImageFrame(
  blob: Blob,
  block: GuideImageBlock,
  signal: AbortSignal,
  maxEdge: 1024 | 4096 = 4096
): Promise<Blob> {
  await assertImportableProjectImage(blob);
  signal.throwIfAborted();
  const bitmap = await createImageBitmap(blob);
  let canvas: OffscreenCanvas | undefined;
  try {
    signal.throwIfAborted();
    const ratio = Math.min(
      1,
      maxEdge / Math.max(block.frame.width, block.frame.height),
      Math.sqrt(16_000_000 / (block.frame.width * block.frame.height))
    );
    const width = Math.max(1, Math.floor(block.frame.width * ratio));
    const height = Math.max(1, Math.floor(block.frame.height * ratio));
    canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Image rendering unavailable.');
    const fit =
      block.fit === 'cover'
        ? Math.max(width / bitmap.width, height / bitmap.height)
        : Math.min(width / bitmap.width, height / bitmap.height);
    ctx.translate(
      width * (0.5 + block.contentTransform.x),
      height * (0.5 + block.contentTransform.y)
    );
    ctx.scale(block.contentTransform.scale, block.contentTransform.scale);
    ctx.translate(-width / 2, -height / 2);
    // Replaced-image content is clipped to its box before that box is transformed.
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    ctx.clip();
    ctx.drawImage(
      bitmap,
      (width - bitmap.width * fit) / 2,
      (height - bitmap.height * fit) / 2,
      bitmap.width * fit,
      bitmap.height * fit
    );
    const raster = await canvas.convertToBlob({ type: 'image/png' });
    signal.throwIfAborted();
    return raster;
  } finally {
    bitmap.close();
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}
