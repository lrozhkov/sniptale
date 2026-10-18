import { buildTourPlaybackPlan } from '../../../features/scenario/project/tour-playback-plan';
import { createOutputFilename } from '../../../workflows/file-naming/index';
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
import { getScenarioAssetBlob } from '../../../composition/persistence/scenario/store/public';
import { saveScenarioHtmlExport } from './html-export';
import { prepareTourRaster, type TourHtmlImageOptions } from './tour-html-images';

/** A detached artifact is the only input to both preview and save. */
export interface PreparedTourHtml {
  blob: Blob;
  filename: string;
  projectId: string;
  mediaCount: number;
}
const MEDIA_BUDGET = 128 * 1024 * 1024;

type TourHtmlBlockerCode =
  | 'invalid'
  | 'unsupported'
  | 'noActions'
  | 'invalidOptions'
  | 'missingImage'
  | 'targetReview'
  | 'missingTarget'
  | 'missingImageMedia'
  | 'missingAudioMedia'
  | 'conflictingMedia'
  | 'rasterFailed'
  | 'mediaBudget';

/** Disposable author-facing context; never enters diagnostics or persistence. */
export interface TourHtmlBlocker {
  code: TourHtmlBlockerCode;
  slideTitle?: string;
  slideNumber?: number;
  actionNumber?: number;
  buttonLabel?: string;
}

/** Fixed reason codes separate actionable preparation failures from raw browser errors. */
export class TourHtmlPreparationError extends Error {
  constructor(readonly blocker: TourHtmlBlocker) {
    super(blocker.code);
    this.name = 'TourHtmlPreparationError';
  }
}

function checkTour(tour: TourDocument) {
  const plan = buildTourPlaybackPlan(tour);
  if (!plan.actionCount) throw new TourHtmlPreparationError({ code: 'noActions' });
  const actions = new Set(plan.entries.map((entry) => entry.actionId));
  const slides = new Set(plan.entries.map((entry) => entry.sourceSlideId));
  for (const [index, slide] of tour.slides.entries()) {
    const context = { slideNumber: index + 1, slideTitle: slide.title };
    if (slide.kind === 'image' && slide.actions.length) {
      if (
        !slide.image &&
        (slide.actions.some((entry) => entry.type === 'hotspot') ||
          slide.masks.some((mask) => mask.kind === 'redact'))
      ) {
        const action = plan.entries.find(
          (entry) =>
            entry.sourceSlideId === slide.id &&
            entry.slide.kind === 'image' &&
            entry.slide.actions[0]?.type === 'hotspot'
        );
        throw new TourHtmlPreparationError({
          code: 'missingImage',
          ...context,
          ...(action?.ordinal ? { actionNumber: action.ordinal } : {}),
        });
      }
      if (slide.requiresTargetReview)
        throw new TourHtmlPreparationError({ code: 'targetReview', ...context });
    }
    if (slide.kind === 'navigation') {
      for (const button of slide.buttons) {
        const target = button.action;
        if (
          (target.kind === 'action' && !actions.has(target.actionId)) ||
          (target.kind === 'slide' && !slides.has(target.slideId))
        )
          throw new TourHtmlPreparationError({
            code: 'missingTarget',
            ...context,
            buttonLabel: button.label,
          });
      }
    }
  }
}

function mediaContext(tour: TourDocument, id: string): Omit<TourHtmlBlocker, 'code'> {
  const plan = buildTourPlaybackPlan(tour);
  for (const [index, slide] of tour.slides.entries()) {
    const context = { slideNumber: index + 1, slideTitle: slide.title };
    const image = slide.kind === 'image' ? slide.image : slide.background.image;
    if (image?.assetId === id) return context;
    for (const target of getTourNarrationTargets(slide)) {
      if (target.narration?.assetId !== id) continue;
      const action = plan.entries.find((entry) => entry.actionId === target.id);
      return {
        ...context,
        ...(action?.ordinal ? { actionNumber: action.ordinal } : {}),
        ...('label' in target ? { buttonLabel: target.label } : {}),
      };
    }
  }
  return {};
}

