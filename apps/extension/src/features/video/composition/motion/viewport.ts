import type { VideoProject } from '../../project/types/index';

type ProjectFrame = Pick<VideoProject, 'height' | 'width'>;

function clampViewportOffset(offset: number, viewportSize: number, projectSize: number): number {
  const availableOffset = projectSize - viewportSize;
  return Math.min(Math.max(Math.min(0, availableOffset), offset), Math.max(0, availableOffset));
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
