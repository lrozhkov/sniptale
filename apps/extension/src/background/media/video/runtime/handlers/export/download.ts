import { createLogger } from '@sniptale/platform/observability/logger';
import {
  downloadRecordingSidecar,
  downloadStoredRecording,
} from '../../../../../media-hub/recording-download';
import { respondAsyncRouteWithLogger } from '../../../../../routing-contracts/response';
import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import { type RouteResult } from '../shared';

const logger = createLogger({ namespace: 'BackgroundVideoRuntimeRouterHandlers' });

export function handleDownloadRecording(
  message: { filename: string; recordingId: string },
  sendResponse: ResponseSender
): RouteResult {
  logger.log('Downloading recording', message.filename);
  respondAsyncRouteWithLogger({
    work: downloadStoredRecording(message.recordingId, message.filename).then((downloadId) => ({
      success: true,
      downloadId,
    })),
    sendResponse,
    logger,
    failureLogMessage: 'Failed to download recording through background route',
  });
  return { handled: true, keepChannelOpen: true };
}

export function handleDownloadRecordingSidecar(
  message: { content: string; filename: string; mimeType: string },
  sendResponse: ResponseSender
): RouteResult {
  logger.log('Downloading recording sidecar', message.filename);
  respondAsyncRouteWithLogger({
    work: downloadRecordingSidecar(message).then((downloadId) => ({ success: true, downloadId })),
    sendResponse,
    logger,
    failureLogMessage: 'Failed to download recording sidecar through background route',
  });
  return { handled: true, keepChannelOpen: true };
}
