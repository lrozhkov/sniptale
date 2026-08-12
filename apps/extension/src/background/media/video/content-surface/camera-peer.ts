// policyStateId: video-recording-surface-lease - document-bound embedded camera peer authority.
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { attachOffscreenCommandCapability } from '@sniptale/platform/security/offscreen-command-capability';
import { getBackgroundRuntimeMessaging } from '../../../routing-contracts/runtime-messaging/services';
import {
  completeVideoRecordingCameraPeerCleanup,
  listPendingVideoRecordingCameraPeerCleanup,
  retainVideoRecordingCameraPeerCleanup,
} from './camera-peer-cleanup';
import {
  ensureOffscreenDocument,
  waitForOffscreenReady,
} from '../../../offscreen-document/service';
import type { VideoRecordingMediaDevice } from '@sniptale/runtime-contracts/video/types/messages.surface';

type CameraPeerLease = {
  documentGeneration: number;
  peerGeneration: number;
  surfaceSessionId: string;
};

export function getVideoRecordingCameraPeerId(
  lease: Pick<CameraPeerLease, 'surfaceSessionId' | 'documentGeneration' | 'peerGeneration'>
): string {
  return `${lease.surfaceSessionId}:${lease.documentGeneration}:${lease.peerGeneration}`;
}

let retryTimer: ReturnType<typeof setTimeout> | null = null;
const volatilePendingPeerIds = new Set<string>();

async function sendClose(peerId: string): Promise<void> {
  const response = await getBackgroundRuntimeMessaging().sendRuntimeMessage(
    attachOffscreenCommandCapability({
      type: VideoMessageType.OFFSCREEN_VIDEO_RECORDING_CAMERA_CLOSE,
      peerId,
    })
  );
  if (!response?.success) {
    throw new Error(response?.error ?? 'Camera peer close was not acknowledged');
  }
}

export async function ensureVideoRecordingCameraOffscreenReady(): Promise<void> {
  await ensureOffscreenDocument('Preview recording camera and enumerate media devices');
  await waitForOffscreenReady();
}

export async function listVideoRecordingMediaDevices(
  deviceKind: 'audioinput' | 'videoinput'
): Promise<VideoRecordingMediaDevice[]> {
  await ensureVideoRecordingCameraOffscreenReady();
  const response = await getBackgroundRuntimeMessaging().sendRuntimeMessage(
    attachOffscreenCommandCapability({
      type: VideoMessageType.OFFSCREEN_VIDEO_RECORDING_MEDIA_DEVICES,
      deviceKind,
    })
  );
  if (!response?.success || !response.mediaDevices) {
    throw new Error(response?.error ?? 'Media device enumeration was not acknowledged');
  }
  return response.mediaDevices;
}

function schedulePendingPeerRetirement(stopRequested: boolean): void {
  if (!stopRequested || retryTimer !== null) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void recoverPendingVideoRecordingCameraPeerCleanup();
  }, 1_000);
}

export async function recoverPendingVideoRecordingCameraPeerCleanup(): Promise<boolean> {
  let complete = true;
  let durablePending: string[] = [];
  try {
    durablePending = await listPendingVideoRecordingCameraPeerCleanup();
  } catch {
    complete = false;
  }
  const pending = new Set([...durablePending, ...volatilePendingPeerIds]);
  for (const peerId of pending) {
    try {
      await sendClose(peerId);
      await completeVideoRecordingCameraPeerCleanup(peerId);
      volatilePendingPeerIds.delete(peerId);
    } catch {
      complete = false;
    }
  }
  if (!complete) schedulePendingPeerRetirement(true);
  return complete;
}

export async function closeVideoRecordingCameraPeerForLease(lease: CameraPeerLease): Promise<void> {
  await recoverPendingVideoRecordingCameraPeerCleanup();
  const peerId = getVideoRecordingCameraPeerId(lease);
  try {
    await sendClose(peerId);
    await completeVideoRecordingCameraPeerCleanup(peerId);
  } catch (error) {
    volatilePendingPeerIds.add(peerId);
    schedulePendingPeerRetirement(true);
    try {
      await retainVideoRecordingCameraPeerCleanup(peerId);
    } catch (persistenceError) {
      throw new AggregateError(
        [error, persistenceError],
        'Camera peer close failed and durable retirement could not be recorded.',
        { cause: persistenceError }
      );
    }
    throw error;
  }
}

export async function switchVideoRecordingCameraPeerInput(
  lease: CameraPeerLease,
  deviceId: string | null
): Promise<void> {
  await ensureVideoRecordingCameraOffscreenReady();
  const response = await getBackgroundRuntimeMessaging().sendRuntimeMessage(
    attachOffscreenCommandCapability({
      type: VideoMessageType.OFFSCREEN_VIDEO_RECORDING_CAMERA_SWITCH,
      deviceId,
      peerId: getVideoRecordingCameraPeerId(lease),
    })
  );
  if (!response?.success) {
    throw new Error(response?.error ?? 'Camera input switch was not acknowledged');
  }
}

export function resetVideoRecordingCameraPeerRetryForTests(): void {
  if (retryTimer !== null) clearTimeout(retryTimer);
  retryTimer = null;
  volatilePendingPeerIds.clear();
}