/** Reads immutable media sequentially; shared sources receive the union of privacy redactions. */
export async function prepareTourHtml(args: {
  project: GuideProject;
  options: TourHtmlImageOptions;
  labels: TourPlayerLabels;
  signal: AbortSignal;
  onProgress?: (done: number, total: number) => void;
  readAsset?: (id: string) => Promise<Blob | undefined>;
}): Promise<PreparedTourHtml> {
  const parsed = parseTourDocument(args.project.tour);
  if (parsed.status !== 'ok')
    throw new TourHtmlPreparationError({
      code: parsed.status === 'unsupported' ? 'unsupported' : 'invalid',
    });
  checkTour(parsed.document);
  if (
    !Number.isFinite(args.options.maxEdge) ||
    args.options.maxEdge < 320 ||
    args.options.maxEdge > 4096 ||
    !Number.isFinite(args.options.quality) ||
    args.options.quality < 0.5 ||
    args.options.quality > 1
  )
    throw new TourHtmlPreparationError({ code: 'invalidOptions' });
  const tour = structuredClone(parsed.document);
  const { redactions, roles } = collectTourMedia(tour);
  tour.slides = tour.slides.filter((slide) => slide.kind === 'navigation' || slide.actions.length);
  const assets: { id: string; mime: string; blob: Blob }[] = [];
  let inputSize = 0,
    outputSize = 0;
  args.onProgress?.(0, roles.size);
  for (const [id, kind] of roles) {
    args.signal.throwIfAborted();
    const context = mediaContext(parsed.document, id);
    let source: Blob | undefined;
    try {
      source = await (args.readAsset ?? getScenarioAssetBlob)(id);
    } catch {
      args.signal.throwIfAborted();
      throw new TourHtmlPreparationError({
        code: kind === 'image' ? 'missingImageMedia' : 'missingAudioMedia',
        ...context,
      });
    }
    args.signal.throwIfAborted();
    if (!source?.size)
      throw new TourHtmlPreparationError({
        code: kind === 'image' ? 'missingImageMedia' : 'missingAudioMedia',
        ...context,
      });
    inputSize += source.size;
    if (inputSize > MEDIA_BUDGET)
      throw new TourHtmlPreparationError({ code: 'mediaBudget', ...context });
    let blob = source;
    if (kind === 'image') {
      try {
        const prepared = await prepareTourRaster(
          source,
          redactions.get(id) ?? [],
          args.options,
          args.signal
        );
        blob = prepared.blob;
      } catch {
        args.signal.throwIfAborted();
        throw new TourHtmlPreparationError({ code: 'rasterFailed', ...context });
      }
      markBakedRedactions(tour, id);
    }
    outputSize += blob.size;
    if (outputSize > MEDIA_BUDGET)
      throw new TourHtmlPreparationError({ code: 'mediaBudget', ...context });
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
    filename: await createOutputFilename({
      category: 'documents',
      type: 'tour',
      title: args.project.name,
      extension: 'html',
    }),
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
  return saveScenarioHtmlExport({
    projectId: artifact.projectId,
    filename: artifact.filename,
    mode: 'tour',
    signal,
    write: async (sink, retain) => {
      const writer = sink.writable.getWriter();
      try {
        for (let offset = 0; offset < artifact.blob.size; offset += 96 * 1024) {
          signal.throwIfAborted();
          const bytes = new Uint8Array(
            await artifact.blob.slice(offset, offset + 96 * 1024).arrayBuffer()
          );
          await writer.write(bytes);
          await retain(bytes);
        }
      } finally {
        writer.releaseLock();
      }
      return artifact.blob.size;
    },
  });
}

/** References and shared-source privacy are resolved together before reading media. */
function collectTourMedia(tour: TourDocument) {
  const redactions = new Map<string, TourMask[]>();
  const roles = new Map<string, 'image' | 'audio'>();
  for (const image of getTourImages({
    ...tour,
    slides: tour.slides.filter((slide) => slide.kind === 'navigation' || slide.actions.length),
  }))
    roles.set(image.assetId, 'image');
  for (const slide of tour.slides) {
    if (slide.kind === 'image' && slide.image) {
      const masks = redactions.get(slide.image.assetId) ?? [];
      masks.push(...slide.masks.filter((mask) => mask.kind === 'redact'));
      redactions.set(slide.image.assetId, masks);
    }
    for (const { narration } of getTourNarrationTargets(slide)) {
      if (!narration) continue;
      if (roles.get(narration.assetId) === 'image')
        throw new TourHtmlPreparationError({ code: 'conflictingMedia' });
      roles.set(narration.assetId, 'audio');
    }
  }
  if (tour.backgroundMusic) {
    const id = tour.backgroundMusic.assetId;
    if (roles.get(id) === 'image') throw new TourHtmlPreparationError({ code: 'conflictingMedia' });
    roles.set(id, 'audio');
  }
  return { redactions, roles };
}

function markBakedRedactions(tour: TourDocument, id: string) {
  for (const slide of tour.slides) {
    if (slide.kind === 'image' && slide.image?.assetId === id)
      slide.masks = slide.masks.filter((mask) => mask.kind !== 'redact');
  }
}
