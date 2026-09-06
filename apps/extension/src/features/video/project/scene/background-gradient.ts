import { parsePaint, type Gradient } from '@sniptale/foundation/paint';
import { VideoSceneBackgroundKind, type VideoProjectGradientBackground } from '../types/index';
import { normalizeGradientAnimation, resolveGradientAnimationFrame } from './background-animation';
import { drawSceneGradient } from './background-gradient-canvas';

export function createSceneGradientBackground(color = '#111111'): VideoProjectGradientBackground {
  return {
    kind: VideoSceneBackgroundKind.GRADIENT,
    gradient: {
      type: 'linear',
      angle: 135,
      interpolation: 'srgb',
      repeat: { enabled: false, span: 1 },
      stops: [
        { id: 'scene-start', color, position: 0, midpoint: 0.5 },
        { id: 'scene-end', color: '#334155ff', position: 1, midpoint: 0.5 },
      ],
    },
  };
}

export function normalizeGradientSceneBackground(
  sceneBackground: VideoProjectGradientBackground
): VideoProjectGradientBackground {
  const paint = parsePaint({ kind: 'gradient', gradient: sceneBackground.gradient });
  if (paint?.kind !== 'gradient') throw new Error('Invalid scene gradient');
  const animation = normalizeGradientAnimation(sceneBackground.animation);
  return {
    kind: VideoSceneBackgroundKind.GRADIENT,
    gradient: paint.gradient,
    ...(animation ? { animation } : {}),
  };
}

export function getSceneGradientLegacyColor(sceneBackground: VideoProjectGradientBackground) {
  return sceneBackground.gradient.stops[0]!.color;
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
  drawSceneGradient(params.context, frame.gradient, params.width, params.height);
}

export function resolveGradientSceneBackgroundFrame(
  sceneBackground: VideoProjectGradientBackground,
  frameParams?: { audioEnvelope?: number | undefined; time?: number | undefined }
): VideoProjectGradientBackground {
  const gradient = sceneBackground.gradient;
  const angle =
    gradient.type === 'linear'
      ? gradient.angle
      : gradient.type === 'conic'
        ? gradient.startAngle
        : 0;
  const frame = resolveGradientAnimationFrame({
    angle,
    animation: normalizeGradientAnimation(sceneBackground.animation),
    audioEnvelope: frameParams?.audioEnvelope ?? 0,
    time: frameParams?.time ?? 0,
  });
  const animated: Gradient = {
    ...gradient,
    stops: gradient.stops.map((stop) => ({
      ...stop,
      position: (frame.fromStop + stop.position * (frame.toStop - frame.fromStop)) / 100,
    })),
  };
  if (animated.type === 'linear') animated.angle = frame.angle;
  if (animated.type === 'conic') animated.startAngle = frame.angle;
  return { ...sceneBackground, gradient: animated };
}
