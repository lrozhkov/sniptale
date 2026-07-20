import { isLegacyScrollActionEvent } from '../../../project/timeline/source-time';
import { isVideoProjectUtilityLaneVisible } from '../../../project/utility-lanes';
import type { VideoProject, VideoProjectActionEvent } from '../../../project/types/index';
import type { VideoCompositionActionState } from '../../types';

function clampProgress(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function getVideoCompositionActionDuration(event: VideoProjectActionEvent): number {
  if (event.duration > 0) {
    return event.duration;
  }

  switch (event.preset) {
    case 'CLICK_RIPPLE':
      return 0.7;
    case 'SPOTLIGHT':
      return 1.1;
    case 'DWELL_ZOOM':
      return 1.3;
    case 'SCROLL_EMPHASIS':
      return 0.9;
    case 'NONE':
      return event.kind === 'CLICK' ? 0.6 : 0.5;
  }
}

function resolveActionState(
  event: VideoProjectActionEvent,
  currentTime: number
): VideoCompositionActionState | null {
  const duration = getVideoCompositionActionDuration(event);
  if (isLegacyScrollActionEvent(event)) {
    return null;
  }
  const end = event.time + duration;

  if (currentTime < event.time || currentTime > end) {
    return null;
  }

  return {
    duration,
    event,
    point: event.point,
    progress: clampProgress(duration <= 0 ? 1 : (currentTime - event.time) / duration),
    start: event.time,
  };
}

export function resolveVideoCompositionActions(
  project: VideoProject,
  currentTime: number
): VideoCompositionActionState[] {
  if (!isVideoProjectUtilityLaneVisible(project, 'actions')) {
    return [];
  }

  const states: VideoCompositionActionState[] = [];
  for (const event of project.actionEvents) {
    const state = resolveActionState(event, currentTime);
    if (state) {
      states.push(state);
    }
  }
  return states;
}
