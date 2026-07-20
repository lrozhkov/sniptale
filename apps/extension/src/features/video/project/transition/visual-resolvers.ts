import {
  getIncomingOffset,
  getTransitionIntensityMultiplier,
  resolveDirectionalDistance,
} from './runtime';
import { getVideoTransitionTemplateDefinition } from './template';
import {
  IDENTITY_TRANSITION_VISUAL_STATE,
  type ResolvedTransitionVisualState,
} from './presentation.types.ts';
import {
  VideoTemplateDirection,
  type VideoProjectClip,
  type VideoProjectTransitionSegment,
} from '../types/index';
import type { VideoTemplateIntensity } from '../types/index';

function resolveCrossfade(
  role: 'leading' | 'trailing',
  progress: number
): ResolvedTransitionVisualState {
  return {
    ...IDENTITY_TRANSITION_VISUAL_STATE,
    opacityMultiplier: role === 'leading' ? 1 - progress : progress,
  };
}

function resolveDip(role: 'leading' | 'trailing', progress: number): ResolvedTransitionVisualState {
  if (progress < 0.5) {
    return {
      ...IDENTITY_TRANSITION_VISUAL_STATE,
      opacityMultiplier: role === 'leading' ? 1 - progress * 2 : 0,
    };
  }

  return {
    ...IDENTITY_TRANSITION_VISUAL_STATE,
    opacityMultiplier: role === 'trailing' ? (progress - 0.5) * 2 : 0,
  };
}

function resolvePushOrSlide(
  clip: VideoProjectClip,
  direction: VideoTemplateDirection,
  intensity: VideoTemplateIntensity,
  role: 'leading' | 'trailing',
  progress: number,
  mode: 'push' | 'slide'
): ResolvedTransitionVisualState {
  const distance = resolveDirectionalDistance(
    clip,
    direction,
    (mode === 'push' ? 1 : 0.92) * getTransitionIntensityMultiplier(intensity)
  );
  const offset = getIncomingOffset(direction, distance);

  if (mode === 'slide' && role === 'leading') {
    return {
      ...IDENTITY_TRANSITION_VISUAL_STATE,
      opacityMultiplier: 1 - progress * 0.24,
      translateX: -offset.x * progress * 0.18,
      translateY: -offset.y * progress * 0.18,
    };
  }

  const progressMultiplier = role === 'leading' ? progress : 1 - progress;
  return {
    ...IDENTITY_TRANSITION_VISUAL_STATE,
    translateX: (role === 'leading' ? -1 : 1) * offset.x * progressMultiplier,
    translateY: (role === 'leading' ? -1 : 1) * offset.y * progressMultiplier,
  };
}

function resolveZoomOrBlur(
  intensity: VideoTemplateIntensity,
  role: 'leading' | 'trailing',
  progress: number,
  mode: 'zoom' | 'blur'
): ResolvedTransitionVisualState {
  const amount = getTransitionIntensityMultiplier(intensity);
  if (mode === 'zoom') {
    const scaleAmount = 0.12 * amount;
    return {
      ...IDENTITY_TRANSITION_VISUAL_STATE,
      opacityMultiplier: role === 'leading' ? 1 - progress : progress,
      scaleX: role === 'leading' ? 1 + scaleAmount * progress : 1 + scaleAmount * (1 - progress),
      scaleY: role === 'leading' ? 1 + scaleAmount * progress : 1 + scaleAmount * (1 - progress),
    };
  }

  return {
    ...IDENTITY_TRANSITION_VISUAL_STATE,
    blurAmount: 14 * amount * (role === 'leading' ? progress : 1 - progress),
    opacityMultiplier: role === 'leading' ? 1 - progress * 0.9 : progress,
  };
}

function resolveFadeThroughLight(
  intensity: VideoTemplateIntensity,
  role: 'leading' | 'trailing',
  progress: number
): ResolvedTransitionVisualState {
  const amount = getTransitionIntensityMultiplier(intensity);
  const bellCurve = 1 - Math.abs(progress * 2 - 1);
  const leadingScale = 1 + bellCurve * 0.018 * amount;
  const trailingScale = 1 + (1 - progress) * 0.008 * amount;

  return role === 'leading'
    ? {
        ...IDENTITY_TRANSITION_VISUAL_STATE,
        blurAmount: bellCurve * 4 * amount,
        opacityMultiplier: 1 - progress * 0.92,
        scaleX: leadingScale,
        scaleY: leadingScale,
      }
    : {
        ...IDENTITY_TRANSITION_VISUAL_STATE,
        blurAmount: bellCurve * 2.4 * amount,
        opacityMultiplier: progress,
        scaleX: trailingScale,
        scaleY: trailingScale,
      };
}

