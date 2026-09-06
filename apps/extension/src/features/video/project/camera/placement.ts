import type { VideoProjectTransform } from '../types/layout';

export const VideoProjectCameraPlacement = {
  BOTTOM_LEFT: 'BOTTOM_LEFT',
  BOTTOM_RIGHT: 'BOTTOM_RIGHT',
  TOP_LEFT: 'TOP_LEFT',
  TOP_RIGHT: 'TOP_RIGHT',
} as const;

export type VideoProjectCameraPlacement =
  (typeof VideoProjectCameraPlacement)[keyof typeof VideoProjectCameraPlacement];

type CameraPlacementTransform = Pick<VideoProjectTransform, 'height' | 'width' | 'x' | 'y'>;

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
