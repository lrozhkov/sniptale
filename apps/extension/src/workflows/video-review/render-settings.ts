import type { VideoSample } from 'mediabunny';
import type { ReviewFrameExportInput } from './render-export-input';
import { buildReviewTimeMap } from '../../features/video/review/timeline';
import type { ReviewEdit } from '../../features/video/review/types';
import { videoExportSampleWindows } from '../../features/video/project/export/size-estimate';
import { reviewRenderFrameSchedule, type ReviewFrameWindow } from './render-schedule';
import { QuickEditExportUnavailable } from './export-unavailable';
import { resolveVideoExportDimensions } from '../../features/video/project/export/output-dimensions';
import {
  computeQuickEditSceneSize,
  resolveReviewCameraConflicts,
} from '../../features/video/review/advanced/scene';
import { parseQuickEditCanvas } from '../../features/video/review/advanced/canvas';
import { resolveQuickEditEffectiveState } from '../../features/video/review/advanced/effective';
import { VideoQuality, VideoResolutionPreset } from '@sniptale/runtime-contracts/video/types/types';
import type { ReviewMediaIndex, ReviewRenderSettings } from './media-index';
import type { PresentationRate } from '../../features/video/review/presentation-sequence';
import type { QuickEditAdvancedState } from '../../features/video/review/advanced/types';
import { resolveReviewRenderBitrate, type ReviewOutputCodec } from './render-codec';

export { resolveReviewRenderBitrate, resolveReviewVideoEncoderConfig } from './render-codec';

/** Direct render and probe entrypoints must admit the shared camera plan before acquiring resources. */
export function assertReviewCameraAdmission(
  args: Pick<
    ReviewFrameExportInput,
    'advanced' | 'index' | 'edits' | 'fragmentOffset' | 'cursorFacts' | 'renderSettings'
  >
): void {
  const effective = resolveQuickEditEffectiveState(args.advanced, args.cursorFacts);
  if (!effective.zoomRegions.some((region) => region.cursorFocus)) return;
  const duration = buildReviewTimeMap(args.index.duration, args.edits).at(-1)?.resultEnd ?? 0;
  const interval = { start: args.fragmentOffset, end: args.fragmentOffset + duration };
  const source =
    args.cursorFacts?.source ??
    (args.index.width !== undefined &&
    args.index.height !== undefined &&
    Number.isFinite(args.index.width) &&
    Number.isFinite(args.index.height) &&
    args.index.width > 0 &&
    args.index.height > 0
      ? { width: args.index.width, height: args.index.height }
      : undefined);
  if (!source) {
    const conflicts = resolveReviewCameraConflicts(effective.zoomRegions, undefined, interval);
    if (conflicts.length) throw new QuickEditExportUnavailable(['camera-follow'], [], conflicts);
    return;
  }
  const profile = resolveReviewOutputProfile(
    { ...args.index, width: source.width, height: source.height },
    args.advanced,
    args.renderSettings
  );
  const conflicts = resolveReviewCameraConflicts(
    effective.zoomRegions,
    {
      source,
      background: effective.background,
      canvas: effective.canvas,
      windowHeader: effective.windowHeader,
      output: { width: profile.width, height: profile.height },
    },
    interval
  );
  if (conflicts.length) throw new QuickEditExportUnavailable(['camera-follow'], [], conflicts);
}

const RATE_ERROR = 1e-9;
const MAX_RATE_DENOMINATOR = 1_000_000_000;

