import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createRouteErrorResponse } from '../../../routing-contracts/response';
import * as contentActionPreauthorization from '../authorization/content-action';
import {
  handleExecuteSave,
  handleOpenEditorWithImage,
  handleReleaseRecordingDownload,
  handleSaveRecordingForDownload,
  handleStageRecordingDownloadChunk,
} from '../actions';
import type { RouteCaptureMessageArgs } from './types';

function resolveRecordingDownloadOwner(
  message: object,
  sendResponse: RouteCaptureMessageArgs['sendResponse']
) {
  const owner = contentActionPreauthorization.getPreauthorizedContentActionRouteMessage(message);
  if (!owner) {
    sendResponse(createRouteErrorResponse('Unauthorized recording download owner'));
    return null;
  }
  return owner;
}

export function routeDownloadMessage(args: RouteCaptureMessageArgs): boolean {
  const { message, resolvedTabId, sendResponse } = args;
  if (message.type === MessageType.EXECUTE_SAVE) {
    return handleExecuteSave(message, resolvedTabId, sendResponse);
  }
  if (message.type === MessageType.OPEN_EDITOR_WITH_IMAGE) {
    return handleOpenEditorWithImage(message.dataUrl, resolvedTabId, sendResponse);
  }
  if (message.type === MessageType.STAGE_RECORDING_DOWNLOAD_CHUNK) {
    const owner = resolveRecordingDownloadOwner(message, sendResponse);
    return owner ? handleStageRecordingDownloadChunk(message, owner, sendResponse) : true;
  }
  if (message.type === MessageType.SAVE_RECORDING_FOR_DOWNLOAD) {
    const owner = resolveRecordingDownloadOwner(message, sendResponse);
    return owner ? handleSaveRecordingForDownload(message, owner, sendResponse) : true;
  }
  if (message.type === MessageType.RELEASE_RECORDING_DOWNLOAD) {
    const owner = resolveRecordingDownloadOwner(message, sendResponse);
    return owner ? handleReleaseRecordingDownload(message, owner, sendResponse) : true;
  }
  return false;
}
