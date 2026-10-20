import { attachOffscreenCommandCapability } from '@sniptale/platform/security/offscreen-command-capability';
import { runtimeInfo } from '@sniptale/platform/browser/runtime';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type {
  CountdownCameraOfferMessage,
  CountdownCameraCloseMessage,
} from '@sniptale/runtime-contracts/video/types/messages.control';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import { getBackgroundRuntimeMessaging } from '../../../../routing-contracts/runtime-messaging/services';
import { getActiveVideoRecordingLeaseSnapshot } from '../../recording-control-lease';
import { ensureActiveVideoRecordingLeaseHydrated } from '../recording-completion';
import { getVideoRecordingRuntimeState } from '../session-state';
import { resolveTrustedPopupRuntimeSenderUrl } from '../sender-policy';
import { createRouteErrorResponse } from '../../../../routing-contracts/response';

type CameraCommand = CountdownCameraOfferMessage | CountdownCameraCloseMessage;
let recordingId: string | null = null;
const generations = new Map<string, { generation: number; closed: boolean }>();

function requireCapability(message: CameraCommand, sender?: chrome.runtime.MessageSender) {
  const senderUrl = resolveTrustedPopupRuntimeSenderUrl(sender);
  const lease = getActiveVideoRecordingLeaseSnapshot();
  if (
    !senderUrl ||
    !lease ||
    lease.phase === 'terminal' ||
    lease.expiresAt <= Date.now() ||
    lease.ownerSenderUrl !== senderUrl ||
    lease.recordingId !== message.recordingId ||
    lease.controlToken !== message.controlToken ||
    !lease.surfaceBinding
  )
    throw new Error('Unauthorized countdown camera capability');
  return {
    lease,
    binding: { recordingId: lease.recordingId, ...lease.surfaceBinding },
  };
}

async function resolvePopupDocumentId(sender?: chrome.runtime.MessageSender): Promise<string> {
  if (sender?.documentId) return sender.documentId;
  if (!sender?.url || sender.tab) throw new Error('Unauthorized countdown camera document');
  const contexts = await runtimeInfo.getContexts({ documentUrls: [sender.url] });
  const matching = contexts.filter(
    (context) => context.contextType === 'POPUP' && context.documentUrl === sender.url
  );
  const documentId = matching.length === 1 ? matching[0]?.documentId : undefined;
  if (typeof documentId !== 'string' || documentId.length === 0)
    throw new Error('Unauthorized countdown camera document');
  return documentId;
}

function requireCountdown(message: CameraCommand, sender?: chrome.runtime.MessageSender) {
  const authority = requireCapability(message, sender);
  if (
    authority.lease.phase !== 'prepared' ||
    getVideoRecordingRuntimeState().status !== VideoRecordingStatus.COUNTDOWN
  ) {
    throw new Error('Countdown camera is unavailable');
  }
  return authority;
}

function closePeer(peerId: string): Promise<unknown> {
  return getBackgroundRuntimeMessaging().sendRuntimeMessage(
    attachOffscreenCommandCapability({
      type: VideoMessageType.OFFSCREEN_VIDEO_RECORDING_CAMERA_CLOSE,
      peerId,
    })
  );
}

async function runCameraCommand(message: CameraCommand, sender?: chrome.runtime.MessageSender) {
  await ensureActiveVideoRecordingLeaseHydrated();
  const initial = requireCapability(message, sender);
  const documentId = await resolvePopupDocumentId(sender);
  const { lease, binding } = requireCapability(message, sender);
  if (
    binding.generation !== initial.binding.generation ||
    binding.streamInstanceId !== initial.binding.streamInstanceId
  )
    throw new Error('Stale countdown camera source');
  const peerId = `countdown:${JSON.stringify([lease.recordingId, documentId, message.peerGeneration])}`;
  if (recordingId !== lease.recordingId) {
    generations.clear();
    recordingId = lease.recordingId;
  }
  const previous = generations.get(documentId);
  if (message.type === VideoMessageType.COUNTDOWN_CAMERA_CLOSE) {
    if (!previous || message.peerGeneration >= previous.generation) {
      if (previous || generations.size < 8)
        generations.set(documentId, { generation: message.peerGeneration, closed: true });
    }
    await closePeer(peerId);
    return { success: true };
  }
  requireCountdown(message, sender);
  if (
    (previous !== undefined && message.peerGeneration <= previous.generation) ||
    (previous === undefined && generations.size >= 8)
  ) {
    throw new Error('Stale countdown camera generation');
  }
  const negotiation = { generation: message.peerGeneration, closed: false };
  generations.set(documentId, negotiation);
  if (previous !== undefined) {
    await closePeer(
      `countdown:${JSON.stringify([lease.recordingId, documentId, previous.generation])}`
    );
    requireCountdown(message, sender);
    if (generations.get(documentId) !== negotiation || negotiation.closed)
      throw new Error('Stale countdown camera generation');
  }
  try {
    const response = await getBackgroundRuntimeMessaging().sendRuntimeMessage(
      attachOffscreenCommandCapability({
        type: VideoMessageType.OFFSCREEN_VIDEO_RECORDING_CAMERA_OFFER,
        peerId,
        sdp: message.sdp,
        source: { kind: 'countdown', ...binding },
      })
    );
    const current = requireCountdown(message, sender);
    if (
      current.binding.generation !== binding.generation ||
      current.binding.streamInstanceId !== binding.streamInstanceId
    )
      throw new Error('Stale countdown camera source');
    if (generations.get(documentId) !== negotiation || negotiation.closed)
      throw new Error('Stale countdown camera generation');
    if (!response?.success || !response.sdp)
      throw new Error('Countdown camera preview is unavailable');
    return { success: true, sdp: response.sdp };
  } catch (error) {
    await closePeer(peerId).catch(() => undefined);
    throw error;
  }
}

export function routeCountdownCamera(args: {
  message: CameraCommand;
  sender: chrome.runtime.MessageSender | undefined;
  sendResponse: ResponseSender;
}): boolean {
  void runCameraCommand(args.message, args.sender).then(args.sendResponse, (error) =>
    args.sendResponse(createRouteErrorResponse(error))
  );
  return true;
}
