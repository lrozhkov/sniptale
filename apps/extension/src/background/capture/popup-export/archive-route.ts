import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type {
  ReleasePopupExportArchiveMessage,
  SavePopupExportArchiveMessage,
  StagePopupExportArchiveChunkMessage,
} from '../../../contracts/messaging/contracts/types';
import { createRouteErrorResponse } from '../../routing-contracts/response';
import { executeDownloadBlob } from '../download/download-router';
import {
  isSafeDownloadFilename,
  isSafeDownloadMimeType,
} from '@sniptale/runtime-contracts/validation/base64';
import { type ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  consumePopupExportStagedArchive,
  releasePopupExportStagedArchive,
  stagePopupExportArchiveChunk,
} from './staged-archives';

const POPUP_EXPORT_ARCHIVE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const POPUP_EXPORT_ARCHIVE_MAX_ID_LENGTH = 128;

function isPopupExportArchiveId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= POPUP_EXPORT_ARCHIVE_MAX_ID_LENGTH &&
    POPUP_EXPORT_ARCHIVE_ID_PATTERN.test(value)
  );
}

function isPopupExportArchiveMessage(message: unknown): message is SavePopupExportArchiveMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    message.type === MessageType.EXPORT_POPUP_SAVE_ARCHIVE
  );
}

function isPopupExportArchiveChunkMessage(
  message: unknown
): message is StagePopupExportArchiveChunkMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    message.type === MessageType.STAGE_POPUP_EXPORT_ARCHIVE_CHUNK
  );
}

function isReleasePopupExportArchiveMessage(
  message: unknown
): message is ReleasePopupExportArchiveMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    message.type === MessageType.RELEASE_POPUP_EXPORT_ARCHIVE
  );
}

function isValidPopupExportArchiveMessage(message: SavePopupExportArchiveMessage): boolean {
  return (
    isPopupExportArchiveId(message.archiveSessionId) &&
    isPopupExportArchiveId(message.stagedArchiveId) &&
    isSafeDownloadMimeType(message.mimeType) &&
    isSafeDownloadFilename(message.filename) &&
    (message.presetId === undefined || typeof message.presetId === 'string')
  );
}

async function savePopupExportArchive(message: SavePopupExportArchiveMessage): Promise<void> {
  const blob = consumePopupExportStagedArchive({
    archiveSessionId: message.archiveSessionId,
    mimeType: message.mimeType,
    stagedArchiveId: message.stagedArchiveId,
  });
  await executeDownloadBlob(blob, message.filename, message.presetId);
}

export function routePopupExportArchiveMessage(
  message: unknown,
  sendResponse: ResponseSender
): boolean {
  if (isPopupExportArchiveChunkMessage(message)) {
    try {
      const result = stagePopupExportArchiveChunk(message);
      sendResponse({ success: true, ...result });
    } catch (error) {
      sendResponse(createRouteErrorResponse(error));
    }
    return true;
  }

  if (isReleasePopupExportArchiveMessage(message)) {
    try {
      releasePopupExportStagedArchive(message);
      sendResponse({ success: true, result: 'released' });
    } catch (error) {
      sendResponse(createRouteErrorResponse(error));
    }
    return true;
  }

  if (!isPopupExportArchiveMessage(message)) {
    return false;
  }

  if (!isValidPopupExportArchiveMessage(message)) {
    sendResponse(createRouteErrorResponse('Invalid popup export archive payload'));
    return true;
  }

  savePopupExportArchive(message)
    .then(() => sendResponse({ success: true, result: 'accepted' }))
    .catch((error) => sendResponse(createRouteErrorResponse(error)));
  return true;
}
