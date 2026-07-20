import { VideoSceneBackgroundKind, type VideoProjectGradientBackground } from '../types/index';
import { clampSceneBackgroundAngle, normalizeGradientAnimation } from './background-animation';
import { resolveGradientAnimationFrame } from './background-animation';
import {
  createVideoSceneGradientColorStopColor,
  createVideoSceneGradientCssStops,
  normalizeVideoSceneGradientStops,
  resolveVideoSceneGradientEndpointColors,
} from './gradient-stops';

export function normalizeGradientSceneBackground(
  sceneBackground: VideoProjectGradientBackground,
  fallbackColor: string
): VideoProjectGradientBackground {
  const stops = normalizeVideoSceneGradientStops(
    sceneBackground.stops,
    sceneBackground.from || fallbackColor,
    sceneBackground.to || fallbackColor
  );
  const endpoints = resolveVideoSceneGradientEndpointColors(
    stops,
    sceneBackground.from || fallbackColor,
    sceneBackground.to || fallbackColor
  );
  const normalizedGradient = {
    kind: VideoSceneBackgroundKind.GRADIENT,
    from: endpoints.from,
    to: endpoints.to,
    angle: clampSceneBackgroundAngle(sceneBackground.angle),
    stops,
  };
  const animation = normalizeGradientAnimation(sceneBackground.animation);
  return animation ? { ...normalizedGradient, animation } : normalizedGradient;
}

export function getSceneGradientLegacyColor(sceneBackground: VideoProjectGradientBackground) {
  return getSceneGradientStops(sceneBackground)[0]?.color ?? sceneBackground.from;
}

export function getSceneGradientStyle(
  sceneBackground: VideoProjectGradientBackground,
  frameParams?: { audioEnvelope?: number; time?: number }
) {
  const frame = resolveGradientSceneBackgroundFrame(sceneBackground, frameParams);
  return {
    background: `linear-gradient(${frame.angle}deg, ${createVideoSceneGradientCssStops(
      getSceneGradientStops(frame),
      { fromStop: frame.fromStop, toStop: frame.toStop }
    )})`,
  };
}

export function drawGradientSceneBackground(params: {
  context: CanvasRenderingContext2D;
  currentTime?: number | undefined;
  audioEnvelope?: number | undefined;
  height: number;
  sceneBackground: VideoProjectGradientBackground;
  width: number;
}) {
  const frame = resolveGradientSceneBackgroundFrame(params.sceneBackground, {
    ...(params.audioEnvelope === undefined ? {} : { audioEnvelope: params.audioEnvelope }),
    ...(params.currentTime === undefined ? {} : { time: params.currentTime }),
  });

  const vector = resolveGradientVector(params.width, params.height, frame.angle);
  const gradient = params.context.createLinearGradient(vector.x0, vector.y0, vector.x1, vector.y1);
  const span = frame.toStop - frame.fromStop;
  getSceneGradientStops(frame).forEach((stop) => {
    gradient.addColorStop(
      (frame.fromStop + stop.offset * span) / 100,
      createVideoSceneGradientColorStopColor(stop)
    );
  });
  params.context.fillStyle = gradient;
  params.context.fillRect(0, 0, params.width, params.height);
}

export function resolveGradientSceneBackgroundFrame(
  sceneBackground: VideoProjectGradientBackground,
  frameParams?: { audioEnvelope?: number | undefined; time?: number | undefined }
): VideoProjectGradientBackground & { fromStop: number; toStop: number } {
  const frame = resolveGradientAnimationFrame({
    angle: sceneBackground.angle,
    animation: normalizeGradientAnimation(sceneBackground.animation),
    audioEnvelope: frameParams?.audioEnvelope ?? 0,
    time: frameParams?.time ?? 0,
  });

  return {
    ...sceneBackground,
    angle: frame.angle,
    fromStop: frame.fromStop,
    toStop: frame.toStop,
  };
}

function getSceneGradientStops(sceneBackground: VideoProjectGradientBackground) {
  return normalizeVideoSceneGradientStops(
    sceneBackground.stops,
    sceneBackground.from,
    sceneBackground.to
  );
}

function resolveGradientVector(width: number, height: number, angle: number) {
  const radians = ((angle - 90) * Math.PI) / 180;
  const radius = Math.sqrt(width * width + height * height) / 2;
  const offsetX = Math.cos(radians) * radius;
  const offsetY = Math.sin(radians) * radius;

  return {
    x0: width / 2 - offsetX,
    y0: height / 2 - offsetY,
    x1: width / 2 + offsetX,
    y1: height / 2 + offsetY,
  };
}
