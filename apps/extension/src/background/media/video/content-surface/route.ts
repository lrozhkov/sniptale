import { createLogger } from '@sniptale/platform/observability/logger';
import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  type ActivateVideoRecordingSurfaceMessage,
  type ReleaseVideoRecordingSurfaceMessage,
  type StartSavedTabVideoRecordingMessage,
  type VideoRecordingSurfaceCommandMessage,
  type VideoRecordingCameraOfferMessage,
  type VideoRecordingCameraCloseMessage,
} from '@sniptale/runtime-contracts/video/types/messages.surface';
import { createRouteErrorResponse } from '../../../routing-contracts/response';
import { loadVideoSettings } from '../../../../composition/persistence/capture-settings';
import { attachOffscreenCommandCapability } from '@sniptale/platform/security/offscreen-command-capability';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { getBackgroundRuntimeMessaging } from '../../../routing-contracts/runtime-messaging/services';
import {
  ensureVideoRecordingSurfaceLeaseHydrated,
  releaseVideoRecordingSurface,
} from './surface-lease';
import {
  closeVideoRecordingCameraPeerForLease,
  getVideoRecordingCameraPeerId,
} from './camera-peer';
import { activateVideoRecordingSurface, startSavedTabVideoRecording } from './start';
import { runVideoRecordingSurfaceCommand } from './commands';

const logger = createLogger({ namespace: 'VideoRecordingContentSurface' });

type SurfaceRouteMessage =
  | ActivateVideoRecordingSurfaceMessage
  | ReleaseVideoRecordingSurfaceMessage
  | StartSavedTabVideoRecordingMessage
  | VideoRecordingSurfaceCommandMessage
  | VideoRecordingCameraOfferMessage
  | VideoRecordingCameraCloseMessage;

export function routeVideoRecordingSurfaceMessage(args: {
  message: SurfaceRouteMessage;
  resolvedTabId: number;
  sendResponse: ResponseSender;
  sender: chrome.runtime.MessageSender | undefined;
}): void {
  void handleSurfaceMessage(args)
    .then(args.sendResponse)
    .catch((error) => {
      logger.error('Video recording surface command failed', error);
      args.sendResponse(createRouteErrorResponse(error));
    });
}

async function handleSurfaceMessage(args: {
  message: SurfaceRouteMessage;
  resolvedTabId: number;
  sender: chrome.runtime.MessageSender | undefined;
}): Promise<unknown> {
  const { message, resolvedTabId } = args;
  switch (message.type) {
    case 'ACTIVATE_VIDEO_RECORDING_SURFACE':
      return activateVideoRecordingSurface(resolvedTabId);
    case 'START_SAVED_TAB_VIDEO_RECORDING':
      return startSavedTabVideoRecording(resolvedTabId, args.sender?.url);
    case 'RELEASE_VIDEO_RECORDING_SURFACE': {
      const lease = await ensureVideoRecordingSurfaceLeaseHydrated();
      if (
        !lease ||
        lease.tabId !== resolvedTabId ||
        lease.surfaceSessionId !== message.surfaceSessionId ||
        lease.surfaceToken !== message.surfaceToken
      ) {
        throw new Error('Unauthorized video recording surface release');
      }
      const released = await releaseVideoRecordingSurface({
        surfaceSessionId: message.surfaceSessionId,
        surfaceToken: message.surfaceToken,
      });
      if (!released) throw new Error('Stale video recording surface release');
      return { success: true, result: 'released' };
    }
    case 'VIDEO_RECORDING_SURFACE_COMMAND':
      return runVideoRecordingSurfaceCommand(resolvedTabId, message);
    case 'VIDEO_RECORDING_CAMERA_OFFER':
      return answerCameraOffer(resolvedTabId, message);
    case 'VIDEO_RECORDING_CAMERA_CLOSE':
      return closeCameraPeer(resolvedTabId, message);
  }
}

function requireCameraPeerLease(
  tabId: number,
  message: VideoRecordingCameraOfferMessage | VideoRecordingCameraCloseMessage
) {
  return ensureVideoRecordingSurfaceLeaseHydrated().then((lease) => {
    if (
      !lease ||
      lease.expiresAt <= Date.now() ||
      lease.tabId !== tabId ||
      lease.surfaceSessionId !== message.surfaceSessionId ||
      lease.surfaceToken !== message.surfaceToken ||
      lease.documentGeneration !== message.documentGeneration ||
      lease.peerGeneration !== message.peerGeneration
    ) {
      throw new Error('Unauthorized or stale camera peer');
    }
    return lease;
  });
}

function cameraPeerId(
  message: VideoRecordingCameraOfferMessage | VideoRecordingCameraCloseMessage
) {
  return getVideoRecordingCameraPeerId(message);
}

async function answerCameraOffer(tabId: number, message: VideoRecordingCameraOfferMessage) {
  const lease = await requireCameraPeerLease(tabId, message);
  const settings = await loadVideoSettings();
  await requireCameraPeerLease(tabId, message);
  const peerId = cameraPeerId(message);
  const response = await getBackgroundRuntimeMessaging().sendRuntimeMessage(
    attachOffscreenCommandCapability({
      type: VideoMessageType.OFFSCREEN_VIDEO_RECORDING_CAMERA_OFFER,
      peerId,
      sdp: message.sdp,
      settings,
    })
  );
  if (!response?.success || !response.sdp) throw new Error(response?.error ?? 'Camera peer failed');
  try {
    await requireCameraPeerLease(tabId, message);
  } catch (error) {
    await closeVideoRecordingCameraPeerForLease(lease).catch(() => undefined);
    throw error;
  }
  return { success: true, sdp: response.sdp };
}

async function closeCameraPeer(tabId: number, message: VideoRecordingCameraCloseMessage) {
  const lease = await requireCameraPeerLease(tabId, message);
  await closeVideoRecordingCameraPeerForLease(lease);
  return { success: true, result: 'closed' };
}
