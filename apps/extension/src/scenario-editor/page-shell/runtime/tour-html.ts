import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import type { TourDocument, TourMask } from '@sniptale/runtime-contracts/scenario/types/tour';
import { parseTourDocument } from '@sniptale/runtime-contracts/scenario/tour-parser';
import {
  getTourImages,
  getTourNarrationTargets,
} from '../../../features/scenario/project/tour-resources';
import {
  buildTourPlayerBlob,
  type TourPlayerLabels,
} from '../../../features/scenario/tour-player/public';
import {
  getScenarioAssetBlob,
  saveScenarioExportRecord,
} from '../../../composition/persistence/scenario/store/public';
import {
  createDirectFileSink,
  sanitizeArchivePathSegment,
} from '../../../composition/archive-transfer';
import { prepareTourRaster, type TourHtmlImageOptions } from './tour-html-images';

/** A detached artifact is the only input to both preview and save. */
export interface PreparedTourHtml {
  blob: Blob;
  filename: string;
  projectId: string;
  mediaCount: number;
}
const MEDIA_BUDGET = 128 * 1024 * 1024;

/** Reads immutable media sequentially; shared sources receive the union of privacy redactions. */
export async function prepareTourHtml(args: {
  project: GuideProject;
  options: TourHtmlImageOptions;
  labels: TourPlayerLabels;
  signal: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}): Promise<PreparedTourHtml> {
  const parsed = parseTourDocument(args.project.tour);
  if (parsed.status !== 'ok' || !parsed.document.slides.length) throw new Error('Invalid tour');
  if (
    !Number.isFinite(args.options.maxEdge) ||
    args.options.maxEdge < 320 ||
    args.options.maxEdge > 4096 ||
    !Number.isFinite(args.options.quality) ||
    args.options.quality < 0.5 ||
    args.options.quality > 1
  )
    throw new Error('Invalid export options');
  const tour = structuredClone(parsed.document);
  if (
    tour.slides.some(
      (slide) => slide.kind === 'image' && (!slide.image || slide.requiresTargetReview)
    )
  )
    throw new Error('Incomplete tour');
  const { redactions, roles } = collectTourMedia(tour);
  const assets: { id: string; mime: string; blob: Blob }[] = [];
  let inputSize = 0,
    outputSize = 0;
  args.onProgress?.(0, roles.size);
  for (const [id, kind] of roles) {
    args.signal.throwIfAborted();
    const source = await getScenarioAssetBlob(id);
    args.signal.throwIfAborted();
    if (!source?.size) throw new Error('Missing tour media');
    inputSize += source.size;
    if (inputSize > MEDIA_BUDGET) throw new Error('Tour media budget exceeded');
    let blob = source;
    if (kind === 'image') {
      const prepared = await prepareTourRaster(
        source,
        redactions.get(id) ?? [],
        args.options,
        args.signal
      );
      blob = prepared.blob;
      markBakedRedactions(tour, id);
    }
    outputSize += blob.size;
    if (outputSize > MEDIA_BUDGET) throw new Error('Tour media budget exceeded');
    assets.push({ id, blob, mime: blob.type.toLowerCase().split(';', 1)[0]!.trim() });
    args.onProgress?.(assets.length, roles.size);
  }
  const blob = await buildTourPlayerBlob({
    tour,
    assets,
    title: args.project.name,
    labels: args.labels,
    signal: args.signal,
  });
  return {
    blob,
    filename: `${sanitizeArchivePathSegment(args.project.name)}.html`,
    projectId: args.project.id,
    mediaCount: assets.length,
  };
}

/** Saves exactly the previewed bytes; failed writes abort before advisory history. */
export async function saveTourHtml(
  artifact: PreparedTourHtml,
  signal: AbortSignal
): Promise<'saved' | 'history-failed'> {
  signal.throwIfAborted();
  const sink = await createDirectFileSink({
    filename: artifact.filename,
    extension: '.html',
    mimeType: 'text/html',
    description: 'HTML',
  });
  try {
    const writer = sink.writable.getWriter();
    try {
      for (let offset = 0; offset < artifact.blob.size; offset += 96 * 1024) {
        signal.throwIfAborted();
        await writer.write(
          new Uint8Array(await artifact.blob.slice(offset, offset + 96 * 1024).arrayBuffer())
        );
      }
    } finally {
      writer.releaseLock();
    }
    signal.throwIfAborted();
    await sink.close();
  } catch (error) {
    await sink.abort(error);
    throw error;
  }
  try {
    await saveScenarioExportRecord({
      projectId: artifact.projectId,
      filename: artifact.filename,
      format: 'html',
      size: artifact.blob.size,
    });
    return 'saved';
  } catch {
    return 'history-failed';
  }
}

/** References and shared-source privacy are resolved together before reading media. */
function collectTourMedia(tour: TourDocument) {
  const redactions = new Map<string, TourMask[]>();
  const roles = new Map<string, 'image' | 'audio'>();
  for (const image of getTourImages(tour)) roles.set(image.assetId, 'image');
  for (const slide of tour.slides) {
    if (slide.kind === 'image' && slide.image) {
      const masks = redactions.get(slide.image.assetId) ?? [];
      masks.push(...slide.masks.filter((mask) => mask.kind === 'redact'));
      redactions.set(slide.image.assetId, masks);
    }
    for (const { narration } of getTourNarrationTargets(slide)) {
      if (!narration) continue;
      if (roles.get(narration.assetId) === 'image') throw new Error('Conflicting media');
      roles.set(narration.assetId, 'audio');
    }
  }
  return { redactions, roles };
}

function markBakedRedactions(tour: TourDocument, id: string) {
  for (const slide of tour.slides) {
    const image = slide.kind === 'image' ? slide.image : slide.background.image;
    if (image?.assetId !== id) continue;
    if (slide.kind === 'image') {
      for (const mask of slide.masks) {
        // Preserve mask identity and narration, but the pixels are already irreversible.
        if (mask.kind === 'redact') {
          mask.kind = 'highlight';
          mask.opacity = 0;
          delete mask.paint;
        }
      }
    }
  }
}
