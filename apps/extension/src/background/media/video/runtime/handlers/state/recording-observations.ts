import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import { getActiveVideoRecordingLeaseSnapshot } from '../../../recording-control-lease';
import { appendControlledCursorTelemetry, getVideoRecordingTabId } from '../../../session-state';
import type { RecordingTelemetrySnapshot } from '../../../../../../contracts/messaging/contracts/response-types';
import { isRecordingTelemetrySnapshot } from '../../../../../../features/video/project/validation/recording-telemetry';
import type { RouteResult } from '../shared';
import type { RecordingObservationsMessage } from '../../../../../../contracts/video/types/messages';
import { isRecordingEventObservationPacket } from '../../../../../../contracts/video/event-observations';
import { isRecordingCursorObservationPacket } from '../../../../../../contracts/video/cursor-observations';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { attachOffscreenCommandCapability } from '@sniptale/platform/security/offscreen-command-capability';
import { browserWebNavigation } from '@sniptale/platform/browser/web-navigation';
import { getBackgroundRuntimeMessaging } from '../../../../../routing-contracts/runtime-messaging/services';

type Forwarding = {
  key: string;
  documentId: string | null;
  pending: number;
  tail: Promise<void>;
};
const observationForwarding: { cursor: Forwarding | null; events: Forwarding | null } = {
  cursor: null,
  events: null,
};

function forwardBlockObservations(
  message: RecordingObservationsMessage,
  sendResponse: ResponseSender,
  sender?: chrome.runtime.MessageSender
): RouteResult {
  const lease = getActiveVideoRecordingLeaseSnapshot();
  const binding = lease?.surfaceBinding;
  const documentId = sender?.documentId;
  const tabId = sender?.tab?.id;
  const kind = message.eventPacket ? 'events' : 'cursor';
  const packet = message.eventPacket ?? message.cursorPacket;
  if (
    !binding ||
    !lease ||
    sender?.id !== chrome.runtime.id ||
    sender.frameId !== 0 ||
    sender.documentLifecycle !== 'active' ||
    typeof documentId !== 'string' ||
    !documentId ||
    typeof tabId !== 'number' ||
    tabId !== getVideoRecordingTabId() ||
    tabId !== lease.recordingTabId ||
    lease.recordingId !== message.recordingId ||
    !(kind === 'cursor'
      ? isRecordingCursorObservationPacket(packet)
      : isRecordingEventObservationPacket(packet)) ||
    !packet ||
    packet.recordingId !== message.recordingId
  ) {
    sendResponse({ success: false, error: 'RECORDING_OBSERVATIONS_SOURCE_UNAVAILABLE' });
    return { handled: true, keepChannelOpen: false };
  }
  const key = JSON.stringify([
    lease.recordingId,
    binding.generation,
    binding.streamInstanceId,
    tabId,
  ]);
  if (observationForwarding[kind]?.key !== key)
    observationForwarding[kind] = { key, documentId: null, pending: 0, tail: Promise.resolve() };
  const forwarding = observationForwarding[kind];
  if (!forwarding) throw new Error('Observation forwarding state is unavailable');
  if (forwarding.pending >= 2) {
    sendResponse({ success: false, error: 'RECORDING_OBSERVATIONS_BACKPRESSURE' });
    return { handled: true, keepChannelOpen: false };
  }
  const snapshot = structuredClone(packet);
  forwarding.pending++;
  const work = forwarding.tail.then(async () => {
    if (forwarding.documentId !== documentId) {
      const frames = await browserWebNavigation.getAllFrames({ tabId });
      if (!frames?.some((frame) => frame.frameId === 0 && frame.documentId === documentId))
        throw new Error('Source document is unavailable');
      forwarding.documentId = documentId;
    }
    const current = getActiveVideoRecordingLeaseSnapshot();
    if (
      current?.recordingId !== lease.recordingId ||
      current.surfaceBinding?.generation !== binding.generation ||
      current.surfaceBinding.streamInstanceId !== binding.streamInstanceId ||
      current.recordingTabId !== tabId ||
      getVideoRecordingTabId() !== tabId
    )
      throw new Error('Source binding is unavailable');
    const response = await getBackgroundRuntimeMessaging().sendRuntimeMessage(
      attachOffscreenCommandCapability({
        type: VideoMessageType.OFFSCREEN_RECORDING_OBSERVATIONS,
        recordingId: lease.recordingId,
        generation: binding.generation,
        streamInstanceId: binding.streamInstanceId,
        nativeDocumentId: documentId,
        ...(isRecordingCursorObservationPacket(snapshot)
          ? { cursorPacket: snapshot }
          : { eventPacket: snapshot }),
      })
    );
    if (response?.success !== true) throw new Error('Observation packet was refused');
  });
  forwarding.tail = work.catch(() => undefined);
  void work
    .then(
      () => sendResponse({ success: true }),
      () => sendResponse({ success: false, error: 'RECORDING_OBSERVATIONS_UNAVAILABLE' })
    )
    .finally(() => {
      forwarding.pending--;
    });
  return { handled: true, keepChannelOpen: true };
}

/** The outgoing top source document hands off facts before its response channel disappears. */
export function handleRecordingObservations(
  message:
    | RecordingObservationsMessage
    | { recordingId: string; telemetry: RecordingTelemetrySnapshot },
  sendResponse: ResponseSender,
  sender?: chrome.runtime.MessageSender
): RouteResult {
  if (
    ('cursorPacket' in message && message.cursorPacket) ||
    ('eventPacket' in message && message.eventPacket)
  )
    return forwardBlockObservations(message, sendResponse, sender);
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
