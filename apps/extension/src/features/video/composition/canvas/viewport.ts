import type { VideoProject } from '../../project/types';
interface PreviewStageBounds {
  height: number;
  left: number;
  top: number;
  width: number;
}

interface PreviewStageViewport {
  height: number;
  offsetX: number;
  offsetY: number;
  scale: number;
  width: number;
}

function resolveStageBounds(
  stage: HTMLDivElement,
  fallbackWidth: number,
  fallbackHeight: number
): PreviewStageBounds {
  const bounds = stage.getBoundingClientRect();

  return {
    height: Math.max(0, bounds.height || fallbackHeight),
    left: bounds.left,
    top: bounds.top,
    width: Math.max(0, bounds.width || fallbackWidth),
  };
}

function resolveStageViewport(
  bounds: PreviewStageBounds,
  project: VideoProject
): PreviewStageViewport {
  if (bounds.width <= 0 || bounds.height <= 0 || project.width <= 0 || project.height <= 0) {
    return { height: 0, offsetX: 0, offsetY: 0, scale: 0, width: 0 };
  }

  const scale = Math.min(bounds.width / project.width, bounds.height / project.height);
  const width = project.width * scale;
  const height = project.height * scale;

  return {
    height,
    offsetX: (bounds.width - width) / 2,
    offsetY: (bounds.height - height) / 2,
    scale,
    width,
  };
}

export function resolvePreviewStageViewportMetrics(
  stage: HTMLDivElement,
  project: VideoProject,
  fallbackWidth = 0,
  fallbackHeight = 0
) {
  const bounds = resolveStageBounds(stage, fallbackWidth, fallbackHeight);
  const viewport = resolveStageViewport(bounds, project);

  return { bounds, viewport };
}
