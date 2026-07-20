import type { VideoProject } from '../../project/types/index';

type ProjectFrame = Pick<VideoProject, 'height' | 'width'>;

function clampViewportOffset(offset: number, viewportSize: number, projectSize: number): number {
  return Math.min(Math.max(0, offset), Math.max(0, projectSize - viewportSize));
}

export function resolveCameraViewportFrame(
  project: ProjectFrame,
  focusPoint: { x: number; y: number },
  scale: number
) {
  const viewportWidth = project.width / scale;
  const viewportHeight = project.height / scale;

  return {
    viewportHeight,
    viewportWidth,
    viewportX: clampViewportOffset(focusPoint.x - viewportWidth / 2, viewportWidth, project.width),
    viewportY: clampViewportOffset(
      focusPoint.y - viewportHeight / 2,
      viewportHeight,
      project.height
    ),
  };
}
