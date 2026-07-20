import {
  getSourceTimedClipProjectDuration,
  normalizeClipPlaybackRate,
} from '../../../features/video/project/timeline/basics';
import type {
  VideoProject,
  VideoProjectAudioClip,
  VideoProjectClip,
  VideoProjectVideoClip,
} from '../../../features/video/project/types/model';
import {
  VideoClipLinkMode,
  VideoProjectClipType,
} from '../../../features/video/project/types/model';

export type SourceTimedClip = VideoProjectVideoClip | VideoProjectAudioClip;

export function isSourceTimedClip(clip: VideoProjectClip): clip is SourceTimedClip {
  return clip.type === VideoProjectClipType.VIDEO || clip.type === VideoProjectClipType.AUDIO;
}

export function updateSourceTimedClipTiming<TClip extends SourceTimedClip>(
  clip: TClip,
  patch: Partial<Pick<TClip, 'playbackRate' | 'sourceDuration' | 'sourceStart' | 'startTime'>>
): TClip {
  const playbackRate = normalizeClipPlaybackRate(patch.playbackRate ?? clip.playbackRate ?? 1);
  const sourceDuration = Math.max(0.1, patch.sourceDuration ?? clip.sourceDuration);

  return {
    ...clip,
    ...patch,
    playbackRate,
    sourceDuration,
    sourceStart: Math.max(0, patch.sourceStart ?? clip.sourceStart),
    duration: getSourceTimedClipProjectDuration({ playbackRate, sourceDuration }),
  };
}

export function getSourceEnd(clip: SourceTimedClip) {
  return clip.sourceStart + clip.sourceDuration;
}

export function getSourceUnitKey(clip: SourceTimedClip) {
  return clip.groupId !== null && clip.linkMode === VideoClipLinkMode.LINKED
    ? clip.groupId
    : clip.id;
}

export function isRecordingSourceTimedClip(
  project: VideoProject,
  clip: VideoProjectClip,
  recordingId: string
): clip is SourceTimedClip {
  if (!isSourceTimedClip(clip)) {
    return false;
  }

  const asset = project.assets.find((item) => item.id === clip.assetId);
  if (!asset) {
    return false;
  }

  return (
    (asset.source.kind === 'recording' && asset.source.recordingId === recordingId) ||
    (asset.source.kind === 'project-asset' && asset.source.originRecordingId === recordingId)
  );
}

export function collectRecordingSourceUnits(project: VideoProject, recordingId: string) {
  const units = new Map<string, SourceTimedClip[]>();

  for (const clip of project.clips) {
    if (!isRecordingSourceTimedClip(project, clip, recordingId)) {
      continue;
    }

    const key = getSourceUnitKey(clip);
    const existing = units.get(key);
    if (existing) {
      existing.push(clip);
      continue;
    }

    units.set(key, [clip]);
  }

  return [...units.values()].sort(
    (left, right) =>
      left[0]!.sourceStart - right[0]!.sourceStart || left[0]!.startTime - right[0]!.startTime
  );
}

export function collectRepresentativeRecordingSourceClips(
  project: VideoProject,
  recordingId: string
): SourceTimedClip[] {
  const clipMap = new Map<string, SourceTimedClip>();

  for (const clip of project.clips) {
    if (!isRecordingSourceTimedClip(project, clip, recordingId)) {
      continue;
    }

    const key = getSourceUnitKey(clip);
    const current = clipMap.get(key);
    if (
      !current ||
      (current.type === VideoProjectClipType.AUDIO && clip.type === VideoProjectClipType.VIDEO)
    ) {
      clipMap.set(key, clip);
    }
  }

  return [...clipMap.values()].sort(
    (left, right) => left.sourceStart - right.sourceStart || left.startTime - right.startTime
  );
}
