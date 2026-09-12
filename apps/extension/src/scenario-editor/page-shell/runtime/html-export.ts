import {
  createDirectFileSink,
  sanitizeArchivePathSegment,
  type ExportSink,
} from '../../../composition/archive-transfer';
import {
  getScenarioAssetBlob,
  saveScenarioExportRecord,
} from '../../../composition/persistence/scenario/store/public';
import {
  assertImportableProjectImage,
  PROJECT_ASSET_IMAGE_MIME_TYPES,
} from '../../../features/media-hub/project-assets';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import type { Translate } from '../../../platform/i18n';

/** Native file commit precedes advisory export history; raster bytes are streamed in bounded slices. */
export async function exportGuideHtml(args: {
  project: GuideProject;
  t: Translate;
  theme: 'light' | 'dark';
  signal: AbortSignal;
}): Promise<'saved' | 'history-failed'> {
  const filename = `${sanitizeArchivePathSegment(args.project.name)}.html`;
  const sink = await createDirectFileSink({
    filename,
    extension: '.html',
    mimeType: 'text/html',
    description: 'HTML',
  });
  let size = 0;
  try {
    args.signal.throwIfAborted();
    const { buildGuideHtml } = await import('../html-document');
    const document = buildGuideHtml(args.project, args.t, args.theme);
    size = await writeGuideHtml(sink, document, args.signal);
    args.signal.throwIfAborted();
    await sink.close();
  } catch (error) {
    await sink.abort(error);
    throw error;
  }
  try {
    await saveScenarioExportRecord({ projectId: args.project.id, filename, format: 'html', size });
    return 'saved';
  } catch {
    return 'history-failed';
  }
}

async function writeGuideHtml(
  sink: ExportSink,
  document: { html: string; assets: string[] },
  signal: AbortSignal
) {
  const writer = sink.writable.getWriter();
  const encoder = new TextEncoder();
  let size = 0;
  const write = async (text: string) => {
    signal.throwIfAborted();
    const bytes = encoder.encode(text);
    await writer.write(bytes);
    size += bytes.byteLength;
  };
  try {
    let offset = 0;
    for (const match of document.html.matchAll(
      /src="data:image\/png;base64,SNIPTALE_ASSET_(\d+)"/g
    )) {
      await write(document.html.slice(offset, match.index));
      const assetId = document.assets[Number(match[1])];
      if (!assetId) throw new Error('Unknown export image.');
      const blob = await getScenarioAssetBlob(assetId);
      if (!blob) throw new Error('Missing export image.');
      await assertImportableProjectImage(blob);
      const mime = PROJECT_ASSET_IMAGE_MIME_TYPES.find(
        (type) => type === blob.type.toLowerCase().split(';', 1)[0]?.trim()
      );
      if (!mime) throw new Error('Unsupported export image.');
      await write(`src="data:${mime};base64,`);
      // Multiples of three avoid padding between independently encoded chunks.
      for (let start = 0; start < blob.size; start += 96 * 1024) {
        signal.throwIfAborted();
        const bytes = new Uint8Array(await blob.slice(start, start + 96 * 1024).arrayBuffer());
        let binary = '';
        for (const byte of bytes) binary += String.fromCharCode(byte);
        await write(btoa(binary));
      }
      await write('"');
      offset = match.index + match[0].length;
    }
    await write(document.html.slice(offset));
    return size;
  } finally {
    writer.releaseLock();
  }
}
