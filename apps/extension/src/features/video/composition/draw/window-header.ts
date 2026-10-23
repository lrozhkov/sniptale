import { composeWindowHeaderSvg } from '../../../browser-frame/appearance';
import type { WindowHeader } from '@sniptale/runtime-contracts/window-header';
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

/** Admit the loaded header for concrete video and image consumers. */
export function admittedVisualWindowHeader(
  clip: {
    id: string;
    windowHeader?: import('@sniptale/runtime-contracts/window-header').WindowHeader;
  },
  images: Record<string, HTMLImageElement>,
  camera: boolean
) {
  const header = camera ? undefined : clip.windowHeader;
  const image = header ? images[windowHeaderImageKey(clip.id, header)] : undefined;
  if (image?.complete && image.naturalWidth === 0)
    throw new Error('Window header image could not be decoded.');
  return image && clip.windowHeader
    ? { windowHeaderImage: image, windowHeader: clip.windowHeader }
    : {};
}
