import type { RecordingTelemetrySnapshot } from '../../../../../../contracts/messaging/contracts/response-types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { getBackgroundRuntimeMessaging } from '../../../../../routing-contracts/runtime-messaging/services';
import type { RecordingFrameClockAnchor } from '../../../../../../contracts/video/recording-frame-clock';

export async function enableControlledCursorCapture(
  tabId: number,
  recordingId: string,
  offsetSeconds = 0,
  frameClock?: RecordingFrameClockAnchor | null
): Promise<void> {
  await getBackgroundRuntimeMessaging().sendTabMessage(tabId, {
    type: VideoMessageType.ENABLE_CONTROLLED_CURSOR_CAPTURE,
    recordingId,
    ...(offsetSeconds > 0 ? { offsetSeconds } : {}),
    ...(frameClock === undefined ? {} : { frameClock }),
  });
}

export async function disableControlledCursorCapture(
  tabId: number
): Promise<RecordingTelemetrySnapshot | null> {
  const response = await getBackgroundRuntimeMessaging().sendTabMessage(tabId, {
    type: VideoMessageType.DISABLE_CONTROLLED_CURSOR_CAPTURE,
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
