import { createOutputFilename } from '../../../workflows/file-naming/index';
import type { GuideReadingOptions } from '../reader-pages';
import { createDirectFileSink, type ExportSink } from '../../../composition/archive-transfer';
import { saveScenarioExportRecord } from '../../../composition/persistence/scenario/store/public';
import { measureHtmlImages, prepareHtmlImage, type HtmlRaster } from './html-images';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import type { Translate } from '../../../platform/i18n';
import { SCENARIO_PREVIEW_MAX_BYTES } from '../../../features/scenario/tour-player/preview-contract';
import { createScenarioHtmlCapture } from '../../../composition/persistence/scenario/export-artifacts';

/** Materializes the same streamed guide as download, without any file or history effects. */
export async function prepareGuideHtml(args: {
  project: GuideProject;
  t: Translate;
  theme: 'light' | 'dark';
  signal: AbortSignal;
  readAsset: (id: string) => Promise<Blob | undefined>;
}): Promise<Blob> {
  args.signal.throwIfAborted();
  const { buildGuideHtml } = await import('../html-document');
  const media = await measureHtmlImages(args.project, args.signal, args.readAsset);
  const document = await buildGuideHtml(args.project, args.t, args.theme, media);
  const chunks: Blob[] = [];
  let bytes = 0;
  const writable = new WritableStream<Uint8Array>({
    write(chunk) {
      bytes += chunk.byteLength;
      if (bytes > SCENARIO_PREVIEW_MAX_BYTES) throw new Error('Guide preview budget exceeded');
      chunks.push(new Blob([new Uint8Array(chunk)]));
    },
  });
  await writeGuideHtml({ writable }, document, args.signal, args.readAsset);
  args.signal.throwIfAborted();
  return new Blob(chunks, { type: 'text/html;charset=utf-8' });
}

/** Native file commit precedes advisory export history; raster bytes are streamed in bounded slices. */
export async function exportGuideHtml(args: {
  project: GuideProject;
  reading?: GuideReadingOptions;
  t: Translate;
  theme: 'light' | 'dark';
  signal: AbortSignal;
}): Promise<'saved' | 'history-failed'> {
  const filename = await createOutputFilename({
    category: 'documents',
    type: 'guide',
    title: args.project.name,
    extension: 'html',
  });
  const sink = await createDirectFileSink({
    filename,
    extension: '.html',
    mimeType: 'text/html',
    description: 'HTML',
  });
  const capture = await createScenarioHtmlCapture();
  let size = 0;
  try {
    args.signal.throwIfAborted();
    const { buildGuideHtml } = await import('../html-document');
    const media = await measureHtmlImages(args.project, args.signal);
    const document = await buildGuideHtml(args.project, args.t, args.theme, media, args.reading);
    size = await writeGuideHtml(sink, document, args.signal, undefined, capture.append);
    args.signal.throwIfAborted();
    await sink.close();
  } catch (error) {
    try {
      await sink.abort(error);
    } finally {
      await capture.abort();
    }
    throw error;
  }
  try {
    const { ref } = await capture.finalize();
    await saveScenarioExportRecord({
      projectId: args.project.id,
      filename,
      format: 'html',
      size,
      html: { mode: 'guide', ref },
    });
    return 'saved';
  } catch {
    return 'history-failed';
  }
}

async function writeGuideHtml(
  sink: Pick<ExportSink, 'writable'>,
  document: { html: string; rasters: HtmlRaster[] },
  signal: AbortSignal,
  readAsset?: (id: string) => Promise<Blob | undefined>,
  retain?: (chunk: Uint8Array) => Promise<void>
) {
  const writer = sink.writable.getWriter();
  const encoder = new TextEncoder();
  let size = 0;
  const write = async (text: string) => {
    signal.throwIfAborted();
    const bytes = encoder.encode(text);
    await writer.write(bytes);
    await retain?.(bytes);
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
      const { blob, mime } = await prepareHtmlImage(
        raster.block,
        raster.settings,
        signal,
        readAsset
      );
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
