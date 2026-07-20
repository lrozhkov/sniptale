import { DEFAULT_VIDEO_PROJECT_BACKGROUND } from '../defaults';
import {
  drawGradientSceneBackground,
  getSceneGradientLegacyColor,
  getSceneGradientStyle,
  normalizeGradientSceneBackground,
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

  switch (sceneBackground.kind) {
    case VideoSceneBackgroundKind.SOLID:
      return createFallbackSolidBackground(sceneBackground.color || fallbackColor);
    case VideoSceneBackgroundKind.GRADIENT:
      return normalizeGradientSceneBackground(sceneBackground, fallbackColor);
    case VideoSceneBackgroundKind.IMAGE:
      return sceneBackground.assetId
        ? sceneBackground
        : createFallbackSolidBackground(fallbackColor);
  }
}

function drawCoverImage(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  imageWidth: number,
  imageHeight: number,
  width: number,
  height: number
) {
  if (imageWidth <= 0 || imageHeight <= 0 || width <= 0 || height <= 0) {
    return;
  }

  const scale = Math.max(width / imageWidth, height / imageHeight);
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
    sceneBackground: normalizedSceneBackground,
  };
}

export function getProjectSceneBackgroundImageAssetId(
  project: VideoProjectSceneBackgroundSource
): string | null {
  const sceneBackground = getProjectSceneBackground(project);
  return sceneBackground.kind === VideoSceneBackgroundKind.IMAGE ? sceneBackground.assetId : null;
}

export function getSceneBackgroundStyle(
  sceneBackground: VideoProjectSceneBackground,
  assetUrl?: string,
  frameParams?: { audioEnvelope?: number; time?: number }
) {
  switch (sceneBackground.kind) {
    case VideoSceneBackgroundKind.SOLID:
      return {
        background: sceneBackground.color,
      };
    case VideoSceneBackgroundKind.GRADIENT: {
      return getSceneGradientStyle(sceneBackground, frameParams);
    }
    case VideoSceneBackgroundKind.IMAGE:
      return assetUrl
        ? {
            backgroundColor: DEFAULT_VIDEO_PROJECT_BACKGROUND,
            backgroundImage: `url("${assetUrl}")`,
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            backgroundSize: 'cover',
          }
        : {
            background: DEFAULT_VIDEO_PROJECT_BACKGROUND,
          };
  }
}

export function drawSceneBackground(params: {
  context: CanvasRenderingContext2D;
  currentTime?: number;
  audioEnvelope?: number;
  height: number;
  loadedImages?: Record<string, HTMLImageElement>;
  sceneBackground: VideoProjectSceneBackground;
  width: number;
}) {
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

      drawCoverImage(
        params.context,
        image,
        image.naturalWidth,
        image.naturalHeight,
        params.width,
        params.height
      );
    }
  }
}
