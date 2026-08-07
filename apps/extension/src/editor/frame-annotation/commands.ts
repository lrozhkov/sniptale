import type { FrameAnnotationCommandId } from '../../features/highlighter/frame-annotation/commands';
import {
  createDefaultFrameCallout,
  createDefaultFrameStepBadge,
} from '../../features/highlighter/frame-annotation/defaults';
import type { FrameAnnotationSnapshotV1 } from '../../features/highlighter/frame-annotation';

const MIN_FRAME_SIZE = 8;

export function applyFrameAnnotationCommand(
  snapshot: FrameAnnotationSnapshotV1,
  command: FrameAnnotationCommandId
): FrameAnnotationSnapshotV1 {
  if (command.startsWith('effect-'))
    return { ...snapshot, effectMode: command.slice(7) as 'border' | 'blur' | 'focus' };
  if (command === 'step-badge')
    return {
      ...snapshot,
      stepBadge: snapshot.stepBadge
        ? { ...snapshot.stepBadge, enabled: !snapshot.stepBadge.enabled }
        : createDefaultFrameStepBadge(),
    };
  if (command === 'callout')
    return {
      ...snapshot,
      callout: snapshot.callout
        ? { ...snapshot.callout, enabled: !snapshot.callout.enabled }
        : createDefaultFrameCallout(),
    };
  if (command === 'increase')
    return {
      ...snapshot,
      x: snapshot.x - 5,
      y: snapshot.y - 5,
      width: snapshot.width + 10,
      height: snapshot.height + 10,
    };
  if (
    command === 'decrease' &&
    snapshot.width >= MIN_FRAME_SIZE + 10 &&
    snapshot.height >= MIN_FRAME_SIZE + 10
  )
    return {
      ...snapshot,
      x: snapshot.x + 5,
      y: snapshot.y + 5,
      width: snapshot.width - 10,
      height: snapshot.height - 10,
    };
  return snapshot;
}
