import type { VideoCompositionCameraState } from '../../../features/video/composition/types';
import {
  drawSceneBackground,
  getProjectSceneBackground,
} from '../../../features/video/project/scene/background';
import { createVideoCompositionBufferCanvas } from '../../../features/video/composition/canvas/buffer-canvas';
import { resolveSceneBackgroundAudioEnvelope } from '../../../features/video/project/scene/background-audio';
import { VideoSceneBackgroundKind } from '../../../features/video/project/types';
import type { VideoProject } from '../../../features/video/project/types';
import type { LoadedImagesMap } from './types';

export interface ExportSceneBackgroundCache {
  buffer: HTMLCanvasElement | OffscreenCanvas | null;
  key: string | null;
}

function getStaticBackgroundCacheKey(project: VideoProject, width: number, height: number) {
  const background = getProjectSceneBackground(project);
  switch (background.kind) {
    case VideoSceneBackgroundKind.SOLID:
      return `solid:${width}x${height}:${background.color}`;
    case VideoSceneBackgroundKind.IMAGE:
      return JSON.stringify([
        'image',
        width,
        height,
        project.width,
        background.assetId,
        background.imageFit ?? 'cover',
        background.blur ?? 0,
      ]);
    case VideoSceneBackgroundKind.GRADIENT:
      return null;
  }
}

function drawExportSceneBackgroundUncached(params: {
  backgroundCamera?: NonNullable<VideoCompositionCameraState['backgroundCamera']>;
  context: CanvasRenderingContext2D;
  currentTime: number;
  height: number;
  loadedImages: LoadedImagesMap;
  project: VideoProject;
  width: number;
}) {
  drawSceneBackground({
    ...(params.backgroundCamera ? { camera: params.backgroundCamera } : {}),
    projectScale: params.width / params.project.width,
    context: params.context,
    currentTime: params.currentTime,
    audioEnvelope: resolveSceneBackgroundAudioEnvelope(params.project, params.currentTime),
    height: params.height,
    loadedImages: params.loadedImages,
    sceneBackground: getProjectSceneBackground(params.project),
    width: params.width,
  });
}

export function drawExportSceneBackground(params: {
  backgroundCamera?: NonNullable<VideoCompositionCameraState['backgroundCamera']>;
  cache?: ExportSceneBackgroundCache | undefined;
  context: CanvasRenderingContext2D;
  currentTime: number;
  height: number;
  loadedImages: LoadedImagesMap;
  project: VideoProject;
  width: number;
}) {
  const cacheKey =
    params.cache && !params.backgroundCamera
      ? getStaticBackgroundCacheKey(params.project, params.width, params.height)
      : null;
  if (!params.cache || !cacheKey) {
    drawExportSceneBackgroundUncached(params);
    return;
  }

  if (params.cache.key !== cacheKey || !params.cache.buffer) {
    params.cache.buffer = createVideoCompositionBufferCanvas(
      params.width,
      params.height,
      params.context.canvas?.ownerDocument
    );
    params.cache.key = null;
    const bufferContext = params.cache.buffer?.getContext('2d') ?? null;
    if (!params.cache.buffer || !bufferContext) {
      drawExportSceneBackgroundUncached(params);
      return;
    }

    drawExportSceneBackgroundUncached({
      ...params,
      context: bufferContext as CanvasRenderingContext2D,
    });
    params.cache.key = cacheKey;
  }

  params.context.drawImage(params.cache.buffer, 0, 0, params.width, params.height);
}
