import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import { createLogger } from '@sniptale/platform/observability/logger';
import { createMediaHubStorageHeadroomError } from '../../../../../features/media-hub/storage-errors';
import { ensureMediaHubStorageHeadroom } from '../../../../../features/media-hub/storage-capacity';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type {
  StartRecordingMessage,
  UpdateSettingsMessage,
  VideoControlMessage,
} from '../../../../../contracts/video/types/messages';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { startRecording } from '../../manager';
import type { PageAccessPort } from '../../../../routing-contracts/page-access-port';
import { createRouteErrorResponse } from '../../../../routing-contracts/response';
import { resolveTrustedPopupRuntimeSenderUrl } from '../sender-policy';
import { isAuthorizedRecordingControl } from './control-route.authorization';
import {
  sendAcceptedOrInactiveRecordingResponse,
  sendResumeRecordingResponse,
  sendStartRecordingResponse,
} from './control-route.responses';
import {
  cancelRecordingStart,
  pauseRecording,
  resumeRecording,
  stopRecording,
  updateRecordingSettings,
} from './controls';

const logger = createLogger({ namespace: 'BackgroundVideoControlRoute' });

type RouteVideoControlMessageArgs = {
  message: VideoControlMessage | UpdateSettingsMessage;
  resolvedTabId?: number | undefined;
  sendResponse: ResponseSender;
  sender: chrome.runtime.MessageSender | undefined;
  pageAccessPort?: PageAccessPort | undefined;
};

type AuthorizedRecordingControlMessage = Extract<
  VideoControlMessage,
  { controlToken: string; recordingId: string }
>;

export function routeVideoControlMessage(args: RouteVideoControlMessageArgs): boolean {
  const { message, sendResponse, sender } = args;

  switch (message.type) {
    case VideoMessageType.START_RECORDING:
      return routeStartRecordingControl({ ...args, message });
    case VideoMessageType.STOP_RECORDING:
      return routeAuthorizedRecordingControl(
        { message, sendResponse, sender },
        () => stopRecording(message.discard ?? false),
        sendAcceptedOrInactiveRecordingResponse
      );
    case VideoMessageType.CANCEL_RECORDING_START:
      return routeAuthorizedRecordingControl(
        { message, sendResponse, sender },
        cancelRecordingStart,
        sendAcceptedOrInactiveRecordingResponse
      );
    case VideoMessageType.PAUSE_RECORDING:
      return routeAuthorizedRecordingControl(
        { message, sendResponse, sender },
        pauseRecording,
        sendAcceptedOrInactiveRecordingResponse
      );
    case VideoMessageType.RESUME_RECORDING:
      return routeAuthorizedRecordingControl(
        { message, sendResponse, sender },
        resumeRecording,
        sendResumeRecordingResponse
      );
    case VideoMessageType.UPDATE_SETTINGS:
      return routeAuthorizedRecordingControl(
        { message, sendResponse, sender },
        () => updateRecordingSettings(message.settings),
        sendAcceptedOrInactiveRecordingResponse
      );
    default:
      return false;
  }
}

function routeStartRecordingControl({
  message,
  pageAccessPort,
  resolvedTabId,
  sendResponse,
  sender,
}: RouteVideoControlMessageArgs & { message: StartRecordingMessage }): boolean {
  if (resolvedTabId === undefined && message.captureMode !== CaptureMode.CAMERA) {
    sendResponse(createRouteErrorResponse('No tab ID'));
    return true;
  }

  handleStartRecording(message, pageAccessPort, resolvedTabId, sendResponse, sender);
  return true;
}

function handleStartRecording(
  message: StartRecordingMessage,
  pageAccessPort: PageAccessPort | undefined,
  resolvedTabId: number | undefined,
  sendResponse: ResponseSender,
  sender: chrome.runtime.MessageSender | undefined
): void {
  const ownerSenderUrl = resolveTrustedPopupRuntimeSenderUrl(sender);
  if (!ownerSenderUrl) {
    sendResponse(createRouteErrorResponse('Unauthorized recording control sender'));
    return;
  }

  const captureMode = message.captureMode ?? CaptureMode.TAB;
  const tabId = message.tabId ?? resolvedTabId;
  logger.debug('Starting video recording', {
    captureMode,
    hasViewportPreset: Boolean(message.viewportPreset),
    tabId,
  });

  if (!pageAccessPort && captureMode !== CaptureMode.CAMERA) {
    sendResponse(createRouteErrorResponse('Page access port unavailable.'));
    return;
  }

  startRecordingWithPageAccess(message, pageAccessPort, tabId, captureMode, ownerSenderUrl)
    .then((response) => sendStartRecordingResponse(response, sendResponse))
    .catch((error) => sendResponse(createRouteErrorResponse(error)));
}

async function startRecordingWithPageAccess(
  message: StartRecordingMessage,
  pageAccessPort: PageAccessPort | undefined,
  tabId: number | undefined,
  captureMode: CaptureMode,
  ownerSenderUrl: string
): Promise<Awaited<ReturnType<typeof startRecording>>> {
  await ensurePageAccessForRecording(pageAccessPort, tabId, captureMode);
  await ensureRecordingStorageHeadroom();
  return startRecording(
    tabId,
    message.settings,
    captureMode,
    message.viewportPreset,
    ownerSenderUrl
  );
}

async function ensureRecordingStorageHeadroom(): Promise<void> {
  try {
    await ensureMediaHubStorageHeadroom();
  } catch (error) {
    throw createMediaHubStorageHeadroomError(error) ?? error;
  }
}

async function ensurePageAccessForRecording(
  pageAccessPort: PageAccessPort | undefined,
  tabId: number | undefined,
  captureMode: CaptureMode
): Promise<void> {
  if (captureMode === CaptureMode.CAMERA || captureMode === CaptureMode.SCREEN) {
    return;
  }
  if (tabId === undefined) {
    throw new Error('No tab ID');
  }
  if (!pageAccessPort) {
    throw new Error('Page access port is required for tab recording.');
  }
  await pageAccessPort.ensureActivePageAccessRuntime(
    tabId,
    'Page access is required for tab recording.'
  );
}

function routeAuthorizedRecordingControl<TResponse>(
  args: {
    message: AuthorizedRecordingControlMessage;
    sendResponse: ResponseSender;
    sender: chrome.runtime.MessageSender | undefined;
  },
  runControl: () => Promise<TResponse>,
  sendControlResponse: (response: TResponse, sendResponse: ResponseSender) => void
): boolean {
  isAuthorizedRecordingControl(args)
    .then((isAuthorized) =>
      isAuthorized
        ? runControl().then((response) => sendControlResponse(response, args.sendResponse))
        : undefined
    )
    .catch((error) => args.sendResponse(createRouteErrorResponse(error)));
  return true;
}
