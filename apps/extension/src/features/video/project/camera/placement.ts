import type { VideoProjectTransform } from '../types/layout';
import { applyVideoProjectClipsPatch } from '../mutation';
import {
  VideoMediaFitMode,
  VideoProjectClipType,
  VideoProjectTrackRole,
  type VideoProject,
  type VideoProjectVideoClip,
} from '../types';

/** Camera layouts are presets for existing clip visuals, not a second timeline. */
export const VideoProjectCameraLayout = {
  OVERLAY: 'OVERLAY',
  FULLFRAME: 'FULLFRAME',
  HIDDEN: 'HIDDEN',
} as const;

export type VideoProjectCameraLayout =
  (typeof VideoProjectCameraLayout)[keyof typeof VideoProjectCameraLayout];

export const VideoProjectCameraPlacement = {
  BOTTOM_LEFT: 'BOTTOM_LEFT',
  BOTTOM_RIGHT: 'BOTTOM_RIGHT',
  TOP_LEFT: 'TOP_LEFT',
  TOP_RIGHT: 'TOP_RIGHT',
} as const;

export type VideoProjectCameraPlacement =
  (typeof VideoProjectCameraPlacement)[keyof typeof VideoProjectCameraPlacement];

type CameraPlacementTransform = Pick<VideoProjectTransform, 'height' | 'width' | 'x' | 'y'>;

/** Derives inspector state from the visual fields also used by preview and export. */
export function resolveVideoProjectCameraLayout(
  project: Pick<VideoProject, 'width' | 'height'>,
  clip: VideoProjectVideoClip
): VideoProjectCameraLayout {
  const { transform } = clip;
  if (transform.opacity === 0) return VideoProjectCameraLayout.HIDDEN;
  if (
    transform.x === 0 &&
    transform.y === 0 &&
    transform.rotation === 0 &&
    transform.width === project.width &&
    transform.height === project.height &&
    clip.fitMode === VideoMediaFitMode.COVER
  )
    return VideoProjectCameraLayout.FULLFRAME;
  return VideoProjectCameraLayout.OVERLAY;
}

/** Applies one visual preset to one camera interval without changing linked media or timing. */
export function applyVideoProjectCameraLayout(
  project: VideoProject,
  clipId: string,
  layout: VideoProjectCameraLayout,
  placement: VideoProjectCameraPlacement = VideoProjectCameraPlacement.BOTTOM_RIGHT
): VideoProject {
  const clip = project.clips.find((item) => item.id === clipId);
  const track = project.tracks.find((item) => item.id === clip?.trackId);
  if (
    !clip ||
    clip.type !== VideoProjectClipType.VIDEO ||
    track?.role !== VideoProjectTrackRole.CAMERA ||
    track.locked
  )
    return project;

  if (layout === VideoProjectCameraLayout.HIDDEN) {
    if (clip.transform.opacity === 0) return project;
    return applyVideoProjectClipsPatch(
      project,
      project.clips.map((item) =>
        item.id === clipId ? { ...clip, transform: { ...clip.transform, opacity: 0 } } : item
      )
    );
  }
  const asset = project.assets.find((item) => item.id === clip.assetId);
  const frame =
    layout === VideoProjectCameraLayout.FULLFRAME
      ? { x: 0, y: 0, width: project.width, height: project.height }
      : resolveVideoProjectCameraPlacement({
          placement,
          projectWidth: project.width,
          projectHeight: project.height,
          sourceWidth: asset?.metadata.width ?? clip.transform.width,
          sourceHeight: asset?.metadata.height ?? clip.transform.height,
        });
  return applyVideoProjectClipsPatch(
    project,
    project.clips.map((item) =>
      item.id === clipId
        ? {
            ...clip,
            fitMode:
              layout === VideoProjectCameraLayout.FULLFRAME
                ? VideoMediaFitMode.COVER
                : VideoMediaFitMode.CONTAIN,
            fitScalePercent: 100,
            transform: { ...frame, rotation: 0, opacity: 1 },
          }
        : item
    )
  );
}

export function resolveVideoProjectCameraPlacement(params: {
  placement: VideoProjectCameraPlacement;
  projectHeight: number;
  projectWidth: number;
  sourceHeight: number;
  sourceWidth: number;
}): CameraPlacementTransform {
  const projectWidth = Math.max(1, params.projectWidth);
  const projectHeight = Math.max(1, params.projectHeight);
  const margin = Math.max(8, Math.min(projectWidth, projectHeight) * 0.03);
  const availableWidth = Math.max(1, projectWidth - margin * 2);
  const availableHeight = Math.max(1, projectHeight - margin * 2);
  const sourceAspectRatio =
    params.sourceWidth > 0 && params.sourceHeight > 0
      ? params.sourceWidth / params.sourceHeight
      : 16 / 9;
  let width = Math.min(availableWidth, Math.max(40, projectWidth * 0.24));
  let height = width / sourceAspectRatio;
  const maximumHeight = Math.min(availableHeight, projectHeight * 0.36);
  if (height > maximumHeight) {
    height = maximumHeight;
    width = height * sourceAspectRatio;
  }

  const left = margin;
  const right = projectWidth - margin - width;
  const top = margin;
  const bottom = projectHeight - margin - height;

  switch (params.placement) {
    case VideoProjectCameraPlacement.TOP_LEFT:
      return { height, width, x: left, y: top };
    case VideoProjectCameraPlacement.TOP_RIGHT:
      return { height, width, x: right, y: top };
    case VideoProjectCameraPlacement.BOTTOM_LEFT:
      return { height, width, x: left, y: bottom };
    case VideoProjectCameraPlacement.BOTTOM_RIGHT:
      return { height, width, x: right, y: bottom };
  }
}
