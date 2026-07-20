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
  const clips = [...mediaClips, ...resolveEffectRuntimeAudioPlans(project)];

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
    startTime: overlapStart - range.start,
    duration: overlapDuration,
    sourceStart:
      clip.sourceStart + getSourceTimedClipSourceOffset(clip, overlapStart - clip.startTime),
    sourceDuration: getSourceTimedClipSourceOffset(clip, overlapDuration),
    fadeInMs: overlapStart > clip.startTime ? 0 : Math.min(clip.fadeInMs, overlapDuration * 1000),
    fadeOutMs: overlapEnd < clipEnd ? 0 : Math.min(clip.fadeOutMs, overlapDuration * 1000),
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
