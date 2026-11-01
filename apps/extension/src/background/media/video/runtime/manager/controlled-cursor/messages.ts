import type { RecordingTelemetrySnapshot } from '../../../../../../contracts/messaging/contracts/response-types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { getBackgroundRuntimeMessaging } from '../../../../../routing-contracts/runtime-messaging/services';
import type { RecordingFrameClockAnchor } from '../../../../../../contracts/video/recording-frame-clock';

const BROWSER_RECORDING_HISTORY_BLOCKS_ENABLED = true;

/** Uses the same source mode for initial viewport setup and later recording synchronization. */
export function browserRecordingHistoryBlockModes(): {
  cursorTrajectoryMode?: 'blocks';
  recordingEventsMode?: 'blocks';
} {
  return BROWSER_RECORDING_HISTORY_BLOCKS_ENABLED
    ? { cursorTrajectoryMode: 'blocks', recordingEventsMode: 'blocks' }
    : {};
}

export async function enableControlledCursorCapture(
  tabId: number,
  recordingId: string,
  offsetSeconds = 0,
  frameClock?: RecordingFrameClockAnchor | null
): Promise<void> {
  await getBackgroundRuntimeMessaging().sendTabMessage(tabId, {
    type: VideoMessageType.ENABLE_CONTROLLED_CURSOR_CAPTURE,
    recordingId,
    ...browserRecordingHistoryBlockModes(),
    ...(offsetSeconds > 0 ? { offsetSeconds } : {}),
    ...(frameClock === undefined ? {} : { frameClock }),
  });
}

export async function disableControlledCursorCapture(
  tabId: number,
  boundaryReason: 'stop' | 'observation' = 'stop'
): Promise<RecordingTelemetrySnapshot | null> {
  const response = await getBackgroundRuntimeMessaging().sendTabMessage(tabId, {
    type: VideoMessageType.DISABLE_CONTROLLED_CURSOR_CAPTURE,
    ...browserRecordingHistoryBlockModes(),
    ...(boundaryReason === 'observation' ? { boundaryReason } : {}),
  });

  return response.telemetry ?? null;
}

export async function syncControlledCursorCapture(
  tabId: number,
  action: 'pause' | 'resume',
  frameClock?: RecordingFrameClockAnchor | null
): Promise<void> {
  await getBackgroundRuntimeMessaging().sendTabMessage(tabId, {
    type:
      action === 'pause'
        ? VideoMessageType.PAUSE_CONTROLLED_CURSOR_CAPTURE
        : VideoMessageType.RESUME_CONTROLLED_CURSOR_CAPTURE,
    ...(frameClock === undefined ? {} : { frameClock }),
  });
}
