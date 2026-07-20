import { DEFAULT_VIDEO_MOTION_OVERLAY_ZOOM_MODE } from '../../project/motion/index';
import type { VideoProject } from '../../project/types/index';
import type { VideoCompositionCameraState } from '../types';

type ProjectFrame = Pick<VideoProject, 'height' | 'width'>;

export function getDefaultFocusPoint(project: ProjectFrame) {
  return {
    x: project.width / 2,
    y: project.height / 2,
  };
}

export function createDefaultCameraState(project: ProjectFrame): VideoCompositionCameraState {
  return {
    focusPoint: getDefaultFocusPoint(project),
    motionBlurAmount: 0,
    overlayZoomMode: DEFAULT_VIDEO_MOTION_OVERLAY_ZOOM_MODE,
    regionId: null,
    scale: 1,
    viewportHeight: project.height,
    viewportWidth: project.width,
    viewportX: 0,
    viewportY: 0,
  };
}
