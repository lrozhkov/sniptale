import type { RecordingTelemetryEntry } from '../../../../composition/persistence/recordings/contracts';
import type { VideoProject } from '../../../../features/video/project/types';

export const TIMELINE_CURSOR_ROW_HEIGHT = 24;

/** One row geometry shared by the history rail, canvas, playhead and drop coordinates. */
export function getTimelineHistoryLayout(
  project: VideoProject,
  telemetry: readonly RecordingTelemetryEntry[] = [],
  cursorVisible = false
) {
  const hasKeys = project.actionEvents.some((event) => event.kind === 'KEY');
  const hasTyping = telemetry.some((entry) =>
    entry.signals.some((signal) => signal.kind === 'typing')
  );
  const clickTop = 4;
  const keyTop = hasKeys ? clickTop + 28 : null;
  const typingTop = hasTyping ? clickTop + 28 + (hasKeys ? 28 : 0) : null;
  const actionHeight = Math.max(56, 8 + 28 * (1 + Number(hasKeys) + Number(hasTyping)));
  const cursorTop = cursorVisible && project.cursorTrack ? actionHeight : null;
  return {
    clickTop,
    keyTop,
    typingTop,
    actionHeight,
    cursorTop,
    height: actionHeight + (cursorTop === null ? 0 : TIMELINE_CURSOR_ROW_HEIGHT),
  };
}
