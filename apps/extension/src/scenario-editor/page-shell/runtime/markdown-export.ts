import {
  createArchiveWriter,
  createDirectFileSink,
  sanitizeArchivePathSegment,
} from '../../../composition/archive-transfer';
import {
  getScenarioAssetBlob,
  saveScenarioExportRecord,
} from '../../../composition/persistence/scenario/store/public';
import { assertImportableProjectImage } from '../../../features/media-hub/project-assets';
import type {
  GuideImageBlock,
  GuideProject,
} from '@sniptale/runtime-contracts/scenario/types/guide';
import type { Translate } from '../../../platform/i18n';
import { buildGuideMarkdown } from '../markdown-document';

/** Owns one ZIP transaction, sequential frame rendering, and post-commit export history. */
export async function exportGuideMarkdown(args: {
  project: GuideProject;
  t: Translate;
  signal: AbortSignal;
}): Promise<'saved' | 'history-failed'> {
  const filename = `${sanitizeArchivePathSegment(args.project.name)}.zip`;
  const sink = await createDirectFileSink({
    filename,
    extension: '.zip',
    mimeType: 'application/zip',
    description: args.t('scenario.editor.guideMarkdownArchive'),
  });
  let size = 0;
  let archive: ReturnType<typeof createArchiveWriter> | undefined;
  try {
    archive = createArchiveWriter(sink, {
      onBytesWritten: (bytes) => {
        size = bytes;
      },
    });
    args.signal.throwIfAborted();
    const document = buildGuideMarkdown(args.project, args.t);
    await archive.addText('guide.md', document.markdown, { signal: args.signal });
    for (const image of document.images) {
      args.signal.throwIfAborted();
      const blob = await getScenarioAssetBlob(image.block.assetId);
      if (!blob) throw new Error('Missing export image.');
      const raster = await renderFrame(blob, image.block, args.signal);
      await archive.addBlob(image.path, raster, { signal: args.signal });
    }
    args.signal.throwIfAborted();
    await archive.close();
  } catch (error) {
    if (archive) await archive.abort(error);
    else await sink.abort(error);
    throw error;
  }
  try {
    await saveScenarioExportRecord({
      projectId: args.project.id,
      filename,
      format: 'markdown',
      size,
    });
    return 'saved';
  } catch {
    return 'history-failed';
  }
}

async function renderFrame(blob: Blob, block: GuideImageBlock, signal: AbortSignal): Promise<Blob> {
  await assertImportableProjectImage(blob);
  signal.throwIfAborted();
  const bitmap = await createImageBitmap(blob);
  let canvas: OffscreenCanvas | undefined;
  try {
    signal.throwIfAborted();
    const ratio = Math.min(
      1,
      4096 / Math.max(block.frame.width, block.frame.height),
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
