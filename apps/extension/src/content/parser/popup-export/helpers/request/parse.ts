import { isPopupExportOptions } from './options';
import type { PopupExportRequest } from './types';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import * as contentIntent from '@sniptale/runtime-contracts/protocol/content-privileged-action';
import { parsePopupExportControlRequest } from '../../../../../contracts/messaging/parsers/popup-export-control';

const isContentGrant = contentIntent.isContentPrivilegedActionAutoStartGrant;
const isFullPageCaptureAction = (value: unknown) => value === MessageType.EXPORT_CAPTURE_FULL_PAGE;

function isPopupExportType(
  value: unknown
): value is
  | MessageType.EXPORT_POPUP_PREVIEW
  | MessageType.EXPORT_POPUP_BUILD_PACKAGE
  | typeof MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT
  | MessageType.EXPORT_POPUP_CANCEL {
  return (
    value === MessageType.EXPORT_POPUP_PREVIEW ||
    value === MessageType.EXPORT_POPUP_BUILD_PACKAGE ||
    value === MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT ||
    value === MessageType.EXPORT_POPUP_CANCEL
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parsePopupExportRequest(request: unknown): PopupExportRequest | null {
  if (!isRecord(request)) {
    return null;
  }

  if (!isPopupExportType(request['type'])) {
    return null;
  }

  const controlRequest = parsePopupExportControlRequest(request);
  if (controlRequest) {
    return controlRequest;
  }

  if (request['type'] === MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT) {
    return parseWebSnapshotExportRequest(request);
  }

  const options = request['options'];
  if (!isPopupExportOptions(options)) {
    return null;
  }

  if (request['type'] === MessageType.EXPORT_POPUP_BUILD_PACKAGE) {
    if (typeof request['batchRequestId'] !== 'string') return null;
    return {
      batchRequestId: request['batchRequestId'],
      type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
      options,
    };
  }

  return null;
}

function parseWebSnapshotExportRequest(
  candidate: Record<string, unknown>
): PopupExportRequest | null {
  const type = candidate['type'];
  const requestId = candidate['requestId'];
  const allowAnonymousCrossOriginAssets = candidate['allowAnonymousCrossOriginAssets'];
  const allowAuthenticatedSameOriginAssets = candidate['allowAuthenticatedSameOriginAssets'];
  const contentIntentGrant = candidate['contentIntentGrant'];
  const fullPageCaptureAction = candidate['fullPageCaptureAction'];
  return type === MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT &&
    typeof requestId === 'string' &&
    typeof allowAnonymousCrossOriginAssets === 'boolean' &&
    typeof allowAuthenticatedSameOriginAssets === 'boolean'
    ? {
        allowAnonymousCrossOriginAssets,
        allowAuthenticatedSameOriginAssets,
        requestId,
        type,
        ...(isContentGrant(contentIntentGrant) ? { contentIntentGrant } : {}),
        ...(isFullPageCaptureAction(fullPageCaptureAction) ? { fullPageCaptureAction } : {}),
      }
    : null;
}
