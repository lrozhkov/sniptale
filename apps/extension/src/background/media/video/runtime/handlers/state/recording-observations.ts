import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import { getActiveVideoRecordingLeaseSnapshot } from '../../../recording-control-lease';
import { appendControlledCursorTelemetry, getVideoRecordingTabId } from '../../../session-state';
import type { RecordingTelemetrySnapshot } from '../../../../../../contracts/messaging/contracts/response-types';
import { isRecordingTelemetrySnapshot } from '../../../../../../features/video/project/validation/recording-telemetry';
import type { RouteResult } from '../shared';

/** The outgoing top source document hands off facts before its response channel disappears. */
export function handleRecordingObservations(
  message: { recordingId: string; telemetry: RecordingTelemetrySnapshot },
  sendResponse: ResponseSender,
  sender?: chrome.runtime.MessageSender
): RouteResult {
  const lease = getActiveVideoRecordingLeaseSnapshot();
  const valid =
    sender?.id === chrome.runtime.id &&
    sender.frameId === 0 &&
    typeof sender.documentId === 'string' &&
    sender.documentId.length > 0 &&
    (sender.documentLifecycle === 'active' || sender.documentLifecycle === 'pending_deletion') &&
    sender.tab?.id === getVideoRecordingTabId() &&
    lease?.recordingTabId === sender.tab?.id &&
    lease?.recordingId === message.recordingId &&
    isRecordingTelemetrySnapshot(message.telemetry) &&
    Array.isArray(message.telemetry.signals) &&
    message.telemetry.provenance?.source === 'browser' &&
    message.telemetry.observationClock?.domain === 'observation';
  if (valid) appendControlledCursorTelemetry(message.telemetry);
  sendResponse(
    valid
      ? { success: true }
      : { success: false, error: 'RECORDING_OBSERVATIONS_SOURCE_UNAVAILABLE' }
  );
  return { handled: true, keepChannelOpen: false };
}
