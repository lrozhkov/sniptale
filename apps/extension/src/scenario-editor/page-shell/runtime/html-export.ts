import {
  createDirectFileSink,
  sanitizeArchivePathSegment,
  type ExportSink,
} from '../../../composition/archive-transfer';
import { saveScenarioExportRecord } from '../../../composition/persistence/scenario/store/public';
import { measureHtmlImages, prepareHtmlImage, type HtmlRaster } from './html-images';
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
    const media = await measureHtmlImages(args.project, args.signal);
    const document = await buildGuideHtml(args.project, args.t, args.theme, media);
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
  document: { html: string; rasters: HtmlRaster[] },
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
      /href="data:image\/[a-z]+;base64,SNIPTALE_ASSET_(\d+)"/g
    )) {
      await write(document.html.slice(offset, match.index));
      const raster = document.rasters[Number(match[1])];
      if (!raster) throw new Error('Unknown export image.');
      const { blob, mime } = await prepareHtmlImage(raster.block, raster.settings, signal);
      await write(`href="data:${mime};base64,`);
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

/** Exact UTF-8 size includes fonts, fixed viewer and each unique base64 payload once. */
export async function measureGuideHtml(args: {
  project: GuideProject;
  t: Translate;
  theme: 'light' | 'dark';
  signal: AbortSignal;
}) {
  const media = await measureHtmlImages(args.project, args.signal);
  const { buildGuideHtml } = await import('../html-document');
  const document = await buildGuideHtml(args.project, args.t, args.theme, media);
  args.signal.throwIfAborted();
  const size =
    new TextEncoder().encode(document.html).length +
    media.rasters.reduce(
      (sum, raster, index) =>
        sum + 4 * Math.ceil(raster.size / 3) - `SNIPTALE_ASSET_${index}`.length,
      0
    );
  return { size, ...media };
}
