import { buildProjectTransitionSegments } from './project';
import { getTransitionProgress } from './runtime';
import { resolveTransitionVisualStateForRole } from './visual-resolvers';
import {
  IDENTITY_TRANSITION_VISUAL_STATE,
  type ResolvedTransitionVisualState,
} from './presentation.types.ts';
import {
  type VideoProject,
  type VideoProjectClip,
  type VideoProjectTransitionSegment,
} from '../types/index';

function findClipTransitionSegment(
  project: VideoProject,
  clip: VideoProjectClip,
  currentTime: number
): { role: 'leading' | 'trailing'; segment: VideoProjectTransitionSegment } | null {
  for (const segment of buildProjectTransitionSegments(project)) {
    if (currentTime < segment.start || currentTime >= segment.end) {
      continue;
    }
    if (segment.leadingClipId === clip.id) {
      return { role: 'leading', segment };
    }
    if (segment.trailingClipId === clip.id) {
      return { role: 'trailing', segment };
    }
  }

  return null;
}

export function resolveClipTransitionVisualState(
  project: VideoProject,
  clip: VideoProjectClip,
  currentTime: number
): ResolvedTransitionVisualState {
  const activeTransition = findClipTransitionSegment(project, clip, currentTime);
  if (!activeTransition) {
    return IDENTITY_TRANSITION_VISUAL_STATE;
  }

  const progress = getTransitionProgress(activeTransition.segment, currentTime);
  if (progress === null) {
    return IDENTITY_TRANSITION_VISUAL_STATE;
  }

  return resolveTransitionVisualStateForRole(
    clip,
    activeTransition.role,
    activeTransition.segment,
    progress
  );
}

export function resolveClipTransitionAudioMultiplier(
  project: VideoProject,
  clip: VideoProjectClip,
  currentTime: number
): number {
  const activeTransition = findClipTransitionSegment(project, clip, currentTime);
  if (!activeTransition) {
    return 1;
  }

  const progress = getTransitionProgress(activeTransition.segment, currentTime);
  if (progress === null) {
    return 1;
  }

  return activeTransition.role === 'leading' ? 1 - progress : progress;
}