function resolveLinearWipe(
  direction: VideoTemplateDirection,
  role: 'leading' | 'trailing',
  progress: number
): ResolvedTransitionVisualState {
  const offset = getIncomingOffset(direction, 36);
  return role === 'leading'
    ? {
        ...IDENTITY_TRANSITION_VISUAL_STATE,
        opacityMultiplier: 1 - progress * 0.16,
      }
    : {
        ...IDENTITY_TRANSITION_VISUAL_STATE,
        opacityMultiplier: progress,
        translateX: offset.x * (1 - progress),
        translateY: offset.y * (1 - progress),
      };
}

function resolveCardFlip(
  clip: VideoProjectClip,
  direction: VideoTemplateDirection,
  intensity: VideoTemplateIntensity,
  role: 'leading' | 'trailing',
  progress: number
): ResolvedTransitionVisualState {
  const amount = getTransitionIntensityMultiplier(intensity);
  const distance = resolveDirectionalDistance(clip, direction, 0.12 * amount);
  const offset = getIncomingOffset(direction, distance);
  const horizontal =
    direction === VideoTemplateDirection.LEFT || direction === VideoTemplateDirection.RIGHT;
  const compressedScale = Math.min(1, Math.max(0.18, 1 - progress * 0.72 * amount));
  const revealedScale = Math.min(1, Math.max(0.18, 0.18 + progress * 0.82));

  return role === 'leading'
    ? {
        ...IDENTITY_TRANSITION_VISUAL_STATE,
        opacityMultiplier: 1 - progress * 0.84,
        scaleX: horizontal ? compressedScale : 1,
        scaleY: horizontal ? 1 : compressedScale,
        translateX: -offset.x * progress,
        translateY: -offset.y * progress,
      }
    : {
        ...IDENTITY_TRANSITION_VISUAL_STATE,
        opacityMultiplier: progress,
        scaleX: horizontal ? revealedScale : 1,
        scaleY: horizontal ? 1 : revealedScale,
        translateX: offset.x * (1 - progress) * 0.45,
        translateY: offset.y * (1 - progress) * 0.45,
      };
}

export function resolveTransitionVisualStateForRole(
  clip: VideoProjectClip,
  role: 'leading' | 'trailing',
  segment: VideoProjectTransitionSegment,
  progress: number
): ResolvedTransitionVisualState {
  const definition = getVideoTransitionTemplateDefinition(
    segment.transition.templateKind ?? segment.transition.kind
  );
  const direction = segment.transition.direction ?? definition.defaultDirection;
  const intensity = segment.transition.intensity ?? definition.defaultIntensity;

  switch (segment.transition.kind) {
    case 'CROSSFADE':
    case 'LIGHT_SWEEP':
    case 'RADIAL_REVEAL':
    case 'DISPLACEMENT_WARP':
    case 'GLARE_SWEEP':
      return resolveCrossfade(role, progress);
    case 'LINEAR_WIPE':
      return resolveLinearWipe(direction, role, progress);
    case 'FADE_THROUGH_LIGHT':
      return resolveFadeThroughLight(intensity, role, progress);
    case 'DIP_TO_COLOR':
      return resolveDip(role, progress);
    case 'PUSH':
      return resolvePushOrSlide(clip, direction, intensity, role, progress, 'push');
    case 'SLIDE':
      return resolvePushOrSlide(clip, direction, intensity, role, progress, 'slide');
    case 'ZOOM_DISSOLVE':
      return resolveZoomOrBlur(intensity, role, progress, 'zoom');
    case 'BLUR_REVEAL':
      return resolveZoomOrBlur(intensity, role, progress, 'blur');
    case 'CARD_FLIP_REVEAL':
      return resolveCardFlip(clip, direction, intensity, role, progress);
  }
}
