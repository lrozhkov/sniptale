import { isPopupExportOptions } from './options';
import type { PopupExportRequest } from './types';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import * as contentIntent from '@sniptale/runtime-contracts/protocol/content-privileged-action';
import { parsePopupExportControlRequest } from '../../../../../contracts/messaging/parsers/popup-export-control';

const isContentGrant = contentIntent.isContentPrivilegedActionAutoStartGrant;

function isPopupExportType(
  value: unknown
): value is
  | MessageType.EXPORT_POPUP_PREVIEW
  | MessageType.EXPORT_POPUP_BUILD_PACKAGE
  | typeof MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT
  | MessageType.EXPORT_POPUP_START
  | MessageType.EXPORT_POPUP_CANCEL {
  return (
    value === MessageType.EXPORT_POPUP_PREVIEW ||
    value === MessageType.EXPORT_POPUP_BUILD_PACKAGE ||
    value === MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT ||
    value === MessageType.EXPORT_POPUP_START ||
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
    return {
      type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
      options,
      ...(isContentGrant(request['contentIntentGrant'])
        ? { contentIntentGrant: request['contentIntentGrant'] }
        : {}),
    };
  }

  const requestId = request['requestId'];
  if (typeof requestId !== 'string') {
    return null;
  }

  return {
    type: MessageType.EXPORT_POPUP_START,
    options,
    requestId,
    ...(isContentGrant(request['contentIntentGrant'])
      ? { contentIntentGrant: request['contentIntentGrant'] }
      : {}),
  };
}

function parseWebSnapshotExportRequest(
  candidate: Record<string, unknown>
): PopupExportRequest | null {
  const type = candidate['type'];
  const requestId = candidate['requestId'];
  const allowAnonymousCrossOriginAssets = candidate['allowAnonymousCrossOriginAssets'];
  const allowAuthenticatedSameOriginAssets = candidate['allowAuthenticatedSameOriginAssets'];
  return type === MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT &&
    typeof requestId === 'string' &&
    typeof allowAnonymousCrossOriginAssets === 'boolean' &&
    typeof allowAuthenticatedSameOriginAssets === 'boolean'
    ? {
        allowAnonymousCrossOriginAssets,
        allowAuthenticatedSameOriginAssets,
        requestId,
        type,
      }
    : null;
}
