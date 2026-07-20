import { createAnimatedState } from './motion-variants';
import type {
  VideoProjectAnnotationClip,
  VideoTemplateDirection,
  VideoTemplateIntensity,
} from '../types/index';
import { VideoOverlayTemplateKind } from '../types/index';

function resolveTemplateIntensityMultiplier(intensity: VideoTemplateIntensity) {
  switch (intensity) {
    case 'SOFT':
      return 0.72;
    case 'BOLD':
      return 1.18;
    case 'BALANCED':
      return 1;
  }
}

function resolveDirectionSign(direction: VideoTemplateDirection) {
  switch (direction) {
    case 'RIGHT':
    case 'DOWN':
      return 1;
    case 'LEFT':
    case 'UP':
      return -1;
  }
}

function getAnimationWindowProgress(duration: number, elapsedTime: number, clipDuration: number) {
  if (duration <= 0 || clipDuration <= 0) {
    return 1;
  }

  return Math.min(1, Math.max(0, elapsedTime / duration));
}

export function resolveAnnotationMotionState(params: {
  animation: VideoProjectAnnotationClip['introAnimation'];
  clip: VideoProjectAnnotationClip;
  currentTime: number;
  phase: 'intro' | 'outro';
}) {
  const intensityMultiplier = resolveTemplateIntensityMultiplier(params.clip.intensity);
  const elapsedTime =
    params.phase === 'intro'
      ? Math.max(0, params.currentTime - params.clip.startTime)
      : Math.max(0, params.clip.startTime + params.clip.duration - params.currentTime);
  const durationSeconds =
    (params.phase === 'intro' ? params.clip.introDurationMs : params.clip.outroDurationMs) / 1000;
  const playbackProgress = getAnimationWindowProgress(
    durationSeconds,
    elapsedTime,
    params.clip.duration
  );
  const motionDistance =
    params.clip.templateKind === VideoOverlayTemplateKind.SIDE_REVEAL_PANEL
      ? params.clip.transform.width * intensityMultiplier
      : 32 * intensityMultiplier;

  return createAnimatedState({
    animation: params.animation,
    clip: params.clip,
    directionSign: resolveDirectionSign(params.clip.direction),
    intensityMultiplier,
    motionDistance,
    phase: params.phase,
    playbackProgress,
  });
}
