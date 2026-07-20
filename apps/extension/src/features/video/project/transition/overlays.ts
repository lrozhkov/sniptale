import { buildProjectTransitionSegments } from './project';
import { getTransitionIntensityMultiplier, getTransitionProgress } from './runtime';
import { getVideoTransitionTemplateDefinition } from './template';
import { type ResolvedTransitionOverlay } from './presentation.types.ts';
import {
  VideoTemplateDirection,
  type VideoProject,
  type VideoProjectTransitionSegment,
} from '../types/index';

function resolveDipOverlay(
  segment: VideoProjectTransitionSegment,
  progress: number
): ResolvedTransitionOverlay | null {
  if (!segment.transition.highlightColor) {
    return null;
  }

  return {
    alpha: progress < 0.5 ? progress * 2 : (1 - progress) * 2,
    color: segment.transition.highlightColor,
    direction: segment.transition.direction ?? VideoTemplateDirection.LEFT,
    kind: 'fill',
    progress,
    softness: 0,
    transitionId: segment.id,
    width: 1,
  };
}

function resolveSweepOverlay(
  segment: VideoProjectTransitionSegment,
  progress: number
): ResolvedTransitionOverlay | null {
  if (!segment.transition.highlightColor) {
    return null;
  }

  const definition = getVideoTransitionTemplateDefinition(
    segment.transition.templateKind ?? segment.transition.kind
  );
  const intensity = segment.transition.intensity ?? definition.defaultIntensity;
  const bellCurve = 1 - Math.abs(progress * 2 - 1);

  return {
    alpha: bellCurve * 0.5,
    color: segment.transition.highlightColor,
    direction: segment.transition.direction ?? definition.defaultDirection,
    kind: 'sweep',
    progress,
    softness: 0.45,
    transitionId: segment.id,
    width: 0.2 * getTransitionIntensityMultiplier(intensity),
  };
}

function resolveFadeThroughLightOverlay(
  segment: VideoProjectTransitionSegment,
  progress: number
): ResolvedTransitionOverlay | null {
  if (!segment.transition.highlightColor) {
    return null;
  }

  const bellCurve = 1 - Math.abs(progress * 2 - 1);

  return {
    alpha: bellCurve * 0.34,
    color: segment.transition.highlightColor,
    direction: segment.transition.direction ?? VideoTemplateDirection.LEFT,
    kind: 'fill',
    progress,
    softness: 0.12,
    transitionId: segment.id,
    width: 1,
  };
}

export function resolveTransitionOverlays(
  project: VideoProject,
  currentTime: number
): ResolvedTransitionOverlay[] {
  return buildProjectTransitionSegments(project).flatMap((segment) => {
    const progress = getTransitionProgress(segment, currentTime);
    if (progress === null) {
      return [];
    }

    switch (segment.transition.kind) {
      case 'FADE_THROUGH_LIGHT': {
        const overlay = resolveFadeThroughLightOverlay(segment, progress);
        return overlay ? [overlay] : [];
      }
      case 'DIP_TO_COLOR': {
        const overlay = resolveDipOverlay(segment, progress);
        return overlay ? [overlay] : [];
      }
      case 'LIGHT_SWEEP':
      case 'LINEAR_WIPE': {
        const overlay = resolveSweepOverlay(segment, progress);
        return overlay ? [overlay] : [];
      }
      case 'CROSSFADE':
      case 'PUSH':
      case 'SLIDE':
      case 'ZOOM_DISSOLVE':
      case 'BLUR_REVEAL':
      case 'CARD_FLIP_REVEAL':
      case 'RADIAL_REVEAL':
      case 'DISPLACEMENT_WARP':
      case 'GLARE_SWEEP':
        return [];
    }
  });
}
