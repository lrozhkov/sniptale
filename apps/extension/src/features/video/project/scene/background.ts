import { acquireVideoCompositionBuffer } from '../../composition/canvas/buffer-pool';
import { drawEdgePaddedBlur } from '../../composition/canvas/edge-padded-blur';
import { parseSceneBackgroundSettings, retainSceneBackgroundVariants } from './background-settings';
import { DEFAULT_VIDEO_PROJECT_BACKGROUND } from '../defaults';
import {
  drawGradientSceneBackground,
  getSceneGradientLegacyColor,
  resolveGradientSceneBackgroundFrame,
} from './background-gradient';
import {
  VideoSceneBackgroundKind,
  type VideoProject,
  type VideoProjectSceneBackground,
} from '../types/index';

function createFallbackSolidBackground(color: string): VideoProjectSceneBackground {
  return {
    kind: VideoSceneBackgroundKind.SOLID,
    color,
  };
}

function normalizeSceneBackground(
  sceneBackground: VideoProject['sceneBackground'],
  fallbackColor: string
): VideoProjectSceneBackground {
  if (!sceneBackground) {
    return createFallbackSolidBackground(fallbackColor);
  }

  const parsed = parseSceneBackgroundSettings(sceneBackground);
  if (!parsed) throw new Error('Invalid scene background');
  return parsed;
}

function drawBackgroundImage(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  imageWidth: number,
  imageHeight: number,
  width: number,
  height: number,
  imageFit: 'cover' | 'contain'
) {
  if (imageWidth <= 0 || imageHeight <= 0 || width <= 0 || height <= 0) {
    return;
  }

  const scale =
    imageFit === 'contain'
      ? Math.min(width / imageWidth, height / imageHeight)
      : Math.max(width / imageWidth, height / imageHeight);
  const drawWidth = imageWidth * scale;
  const drawHeight = imageHeight * scale;
  const drawX = (width - drawWidth) / 2;
  const drawY = (height - drawHeight) / 2;

  context.save();
  context.beginPath();
  context.rect(0, 0, width, height);
  context.clip();
  context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
  context.restore();
}

type VideoProjectSceneBackgroundSource = {
  backgroundColor: string;
  sceneBackground?: VideoProject['sceneBackground'] | undefined;
};

export function getProjectSceneBackground(project: VideoProjectSceneBackgroundSource) {
  const fallbackColor = project.backgroundColor || DEFAULT_VIDEO_PROJECT_BACKGROUND;
  return normalizeSceneBackground(project.sceneBackground, fallbackColor);
}

export function resolveSceneBackgroundFrame(params: {
  audioEnvelope?: number | undefined;
  sceneBackground: VideoProjectSceneBackground;
  time?: number | undefined;
}) {
  if (params.sceneBackground.enabled === false)
    return { kind: VideoSceneBackgroundKind.SOLID, color: '#00000000' };
  if (params.sceneBackground.kind !== VideoSceneBackgroundKind.GRADIENT) {
    return params.sceneBackground;
  }

  return resolveGradientSceneBackgroundFrame(params.sceneBackground, {
    ...(params.audioEnvelope === undefined ? {} : { audioEnvelope: params.audioEnvelope }),
    ...(params.time === undefined ? {} : { time: params.time }),
  });
}

export function getSceneBackgroundLegacyColor(
  sceneBackground: VideoProjectSceneBackground
): string {
  if (sceneBackground.enabled === false) return '#00000000';
  switch (sceneBackground.kind) {
    case VideoSceneBackgroundKind.SOLID:
      return sceneBackground.color;
    case VideoSceneBackgroundKind.GRADIENT:
      return getSceneGradientLegacyColor(sceneBackground);
    case VideoSceneBackgroundKind.IMAGE:
      return DEFAULT_VIDEO_PROJECT_BACKGROUND;
  }
}