/** Approximation of a selected measurement, not identification of a source's native timebase. */
function outputRate(fps: number): PresentationRate {
  if (!Number.isFinite(fps) || fps < 1 || fps > 120) throw new Error('Invalid output frame rate.');
  let previousNumerator = 0,
    numerator = 1;
  let previousDenominator = 1,
    denominator = 0;
  let remainder = fps;
  for (;;) {
    const whole = Math.floor(remainder);
    if (
      !Number.isFinite(whole) ||
      (denominator > 0 &&
        whole > Math.floor((MAX_RATE_DENOMINATOR - previousDenominator) / denominator))
    )
      break;
    const nextNumerator = whole * numerator + previousNumerator;
    const nextDenominator = whole * denominator + previousDenominator;
    if (Math.abs(nextNumerator / nextDenominator - fps) <= RATE_ERROR) {
      return { numerator: nextNumerator, denominator: nextDenominator };
    }
    previousNumerator = numerator;
    numerator = nextNumerator;
    previousDenominator = denominator;
    denominator = nextDenominator;
    remainder = 1 / (remainder - whole);
  }
  // This grid bounds error to 0.5e-9fps; all products stay below 120e9, safely integral.
  numerator = Math.round(fps * MAX_RATE_DENOMINATOR);
  denominator = MAX_RATE_DENOMINATOR;
  let a = numerator,
    b = denominator;
  while (b !== 0) {
    const next = a % b;
    a = b;
    b = next;
  }
  return { numerator: numerator / a, denominator: denominator / a };
}

/** The output profile is independent of the source container and preserves the scene aspect ratio. */
export function resolveReviewOutputProfile(
  index: ReviewMediaIndex,
  advanced: QuickEditAdvancedState,
  settings?: ReviewRenderSettings,
  video?: 'render'
): ReturnType<typeof resolveRenderProfile>;
export function resolveReviewOutputProfile(
  index: ReviewMediaIndex,
  advanced: QuickEditAdvancedState,
  settings: ReviewRenderSettings | undefined,
  video: 'copy' | 'render'
): Omit<ReturnType<typeof resolveRenderProfile>, 'codec'> & {
  codec: ReviewMediaIndex['videoCodec'] | null;
};
export function resolveReviewOutputProfile(
  index: ReviewMediaIndex,
  advanced: QuickEditAdvancedState,
  settings?: ReviewRenderSettings,
  video: 'copy' | 'render' = 'render'
) {
  const profile = resolveRenderProfile(index, advanced, settings);
  return video === 'copy'
    ? {
        ...profile,
        codec: index.videoCodec,
        width: index.width ?? profile.width,
        height: index.height ?? profile.height,
      }
    : profile;
}

function resolveRenderProfile(
  index: ReviewMediaIndex,
  advanced: QuickEditAdvancedState,
  settings?: ReviewRenderSettings
) {
  if (
    settings &&
    ((settings.quality !== undefined && !Object.values(VideoQuality).includes(settings.quality)) ||
      ![0, 24, 30, 60].includes(settings.frameRate) ||
      (settings.frameRateMode !== undefined &&
        settings.frameRateMode !== 'constant' &&
        settings.frameRateMode !== 'adaptive') ||
      (settings.frameRateMode === 'adaptive' && settings.frameRate !== 60) ||
      (settings.resolution !== undefined &&
        !Object.values(VideoResolutionPreset).includes(settings.resolution)) ||
      (settings.format !== undefined && settings.format !== 'mp4' && settings.format !== 'webm'))
  )
    throw new Error('Invalid export settings.');
  const format = settings?.format ?? index.container;
  const codecs = reviewOutputCodecs(index, format);
  const codec = settings?.codec ?? codecs[0] ?? null;
  const scene = resolveReviewSceneOutput(
    { width: index.width ?? 1920, height: index.height ?? 1080 },
    resolveQuickEditEffectiveState(advanced),
    settings?.resolution ?? VideoResolutionPreset.SOURCE
  );
  const dimensions = scene.output;
  const rate = outputRate(settings?.frameRate || (index.frameRate ?? 30));
  const fps = rate.numerator / rate.denominator;
  return {
    format,
    codec,
    ...dimensions,
    dimensionsSupported: scene.supported,
    fps,
    rate,
    bitrate: resolveReviewRenderBitrate({ ...dimensions, fps }, settings?.quality),
  };
}

