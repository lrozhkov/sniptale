import type {
  VideoObjectTrack,
  VideoObjectTrackAnalysisMetadata,
  VideoObjectTrackCorrectionAnchor,
  VideoObjectTrackSample,
} from './types';

export const VIDEO_PROJECT_VISUAL_CURSOR_TRACK_ID = 'visual-cursor';

function isUsableSample(sample: VideoObjectTrackSample): boolean {
  return (
    Number.isFinite(sample.time) &&
    Number.isFinite(sample.x) &&
    Number.isFinite(sample.y) &&
    typeof sample.visible === 'boolean' &&
    Number.isFinite(sample.confidence)
  );
}

function sortSamples(samples: VideoObjectTrackSample[]): VideoObjectTrackSample[] {
  return [...samples].filter(isUsableSample).sort((first, second) => first.time - second.time);
}

function sortCorrectionAnchors(
  anchors: readonly VideoObjectTrackCorrectionAnchor[] | undefined
): VideoObjectTrackCorrectionAnchor[] | undefined {
  if (!anchors) return undefined;
  return anchors
    .filter(
      (anchor) =>
        Number.isFinite(anchor.time) && Number.isFinite(anchor.x) && Number.isFinite(anchor.y)
    )
    .map((anchor) => ({
      ...anchor,
      ...(anchor.confidence === undefined
        ? {}
        : { confidence: Math.min(1, Math.max(0, anchor.confidence)) }),
    }))
    .sort((first, second) => first.time - second.time);
}

function normalizeAnalysisMetadata(
  analysis: VideoObjectTrackAnalysisMetadata | undefined
): VideoObjectTrackAnalysisMetadata | undefined {
  if (
    !analysis ||
    analysis.sourceAssetId.length === 0 ||
    analysis.sourceClipId.length === 0 ||
    !Number.isFinite(analysis.projectStartTime) ||
    !Number.isFinite(analysis.projectEndTime) ||
    !Number.isFinite(analysis.sampleFps) ||
    analysis.sampleFps <= 0
  ) {
    return undefined;
  }
  return {
    ...analysis,
    ...(analysis.mode === 'coarseKeyframes' || analysis.mode === 'visualFrames'
      ? { mode: analysis.mode }
      : {}),
    ...(analysis.quality ? { quality: normalizeTrackQuality(analysis.quality) } : {}),
    projectEndTime: Math.max(analysis.projectStartTime, analysis.projectEndTime),
  };
}

function normalizeTrackQuality(
  quality: NonNullable<VideoObjectTrackAnalysisMetadata['quality']>
): NonNullable<VideoObjectTrackAnalysisMetadata['quality']> {
  return {
    coverageRatio: clamp01(quality.coverageRatio),
    jumpCount: Math.max(0, Math.floor(quality.jumpCount)),
    medianConfidence: clamp01(quality.medianConfidence),
    status: ['needsAnchor', 'unusable', 'usable'].includes(quality.status)
      ? quality.status
      : 'needsAnchor',
    visibleSamples: Math.max(0, Math.floor(quality.visibleSamples)),
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

export function normalizeVideoObjectTrack(track: VideoObjectTrack): VideoObjectTrack {
  const correctionAnchors = sortCorrectionAnchors(track.correctionAnchors);
  const analysis = normalizeAnalysisMetadata(track.analysis);
  const normalizedTrack: VideoObjectTrack = {
    ...track,
    id: track.id === 'cursorTrack' ? 'object-cursorTrack' : track.id,
    ...(track.hidden ? { hidden: true } : {}),
    samples: sortSamples(track.samples).map((sample) => ({
      ...sample,
      confidence: Math.min(1, Math.max(0, sample.confidence)),
    })),
    ...(track.role === 'cameraCursor' ? { role: track.role } : {}),
  };
  if (analysis) normalizedTrack.analysis = analysis;
  else delete normalizedTrack.analysis;
  if (correctionAnchors) normalizedTrack.correctionAnchors = correctionAnchors;
  else delete normalizedTrack.correctionAnchors;
  return normalizedTrack;
}

export function isInternalVideoObjectTrack(track: Pick<VideoObjectTrack, 'hidden'>): boolean {
  return track.hidden === true;
}

export function isCameraCursorObjectTrack(
  track: Pick<VideoObjectTrack, 'hidden' | 'kind' | 'role' | 'source'>
): boolean {
  return track.hidden === true && track.role === 'cameraCursor' && track.kind === 'visualCursor';
}