export function syncProjectSceneBackground(
  project: VideoProjectSceneBackgroundSource,
  sceneBackground: VideoProjectSceneBackground
) {
  const normalizedSceneBackground = normalizeSceneBackground(
    sceneBackground,
    project.backgroundColor || DEFAULT_VIDEO_PROJECT_BACKGROUND
  );

  return {
    backgroundColor: getSceneBackgroundLegacyColor(normalizedSceneBackground),
    sceneBackground: retainSceneBackgroundVariants(
      getProjectSceneBackground(project),
      normalizedSceneBackground
    ),
  };
}

export function getProjectSceneBackgroundImageAssetId(
  project: VideoProjectSceneBackgroundSource
): string | null {
  const sceneBackground = getProjectSceneBackground(project);
  return sceneBackground.enabled !== false &&
    sceneBackground.kind === VideoSceneBackgroundKind.IMAGE
    ? sceneBackground.assetId
    : null;
}

interface SceneBackgroundDraw {
  camera?: { scale: number; viewportX: number; viewportY: number };
  context: CanvasRenderingContext2D;
  currentTime?: number;
  projectScale?: number;
  audioEnvelope?: number;
  height: number;
  loadedImages?: Record<string, HTMLImageElement>;
  sceneBackground: VideoProjectSceneBackground;
  width: number;
}

function drawSharpSceneBackground(params: SceneBackgroundDraw) {
  switch (params.sceneBackground.kind) {
    case VideoSceneBackgroundKind.SOLID:
      params.context.fillStyle = params.sceneBackground.color;
      params.context.fillRect(0, 0, params.width, params.height);
      return;
    case VideoSceneBackgroundKind.GRADIENT:
      drawGradientSceneBackground({
        context: params.context,
        height: params.height,
        sceneBackground: params.sceneBackground,
        width: params.width,
        ...(params.audioEnvelope === undefined ? {} : { audioEnvelope: params.audioEnvelope }),
        ...(params.currentTime === undefined ? {} : { currentTime: params.currentTime }),
      });
      return;
    case VideoSceneBackgroundKind.IMAGE: {
      const image = params.loadedImages?.[params.sceneBackground.assetId];
      params.context.fillStyle = DEFAULT_VIDEO_PROJECT_BACKGROUND;
      params.context.fillRect(0, 0, params.width, params.height);
      if (!image) {
        return;
      }

      drawBackgroundImage(
        params.context,
        image,
        image.naturalWidth,
        image.naturalHeight,
        params.width,
        params.height,
        params.sceneBackground.imageFit ?? 'cover'
      );
    }
  }
}

type BackgroundRasterLease = NonNullable<ReturnType<typeof acquireVideoCompositionBuffer>>;
interface BackgroundRasterCache {
  image: HTMLImageElement | undefined;
  key: string;
  lease: BackgroundRasterLease | null;
  timer: ReturnType<typeof setTimeout>;
}

const backgroundRasters = new WeakMap<CanvasRenderingContext2D, BackgroundRasterCache>();

function releaseBackgroundRaster(entry: BackgroundRasterCache) {
  clearTimeout(entry.timer);
  entry.lease?.release();
  entry.lease = null;
  entry.image = undefined;
  entry.key = '';
}

function staticRasterKey(
  params: SceneBackgroundDraw,
  radius: number,
  image: HTMLImageElement | undefined
): string | null {
  const { remembered: _memory, blur: _blur, ...paint } = params.sceneBackground;
  if (
    paint.kind === 'solid' ||
    (paint.kind === 'gradient' && paint.animation?.mode && paint.animation.mode !== 'none')
  )
    return null;
  return JSON.stringify([
    params.width,
    params.height,
    radius,
    paint,
    image?.naturalWidth,
    image?.naturalHeight,
  ]);
}