/** Admitted codecs per container; no source-codec substitution for an explicit unsupported choice. */
export function reviewOutputCodecs(
  index: ReviewMediaIndex,
  format: 'mp4' | 'webm'
): ReviewOutputCodec[] {
  const allowed: readonly ReviewOutputCodec[] =
    format === 'mp4' ? ['avc', 'hevc', 'vp9'] : ['vp9', 'vp8'];
  const probed =
    index.outputCodecs?.[format] ??
    (format === index.container
      ? (index.supportedVideoCodecs ??
        (index.processedVideoCodec ? [index.processedVideoCodec] : []))
      : []);
  return allowed.filter((codec) => probed.includes(codec));
}

/** Fit the complete scene, including decoration, before probing or allocating the encoder canvas. */
export function resolveReviewSceneOutput(
  source: { width: number; height: number },
  settings: {
    canvas?: QuickEditAdvancedState['canvas'];
    background: QuickEditAdvancedState['background'];
    windowHeader?: QuickEditAdvancedState['windowHeader'];
  },
  resolution: VideoResolutionPreset
) {
  const base = settings.canvas ?? source;
  const scene = computeQuickEditSceneSize({
    source,
    canvas: base,
    background: settings.background,
    windowHeader: settings.windowHeader,
  });
  const output = resolveVideoExportDimensions(scene.width, scene.height, resolution);
  const scale = output.width / base.width;
  const canvas = { width: output.width, height: base.height * scale };
  const background = settings.background.enabled
    ? {
        ...settings.background,
        layout: {
          ...settings.background.layout,
          ...(settings.background.layout.blur === undefined
            ? {}
            : { blur: settings.background.layout.blur * scale }),
          padding: settings.background.layout.padding * scale,
          cornerRadius: settings.background.layout.cornerRadius * scale,
        },
      }
    : settings.background;
  return {
    canvas,
    output,
    background,
    scale,
    supported: !settings.windowHeader || parseQuickEditCanvas(output) !== null,
  };
}

export interface ReviewRenderPreparation {
  codec: ReviewOutputCodec;
  container: 'mp4' | 'webm';
  resolution: VideoResolutionPreset;
  quality: NonNullable<ReviewRenderSettings['quality']>;
  fps: number;
  windows: ReviewFrameWindow[];
  effective: ReturnType<typeof resolveQuickEditEffectiveState>;
}

/** Frame rendering validates ranges, while packet copying alone requires keyframes. */
export function prepareReviewRender(args: {
  frameProbe?: { add(sample: VideoSample): Promise<void> };
  renderSettings?: ReviewRenderSettings | undefined;
  index: ReviewMediaIndex;
  edits: readonly ReviewEdit[];
  advanced: QuickEditAdvancedState;
  cursorFacts?: ReviewFrameExportInput['cursorFacts'];
}): ReviewRenderPreparation {
  let validRanges = true;
  try {
    buildReviewTimeMap(args.index.duration, args.edits);
  } catch {
    validRanges = false;
  }
  if (!validRanges) throw new Error('Export requires valid non-overlapping edit ranges.');
  const container = args.renderSettings?.format ?? args.index.container;
  const supported = reviewOutputCodecs(args.index, container);
  const codec = args.renderSettings?.codec ?? supported[0];
  if (!codec || !supported.includes(codec)) throw new QuickEditExportUnavailable(['video-encoder']);
  const { fps } = resolveReviewOutputProfile(args.index, args.advanced, args.renderSettings);
  const duration = buildReviewTimeMap(args.index.duration, args.edits).at(-1)?.resultEnd ?? 0;
  const windows = reviewRenderFrameSchedule(
    args.index.duration,
    args.edits,
    fps,
    args.frameProbe ? videoExportSampleWindows(duration, fps) : undefined
  );
  if (!windows.length) throw new Error('The edited video is empty.');
  return {
    codec,
    container,
    resolution: args.renderSettings?.resolution ?? VideoResolutionPreset.SOURCE,
    quality: args.renderSettings?.quality ?? 'HIGH',
    fps,
    windows,
    effective: resolveQuickEditEffectiveState(args.advanced, args.cursorFacts),
  };
}
