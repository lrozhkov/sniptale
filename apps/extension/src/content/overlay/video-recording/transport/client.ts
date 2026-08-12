import { browserRuntime } from '@sniptale/platform/browser/runtime';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import {
  isVideoRecordingSurfaceSnapshotMessage,
  isActivateVideoRecordingSurfaceMessage,
  isStartSavedTabVideoRecordingMessage,
  type VideoRecordingSurfaceCommand,
  type VideoRecordingSurfaceSnapshot,
} from '@sniptale/runtime-contracts/video/types/messages.surface';
import {
  attachContentActionIntent,
  createTrustedContentActionIntentSource,
} from '../../../application/privileged-action-intent';
import { getContentRuntimeServices } from '../../../application/runtime-services/services';
import type { VideoRecordingRuntimeState } from '@sniptale/runtime-contracts/video/types/types';
import { isVideoRecordingRuntimeState } from '../../../../contracts/messaging/validators';

export type SurfaceIdentity = {
  capabilityEpoch: number;
  documentGeneration: number;
  peerGeneration: number;
  recordingId: string | null;
  surfaceSessionId: string;
  surfaceToken: string;
};

export async function activateVideoRecordingSurface(event: Event) {
  const message = await attachContentActionIntent(
    { type: VideoMessageType.ACTIVATE_VIDEO_RECORDING_SURFACE },
    createTrustedContentActionIntentSource(event)
  );
  if (!isActivateVideoRecordingSurfaceMessage(message)) {
    throw new Error('Trusted video surface activation was not issued');
  }
  return getContentRuntimeServices().messaging.sendRuntimeMessage(message);
}

export async function requestVideoRecordingCameraAnswer(
  identity: SurfaceIdentity,
  sdp: string
): Promise<string> {
  const response = await getContentRuntimeServices().messaging.sendRuntimeMessage({
    type: VideoMessageType.VIDEO_RECORDING_CAMERA_OFFER,
    surfaceSessionId: identity.surfaceSessionId,
    surfaceToken: identity.surfaceToken,
    documentGeneration: identity.documentGeneration,
    peerGeneration: identity.peerGeneration,
    sdp,
  });
  if (!response?.success || !response.sdp) throw new Error(response?.error ?? 'Camera peer failed');
  return response.sdp;
}

export async function closeVideoRecordingCameraPeer(identity: SurfaceIdentity): Promise<void> {
  const response = await getContentRuntimeServices().messaging.sendRuntimeMessage({
    type: VideoMessageType.VIDEO_RECORDING_CAMERA_CLOSE,
    surfaceSessionId: identity.surfaceSessionId,
    surfaceToken: identity.surfaceToken,
    documentGeneration: identity.documentGeneration,
    peerGeneration: identity.peerGeneration,
  });
  if (!response?.success) throw new Error(response?.error ?? 'Camera peer close failed');
}

export async function startSavedTabVideoRecording(event: Event) {
  const message = await attachContentActionIntent(
    { type: VideoMessageType.START_SAVED_TAB_VIDEO_RECORDING },
    createTrustedContentActionIntentSource(event)
  );
  if (!isStartSavedTabVideoRecordingMessage(message)) {
    throw new Error('Trusted video recording start was not issued');
  }
  return getContentRuntimeServices().messaging.sendRuntimeMessage(message);
}

export async function releaseVideoRecordingSurface(identity: SurfaceIdentity): Promise<void> {
  const response = await getContentRuntimeServices().messaging.sendRuntimeMessage({
    type: VideoMessageType.RELEASE_VIDEO_RECORDING_SURFACE,
    surfaceSessionId: identity.surfaceSessionId,
    surfaceToken: identity.surfaceToken,
  });
  if (!response?.success) throw new Error(response?.error ?? 'Recording surface release failed');
}

export async function sendVideoRecordingSurfaceCommand(
  identity: SurfaceIdentity,
  command: VideoRecordingSurfaceCommand
): Promise<unknown> {
  const response = await getContentRuntimeServices().messaging.sendRuntimeMessage({
    type: VideoMessageType.VIDEO_RECORDING_SURFACE_COMMAND,
    surfaceSessionId: identity.surfaceSessionId,
    surfaceToken: identity.surfaceToken,
    capabilityEpoch: identity.capabilityEpoch,
    documentGeneration: identity.documentGeneration,
    recordingId: identity.recordingId,
    command,
  });
  if (!response?.success) throw new Error(response?.error ?? 'Recording command failed');
  return response;
}

export function subscribeToVideoRecordingSurfaceSnapshots(
  listener: (snapshot: VideoRecordingSurfaceSnapshot, surfaceToken?: string) => void
): () => void {
  if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) return () => undefined;
  return browserRuntime.subscribeToMessages((message: unknown) => {
    if (!isVideoRecordingSurfaceSnapshotMessage(message)) return undefined;
    listener(message.snapshot, message.surfaceToken);
    return undefined;
  });
}

export function subscribeToVideoRecordingRuntimeState(
  listener: (state: VideoRecordingRuntimeState) => void
): () => void {
  if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) return () => undefined;
  return browserRuntime.subscribeToMessages((message: unknown) => {
    if (
      typeof message !== 'object' ||
      message === null ||
      !('type' in message) ||
      !('state' in message) ||
      message.type !== VideoMessageType.RECORDING_STATE_SYNC ||
      !isVideoRecordingRuntimeState(message.state)
    ) {
      return undefined;
    }
    listener(message.state);
    return undefined;
  });
}
