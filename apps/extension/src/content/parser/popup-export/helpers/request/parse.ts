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
  | MessageType.EXPORT_POPUP_CANCEL {
  return (
    value === MessageType.EXPORT_POPUP_PREVIEW ||
    value === MessageType.EXPORT_POPUP_BUILD_PACKAGE ||
    value === MessageType.EXPORT_POPUP_CANCEL
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
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

  const options = request['options'];
  if (!isPopupExportOptions(options)) {
    return null;
  }

  if (request['type'] === MessageType.EXPORT_POPUP_BUILD_PACKAGE) {
    const intent = request['intent'];
    const includeWebCopy = request['includeWebCopy'];
    const hasAnonymousPolicy = hasOwn(request, 'allowAnonymousCrossOriginAssets');
    const hasAuthenticatedPolicy = hasOwn(request, 'allowAuthenticatedSameOriginAssets');
    if (
      typeof request['batchRequestId'] !== 'string' ||
      typeof includeWebCopy !== 'boolean' ||
      (intent !== 'export' && intent !== 'save') ||
      !Number.isSafeInteger(request['ordinal']) ||
      (request['ordinal'] as number) < 0 ||
      (includeWebCopy
        ? typeof request['allowAnonymousCrossOriginAssets'] !== 'boolean' ||
          typeof request['allowAuthenticatedSameOriginAssets'] !== 'boolean'
        : hasAnonymousPolicy || hasAuthenticatedPolicy)
    ) {
      return null;
    }
    const admittedIntent = intent as 'export' | 'save';
    const common = {
      batchRequestId: request['batchRequestId'],
      ...(isContentGrant(request['contentIntentGrant'])
        ? { contentIntentGrant: request['contentIntentGrant'] }
        : {}),
      ...(isFullPageCaptureAction(request['fullPageCaptureAction'])
        ? { fullPageCaptureAction: request['fullPageCaptureAction'] }
        : {}),
      intent: admittedIntent,
      ordinal: request['ordinal'] as number,
      type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
      options,
    };
    return includeWebCopy
      ? {
          ...common,
          allowAnonymousCrossOriginAssets: request['allowAnonymousCrossOriginAssets'] as boolean,
          allowAuthenticatedSameOriginAssets: request[
            'allowAuthenticatedSameOriginAssets'
          ] as boolean,
          includeWebCopy: true,
        }
      : { ...common, includeWebCopy: false };
  }

  return null;
}
