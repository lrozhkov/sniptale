import {
  getAssetById,
  isAudioClip,
  isVideoClip,
} from '../../../features/video/project/timeline/basics';
import type { VideoProject, VideoProjectClip } from '../../../features/video/project/types';

export function shouldRenderClipAudio(project: VideoProject, clip: VideoProjectClip): boolean {
  if ((!isVideoClip(clip) && !isAudioClip(clip)) || clip.muted) {
    return false;
  }

  const track = project.tracks.find((item) => item.id === clip.trackId);
  if (!track?.visible) {
    return false;
  }

  const asset = getAssetById(project, clip.assetId);
  return Boolean(asset?.metadata.hasAudio);
}
