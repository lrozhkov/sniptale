import {
  isProjectAudioSourceJobScope,
  parseAudioJobScope,
  type ProjectAudioSourceJobScope,
} from '../../../../contracts/ai/audio';
import { getMediaClipSourceTime } from '../timeline/rate';
import type { VideoProject } from '../types/model';

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
  if (!asset || (asset.type !== 'VIDEO' && asset.type !== 'AUDIO') || !asset.metadata.hasAudio)
    return null;
  const end = Math.min(
    clip.sourceStart + clip.sourceDuration,
    getMediaClipSourceTime(clip, clip.startTime + clip.duration),
    asset.metadata.duration ?? Infinity
  );
  if (scope.nativeStart < clip.sourceStart || scope.nativeEnd > end) return null;
  return { clip, asset };
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
