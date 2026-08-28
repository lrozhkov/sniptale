import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  handleFetchWebSnapshotAsset,
  handleRegisterWebSnapshotAssets,
} from '../actions.web-snapshot';
import type { RouteCaptureMessageArgs } from './types';
import { handleStagePagePackageJobChunk } from '../../page-package/job/stage-route';

export function routeWebSnapshotMessage(args: RouteCaptureMessageArgs): boolean {
  const { message, resolvedTabId, sendResponse } = args;
  if (message.type === MessageType.STAGE_PAGE_PACKAGE_JOB_CHUNK) {
    return handleStagePagePackageJobChunk(message, resolvedTabId, sendResponse);
  }
  if (message.type === MessageType.REGISTER_WEB_SNAPSHOT_ASSETS) {
    return handleRegisterWebSnapshotAssets(message, resolvedTabId, sendResponse);
  }
  if (message.type === MessageType.FETCH_WEB_SNAPSHOT_ASSET) {
    return handleFetchWebSnapshotAsset(message, resolvedTabId, sendResponse);
  }
  return false;
}
