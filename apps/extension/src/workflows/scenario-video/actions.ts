import { DEFAULT_IMAGE_CLIP_DURATION } from '../../features/video/project/defaults';
import {
  VideoProjectActionEventKind,
  VideoProjectActionPreset,
  type VideoProjectActionEvent,
} from '../../features/video/project/types';
import type {
  ScenarioProject,
  ScenarioSuggestedEvent,
} from '../../features/scenario/contracts/types/project';
import type { CaptureStepTimelineEntry } from './timeline';
import { resolveInteractionPoint } from './timeline';

function resolveActionPresetForSuggestedEvent(
  event: ScenarioSuggestedEvent
): VideoProjectActionPreset {
  switch (event.kind) {
    case 'scroll':
      return VideoProjectActionPreset.SCROLL_EMPHASIS;
    case 'keydown':
      return VideoProjectActionPreset.SPOTLIGHT;
    case 'input':
    case 'change':
      return VideoProjectActionPreset.DWELL_ZOOM;
    case 'click':
      return VideoProjectActionPreset.CLICK_RIPPLE;
  }
}

export function resolveActionKindForPreset(
  preset: VideoProjectActionPreset
): VideoProjectActionEvent['kind'] {
  switch (preset) {
    case VideoProjectActionPreset.SCROLL_EMPHASIS:
      return VideoProjectActionEventKind.SCROLL;
    case VideoProjectActionPreset.DWELL_ZOOM:
      return VideoProjectActionEventKind.PAUSE;
    case VideoProjectActionPreset.SPOTLIGHT:
      return VideoProjectActionEventKind.CALLOUT;
    case VideoProjectActionPreset.NONE:
    case VideoProjectActionPreset.CLICK_RIPPLE:
      return VideoProjectActionEventKind.CLICK;
  }
}

function createActionEvent(args: {
  id: string;
  label: string;
  point: VideoProjectActionEvent['point'];
  preset: VideoProjectActionPreset;
  time: number;
}): VideoProjectActionEvent {
  return {
    data: {},
    duration: 0,
    id: args.id,
    kind: resolveActionKindForPreset(args.preset),
    label: args.label,
    point: args.point,
    preset: args.preset,
    time: args.time,
  };
}

export function buildCaptureStepActionEvents(
  entries: CaptureStepTimelineEntry[]
): VideoProjectActionEvent[] {
  return entries.flatMap((entry) => {
    const interactionPoint = resolveInteractionPoint(entry.step);
    if (!interactionPoint) {
      return [];
    }

    return [
      createActionEvent({
        id: `${entry.step.id}:click`,
        label: entry.step.title || entry.step.body || entry.step.id,
        point: interactionPoint,
        preset: VideoProjectActionPreset.CLICK_RIPPLE,
        time: entry.start + 0.35,
      }),
    ];
  });
}

export function buildSuggestedActionEvents(
  project: ScenarioProject,
  entries: CaptureStepTimelineEntry[],
  fallbackStepDuration = DEFAULT_IMAGE_CLIP_DURATION
): VideoProjectActionEvent[] {
  const stepTimelineById = new Map(entries.map((entry) => [entry.step.id, entry]));

  return project.suggestedEvents
    .map((event, index) => {
      if (event.kind === 'scroll') {
        return null;
      }

      const stepEntry = getSuggestedEventStepEntry(entries, event, index, stepTimelineById);
      const stepPoint = stepEntry ? resolveInteractionPoint(stepEntry.step) : null;
      const preset = resolveActionPresetForSuggestedEvent(event);

      return createActionEvent({
        id: event.id,
        label: event.message,
        point: stepPoint,
        preset,
        time: (stepEntry?.start ?? index * fallbackStepDuration) + 0.45,
      });
    })
    .filter((event): event is VideoProjectActionEvent => event !== null);
}

function getSuggestedEventStepEntry(
  entries: CaptureStepTimelineEntry[],
  event: ScenarioSuggestedEvent,
  index: number,
  stepTimelineById: Map<string, CaptureStepTimelineEntry>
) {
  return (
    (event.sourceStepId ? stepTimelineById.get(event.sourceStepId) : null) ?? entries[index] ?? null
  );
}
