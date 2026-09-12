import { renderGuideImageFrame } from './image-frame';
import {
  createArchiveWriter,
  createDirectFileSink,
  sanitizeArchivePathSegment,
} from '../../../composition/archive-transfer';
import {
  getScenarioAssetBlob,
  saveScenarioExportRecord,
} from '../../../composition/persistence/scenario/store/public';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
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
      const raster = await renderGuideImageFrame(blob, image.block, args.signal);
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
