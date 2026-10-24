import type { VideoCompositionCameraState } from '../../../../features/video/composition/types';
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

/** Measures the existing preview viewport without changing the presented canvas. */
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
  rasterSize?: VideoEditorPreviewRasterSize,
  viewportCanvas?: HTMLCanvasElement
) {
  const context = canvas.getContext('2d');
  const { bounds, viewport } = resolvePreviewSceneMetrics(viewportCanvas ?? canvas, project, stage);
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
  backgroundCamera?: NonNullable<VideoCompositionCameraState['backgroundCamera']>;
  currentTime?: number;
  dpr: number;
  imageBank: Record<string, HTMLImageElement>;
  project: VideoProject;
}) {
  params.context.setTransform(1, 0, 0, 1, 0, 0);
  params.context.clearRect(0, 0, params.canvas.width, params.canvas.height);
  params.context.setTransform(params.dpr, 0, 0, params.dpr, 0, 0);
  drawSceneBackground({
    ...(params.backgroundCamera ? { camera: params.backgroundCamera } : {}),
    projectScale: params.bounds.width / params.project.width,
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
  backgroundCamera?: NonNullable<VideoCompositionCameraState['backgroundCamera']>;
  canvas: HTMLCanvasElement;
  viewportCanvas?: HTMLCanvasElement;
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
    params.previewRasterSize,
    params.viewportCanvas
  );
  if (!hasUsablePreviewViewport(prepared)) {
    return null;
  }

  if (params.shouldClearCanvas) {
    const currentTime = params.currentTime ?? 0;
    clearPreviewSceneCanvas({
      ...(params.backgroundCamera ? { backgroundCamera: params.backgroundCamera } : {}),
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

/** Publishes a finished transaction canvas after asynchronous preparation succeeds. */
export function publishCompletedPreviewFrame(
  presented: HTMLCanvasElement,
  staging: HTMLCanvasElement
): void {
  const context = presented.getContext('2d');
  if (!context) throw new Error('Preview frame context is unavailable.');
  if (presented.width !== staging.width) presented.width = staging.width;
  if (presented.height !== staging.height) presented.height = staging.height;
  context.save();
  try {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalAlpha = 1;
    context.globalCompositeOperation = 'copy';
    context.filter = 'none';
    context.shadowColor = 'transparent';
    context.shadowBlur = 0;
    context.shadowOffsetX = 0;
    context.shadowOffsetY = 0;
    context.drawImage(staging, 0, 0);
  } finally {
    context.restore();
  }
  presented.dispatchEvent(new Event('sniptale-preview-frame', { bubbles: true }));
}

type CompletedCompositionPresentation = Pick<
  Parameters<typeof resolvePreparedPreviewSceneCanvas>[0],
  'imageBank' | 'project' | 'stage' | 'previewRasterSize'
> & {
  canvas: HTMLCanvasElement;
  currentTime: number;
  stagingCanvas?: () => HTMLCanvasElement;
  signal?: AbortSignal;
};

/** Uses the canonical contained viewport to select the completed-composition sample size. */
export function resolvePreviewCompositionFrameSize(
  input: Pick<
    CompletedCompositionPresentation,
    'canvas' | 'project' | 'stage' | 'previewRasterSize'
  >
) {
  const { viewport } = resolvePreviewSceneMetrics(input.canvas, input.project, input.stage);
  const dpr = input.canvas.ownerDocument.defaultView?.devicePixelRatio || 1;
  const size = input.previewRasterSize ?? {
    width: Math.round(viewport.width * dpr),
    height: Math.round(viewport.height * dpr),
  };
  return size.width > 0 && size.height > 0 && viewport.width > 0 && viewport.height > 0
    ? size
    : null;
}

/** Publishes one completed composition through the existing viewport and transaction canvas. */
export function publishPreviewCompositionFrame(
  input: CompletedCompositionPresentation,
  frame: CanvasImageSource
) {
  const owned = !input.stagingCanvas;
  const staging = input.stagingCanvas?.() ?? input.canvas.ownerDocument.createElement('canvas');
  if (staging === input.canvas || staging.ownerDocument !== input.canvas.ownerDocument)
    throw new Error('Preview frame canvas is unavailable.');
  try {
    const prepared = resolvePreparedPreviewSceneCanvas({
      canvas: staging,
      viewportCanvas: input.canvas,
      imageBank: input.imageBank,
      project: input.project,
      ...(input.previewRasterSize ? { previewRasterSize: input.previewRasterSize } : {}),
      shouldClearCanvas: true,
      stage: input.stage,
      currentTime: input.currentTime,
    });
    if (!prepared) return false;
    beginPreviewViewportClip(prepared);
    try {
      const context = prepared.context;
      context.globalAlpha = 1;
      context.globalCompositeOperation = 'copy';
      context.filter = 'none';
      context.shadowColor = 'transparent';
      context.shadowBlur = context.shadowOffsetX = context.shadowOffsetY = 0;
      context.drawImage(frame, 0, 0, prepared.viewport.width, prepared.viewport.height);
    } finally {
      prepared.context.restore();
    }
    input.signal?.throwIfAborted();
    publishCompletedPreviewFrame(input.canvas, staging);
  } finally {
    if (owned) {
      staging.width = 0;
      staging.height = 0;
    }
  }
}
