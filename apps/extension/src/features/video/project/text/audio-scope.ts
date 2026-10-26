import {
  isProjectAudioSourceJobScope,
  parseAudioJobScope,
  type ProjectAudioSourceJobScope,
} from '../../../../contracts/ai/audio';
import { getMediaClipSourceTime } from '../timeline/rate';
import type { VideoProject, VideoProjectAsset, VideoProjectClip } from '../types/model';

/** Resolves only an audible source owned by the exact saved project snapshot and clip span. */
export function resolveVideoProjectAudioTarget(
  project: VideoProject,
  scope: ProjectAudioSourceJobScope
) {
  if (
    project.id !== scope.projectId ||
    project.updatedAt !== scope.projectUpdatedAt ||
    !Number.isFinite(scope.nativeStart) ||
    !Number.isFinite(scope.nativeEnd) ||
    scope.nativeEnd <= scope.nativeStart
  )
    return null;
  const clip = project.clips.find((entry) => entry.id === scope.target.clipId);
  if (!clip || (clip.type !== 'VIDEO' && clip.type !== 'AUDIO') || clip.assetId !== scope.assetId)
    return null;
  const asset = project.assets.find((entry) => entry.id === scope.assetId);
  if (
    !asset ||
    (asset.type !== 'VIDEO' && asset.type !== 'AUDIO' && asset.type !== 'RECORDING') ||
    !asset.metadata.hasAudio
  )
    return null;
  const { start, end } = getVideoProjectNativeAudioWindow(clip, asset);
  if (scope.nativeStart < start || scope.nativeEnd > end) return null;
  return { clip, asset };
}

/** Computes native source bounds after the caller admits the clip and asset. */
export function getVideoProjectNativeAudioWindow(
  clip: Extract<VideoProjectClip, { type: 'VIDEO' | 'AUDIO' }>,
  asset: VideoProjectAsset
) {
  const offset = clip.type === 'VIDEO' ? (clip.cameraTiming?.offsetSeconds ?? 0) : 0;
  const start = Math.max(getMediaClipSourceTime(clip, clip.startTime) + offset, offset);
  const end = Math.min(
    clip.sourceStart + clip.sourceDuration,
    getMediaClipSourceTime(clip, clip.startTime + clip.duration) + offset,
    (asset.metadata.duration ?? Infinity) + offset
  );
  return { start, end };
}

/** Freezes a native selection after the existing montage save barrier has acknowledged its revision. */
export function createVideoProjectAudioScope(
  project: VideoProject,
  projectRevision: number,
  clipId: string,
  nativeStart: number,
  nativeEnd: number
): ProjectAudioSourceJobScope | null {
  const clip = project.clips.find((entry) => entry.id === clipId);
  if (!clip || (clip.type !== 'VIDEO' && clip.type !== 'AUDIO')) return null;
  const scope = parseAudioJobScope({
    projectId: project.id,
    projectRevision,
    projectUpdatedAt: project.updatedAt,
    target: { kind: 'project-clip', clipId },
    assetId: clip.assetId,
    nativeStart,
    nativeEnd,
  });
  return scope &&
    isProjectAudioSourceJobScope(scope) &&
    resolveVideoProjectAudioTarget(project, scope)
    ? scope
    : null;
}
