import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import type { VideoControlMessage } from '../../../../../contracts/video/types/messages';
import { createRouteErrorResponse } from '../../../../routing-contracts/response';
import {
  ensureActiveVideoRecordingLeaseHydrated,
  getActiveVideoRecordingLeaseSnapshot,
  validateRecordingControlCapability,
} from '../../recording-control-lease';
import { isAuthorizedCameraRecorderDocument } from '../camera-recorder-control';
import {
  resolveTrustedCameraRecorderRuntimeSenderUrl,
  resolveTrustedPopupRuntimeSenderUrl,
} from '../sender-policy';

type AuthorizedRecordingControlMessage = Extract<
  VideoControlMessage,
  {
    controlToken: string;
    recordingId: string;
  }
>;

export async function isAuthorizedRecordingControl(args: {
  message: AuthorizedRecordingControlMessage;
  sendResponse: ResponseSender;
  sender: chrome.runtime.MessageSender | undefined;
}): Promise<boolean> {
  await ensureActiveVideoRecordingLeaseHydrated();
  const ownerSenderUrl = resolveRecordingControlOwnerSenderUrl(args.sender);
  if (
    validateRecordingControlCapability({
      controlToken: args.message.controlToken,
      ownerSenderUrl,
      recordingId: args.message.recordingId,
    })
  ) {
    return true;
  }

  args.sendResponse(createRouteErrorResponse('Unauthorized recording control capability'));
  return false;
}

function resolveRecordingControlOwnerSenderUrl(
  sender: chrome.runtime.MessageSender | undefined
): string | null {
  const popupSenderUrl = resolveTrustedPopupRuntimeSenderUrl(sender);
  if (popupSenderUrl) {
    return popupSenderUrl;
  }

  const cameraSenderUrl = resolveTrustedCameraRecorderRuntimeSenderUrl(sender);
  if (!cameraSenderUrl) {
    return null;
  }

  const activeLease = getActiveVideoRecordingLeaseSnapshot();
  if (
    !isAuthorizedCameraRecorderDocument({
      documentId: sender?.documentId,
      recordingId: activeLease?.recordingId,
      senderUrl: cameraSenderUrl,
    })
  ) {
    return null;
  }

  return activeLease?.ownerSenderUrl ?? null;
}
