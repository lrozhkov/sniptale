import {
  drawSceneBackground,
  getProjectSceneBackground,
} from '../../../../features/video/project/scene/background';
import { resolveSceneBackgroundAudioEnvelope } from '../../../../features/video/project/scene/background-audio';
import type { VideoProject } from '../../../../features/video/project/types';
import { EFFECT_RUNTIME_RESOURCE_LIMITS } from '../../../../features/video/composition/effect-runtime';
import { resolvePreviewStageViewportMetrics } from '../canvas/geometry';
import type { PreviewSceneBounds, PreviewSceneViewport } from '../types';
import type { VideoEditorPreviewRasterSize } from '../sizing/raster';

export interface PreparedPreviewSceneCanvas {
  bounds: PreviewSceneBounds;
  context: CanvasRenderingContext2D;
  dpr: number;
  viewport: PreviewSceneViewport;
}

function syncCanvasResolution(
  canvas: HTMLCanvasElement,
  bounds: PreviewSceneBounds,
  rasterSize?: VideoEditorPreviewRasterSize
): number {
  const dpr = rasterSize
    ? rasterSize.width / Math.max(1, bounds.width)
    : window.devicePixelRatio || 1;
  const nextWidth = rasterSize?.width ?? Math.max(1, Math.round(bounds.width * dpr));
  const nextHeight = rasterSize?.height ?? Math.max(1, Math.round(bounds.height * dpr));

  if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
    canvas.width = nextWidth;
    canvas.height = nextHeight;
  }

  return dpr;
}

function resolvePreviewSceneMetrics(
  canvas: HTMLCanvasElement,
  project: VideoProject,
  stage: HTMLDivElement | null
) {
  const fallbackBounds = {
    height: Math.max(0, canvas.clientHeight),
    width: Math.max(0, canvas.clientWidth),
  };
  if (!stage) {
    const scale = Math.min(
      fallbackBounds.width / project.width,
      fallbackBounds.height / project.height
    );

    return {
      bounds: fallbackBounds,
      viewport: {
        height: project.height * scale,
        offsetX: (fallbackBounds.width - project.width * scale) / 2,
        offsetY: (fallbackBounds.height - project.height * scale) / 2,
        scale,
        width: project.width * scale,
      },
    };
  }

  return resolvePreviewStageViewportMetrics(
    stage,
    project,
    fallbackBounds.width,
    fallbackBounds.height
  );
}

export function resolvePreviewEffectRuntimeRasterScale(params: {
  canvas: HTMLCanvasElement;
  previewRasterSize?: VideoEditorPreviewRasterSize;
  project: VideoProject;
  stage: HTMLDivElement | null;
}): number {
  if (params.previewRasterSize) {
    return Math.min(
      params.previewRasterSize.width / Math.max(1, params.project.width),
      params.previewRasterSize.height / Math.max(1, params.project.height)
    );
  }
  const { viewport } = resolvePreviewSceneMetrics(params.canvas, params.project, params.stage);
  const ownerWindow = params.canvas.ownerDocument.defaultView;
  const dpr = ownerWindow?.devicePixelRatio || 1;
  const viewportScale = Math.min(
    viewport.width > 0 ? (viewport.width * dpr) / params.project.width : 1,
    viewport.height > 0 ? (viewport.height * dpr) / params.project.height : 1
  );
  const projectPixels = Math.max(1, params.project.width * params.project.height);
  const resourceLimitScale = Math.sqrt(
    EFFECT_RUNTIME_RESOURCE_LIMITS.maxOutputPixels / projectPixels
  );
  return Math.min(Math.max(0.01, viewportScale), resourceLimitScale);
}

function resolvePreviewSceneContext(
  canvas: HTMLCanvasElement,
  project: VideoProject,
  stage: HTMLDivElement | null,
  rasterSize?: VideoEditorPreviewRasterSize
) {
  const context = canvas.getContext('2d');
  const { bounds, viewport } = resolvePreviewSceneMetrics(canvas, project, stage);
  if (!context) {
    return null;
  }

  return {
    bounds,
    context,
    dpr: syncCanvasResolution(canvas, bounds, rasterSize),
    viewport,
  };
}

function clearPreviewSceneCanvas(params: {
  bounds: PreviewSceneBounds;
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  currentTime?: number;
  dpr: number;
  imageBank: Record<string, HTMLImageElement>;
  project: VideoProject;
}) {
  params.context.setTransform(1, 0, 0, 1, 0, 0);
  params.context.clearRect(0, 0, params.canvas.width, params.canvas.height);
  params.context.setTransform(params.dpr, 0, 0, params.dpr, 0, 0);
  drawSceneBackground({
    context: params.context,
    currentTime: params.currentTime ?? 0,
    audioEnvelope: resolveSceneBackgroundAudioEnvelope(params.project, params.currentTime ?? 0),
    height: params.bounds.height,
    loadedImages: params.imageBank,
    sceneBackground: getProjectSceneBackground(params.project),
    width: params.bounds.width,
  });
}

function hasUsablePreviewViewport(
  prepared: PreparedPreviewSceneCanvas | null
): prepared is PreparedPreviewSceneCanvas {
  return (
    !!prepared &&
    prepared.bounds.width > 0 &&
    prepared.bounds.height > 0 &&
    prepared.viewport.width > 0 &&
    prepared.viewport.height > 0
  );
}

export function resolvePreparedPreviewSceneCanvas(params: {
  canvas: HTMLCanvasElement;
  imageBank: Record<string, HTMLImageElement>;
  project: VideoProject;
  previewRasterSize?: VideoEditorPreviewRasterSize;
  shouldClearCanvas: boolean;
  stage: HTMLDivElement | null;
  currentTime?: number;
}) {
  const prepared = resolvePreviewSceneContext(
    params.canvas,
    params.project,
    params.stage,
    params.previewRasterSize
  );
  if (!hasUsablePreviewViewport(prepared)) {
    return null;
  }

  if (params.shouldClearCanvas) {
    const currentTime = params.currentTime ?? 0;
    clearPreviewSceneCanvas({
      bounds: prepared.bounds,
      canvas: params.canvas,
      context: prepared.context,
      currentTime,
      dpr: prepared.dpr,
      imageBank: params.imageBank,
      project: params.project,
    });
  }

  return prepared;
}

export function beginPreviewViewportClip(prepared: PreparedPreviewSceneCanvas) {
  prepared.context.save();
  prepared.context.beginPath();
  prepared.context.rect(
    prepared.viewport.offsetX,
    prepared.viewport.offsetY,
    prepared.viewport.width,
    prepared.viewport.height
  );
  prepared.context.clip();
  prepared.context.translate(prepared.viewport.offsetX, prepared.viewport.offsetY);
}

export function beginPreviewCameraPass(
  prepared: PreparedPreviewSceneCanvas,
  camera: {
    scale: number;
    viewportX: number;
    viewportY: number;
  }
) {
  beginPreviewViewportClip(prepared);
  prepared.context.scale(camera.scale, camera.scale);
  prepared.context.translate(
    -camera.viewportX * prepared.viewport.scale,
    -camera.viewportY * prepared.viewport.scale
  );
}
