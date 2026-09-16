import { guideVideoActionSchema } from '@sniptale/runtime-contracts/scenario/guide-parser';
import type { GuideVideoAction } from '@sniptale/runtime-contracts/scenario/types/guide';
import type { RecordingActionEvent } from '../../../features/video/project/types';
import { isRecordingPoint } from '../../../features/video/project/validation/recording-telemetry';

/** Copies only declared control descriptors; raw telemetry data never enters the guide. */
export function projectGuideVideoActions(
  events: readonly RecordingActionEvent[]
): GuideVideoAction[] {
  const actions: GuideVideoAction[] = [];
  const label = (value: unknown) => (typeof value === 'string' ? value.slice(0, 160) : '');
  for (const event of events) {
    if (event.kind !== 'CLICK' && event.kind !== 'KEY') continue;
    const target = {
      name: label(event.data['targetName']),
      tag: label(event.data['targetTag']),
      role: label(event.data['targetRole']),
    };
    const result = guideVideoActionSchema.safeParse({
      id: event.id,
      kind: event.kind,
      time: event.time,
      duration: Math.min(event.duration, 10),
      label: label(event.label),
      point:
        event.kind === 'CLICK' && isRecordingPoint(event.recordingPoint)
          ? { ...event.recordingPoint }
          : null,
      target: Object.values(target).some(Boolean) ? target : null,
    });
    if (result.success) actions.push(result.data);
  }
  return actions.sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
}

/** Overlapping events resolve to the latest active source event, never the nearest future event. */
export function guideVideoActionAt(actions: readonly GuideVideoAction[], time: number) {
  return actions.findLast((action) => time >= action.time && time <= action.time + action.duration);
}