/** Filter only the scene paint; foreground layers keep their own rendering semantics. */
export function drawSceneBackground(params: SceneBackgroundDraw) {
  if (params.sceneBackground.enabled === false) {
    const previous = backgroundRasters.get(params.context);
    if (previous) {
      releaseBackgroundRaster(previous);
      backgroundRasters.delete(params.context);
    }
    return;
  }
  if (params.camera) {
    const { camera, ...paint } = params;
    params.context.save();
    try {
      params.context.scale(camera.scale, camera.scale);
      params.context.translate(
        -camera.viewportX * (params.projectScale ?? 1),
        -camera.viewportY * (params.projectScale ?? 1)
      );
      drawSceneBackground(paint);
    } finally {
      params.context.restore();
    }
    return;
  }
  const radius = (params.sceneBackground.blur ?? 0) * (params.projectScale ?? 1);
  const image =
    params.sceneBackground.kind === 'image'
      ? params.loadedImages?.[params.sceneBackground.assetId]
      : undefined;
  const key = radius > 0 ? staticRasterKey(params, radius, image) : null;
  const previous = backgroundRasters.get(params.context);
  if (key && previous?.lease && previous.key === key && previous.image === image) {
    try {
      params.context.drawImage(previous.lease.canvas, 0, 0, params.width, params.height);
    } catch (error) {
      releaseBackgroundRaster(previous);
      backgroundRasters.delete(params.context);
      throw error;
    }
    return;
  }
  if (previous) {
    releaseBackgroundRaster(previous);
    backgroundRasters.delete(params.context);
  }
  if (params.sceneBackground.kind === VideoSceneBackgroundKind.SOLID || radius === 0) {
    drawSharpSceneBackground(params);
    return;
  }
  const lease = drawBlurredSceneBackground(params, radius);
  if (!key) {
    lease.release();
    return;
  }
  const entry: BackgroundRasterCache = {
    key,
    image,
    lease,
    timer: setTimeout(() => releaseBackgroundRaster(entry), 1000),
  };
  backgroundRasters.set(params.context, entry);
}

function drawBlurredSceneBackground(
  params: SceneBackgroundDraw,
  radius: number
): BackgroundRasterLease {
  if (!Number.isFinite(radius) || radius < 0 || params.width <= 0 || params.height <= 0)
    throw new Error('Invalid scene background dimensions.');
  const scale = Math.min(1, 2048 / Math.max(params.width, params.height), 128 / radius);
  const width = Math.max(1, Math.round(params.width * scale));
  const height = Math.max(1, Math.round(params.height * scale));
  const rasterRadius = Math.min(128, radius * scale);
  const pad = Math.ceil(rasterRadius * 3) + 2;
  const leases: NonNullable<ReturnType<typeof acquireVideoCompositionBuffer>>[] = [];
  const acquire = (w: number, h: number) => {
    const lease = acquireVideoCompositionBuffer(w, h, params.context.canvas?.ownerDocument);
    if (!lease) throw new Error('Scene background compositor is unavailable.');
    leases.push(lease);
    return lease.canvas;
  };
  let result: BackgroundRasterLease | undefined;
  try {
    const source = acquire(width, height);
    const filtered = acquire(width, height);
    const scratch = acquire(width + pad * 2, height + pad * 2);
    const sourceContext = source.getContext('2d');
    const filteredContext = filtered.getContext('2d');
    const scratchContext = scratch.getContext('2d');
    if (
      !sourceContext ||
      !('drawImage' in sourceContext) ||
      !filteredContext ||
      !('drawImage' in filteredContext) ||
      !scratchContext ||
      !('drawImage' in scratchContext)
    )
      throw new Error('Scene background compositor is unavailable.');
    for (const context of [sourceContext, filteredContext, scratchContext]) {
      context.reset?.();
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.globalAlpha = 1;
      context.globalCompositeOperation = 'source-over';
      context.filter = 'none';
      context.clearRect(
        0,
        0,
        context === scratchContext ? scratch.width : width,
        context === scratchContext ? scratch.height : height
      );
    }
    drawSharpSceneBackground({
      ...params,
      context: sourceContext as CanvasRenderingContext2D,
      width,
      height,
    });
    drawEdgePaddedBlur(filteredContext as CanvasRenderingContext2D, source, scratch, rasterRadius);
    params.context.drawImage(filtered, 0, 0, params.width, params.height);
    result = leases[1]!;
    return result;
  } finally {
    for (const lease of leases) if (lease !== result) lease.release();
  }
}
