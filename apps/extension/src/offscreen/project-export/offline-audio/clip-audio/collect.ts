import { composeSourceAudioRanges } from '../../../../features/video/audio/source-attenuation';
import { getProjectSourceAudioRanges } from '../../../../features/video/project/source-audio';
import { getClipGainRange } from '../../../../features/video/project/timeline/audio';
import { getProjectTrackAudioVolume } from '../../../../features/video/project/timeline/track-audio';
import { getProjectOriginalAudioRanges } from '../../../../features/video/project/timeline/original-audio';
import { buildProjectTransitionSegments } from '../../../../features/video/project/transition/project';
import { resolveProjectExportRange } from '../../../../features/video/project/export/range';
import { resolveEffectRuntimeAudioPlans } from '../../../../features/video/composition/effect-runtime/audio/plan';
import { getSourceTimedClipSourceOffset } from '../../../../features/video/project/timeline';
import type {
  VideoProject,
  VideoProjectAudioClip,
  VideoProjectExportSettings,
  VideoProjectVideoClip,
} from '../../../../features/video/project/types/index';
import { shouldRenderClipAudio } from '../../media/audio';

import type { OfflineAudioRenderableClip } from './types';

export function collectRenderableAudioClips(
  project: VideoProject,
  settings?: Pick<VideoProjectExportSettings, 'rangeEndSeconds' | 'rangeStartSeconds'>
): OfflineAudioRenderableClip[] {
  const range = settings ? resolveProjectExportRange(project, settings) : null;

  const mediaClips = project.clips.filter(
    (clip): clip is VideoProjectAudioClip | VideoProjectVideoClip =>
      shouldRenderClipAudio(project, clip)
  );
  const segments = buildProjectTransitionSegments(project);
  const preparedMediaClips = mediaClips.map((clip) => {
    const gain = getClipGainRange(clip);
    const audioTransitions = segments
      .filter((segment) => segment.leadingClipId === clip.id || segment.trailingClipId === clip.id)
      .map((segment) => ({
        start: segment.start,
        end: segment.end,
        easing: segment.transition.easing,
        incoming: segment.trailingClipId === clip.id,
      }));
    const originalAudioRanges = composeSourceAudioRanges(
      getProjectSourceAudioRanges(project, clip),
      getProjectOriginalAudioRanges(project, clip)
    );
    return {
      ...clip,
      volume: getProjectTrackAudioVolume(project, clip.trackId),
      audioGainStart: gain.start,
      audioGainEnd: gain.end,
      volumeEnvelopeStart: gain.start,
      volumeEnvelopeEnd: gain.end,
      ...(audioTransitions.length ? { audioTransitions } : {}),
      originalAudioRanges,
      audioFadePhase: { offset: 0, duration: clip.duration },
    };
  });
  const clips: OfflineAudioRenderableClip[] = [
    ...preparedMediaClips,
    ...resolveEffectRuntimeAudioPlans(project),
  ];

  return clips.flatMap((clip) => {
    if (!range) {
      return [clip];
    }

    const clipped = clipAudioClipToExportRange(clip, range);
    return clipped ? [clipped] : [];
  });
}

export function clipAudioClipToExportRange(
  clip: OfflineAudioRenderableClip,
  range: { end: number; start: number }
): OfflineAudioRenderableClip | null {
  const clipEnd = clip.startTime + clip.duration;
  const overlapStart = Math.max(clip.startTime, range.start);
  const overlapEnd = Math.min(clipEnd, range.end);
  if (overlapEnd <= overlapStart) {
    return null;
  }

  const overlapDuration = overlapEnd - overlapStart;
  const startProgress = clip.duration <= 0 ? 0 : (overlapStart - clip.startTime) / clip.duration;
  const endProgress = clip.duration <= 0 ? 1 : (overlapEnd - clip.startTime) / clip.duration;

  return {
    ...clip,
    ...(clip.audioTransitions
      ? {
          audioTransitions: clip.audioTransitions.map((transition) => ({
            ...transition,
            start: transition.start - range.start,
            end: transition.end - range.start,
          })),
        }
      : {}),
    ...(clip.originalAudioRanges
      ? {
          originalAudioRanges: clip.originalAudioRanges.flatMap((cell) => {
            const start = Math.max(cell.start, overlapStart),
              end = Math.min(cell.end, overlapEnd);
            return end > start
              ? [{ ...cell, start: start - range.start, end: end - range.start }]
              : [];
          }),
        }
      : {}),
    startTime: overlapStart - range.start,
    duration: overlapDuration,
    sourceStart:
      clip.sourceStart + getSourceTimedClipSourceOffset(clip, overlapStart - clip.startTime),
    sourceDuration: getSourceTimedClipSourceOffset(clip, overlapDuration),
    audioFadePhase: {
      offset: (clip.audioFadePhase?.offset ?? 0) + overlapStart - clip.startTime,
      duration: clip.audioFadePhase?.duration ?? clip.duration,
    },
    ...buildOptionalGainPatch(
      'audioGainStart',
      interpolateGain(clip.audioGainStart, clip.audioGainEnd, startProgress)
    ),
    ...buildOptionalGainPatch(
      'audioGainEnd',
      interpolateGain(clip.audioGainStart, clip.audioGainEnd, endProgress)
    ),
    ...buildOptionalGainPatch(
      'volumeEnvelopeStart',
      interpolateGain(clip.volumeEnvelopeStart, clip.volumeEnvelopeEnd, startProgress)
    ),
    ...buildOptionalGainPatch(
      'volumeEnvelopeEnd',
      interpolateGain(clip.volumeEnvelopeStart, clip.volumeEnvelopeEnd, endProgress)
    ),
  };
}

function interpolateGain(
  start: number | undefined,
  end: number | undefined,
  progress: number
): number | undefined {
  if (start === undefined && end === undefined) {
    return undefined;
  }

  const safeStart = start ?? end ?? 1;
  const safeEnd = end ?? start ?? 1;
  const clampedProgress = Math.min(1, Math.max(0, progress));
  return safeStart + (safeEnd - safeStart) * clampedProgress;
}

function buildOptionalGainPatch<TKey extends string>(key: TKey, value: number | undefined) {
  return value === undefined ? {} : { [key]: value };
}
