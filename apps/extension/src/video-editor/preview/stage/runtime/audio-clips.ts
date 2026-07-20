import {
  getAssetById,
  getLinkedClipIds,
  isAudioClip,
  isVideoClip,
} from '../../../../features/video/project/timeline';
import type {
  VideoProject,
  VideoProjectAudioClip,
  VideoProjectClip,
  VideoProjectVideoClip,
} from '../../../../features/video/project/types/index';

function hasActiveLinkedAudioCompanion(
  project: VideoProject,
  clip: VideoProjectVideoClip,
  activeClipById: ReadonlyMap<string, VideoProjectClip>
): boolean {
  return getLinkedClipIds(project, clip.id).some((linkedClipId) => {
    if (linkedClipId === clip.id) {
      return false;
    }

    const linkedClip = activeClipById.get(linkedClipId);
    return linkedClip !== undefined && isAudioClip(linkedClip);
  });
}

function isAudioDrivenVideoClip(
  project: VideoProject,
  clip: VideoProjectClip,
  activeClipById: ReadonlyMap<string, VideoProjectClip>
): clip is VideoProjectVideoClip {
  return (
    isVideoClip(clip) &&
    Boolean(getAssetById(project, clip.assetId)?.metadata.hasAudio) &&
    !hasActiveLinkedAudioCompanion(project, clip, activeClipById)
  );
}

export function isAudioDrivenPreviewClip(
  project: VideoProject,
  clip: VideoProjectClip,
  activeClipById: ReadonlyMap<string, VideoProjectClip>
): clip is VideoProjectAudioClip | VideoProjectVideoClip {
  return isAudioClip(clip) || isAudioDrivenVideoClip(project, clip, activeClipById);
}
