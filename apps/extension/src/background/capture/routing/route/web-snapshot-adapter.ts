import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  handleFetchWebSnapshotAsset,
  handleRegisterWebSnapshotAssets,
  handleSaveWebSnapshotToGallery,
  handleStageWebSnapshotBlobChunk,
} from '../actions';
import type { RouteCaptureMessageArgs } from './types';

export function routeWebSnapshotMessage(args: RouteCaptureMessageArgs): boolean {
  const { message, resolvedTabId, sendResponse } = args;
  if (message.type === MessageType.SAVE_WEB_SNAPSHOT_TO_GALLERY) {
    return handleSaveWebSnapshotToGallery(message, resolvedTabId, sendResponse);
  }
  if (message.type === MessageType.REGISTER_WEB_SNAPSHOT_ASSETS) {
    return handleRegisterWebSnapshotAssets(message, resolvedTabId, sendResponse);
  }
  if (message.type === MessageType.FETCH_WEB_SNAPSHOT_ASSET) {
    return handleFetchWebSnapshotAsset(message, resolvedTabId, sendResponse);
  }
  if (message.type === MessageType.STAGE_WEB_SNAPSHOT_BLOB_CHUNK) {
    return handleStageWebSnapshotBlobChunk(message, resolvedTabId, sendResponse);
  }
  return false;
}
