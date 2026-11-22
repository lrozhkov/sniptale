import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import { getActiveVideoRecordingLeaseSnapshot } from '../../../recording-control-lease';
import { appendControlledCursorTelemetry, getVideoRecordingTabId } from '../../../session-state';
import type { RecordingTelemetrySnapshot } from '../../../../../../contracts/messaging/contracts/response-types';
import { isRecordingTelemetrySnapshot } from '../../../../../../features/video/project/validation/recording-telemetry';
import type { RouteResult } from '../shared';
import type { RecordingObservationsMessage } from '../../../../../../contracts/video/types/messages';
import {
  isFinalRecordingEventPackets,
  isRecordingEventObservationPacket,
} from '../../../../../../contracts/video/event-observations';
import {
  isFinalRecordingCursorPackets,
  isRecordingCursorObservationPacket,
} from '../../../../../../contracts/video/cursor-observations';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { attachOffscreenCommandCapability } from '@sniptale/platform/security/offscreen-command-capability';
import { browserWebNavigation } from '@sniptale/platform/browser/web-navigation';
import { getBackgroundRuntimeMessaging } from '../../../../../routing-contracts/runtime-messaging/services';

import { createRecordingObservationForwarder } from './recording-observation-forwarder';
const observationForwarding = {
  cursor: createRecordingObservationForwarder(),
  events: createRecordingObservationForwarder(),
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
  const kind = message.eventPacket || message.eventPackets ? 'events' : 'cursor';
  const packets = message.eventPackets ?? message.cursorPackets;
  const packet = message.eventPacket ?? message.cursorPacket ?? packets?.[0];
  const validPayload = packets
    ? kind === 'events'
      ? isFinalRecordingEventPackets(packets)
      : isFinalRecordingCursorPackets(packets)
    : kind === 'events'
      ? isRecordingEventObservationPacket(packet)
      : isRecordingCursorObservationPacket(packet);
  const outgoing =
    sender?.documentLifecycle === 'pending_deletion' || sender?.documentLifecycle === 'cached';
  const hasSourceFrame =
    sender?.frameId === 0 ||
    (outgoing &&
      typeof sender?.frameId === 'number' &&
      Number.isInteger(sender.frameId) &&
      sender.frameId >= 0);
  if (
    !binding ||
    !lease ||
    sender?.id !== chrome.runtime.id ||
    !hasSourceFrame ||
    (sender.documentLifecycle !== 'active' && !outgoing) ||
    typeof documentId !== 'string' ||
    !documentId ||
    typeof tabId !== 'number' ||
    tabId !== getVideoRecordingTabId() ||
    tabId !== lease.recordingTabId ||
    lease.recordingId !== message.recordingId ||
    !validPayload ||
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
  const snapshot = structuredClone(
    message.eventPackets
      ? { eventPackets: message.eventPackets }
      : message.cursorPackets
        ? { cursorPackets: message.cursorPackets }
        : message.eventPacket
          ? { eventPacket: message.eventPacket }
          : { cursorPacket: message.cursorPacket! }
  );
  const lastPacket = packets?.at(-1) ?? packet;
  const lastRecord = lastPacket?.records.at(-1);
  const queued = observationForwarding[kind]({
    key,
    source: JSON.stringify([documentId, packet.sourceInstanceId ?? null]),
    outgoing,
    closing: !!packets,
    endsSource: !!packets || (lastRecord?.kind === 'boundary' && lastRecord.reason === 'stop'),
    lastBatch: lastPacket?.batchSequence ?? packet.batchSequence,
    fingerprint: JSON.stringify(snapshot),
    verify: async () => {
      const frames = await browserWebNavigation.getAllFrames({ tabId });
      return !!frames?.some((frame) => frame.frameId === 0 && frame.documentId === documentId);
    },
    isCurrent: () => {
      const current = getActiveVideoRecordingLeaseSnapshot();
      return (
        current?.recordingId === lease.recordingId &&
        current.surfaceBinding?.generation === binding.generation &&
        current.surfaceBinding.streamInstanceId === binding.streamInstanceId &&
        current.recordingTabId === tabId &&
        getVideoRecordingTabId() === tabId
      );
    },
    publish: async () => {
      const response = await getBackgroundRuntimeMessaging().sendRuntimeMessage(
        attachOffscreenCommandCapability({
          type: VideoMessageType.OFFSCREEN_RECORDING_OBSERVATIONS,
          recordingId: lease.recordingId,
          generation: binding.generation,
          streamInstanceId: binding.streamInstanceId,
          nativeDocumentId: documentId,
          ...snapshot,
        })
      );
      if (response?.success !== true) throw new Error('Observation packet was refused');
    },
  });
  if (!queued.accepted) {
    sendResponse({ success: false, error: queued.error });
    return { handled: true, keepChannelOpen: false };
  }
  void queued.completion.then(
    () => sendResponse({ success: true }),
    () => sendResponse({ success: false, error: 'RECORDING_OBSERVATIONS_UNAVAILABLE' })
  );
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
    ('eventPacket' in message && message.eventPacket) ||
    ('eventPackets' in message && message.eventPackets) ||
    ('cursorPackets' in message && message.cursorPackets)
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
