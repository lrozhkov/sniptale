import { composeWindowHeaderSvg } from '../../../browser-frame/appearance';
import type { WindowHeader } from '../../../browser-frame/header';
import type { VideoProject, VideoProjectClip } from '../../project/types';

/** Content-bound keys prevent a stale async raster from appearing after an edit or undo. */
export function windowHeaderImageKey(clipId: string, header: WindowHeader): string {
  return `window-header:${JSON.stringify([clipId, header])}`;
}

/** Runtime image banks own loading and cancellation; this owner only describes local rasters. */
export function projectWindowHeaderImages(
  project: VideoProject,
  clips: readonly VideoProjectClip[] = project.clips
): { key: string; src: string }[] {
  return clips.flatMap((clip) => {
    if (
      (clip.type !== 'VIDEO' && clip.type !== 'IMAGE') ||
      !clip.windowHeader ||
      project.tracks.some((track) => track.id === clip.trackId && track.role === 'CAMERA')
    )
      return [];
    const asset = project.assets.find(({ id }) => id === clip.assetId);
    if (!asset || asset.metadata.width <= 0 || asset.metadata.height <= 0) return [];
    const svg = composeWindowHeaderSvg(clip.windowHeader, asset.metadata);
    return [
      {
        key: windowHeaderImageKey(clip.id, clip.windowHeader),
        src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
      },
    ];
  });
}
